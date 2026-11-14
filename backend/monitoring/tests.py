import uuid

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import AdminUser
from monitoring.models import AccessLog, Device
from securefiles.models import SecureFile
from sharing.models import LinkState, Recipient, ShareLink, ViewerSession


class DeviceDeleteTests(TestCase):
    def setUp(self):
        self.admin = AdminUser.objects.create_user(
            email='owner@example.test',
            password='secure-admin-password',
            full_name='Owner',
        )
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    def make_device(self, label: str, username: str) -> Device:
        return Device.objects.create(
            label=label,
            device_identifier=f'{label}-fingerprint',
            owner_username=username,
        )

    def make_recipient(self, username: str) -> Recipient:
        protected_file = SecureFile.objects.create(
            owner=self.admin,
            name='Passport scan',
            extension='JPG',
            mime_type='image/jpeg',
            original_path='originals/passport.bin',
        )
        return Recipient.objects.create(file=protected_file, username=username)

    def make_link(self, recipient: Recipient, state: str = LinkState.CONSUMED) -> ShareLink:
        return ShareLink.objects.create(
            file=recipient.file,
            recipient=recipient,
            token_hash=uuid.uuid4().hex,
            token_sealed=b'sealed-token',
            state=state,
        )

    def test_delete_removes_device_and_its_access_logs(self):
        device = self.make_device('Recipient browser', '1234567890')
        access_log = AccessLog.objects.create(
            event_type='successful-access',
            recipient_username='1234567890',
            device=device.label,
        )

        response = self.client.delete(f'/api/devices/{device.id}/')

        self.assertEqual(response.status_code, 204)
        self.assertFalse(Device.objects.filter(pk=device.id).exists())
        self.assertFalse(AccessLog.objects.filter(pk=access_log.id).exists())

    def test_delete_keeps_events_recorded_for_other_devices(self):
        device = self.make_device('Recipient browser', '1234567890')
        other_device_log = AccessLog.objects.create(
            event_type='successful-access',
            recipient_username='1234567890',
            device='A different browser',
        )

        response = self.client.delete(f'/api/devices/{device.id}/')

        self.assertEqual(response.status_code, 204)
        self.assertTrue(AccessLog.objects.filter(pk=other_device_log.id).exists())

    def test_delete_revokes_the_recipients_links_and_sessions(self):
        recipient = self.make_recipient('1234567890')
        device = self.make_device('Recipient browser', recipient.username)

        consumed = self.make_link(recipient)
        unused = self.make_link(recipient, state=LinkState.ACTIVE)
        session = ViewerSession.objects.create(
            link=consumed,
            recipient=recipient,
            file=recipient.file,
            access_id='access-1234',
            expires_at=timezone.now() + timezone.timedelta(minutes=30),
        )

        response = self.client.delete(f'/api/devices/{device.id}/')

        self.assertEqual(response.status_code, 204)
        consumed.refresh_from_db()
        unused.refresh_from_db()
        session.refresh_from_db()
        self.assertEqual(consumed.state, LinkState.REVOKED)
        self.assertEqual(unused.state, LinkState.REVOKED)
        self.assertIsNotNone(session.revoked_at)
        self.assertFalse(session.is_active)

    def test_delete_leaves_other_recipients_links_alone(self):
        device = self.make_device('Recipient browser', '1234567890')
        other_recipient = self.make_recipient('0987654321')
        other_link = self.make_link(other_recipient, state=LinkState.ACTIVE)

        response = self.client.delete(f'/api/devices/{device.id}/')

        self.assertEqual(response.status_code, 204)
        other_link.refresh_from_db()
        self.assertEqual(other_link.state, LinkState.ACTIVE)
