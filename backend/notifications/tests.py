from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import AdminUser
from monitoring.models import AccessLog
from notifications.models import Notification


class NotificationDeleteTests(TestCase):
    def setUp(self):
        self.admin = AdminUser.objects.create_user(
            email='owner@example.test',
            password='secure-admin-password',
            full_name='Owner',
        )
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    def test_delete_dismisses_notification_without_deleting_access_history(self):
        notification = Notification.objects.create(
            category='successful-access',
            title='Image viewed',
            message='A recipient viewed an image.',
        )
        access_log = AccessLog.objects.create(
            event_type='successful-access',
            recipient_username='1234567890',
        )

        response = self.client.delete(f'/api/notifications/{notification.id}/')

        self.assertEqual(response.status_code, 204)
        self.assertFalse(Notification.objects.filter(pk=notification.id).exists())
        self.assertTrue(AccessLog.objects.filter(pk=access_log.id).exists())
