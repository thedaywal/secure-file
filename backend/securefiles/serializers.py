"""Serializers for protected images and their policies.

Policy output mirrors the frontend contract exactly, including the locked
literals (`true`) that represent non-negotiable backend rules. Those fields are
read-only: a client cannot switch them off.
"""
from __future__ import annotations

from django.conf import settings
from rest_framework import serializers

from securefiles.models import Album, FilePolicy, ProtectionStatus, SecureFile

LOCKED = True  # documents intent: these policy flags can never be disabled


class SecureFileSerializer(serializers.Serializer):
    id = serializers.CharField(read_only=True)
    name = serializers.CharField(read_only=True)
    extension = serializers.CharField(read_only=True)
    kind = serializers.CharField(read_only=True)
    mimeType = serializers.CharField(source='mime_type', read_only=True)
    sizeBytes = serializers.IntegerField(source='size_bytes', read_only=True)
    uploadedAt = serializers.DateTimeField(source='uploaded_at', read_only=True)
    updatedAt = serializers.DateTimeField(source='updated_at', read_only=True)
    protectionStatus = serializers.SerializerMethodField()
    encryption = serializers.SerializerMethodField()
    authorizedRecipients = serializers.SerializerMethodField()
    activeShareLinks = serializers.SerializerMethodField()
    expiresAt = serializers.DateTimeField(read_only=True, allow_null=True)
    ownerId = serializers.CharField(source='owner_id', read_only=True)
    ownerName = serializers.CharField(source='owner_name', read_only=True)
    checksum = serializers.CharField(read_only=True)
    tags = serializers.ListField(child=serializers.CharField(), read_only=True)
    successfulViews = serializers.SerializerMethodField()
    failedAttempts = serializers.SerializerMethodField()

    def get_protectionStatus(self, obj: SecureFile) -> str:
        return obj.effective_status

    def get_encryption(self, _obj: SecureFile) -> str:
        return 'AES-256-GCM'

    def get_authorizedRecipients(self, obj: SecureFile) -> int:
        return obj.recipients.count()

    def get_activeShareLinks(self, obj: SecureFile) -> int:
        return obj.share_links.filter(state='ACTIVE').count()

    def get_successfulViews(self, obj: SecureFile) -> int:
        return sum(link.successful_views for link in obj.share_links.all())

    def get_failedAttempts(self, obj: SecureFile) -> int:
        return sum(link.failed_attempts for link in obj.share_links.all())


class AlbumSerializer(serializers.Serializer):
    id = serializers.CharField(read_only=True)
    name = serializers.CharField(read_only=True)
    imageCount = serializers.SerializerMethodField()
    createdAt = serializers.DateTimeField(source='created_at', read_only=True)
    images = serializers.SerializerMethodField()

    def get_imageCount(self, obj: Album) -> int:
        return obj.images.count()

    def get_images(self, obj: Album) -> list[dict]:
        files = [membership.file for membership in obj.images.all()]
        return SecureFileSerializer(files, many=True).data


class FileUpdateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255, required=False, allow_blank=False)
    tags = serializers.ListField(child=serializers.CharField(max_length=50), required=False)
    protectionStatus = serializers.ChoiceField(
        choices=[choice.value for choice in ProtectionStatus], required=False
    )
    expiresAt = serializers.DateTimeField(required=False, allow_null=True)


