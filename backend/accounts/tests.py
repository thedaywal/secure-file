"""Tests for the administrator sign-in protections.

The console has a single administrator, so the password is the only secret. A
burst of failed sign-ins from one address is recorded in the audit trail and,
past the threshold, the address is blocked outright.
"""
from __future__ import annotations

from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from accounts.models import AdminUser
from monitoring.models import AccessEventType, AccessLog, BlockedIP, is_blocked

# A real, publicly routable address so `client_ip` treats it as the client.
PUBLIC_ADDRESS = '8.8.8.8'
LOGIN_URL = '/api/auth/login/'


class AdminLoginAutoBlockTests(TestCase):
    def setUp(self):
        self.admin = AdminUser.objects.create_user(
            email='owner@example.test',
            password='secure-admin-password',
            full_name='Owner',
        )
        self.client = APIClient()

    def attempt(self, *, password: str, address: str = PUBLIC_ADDRESS):
        return self.client.post(
            LOGIN_URL,
            {'email': 'owner@example.test', 'password': password},
            format='json',
            HTTP_CF_CONNECTING_IP=address,
        )

    def test_a_failed_sign_in_is_recorded(self):
        response = self.attempt(password='definitely-wrong')

        self.assertEqual(response.status_code, 401)
        self.assertTrue(
            AccessLog.objects.filter(
                event_type=AccessEventType.ADMIN_LOGIN_FAILED, ip=PUBLIC_ADDRESS
            ).exists()
        )

    @override_settings(AUTO_BLOCK_THRESHOLD=3)
    def test_repeated_failures_block_the_address(self):
        for _ in range(3):
            response = self.attempt(password='definitely-wrong')

        self.assertEqual(response.status_code, 401)
        self.assertTrue(is_blocked(PUBLIC_ADDRESS))
        self.assertTrue(
            AccessLog.objects.filter(
                event_type=AccessEventType.IP_BLOCKED, ip=PUBLIC_ADDRESS
            ).exists()
        )

    @override_settings(AUTO_BLOCK_THRESHOLD=3)
    def test_failures_below_the_threshold_do_not_block(self):
        for _ in range(2):
            self.attempt(password='definitely-wrong')

        self.assertFalse(BlockedIP.objects.filter(address=PUBLIC_ADDRESS).exists())

    def test_a_blocked_address_cannot_sign_in_even_with_the_right_password(self):
        BlockedIP.objects.create(address=PUBLIC_ADDRESS, reason='test')

        response = self.attempt(password='secure-admin-password')

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()['code'], 'ip_blocked')

    def test_the_correct_password_still_signs_in(self):
        response = self.attempt(password='secure-admin-password')

        self.assertEqual(response.status_code, 200, response.data)
        self.assertIn('tokens', response.json())
