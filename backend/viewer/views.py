"""Public recipient endpoints — no administrator data is ever exposed here.

Security model (all enforced server-side):
  * resolving a token only reports whether the link is usable — it never
    consumes the link;
  * `authenticate` is the *only* operation that consumes the link, and it does
    so atomically;
  * the authorized session is bound to the browser by a Secure, HttpOnly,
    SameSite cookie;
  * the only asset ever served is a short-lived, recipient-scoped, permanently
    watermarked rendition delivered through a signed capability URL.
"""
from __future__ import annotations

import uuid

from django.conf import settings
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from core.signing import sign, sign_query, verify as verify_signature
from core.utils import client_ip, is_phone, make_access_id, sha256_hex
from monitoring.models import AccessEventType, is_blocked
from monitoring.services import (
    guard_link_reuse,
    guard_repeated_failures,
    record_access,
    upsert_device,
)
from securefiles.models import ProtectionStatus, get_or_create_policy
from sharing.models import LinkState, ViewerSession
from sharing.services import consume_link, find_link_by_token, revoke_link, start_session
from watermarks.models import WatermarkRecord
from watermarks.services import create_rendition
from watermarks.storage import read_rendition

VIEWER_COOKIE = 'sf_viewer'
MAX_FAILED_PASSWORD_LENGTH_GUARD = 4096
# A page that resolves the same link twice (re-mount, refresh, double tap) is one
# visit; only a later, genuinely separate open is recorded as a new event.
LINK_OPENED_DEDUPE_SECONDS = 60

BLOCKED_RESPONSE = {
    'detail': 'Access from this network has been blocked. Ask the sender if you believe this is a mistake.',
    'code': 'ip_blocked',
}

MOBILE_ONLY_RESPONSE = {
    'detail': 'This protected link can only be opened on a mobile phone. Open it on your phone to continue.',
    'code': 'mobile_only',
}


def _blocked_call(request, file, share, recipient_username: str = '') -> bool:
    """Record and report a request from a blocked address. Returns True if blocked."""
    if not is_blocked(client_ip(request)):
        return False
    record_access(
        AccessEventType.IP_BLOCKED,
        request=request,
        file=file,
        share=share,
        recipient_username=recipient_username,
    )
    return True


def _mobile_only_call(request, file, share, recipient_username: str = '') -> bool:
    """Record and report a request from a non-phone device. Returns True if blocked.

    Recipient links are phone-only. This is a policy gate, not an authentication
    factor: a user agent is trivially spoofed, so the single-use link remains the
    real control and the attempt is recorded for the access monitor.
    """
    if is_phone(request.META.get('HTTP_USER_AGENT', '')):
        return False
    record_access(
        AccessEventType.MOBILE_ONLY_BLOCKED,
        request=request,
        file=file,
        share=share,
        recipient_username=recipient_username,
    )
    return True


def _content_url(request, session: ViewerSession, record: WatermarkRecord) -> str:
    path = f'/api/public/sessions/{session.id}/content/{record.id}/'
    query = sign_query(path, settings.CONTENT_URL_TTL_SECONDS)
    return request.build_absolute_uri(f'{path}?{query}')


def _session_payload(request, session: ViewerSession) -> dict:
    if session.album_id:
        files = [
            membership.file
            for membership in session.album.images.select_related('file').all()
        ]
        records = {
            record.file_id: record
            for record in WatermarkRecord.objects.filter(session_id=session.id)
        }
    else:
        files = [session.file]
        record = getattr(session, 'watermark', None)
        records = {record.file_id: record} if record else {}

    images = [
        {
            'fileId': str(file.id),
            'fileName': file.name,
            'fileKind': file.kind,
            'extension': file.extension,
            'contentUrl': _content_url(request, session, records[file.id]),
            'watermarkLines': list(records[file.id].watermark_lines),
        }
        for file in files
        if file.id in records
    ]
    primary = images[0] if images else {}
    file_name = session.album.name if session.album_id else session.file.name
    return {
        'sessionId': str(session.id),
        'fileId': str(session.file_id),
        'albumId': str(session.album_id) if session.album_id else None,
        'fileName': file_name,
        'fileKind': session.file.kind,
        'extension': session.file.extension,
        'imageCount': len(images),
        'images': images,
        'contentUrl': primary.get('contentUrl', ''),
        'recipientUsername': session.recipient.username,
        'accessId': session.access_id,
        'watermarkLines': primary.get('watermarkLines', []),
        'startedAt': session.started_at,
        'expiresAt': session.expires_at,
        'remainingSeconds': session.remaining_seconds,
    }


