"""Token issuance, atomic consumption and revocation for access links."""
from __future__ import annotations

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from core.crypto import decrypt_bytes, encrypt_bytes
from core.utils import random_token, sha256_hex
from sharing.models import LinkState, Recipient, ShareLink, ViewerSession


def issue_link(recipient: Recipient, expires_at=None) -> tuple[ShareLink, str]:
    """Create a fresh ACTIVE link. Returns (link, plaintext token)."""
    plaintext = random_token(32)
    link = ShareLink.objects.create(
        file=recipient.file,
        recipient=recipient,
        token_hash=sha256_hex(plaintext),
        token_sealed=encrypt_bytes(plaintext.encode('utf-8')),
        token_preview=f'••••••{plaintext[-6:]}',
        expires_at=expires_at if expires_at is not None else recipient.expires_at,
    )
    return link, plaintext


def link_plaintext(link: ShareLink) -> str:
    return decrypt_bytes(bytes(link.token_sealed)).decode('utf-8')


def build_share_url(plaintext_token: str) -> str:
    return f'{settings.PUBLIC_VIEW_BASE_URL}/{plaintext_token}'


def find_link_by_token(token: str) -> ShareLink | None:
    return (
        ShareLink.objects.select_related('recipient', 'file', 'file__owner')
        .filter(token_hash=sha256_hex(token))
        .first()
    )


def consume_link(link: ShareLink, ip: str) -> bool:
    """Atomically claim an ACTIVE link.

    A conditional UPDATE is used rather than `select_for_update()` so the
    compare-and-swap is correct on every backend (PostgreSQL `SELECT … FOR
    UPDATE` and SQLite's write lock both serialise this statement). Returns
    False when another request consumed the link first.
    """
    with transaction.atomic():
        claimed = ShareLink.objects.filter(pk=link.pk, state=LinkState.ACTIVE).update(
            state=LinkState.CONSUMED,
            consumed_at=timezone.now(),
            consumed_ip=ip,
        )
    if claimed:
        link.state = LinkState.CONSUMED
    return bool(claimed)


def start_session(link: ShareLink, recipient: Recipient, access_id: str, ip: str, user_agent: str) -> ViewerSession:
    duration = recipient.session_duration_minutes or settings.DEFAULT_SESSION_DURATION_MINUTES
    return ViewerSession.objects.create(
        link=link,
        recipient=recipient,
        file=link.file,
        access_id=access_id,
        expires_at=timezone.now() + timezone.timedelta(minutes=duration),
        ip=ip,
        user_agent=user_agent,
    )


def revoke_link(link: ShareLink) -> ShareLink:
    """Revoke a link and tear down its authorized session."""
    link.state = LinkState.REVOKED
    link.save(update_fields=['state'])
    session = link.viewer_session
    if session is not None and session.revoked_at is None:
        session.revoked_at = timezone.now()
        session.save(update_fields=['revoked_at'])
    return link


def reissue_link(previous: ShareLink) -> tuple[ShareLink, str]:
    """Invalidate the old token and issue a replacement for the same recipient."""
    revoke_link(previous)
    return issue_link(previous.recipient, previous.expires_at)
