"""Tests for the public recipient viewer.

Covers the two recipient-link policies added on top of the single-use link:
links are phone-only, and an authorized session ends the moment the recipient
minimises the browser or leaves the page.
"""
from __future__ import annotations

from django.conf import settings
from django.test import TestCase, override_settings
from django.utils import timezone

from accounts.models import AdminUser
from core.signing import sign
from monitoring.models import AccessEventType, AccessLog, BlockedIP, is_blocked
from securefiles.models import SecureFile
from sharing.models import LinkState, Recipient, ViewerSession
from sharing.services import issue_link

PHONE_UA = (
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 '
    '(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
)
ANDROID_PHONE_UA = (
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) '
    'Chrome/126.0.0.0 Mobile Safari/537.36'
)
TABLET_UA = (
    'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 '
    '(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
)
DESKTOP_UA = (
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) '
    'Chrome/126.0.0.0 Safari/537.36'
)


class ViewerPolicyTestCase(TestCase):
    def setUp(self):
        self.admin = AdminUser.objects.create_user(
            email='owner@example.test',
            password='secure-admin-password',
            full_name='Owner',
        )
        self.file = SecureFile.objects.create(
            owner=self.admin,
            name='Passport scan',
            extension='JPG',
            mime_type='image/jpeg',
            original_path='originals/passport.bin',
        )
        self.recipient = Recipient.objects.create(file=self.file, username='1234567890')
        self.recipient.set_password('recipient-password')
        self.recipient.save(update_fields=['password'])
        self.link, self.token = issue_link(self.recipient)

    @property
    def resolve_url(self) -> str:
        return f'/api/public/links/{self.token}/'

    @property
    def authenticate_url(self) -> str:
        return f'/api/public/links/{self.token}/authenticate/'

    def make_session(self) -> ViewerSession:
        return ViewerSession.objects.create(
            link=self.link,
            recipient=self.recipient,
            file=self.file,
            access_id='SF-AC-1234-5678',
            expires_at=timezone.now() + timezone.timedelta(minutes=30),
        )

    def authorize(self, session: ViewerSession) -> None:
        """Present the signed viewer cookie the viewer would hold."""
        expires, signature = sign(f'viewer-session:{session.id}', 600)
        self.client.cookies['sf_viewer'] = f'{session.id}.{expires}.{signature}'


class PhoneOnlyPolicyTests(ViewerPolicyTestCase):
    def test_phone_can_resolve_the_link(self):
        response = self.client.get(self.resolve_url, HTTP_USER_AGENT=PHONE_UA)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['state'], LinkState.ACTIVE)

    def test_android_phone_can_resolve_the_link(self):
        response = self.client.get(self.resolve_url, HTTP_USER_AGENT=ANDROID_PHONE_UA)

        self.assertEqual(response.status_code, 200)

    def test_desktop_is_blocked_and_recorded(self):
        response = self.client.get(self.resolve_url, HTTP_USER_AGENT=DESKTOP_UA)

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()['code'], 'mobile_only')
        self.assertTrue(
            AccessLog.objects.filter(event_type=AccessEventType.MOBILE_ONLY_BLOCKED).exists()
        )

    def test_tablet_is_blocked(self):
        response = self.client.get(self.resolve_url, HTTP_USER_AGENT=TABLET_UA)

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()['code'], 'mobile_only')

    def test_desktop_cannot_consume_the_link(self):
        response = self.client.post(
            self.authenticate_url,
            data={'username': self.recipient.username, 'password': 'recipient-password'},
            HTTP_USER_AGENT=DESKTOP_UA,
        )

        self.assertEqual(response.status_code, 403)
        self.link.refresh_from_db()
        self.assertEqual(self.link.state, LinkState.ACTIVE)

    def test_phone_is_not_blocked_by_the_policy(self):
        response = self.client.get(self.resolve_url, HTTP_USER_AGENT=PHONE_UA)

        self.assertFalse(
            AccessLog.objects.filter(event_type=AccessEventType.MOBILE_ONLY_BLOCKED).exists()
        )
        self.assertEqual(response.status_code, 200)