def _shareable_files(link) -> list:
    files = (
        [membership.file for membership in link.album.images.select_related('file').all()]
        if link.album_id
        else [link.file]
    )
    if not files or any(file.effective_status != ProtectionStatus.PROTECTED for file in files):
        return []
    return files


def _set_viewer_cookie(response, session: ViewerSession, request) -> None:
    exp, signature = sign(f'viewer-session:{session.id}', max(60, session.remaining_seconds))
    response.set_cookie(
        VIEWER_COOKIE,
        f'{session.id}.{exp}.{signature}',
        max_age=max(60, session.remaining_seconds),
        httponly=True,
        samesite='Lax',
        secure=request.is_secure(),
        path='/',
    )


def _session_from_cookie(request) -> ViewerSession | None:
    raw = request.COOKIES.get(VIEWER_COOKIE, '')
    if not raw or raw.count('.') != 2:
        return None
    raw_id, exp, signature = raw.split('.')
    try:
        session_id = uuid.UUID(raw_id)
    except ValueError:
        return None
    if not verify_signature(f'viewer-session:{session_id}', exp, signature):
        return None
    return (
        ViewerSession.objects.select_related('recipient', 'file', 'album', 'watermark', 'link')
        .filter(pk=session_id)
        .first()
    )


class LinkResolveView(APIView):
    """GET /api/public/links/{token}/ — read the link state without consuming it."""

    authentication_classes: list = []
    permission_classes = [AllowAny]

    def get(self, request, token):
        link = find_link_by_token(token)
        if link is None:
            return Response(
                {
                    'fileId': '',
                    'fileName': '',
                    'fileKind': 'image',
                    'extension': '',
                    'ownerName': '',
                    'organization': '',
                    'state': 'INVALID',
                    'expiresAt': None,
                }
            )

        file = link.file
        album = link.album
        state = link.effective_state
        if state == LinkState.ACTIVE and not _shareable_files(link):
            state = LinkState.REVOKED
        if _blocked_call(request, file, link, link.recipient.username):
            return Response(BLOCKED_RESPONSE, status=status.HTTP_403_FORBIDDEN)
        if _mobile_only_call(request, file, link, link.recipient.username):
            return Response(MOBILE_ONLY_RESPONSE, status=status.HTTP_403_FORBIDDEN)
        event = {
            LinkState.ACTIVE: AccessEventType.LINK_OPENED,
            LinkState.EXPIRED: AccessEventType.EXPIRED_LINK,
            LinkState.REVOKED: AccessEventType.REVOKED_LINK,
            LinkState.CONSUMED: AccessEventType.LINK_REUSE_BLOCKED,
        }.get(state, AccessEventType.LINK_OPENED)
        # Fingerprint the opening device too: a forwarded link is often merely
        # clicked before any credentials are entered, and the operator wants that
        # device in the list even when it never authenticates.
        device = upsert_device(
            request=request, owner_username=link.recipient.username, file=file
        )
        record_access(
            event,
            request=request,
            file=file,
            share=link,
            recipient_username=link.recipient.username,
            device=device,
            dedupe_window_seconds=LINK_OPENED_DEDUPE_SECONDS,
        )

        return Response(
            {
                'fileId': str(file.id),
                'albumId': str(album.id) if album else None,
                'fileName': album.name if album else file.name,
                'fileKind': file.kind,
                'extension': file.extension,
                'imageCount': album.images.count() if album else 1,
                'ownerName': file.owner.short_name if file.owner_id else 'SecureFile',
                'organization': file.owner.organization if file.owner_id else '',
                'state': state,
                'expiresAt': link.expires_at,
            }
        )


