"""Serializers for recipients and single-use links."""
from __future__ import annotations

from django.conf import settings
from rest_framework import serializers

from sharing.models import Recipient, ShareLink
from sharing.services import build_share_url, link_plaintext


class RecipientPermissionsSerializer(serializers.Serializer):
    canView = serializers.SerializerMethodField()
    sessionDurationMinutes = serializers.IntegerField(source='session_duration_minutes', read_only=True)
    expiresAt = serializers.DateTimeField(source='expires_at', read_only=True, allow_null=True)

    def get_canView(self, _obj) -> bool:
        # Recipients may only view the watermarked image through the browser.
        return True


class RecipientSerializer(serializers.Serializer):
    id = serializers.CharField(read_only=True)
    username = serializers.CharField(read_only=True)
    displayName = serializers.CharField(source='display_name', read_only=True)
    fileId = serializers.CharField(source='file_id', read_only=True)
    albumId = serializers.SerializerMethodField()
    fileName = serializers.SerializerMethodField()
    imageCount = serializers.SerializerMethodField()
    permissions = RecipientPermissionsSerializer(source='*', read_only=True)
    status = serializers.SerializerMethodField()
    createdAt = serializers.DateTimeField(source='created_at', read_only=True)
    lastAuthenticatedAt = serializers.DateTimeField(source='last_authenticated_at', read_only=True, allow_null=True)

    def get_status(self, obj: Recipient) -> str:
        return obj.effective_state

    def get_albumId(self, obj: Recipient) -> str | None:
        return str(obj.album_id) if obj.album_id else None

    def get_fileName(self, obj: Recipient) -> str:
        return obj.album.name if obj.album_id else obj.file.name

    def get_imageCount(self, obj: Recipient) -> int:
        return obj.album.images.count() if obj.album_id else 1


class ShareLinkSerializer(serializers.Serializer):
    id = serializers.CharField(read_only=True)
    fileId = serializers.CharField(source='file_id', read_only=True)
    albumId = serializers.SerializerMethodField()
    fileName = serializers.SerializerMethodField()
    fileKind = serializers.CharField(source='file.kind', read_only=True)
    imageCount = serializers.SerializerMethodField()
    recipientId = serializers.CharField(source='recipient_id', read_only=True)
    recipientUsername = serializers.CharField(source='recipient.username', read_only=True)
    permissions = RecipientPermissionsSerializer(source='recipient', read_only=True)
    tokenPreview = serializers.CharField(read_only=True)
    url = serializers.SerializerMethodField()
    state = serializers.SerializerMethodField()
    createdAt = serializers.DateTimeField(source='created_at', read_only=True)
    expiresAt = serializers.DateTimeField(read_only=True, allow_null=True)
    consumedAt = serializers.DateTimeField(source='consumed_at', read_only=True, allow_null=True)
    consumedIp = serializers.CharField(source='consumed_ip', read_only=True)
    sessionId = serializers.SerializerMethodField()
    sessionStartedAt = serializers.SerializerMethodField()
    sessionExpiresAt = serializers.SerializerMethodField()
    successfulViews = serializers.IntegerField(source='successful_views', read_only=True)
    failedAttempts = serializers.IntegerField(source='failed_attempts', read_only=True)
    lastAccessedAt = serializers.DateTimeField(source='last_accessed_at', read_only=True, allow_null=True)

    def get_url(self, obj: ShareLink) -> str:
        """The full link, decrypted server-side for the administrator only."""
        try:
            return build_share_url(link_plaintext(obj))
        except Exception:  # pragma: no cover - defensive: never leak a broken link
            return ''

    def get_albumId(self, obj: ShareLink) -> str | None:
        return str(obj.album_id) if obj.album_id else None

    def get_fileName(self, obj: ShareLink) -> str:
        return obj.album.name if obj.album_id else obj.file.name

    def get_imageCount(self, obj: ShareLink) -> int:
        return obj.album.images.count() if obj.album_id else 1

    def get_state(self, obj: ShareLink) -> str:
        return obj.effective_state

    def get_sessionId(self, obj: ShareLink) -> str | None:
        session = obj.viewer_session
        return str(session.id) if session else None

    def get_sessionStartedAt(self, obj: ShareLink) -> str | None:
        session = obj.viewer_session
        return session.started_at.isoformat() if session else None

    def get_sessionExpiresAt(self, obj: ShareLink) -> str | None:
        session = obj.viewer_session
        return session.expires_at.isoformat() if session else None


class RecipientInputSerializer(serializers.Serializer):
    username = serializers.RegexField(
        regex=r'^\d{10}$',
        max_length=10,
        error_messages={'invalid': 'The recipient username must be exactly 10 digits.'},
    )
    password = serializers.RegexField(
        regex=r'^\d{10}$',
        max_length=10,
        trim_whitespace=False,
        write_only=True,
        error_messages={'invalid': 'The recipient password must be exactly 10 digits.'},
    )

    class PermissionsInput(serializers.Serializer):
        sessionDurationMinutes = serializers.IntegerField(required=False, min_value=1, max_value=240)
        expiresAt = serializers.DateTimeField(required=False, allow_null=True)

    display_name = serializers.CharField(max_length=150, required=False, allow_blank=True, default='')
    permissions = PermissionsInput(required=False)


class CreateSharesInputSerializer(serializers.Serializer):
    recipients = RecipientInputSerializer(many=True, allow_empty=False)


class SharePermissionsUpdateSerializer(serializers.Serializer):
    """Explicit camelCase input for a share-permissions PATCH.

    Only the per-recipient tunables are accepted; the fixed access rules
    (view-only, single-use link, single session) can never be changed here.
    """

    sessionDurationMinutes = serializers.IntegerField(
        required=False, min_value=1, max_value=settings.MAX_SESSION_DURATION_MINUTES
    )
    expiresAt = serializers.DateTimeField(required=False, allow_null=True)