class SessionClosureTests(ViewerPolicyTestCase):
    def test_close_ends_the_session_immediately(self):
        session = self.make_session()
        self.authorize(session)

        response = self.client.post(f'/api/public/sessions/{session.id}/close/')

        self.assertEqual(response.status_code, 204)
        session.refresh_from_db()
        self.assertIsNotNone(session.revoked_at)
        self.assertFalse(session.is_active)

    def test_close_without_the_session_cookie_is_ignored(self):
        session = self.make_session()

        response = self.client.post(f'/api/public/sessions/{session.id}/close/')

        self.assertEqual(response.status_code, 204)
        session.refresh_from_db()
        self.assertIsNone(session.revoked_at)

    def test_session_is_abandoned_when_the_heartbeat_stops(self):
        session = self.make_session()
        ViewerSession.objects.filter(pk=session.pk).update(
            last_seen_at=timezone.now()
            - timezone.timedelta(seconds=settings.SESSION_IDLE_TIMEOUT_SECONDS + 5)
        )

        session.refresh_from_db()
        self.assertTrue(session.is_abandoned)
        self.assertFalse(session.is_active)
        response = self.client.post(f'/api/public/sessions/{session.id}/heartbeat/')
        self.assertEqual(response.status_code, 401)

    def test_heartbeat_keeps_the_session_alive(self):
        session = self.make_session()
        stale = timezone.now() - timezone.timedelta(
            seconds=settings.SESSION_IDLE_TIMEOUT_SECONDS - 30
        )
        ViewerSession.objects.filter(pk=session.pk).update(last_seen_at=stale)

        response = self.client.post(f'/api/public/sessions/{session.id}/heartbeat/')

        self.assertEqual(response.status_code, 200)
        session.refresh_from_db()
        self.assertGreater(session.last_seen_at, stale)
        self.assertTrue(session.is_active)


# A real, publicly routable address so `client_ip` treats it as the client.
PUBLIC_ADDRESS = '8.8.8.8'


class AutoBlockTests(ViewerPolicyTestCase):
    """A burst of failures from one address is blocked once the threshold is hit."""

    def fail_authenticate(self, *, address: str, password: str = 'definitely-wrong'):
        return self.client.post(
            self.authenticate_url,
            data={'username': self.recipient.username, 'password': password},
            HTTP_USER_AGENT=PHONE_UA,
            HTTP_CF_CONNECTING_IP=address,
        )

    @override_settings(AUTO_BLOCK_THRESHOLD=3, LINK_MAX_FAILED_ATTEMPTS=99)
    def test_repeated_failures_block_the_address(self):
        for _ in range(3):
            response = self.fail_authenticate(address=PUBLIC_ADDRESS)

        self.assertEqual(response.status_code, 401)
        self.assertTrue(is_blocked(PUBLIC_ADDRESS))
        self.assertTrue(
            AccessLog.objects.filter(
                event_type=AccessEventType.IP_BLOCKED, ip=PUBLIC_ADDRESS
            ).exists()
        )

    @override_settings(AUTO_BLOCK_THRESHOLD=3, LINK_MAX_FAILED_ATTEMPTS=99)
    def test_a_blocked_address_is_refused_outright(self):
        for _ in range(3):
            self.fail_authenticate(address=PUBLIC_ADDRESS)

        response = self.client.get(
            self.resolve_url,
            HTTP_USER_AGENT=PHONE_UA,
            HTTP_CF_CONNECTING_IP=PUBLIC_ADDRESS,
        )

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()['code'], 'ip_blocked')

    @override_settings(AUTO_BLOCK_THRESHOLD=3, LINK_MAX_FAILED_ATTEMPTS=99)
    def test_failures_below_the_threshold_do_not_block(self):
        for _ in range(2):
            self.fail_authenticate(address=PUBLIC_ADDRESS)

        self.assertFalse(BlockedIP.objects.filter(address=PUBLIC_ADDRESS).exists())

    @override_settings(AUTO_BLOCK_THRESHOLD=0, LINK_MAX_FAILED_ATTEMPTS=99)
    def test_blocking_can_be_disabled(self):
        for _ in range(5):
            response = self.fail_authenticate(address=PUBLIC_ADDRESS)

        self.assertEqual(response.status_code, 401)
        self.assertFalse(BlockedIP.objects.filter(address=PUBLIC_ADDRESS).exists())


class LinkLockTests(ViewerPolicyTestCase):
    """A link that keeps failing is locked rather than left open to guessing."""

    def fail_authenticate(self, *, password: str = 'definitely-wrong'):
        return self.client.post(
            self.authenticate_url,
            data={'username': self.recipient.username, 'password': password},
            HTTP_USER_AGENT=PHONE_UA,
        )

    @override_settings(LINK_MAX_FAILED_ATTEMPTS=3, AUTO_BLOCK_THRESHOLD=0)
    def test_link_is_locked_after_the_attempt_limit(self):
        for _ in range(2):
            response = self.fail_authenticate()
            self.assertEqual(response.status_code, 401)

        response = self.fail_authenticate()

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()['code'], 'link_locked')
        self.link.refresh_from_db()
        self.assertEqual(self.link.state, LinkState.REVOKED)
        self.assertTrue(
            AccessLog.objects.filter(event_type=AccessEventType.LINK_LOCKED).exists()
        )

    @override_settings(LINK_MAX_FAILED_ATTEMPTS=3, AUTO_BLOCK_THRESHOLD=0)
    def test_a_locked_link_stays_locked(self):
        for _ in range(3):
            self.fail_authenticate()

        response = self.fail_authenticate()

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()['code'], 'link_revoked')
