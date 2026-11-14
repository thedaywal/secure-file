"""Recipients, single-use links and authorized viewing sessions.

The rules enforced here are the heart of the product:

* credentials are image-specific — a recipient authorized for one image gets
  no access to any other image;
* a link is consumed by the first *successful* authentication and can never be
  reused; opening the link or failing authentication never consumes it;
* one consumed link yields exactly one authorized browser session.

Only the SHA-256 hash of a link token is used for resolution. The plaintext is
kept encrypted (never in the clear) so the administrator can re-copy a link
without a database dump revealing any token.
"""
from __future__ import annotations

import uuid

from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password
from django.db import models
from django.utils import timezone

from securefiles.models import Album, SecureFile


class LinkState(models.TextChoices):
    ACTIVE = 'ACTIVE', 'Active'
    CONSUMED = 'CONSUMED', 'Consumed'
    EXPIRED = 'EXPIRED', 'Expired'
    REVOKED = 'REVOKED', 'Revoked'


class Recipient(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    file = models.ForeignKey(SecureFile, related_name='recipients', on_delete=models.CASCADE)
    album = models.ForeignKey(
        Album, related_name='recipients', null=True, blank=True, on_delete=models.CASCADE
    )

    username = models.CharField(max_length=150)
    display_name = models.CharField(max_length=150, blank=True)
    # Argon2 hash (Django's make_password). The plaintext is never stored.
    password = models.CharField(max_length=128, blank=True)

    session_duration_minutes = models.PositiveIntegerField(default=settings.DEFAULT_SESSION_DURATION_MINUTES)
    expires_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(default=timezone.now)
    last_authenticated_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ('-created_at',)
        constraints = [
            models.UniqueConstraint(
                fields=['file', 'username'],
                condition=models.Q(album__isnull=True),
                name='unique_recipient_per_file',
            ),
            models.UniqueConstraint(
                fields=['album', 'username'],
                condition=models.Q(album__isnull=False),
                name='unique_recipient_per_album',
            ),
        ]

    def __str__(self) -> str:
        return f'{self.username} → {self.file_id}'

    def set_password(self, raw_password: str) -> None:
        self.password = make_password(raw_password)

    def verify_password(self, raw_password: str) -> bool:
        if not self.password:
            return False
        return check_password(raw_password, self.password)

    @property
    def latest_link(self) -> 'ShareLink | None':
        return self.share_links.order_by('-created_at').first()

    @property
    def effective_state(self) -> str:
        link = self.latest_link
        if link is None:
            return LinkState.REVOKED
        return link.effective_state


class ShareLink(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    file = models.ForeignKey(SecureFile, related_name='share_links', on_delete=models.CASCADE)
    album = models.ForeignKey(
        Album, related_name='share_links', null=True, blank=True, on_delete=models.CASCADE
    )
    recipient = models.ForeignKey(Recipient, related_name='share_links', on_delete=models.CASCADE)

    # sha256(plaintext token) — the only value used to resolve a link.
    token_hash = models.CharField(max_length=64, unique=True)
    # AES-256-GCM of the plaintext token, so the admin can re-copy the link.
    token_sealed = models.BinaryField()
    token_preview = models.CharField(max_length=16, blank=True)

    state = models.CharField(max_length=12, choices=LinkState.choices, default=LinkState.ACTIVE)

    created_at = models.DateTimeField(default=timezone.now)
    expires_at = models.DateTimeField(null=True, blank=True)
    consumed_at = models.DateTimeField(null=True, blank=True)
    consumed_ip = models.CharField(max_length=45, blank=True)

    successful_views = models.PositiveIntegerField(default=0)
    failed_attempts = models.PositiveIntegerField(default=0)
    last_accessed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ('-created_at',)

    def __str__(self) -> str:
        return f'{self.recipient_username} · {self.state}'

    @property
    def recipient_username(self) -> str:
        return self.recipient.username

    @property
    def effective_state(self) -> str:
        if self.state in (LinkState.REVOKED, LinkState.CONSUMED):
            return self.state
        if self.expires_at and self.expires_at <= timezone.now():
            return LinkState.EXPIRED
        return self.state

    @property
    def viewer_session(self) -> 'ViewerSession | None':
        return getattr(self, 'session', None)


class ViewerSession(models.Model):
    """The single authorized browser session created when a link is consumed."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    link = models.OneToOneField(ShareLink, related_name='session', on_delete=models.CASCADE)
    recipient = models.ForeignKey(Recipient, related_name='sessions', on_delete=models.CASCADE)
    file = models.ForeignKey(SecureFile, related_name='sessions', on_delete=models.CASCADE)
    album = models.ForeignKey(
        Album, related_name='sessions', null=True, blank=True, on_delete=models.CASCADE
    )

    access_id = models.CharField(max_length=32)
    started_at = models.DateTimeField(default=timezone.now)
    # Refreshed by the viewer heartbeat. Absence of a heartbeat means the
    # recipient is no longer looking at the image — a backgrounded or closed
    # tab whose close beacon never reached the server.
    last_seen_at = models.DateTimeField(default=timezone.now)
    expires_at = models.DateTimeField()
    revoked_at = models.DateTimeField(null=True, blank=True)

    ip = models.CharField(max_length=45, blank=True)
    user_agent = models.TextField(blank=True)
    device = models.ForeignKey(
        'monitoring.Device', related_name='sessions', null=True, blank=True, on_delete=models.SET_NULL
    )
    watermark = models.OneToOneField(
        'watermarks.WatermarkRecord', related_name='viewer_session', null=True, blank=True,
        on_delete=models.SET_NULL,
    )

    class Meta:
        ordering = ('-started_at',)

    def __str__(self) -> str:
        return f'session {self.id} for {self.recipient.username}'

    @property
    def is_expired(self) -> bool:
        return self.expires_at <= timezone.now()

    @property
    def is_abandoned(self) -> bool:
        """No heartbeat within the idle window — the recipient has gone away."""
        idle = timezone.now() - self.last_seen_at
        return idle.total_seconds() > settings.SESSION_IDLE_TIMEOUT_SECONDS

    @property
    def is_active(self) -> bool:
        return self.revoked_at is None and not self.is_expired and not self.is_abandoned

    @property
    def remaining_seconds(self) -> int:
        return max(0, int((self.expires_at - timezone.now()).total_seconds()))
