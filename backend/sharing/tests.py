from __future__ import annotations

import io
from pathlib import Path
from tempfile import TemporaryDirectory
from urllib.parse import urlsplit

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from PIL import Image
from rest_framework.test import APIClient

from accounts.models import AdminUser
from securefiles.models import Album, SecureFile
from sharing.models import ShareLink, ViewerSession
from watermarks.models import WatermarkRecord


def image_upload(name: str, color: tuple[int, int, int]) -> tuple[str, bytes]:
    buffer = io.BytesIO()
    Image.new('RGB', (24, 24), color).save(buffer, format='PNG')
    return name, buffer.getvalue()


# Recipient links are phone-only, so the public viewer is exercised with a phone
# user agent. This test is about album sharing, not the device policy.
PHONE_UA = (
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 '
    '(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
)


class AlbumShareFlowTests(TestCase):
    def setUp(self):
        self.media = TemporaryDirectory()
        self.addCleanup(self.media.cleanup)
        self.settings_override = override_settings(
            MEDIA_ROOT=Path(self.media.name),
            PUBLIC_VIEW_BASE_URL='https://share.example.test',
        )
        self.settings_override.enable()
        self.addCleanup(self.settings_override.disable)

        self.owner = AdminUser.objects.create_user(
            email='owner@example.test',
            password='secure-admin-password',
            full_name='Owner',
        )
        self.client = APIClient()
        self.client.defaults['HTTP_USER_AGENT'] = PHONE_UA
        self.client.force_authenticate(self.owner)

    def test_album_is_shared_in_one_session_with_a_rendition_per_image(self):
        first_name, first_bytes = image_upload('first.png', (220, 30, 30))
        second_name, second_bytes = image_upload('second.png', (30, 30, 220))
        response = self.client.post(
            '/api/albums/upload/',
            {
                'name': 'Project photos',
                'files': [
                    SimpleUploadedFile(first_name, first_bytes, content_type='image/png'),
                    SimpleUploadedFile(second_name, second_bytes, content_type='image/png'),
                ],
            },
            format='multipart',
        )

        self.assertEqual(response.status_code, 201, response.data)
        album = Album.objects.get(pk=response.data['id'])
        self.assertEqual(album.name, 'Project photos')
        self.assertEqual(album.images.count(), 2)
        self.assertEqual(SecureFile.objects.filter(owner=self.owner).count(), 2)

        share_response = self.client.post(
            f'/api/albums/{album.id}/share/',
            {
                'recipients': [
                    {
                        'username': '1234567890',
                        'password': '0987654321',
                    }
                ]
            },
            format='json',
        )
        self.assertEqual(share_response.status_code, 201, share_response.data)
        self.assertEqual(len(share_response.data['shares']), 1)
        share_data = share_response.data['shares'][0]
        self.assertEqual(share_data['albumId'], str(album.id))
        self.assertEqual(share_data['imageCount'], 2)

        token = urlsplit(share_data['url']).path.rstrip('/').split('/')[-1]
        self.client.force_authenticate(user=None)
        resolve_response = self.client.get(f'/api/public/links/{token}/')
        self.assertEqual(resolve_response.status_code, 200)
        self.assertEqual(resolve_response.data['fileName'], 'Project photos')
        self.assertEqual(resolve_response.data['imageCount'], 2)

        authenticate_response = self.client.post(
            f'/api/public/links/{token}/authenticate/',
            {'username': '1234567890', 'password': '0987654321'},
            format='json',
        )
        self.assertEqual(authenticate_response.status_code, 200, authenticate_response.data)
        session_data = authenticate_response.data
        self.assertEqual(session_data['imageCount'], 2)
        self.assertEqual([image['fileName'] for image in session_data['images']], ['first', 'second'])
        self.assertEqual(len(session_data['images']), 2)
        self.assertTrue(all(image['watermarkLines'] == ['1234567890'] for image in session_data['images']))
        self.assertEqual(ViewerSession.objects.count(), 1)
        self.assertEqual(WatermarkRecord.objects.filter(session_id=session_data['sessionId']).count(), 2)

        first_image_id = session_data['images'][0]['fileId']
        for image in session_data['images']:
            content = urlsplit(image['contentUrl'])
            content_response = self.client.get(f'{content.path}?{content.query}')
            self.assertEqual(content_response.status_code, 200)
            self.assertEqual(content_response['Content-Type'], 'image/jpeg')
            self.assertEqual(content_response['Cache-Control'], 'no-store')

        consumed_response = self.client.post(
            f'/api/public/links/{token}/authenticate/',
            {'username': '1234567890', 'password': '0987654321'},
            format='json',
        )
        self.assertEqual(consumed_response.status_code, 409)

        self.client.force_authenticate(self.owner)
        revoke_response = self.client.patch(
            f'/api/files/{first_image_id}/',
            {'protectionStatus': 'revoked'},
            format='json',
        )
        self.assertEqual(revoke_response.status_code, 200, revoke_response.data)
        self.assertEqual(ShareLink.objects.get(pk=share_data['id']).state, 'REVOKED')
        session = ViewerSession.objects.get(pk=session_data['sessionId'])
        self.assertIsNotNone(session.revoked_at)

        self.client.force_authenticate(user=None)
        content = urlsplit(session_data['images'][0]['contentUrl'])
        self.assertEqual(self.client.get(f'{content.path}?{content.query}').status_code, 403)