class FilePolicyUpdateSerializer(serializers.Serializer):
    """Explicit, camelCase input for a policy PATCH.

    Only the tunables are accepted. Locked rule flags present in the payload are
    ignored, and permanent watermarking is re-applied server-side regardless.
    """

    class AccessInput(serializers.Serializer):
        sessionDurationMinutes = serializers.IntegerField(
            required=False, min_value=1, max_value=settings.MAX_SESSION_DURATION_MINUTES
        )
        expiresAt = serializers.DateTimeField(required=False, allow_null=True)

    class DeviceInput(serializers.Serializer):
        flagUnexpectedDevice = serializers.BooleanField(required=False)

    class WatermarkInput(serializers.Serializer):
        secureFileReference = serializers.BooleanField(required=False)
        opacity = serializers.FloatField(
            required=False,
            min_value=settings.WATERMARK_MIN_OPACITY,
            max_value=settings.WATERMARK_MAX_OPACITY,
        )
        size = serializers.FloatField(
            required=False,
            min_value=settings.WATERMARK_MIN_SIZE,
            max_value=settings.WATERMARK_MAX_SIZE,
        )

    access = AccessInput(required=False)
    device = DeviceInput(required=False)
    watermark = WatermarkInput(required=False)

    def apply(self, policy: FilePolicy) -> FilePolicy:
        data = self.validated_data

        access = data.get('access') or {}
        if 'sessionDurationMinutes' in access:
            policy.session_duration_minutes = access['sessionDurationMinutes']
        if 'expiresAt' in access:
            policy.link_expires_at = access['expiresAt']

        device = data.get('device') or {}
        if 'flagUnexpectedDevice' in device:
            policy.flag_unexpected_device = device['flagUnexpectedDevice']

        watermark = data.get('watermark') or {}
        if 'secureFileReference' in watermark:
            policy.watermark_securefile_reference = watermark['secureFileReference']
        if 'opacity' in watermark:
            policy.watermark_opacity = watermark['opacity']
        if 'size' in watermark:
            policy.watermark_size = watermark['size']

        policy.clamp()
        policy.save()

        file = policy.file
        file.expires_at = policy.link_expires_at
        file.save(update_fields=['expires_at', 'updated_at'])
        return policy


class AccessControlPolicySerializer(serializers.Serializer):
    recipientCredentials = serializers.SerializerMethodField()
    singleUseLink = serializers.SerializerMethodField()
    singleActiveSession = serializers.SerializerMethodField()
    adminRevocation = serializers.SerializerMethodField()
    sessionDurationMinutes = serializers.IntegerField(source='session_duration_minutes', read_only=True)
    expiresAt = serializers.DateTimeField(source='link_expires_at', read_only=True, allow_null=True)

    def get_recipientCredentials(self, _obj) -> bool:
        return LOCKED

    def get_singleUseLink(self, _obj) -> bool:
        return LOCKED

    def get_singleActiveSession(self, _obj) -> bool:
        return LOCKED

    def get_adminRevocation(self, _obj) -> bool:
        return LOCKED


class DeviceControlPolicySerializer(serializers.Serializer):
    recordDeviceMetadata = serializers.SerializerMethodField()
    flagUnexpectedDevice = serializers.BooleanField(source='flag_unexpected_device', read_only=True)

    def get_recordDeviceMetadata(self, _obj) -> bool:
        return LOCKED


class ViewingRestrictionPolicySerializer(serializers.Serializer):
    disableDownloadControls = serializers.SerializerMethodField()
    disablePrintControls = serializers.SerializerMethodField()
    browserViewingOnly = serializers.SerializerMethodField()
    permanentWatermark = serializers.SerializerMethodField()

    def get_disableDownloadControls(self, _obj) -> bool:
        return LOCKED

    def get_disablePrintControls(self, _obj) -> bool:
        return LOCKED

    def get_browserViewingOnly(self, _obj) -> bool:
        return LOCKED

    def get_permanentWatermark(self, _obj) -> bool:
        return LOCKED


class WatermarkConfigSerializer(serializers.Serializer):
    recipientUsername = serializers.SerializerMethodField()
    accessTimestamp = serializers.SerializerMethodField()
    secureFileReference = serializers.BooleanField(source='watermark_securefile_reference', read_only=True)
    pattern = serializers.SerializerMethodField()
    opacity = serializers.FloatField(source='watermark_opacity', read_only=True)
    size = serializers.FloatField(source='watermark_size', read_only=True)

    def get_recipientUsername(self, _obj) -> bool:
        return LOCKED

    def get_accessTimestamp(self, _obj) -> bool:
        return LOCKED

    def get_pattern(self, _obj) -> str:
        return 'repeated-diagonal'


class FilePolicySerializer(serializers.Serializer):
    access = AccessControlPolicySerializer(source='*', read_only=True)
    device = DeviceControlPolicySerializer(source='*', read_only=True)
    viewing = ViewingRestrictionPolicySerializer(source='*', read_only=True)
    watermark = WatermarkConfigSerializer(source='*', read_only=True)