class LinkAuthenticateView(APIView):
    """POST /api/public/links/{token}/authenticate/ — the only consuming call."""

    authentication_classes: list = []
    permission_classes = [AllowAny]

    def post(self, request, token):
        link = find_link_by_token(token)
        if link is None:
            return Response(
                {'detail': 'This access link is not valid.', 'code': 'invalid_link'},
                status=status.HTTP_404_NOT_FOUND,
            )

        if _blocked_call(request, link.file, link, link.recipient.username):
            return Response(BLOCKED_RESPONSE, status=status.HTTP_403_FORBIDDEN)
        if _mobile_only_call(request, link.file, link, link.recipient.username):
            return Response(MOBILE_ONLY_RESPONSE, status=status.HTTP_403_FORBIDDEN)

        state = link.effective_state
        if state == LinkState.REVOKED:
            return Response(
                {'detail': 'This access link has been revoked.', 'code': 'link_revoked'},
                status=status.HTTP_403_FORBIDDEN,
            )
        if state == LinkState.EXPIRED:
            return Response(
                {'detail': 'This access link has expired.', 'code': 'link_expired'},
                status=status.HTTP_410_GONE,
            )
        if state == LinkState.CONSUMED:
            return Response(
                {
                    'detail': 'This single-use link has already been consumed. Ask the sender for a replacement link.',
                    'code': 'link_consumed',
                },
                status=status.HTTP_409_CONFLICT,
            )
        image_files = _shareable_files(link)
        if not image_files:
            record_access(
                AccessEventType.REVOKED_LINK,
                request=request,
                file=link.file,
                share=link,
                recipient_username=link.recipient.username,
            )
            return Response(
                {'detail': 'This protected content is no longer available.', 'code': 'link_revoked'},
                status=status.HTTP_403_FORBIDDEN,
            )

        username = str(request.data.get('username') or '').strip()
        password = str(request.data.get('password') or '')
        if not username or len(password) < 8 or len(password) > MAX_FAILED_PASSWORD_LENGTH_GUARD:
            raise ValidationError({'username': ['Enter the username and password you were given.']})

        recipient = link.recipient
        authenticated = username == recipient.username and recipient.verify_password(password)
        if not authenticated:
            link.failed_attempts += 1
            link.last_accessed_at = timezone.now()
            link.save(update_fields=['failed_attempts', 'last_accessed_at'])
            # A username that does not match the recipient is evidence of a
            # forwarded link; a wrong password is a failed sign-in.
            event = (
                AccessEventType.FORWARDED_LINK
                if username != recipient.username
                else AccessEventType.FAILED_ACCESS
            )
            record_access(
                event,
                request=request,
                file=link.file,
                share=link,
                recipient_username=username or recipient.username,
            )
            # Enough failures from one address gets it blocked outright.
            address = client_ip(request)
            guard_repeated_failures(
                address,
                reason='Repeated failed sign-ins on a protected link',
                request=request,
                file=link.file,
                share=link,
                recipient_username=username or recipient.username,
            )
            # A link that keeps failing is either under attack or shared widely:
            # lock it and alert the owner rather than permitting endless guesses.
            if link.failed_attempts >= settings.LINK_MAX_FAILED_ATTEMPTS:
                revoke_link(link)
                record_access(
                    AccessEventType.LINK_LOCKED,
                    request=request,
                    file=link.file,
                    share=link,
                    recipient_username=recipient.username,
                )
                return Response(
                    {
                        'detail': (
                            'This link has been locked after too many failed attempts. '
                            'Ask the sender for a replacement link.'
                        ),
                        'code': 'link_locked',
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )
            return Response(
                {
                    'detail': 'The username or password is incorrect.',
                    'code': 'invalid_credentials',
                },
                status=status.HTTP_401_UNAUTHORIZED,
            )

        # Claim the link atomically. If another request won the race, this is a
        # reuse attempt and is blocked.
        if not consume_link(link, client_ip(request)):
            record_access(
                AccessEventType.LINK_REUSE_BLOCKED,
                request=request,
                file=link.file,
                share=link,
                recipient_username=recipient.username,
            )
            # Reusing a consumed link is a deliberate abuse signal: block the
            # address outright so it appears in the blocked-address list.
            guard_link_reuse(
                client_ip(request),
                request=request,
                file=link.file,
                share=link,
                recipient_username=recipient.username,
            )
            return Response(
                {
                    'detail': 'This single-use link has already been consumed. Ask the sender for a replacement link.',
                    'code': 'link_consumed',
                },
                status=status.HTTP_409_CONFLICT,
            )

        policy = get_or_create_policy(link.file)
        session = start_session(
            link,
            recipient,
            make_access_id(),
            client_ip(request),
            request.META.get('HTTP_USER_AGENT', ''),
        )
        session.device = upsert_device(request=request, owner_username=recipient.username, file=link.file)
        session.save(update_fields=['device'])

        records = []
        for image in image_files:
            image_policy = policy if image.id == link.file_id else get_or_create_policy(image)
            records.append(
                create_rendition(
                    file=image,
                    recipient_username=recipient.username,
                    access_id=session.access_id,
                    session_id=session.id,
                    opacity=image_policy.watermark_opacity,
                    size=image_policy.watermark_size,
                    securefile_reference=image_policy.watermark_securefile_reference,
                )
            )
        session.watermark = records[0]
        session.save(update_fields=['watermark'])

        now = timezone.now()
        link.successful_views += 1
        link.last_accessed_at = now
        link.save(update_fields=['successful_views', 'last_accessed_at'])
        recipient.last_authenticated_at = now
        recipient.save(update_fields=['last_authenticated_at'])

        record_access(
            AccessEventType.LINK_CONSUMED,
            request=request,
            file=link.file,
            share=link,
            recipient_username=recipient.username,
            device=session.device,
        )
        record_access(
            AccessEventType.SUCCESSFUL_ACCESS,
            request=request,
            file=link.file,
            share=link,
            recipient_username=recipient.username,
            device=session.device,
        )

        response = Response(_session_payload(request, session))
        _set_viewer_cookie(response, session, request)
        return response


class LinkSessionView(APIView):
    """GET /api/public/links/{token}/session/ — resume an authorized session."""

    authentication_classes: list = []
    permission_classes = [AllowAny]

    def get(self, request, token):
        session = _session_from_cookie(request)
        if session is None or sha256_hex(token) != session.link.token_hash:
            return Response(
                {
                    'detail': 'No authorized session exists for this link yet.',
                    'code': 'session_required',
                },
                status=status.HTTP_409_CONFLICT,
            )
        if not session.is_active:
            return Response(
                {'detail': 'Your viewing session has ended.', 'code': 'session_expired'},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        return Response(_session_payload(request, session))


class SessionHeartbeatView(APIView):
    """POST /api/public/sessions/{id}/heartbeat/ — enforce the session deadline.

    A heartbeat also refreshes `last_seen_at`, which is what lets the backend
    treat a session whose close beacon never arrived as abandoned.
    """

    authentication_classes: list = []
    permission_classes = [AllowAny]

    def post(self, request, session_id):
        session = ViewerSession.objects.filter(pk=session_id).first()
        if session is None:
            return Response(
                {'detail': 'This viewing session no longer exists.', 'code': 'session_not_found'},
                status=status.HTTP_404_NOT_FOUND,
            )
        if not session.is_active:
            return Response(
                {'detail': 'Your viewing session has ended.', 'code': 'session_expired'},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        session.last_seen_at = timezone.now()
        session.save(update_fields=['last_seen_at'])
        return Response({'remainingSeconds': session.remaining_seconds})


class SessionCloseView(APIView):
    """POST /api/public/sessions/{id}/close/ — end the session immediately.

    Called from `visibilitychange`/`pagehide` so a session ends the moment the
    recipient minimises the browser or leaves the page. The viewer cookie must
    resolve to the same session, so a guessed id cannot end someone else's
    session. Always answers 204: this is a fire-and-forget beacon with no
    meaningful response for the sender to act on.
    """

    authentication_classes: list = []
    permission_classes = [AllowAny]

    def post(self, request, session_id):
        session = _session_from_cookie(request)
        if session is None or str(session.id) != str(session_id):
            return Response(status=status.HTTP_204_NO_CONTENT)
        if session.revoked_at is None:
            session.revoked_at = timezone.now()
            session.save(update_fields=['revoked_at'])
        return Response(status=status.HTTP_204_NO_CONTENT)


class SessionEventView(APIView):
    """POST /api/public/sessions/{id}/events/ — record viewer-side events."""

    authentication_classes: list = []
    permission_classes = [AllowAny]

    _BLOCKED_EVENTS = {'blocked-action', 'download-blocked'}

    def post(self, request, session_id):
        session = (
            ViewerSession.objects.select_related('file', 'recipient').filter(pk=session_id).first()
        )
        if session is None:
            return Response(status=status.HTTP_404_NOT_FOUND)

        event = str(request.data.get('event') or '').strip()
        if event in self._BLOCKED_EVENTS:
            record_access(
                AccessEventType.DOWNLOAD_BLOCKED,
                request=request,
                file=session.file,
                share=session.link,
                recipient_username=session.recipient.username,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)


class SessionContentView(APIView):
    """GET /api/public/sessions/{id}/content/?exp=…&sig=…

    Streams the watermarked rendition through a short-lived signed URL, so an
    `<img>` can load it without an Authorization header.
    """

    authentication_classes: list = []
    permission_classes: list = []

    def get(self, request, session_id):
        path = f'/api/public/sessions/{session_id}/content/'
        if not verify_signature(path, request.query_params.get('exp'), request.query_params.get('sig', '')):
            return HttpResponse(status=status.HTTP_403_FORBIDDEN)

        session = (
            ViewerSession.objects.select_related('watermark').filter(pk=session_id).first()
        )
        if session is None or not session.is_active:
            return HttpResponse(status=status.HTTP_403_FORBIDDEN)

        # The signed URL is a bearer capability, so the phone-only policy is
        # enforced on delivery too — not only when the link is opened.
        if _mobile_only_call(
            request, session.file, session.link, session.recipient.username
        ):
            return HttpResponse(status=status.HTTP_403_FORBIDDEN)

        record = getattr(session, 'watermark', None)
        if record is None or not record.rendition_path:
            return HttpResponse(status=status.HTTP_404_NOT_FOUND)

        try:
            payload = read_rendition(record.rendition_path)
        except (OSError, ValueError):
            return HttpResponse(status=status.HTTP_404_NOT_FOUND)

        response = HttpResponse(payload, content_type=record.mime_type or 'image/jpeg')
        response['Cache-Control'] = 'no-store'
        response['Content-Disposition'] = 'inline'
        return response


class SessionRenditionContentView(APIView):
    """Serve one member image from an authorized session's album."""

    authentication_classes: list = []
    permission_classes: list = []

    def get(self, request, session_id, rendition_id):
        path = f'/api/public/sessions/{session_id}/content/{rendition_id}/'
        if not verify_signature(
            path, request.query_params.get('exp'), request.query_params.get('sig', '')
        ):
            return HttpResponse(status=status.HTTP_403_FORBIDDEN)

        session = ViewerSession.objects.filter(pk=session_id).first()
        if session is None or not session.is_active:
            return HttpResponse(status=status.HTTP_403_FORBIDDEN)

        if _mobile_only_call(
            request, session.file, session.link, session.recipient.username
        ):
            return HttpResponse(status=status.HTTP_403_FORBIDDEN)

        record = WatermarkRecord.objects.filter(
            pk=rendition_id, session_id=session.id
        ).first()
        if record is None or not record.rendition_path:
            return HttpResponse(status=status.HTTP_404_NOT_FOUND)

        try:
            payload = read_rendition(record.rendition_path)
        except (OSError, ValueError):
            return HttpResponse(status=status.HTTP_404_NOT_FOUND)

        response = HttpResponse(payload, content_type=record.mime_type or 'image/jpeg')
        response['Cache-Control'] = 'no-store'
        response['Content-Disposition'] = 'inline'
        return response
