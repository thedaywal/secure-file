"""Serializers for the access log and the device registry."""
from __future__ import annotations

from rest_framework import serializers

from monitoring.models import AccessLog, BlockedIP, Device


class AccessLogSerializer(serializers.Serializer):
    id = serializers.CharField(read_only=True)
    recipientUsername = serializers.CharField(source='recipient_username', read_only=True)
    ip = serializers.CharField(read_only=True)
    device = serializers.CharField(read_only=True)
    deviceType = serializers.CharField(source='device_type', read_only=True)
    browser = serializers.CharField(read_only=True)
    os = serializers.CharField(read_only=True)
    occurredAt = serializers.DateTimeField(source='occurred_at', read_only=True)
    fileId = serializers.SerializerMethodField()
    fileName = serializers.SerializerMethodField()
    shareId = serializers.SerializerMethodField()
    result = serializers.CharField(read_only=True)
    authenticated = serializers.BooleanField(read_only=True)
    eventType = serializers.CharField(source='event_type', read_only=True)
    riskLevel = serializers.CharField(source='risk_level', read_only=True)
    location = serializers.CharField(read_only=True)

    def get_fileId(self, obj: AccessLog) -> str | None:
        return str(obj.file_id) if obj.file_id else None

    def get_fileName(self, obj: AccessLog) -> str:
        return obj.file.name if obj.file_id else ''

    def get_shareId(self, obj: AccessLog) -> str | None:
        return str(obj.share_id) if obj.share_id else None


class DeviceSerializer(serializers.Serializer):
    id = serializers.CharField(read_only=True)
    label = serializers.CharField(read_only=True)
    deviceIdentifier = serializers.CharField(source='device_identifier', read_only=True)
    deviceType = serializers.CharField(source='device_type', read_only=True)
    os = serializers.CharField(read_only=True)
    browser = serializers.CharField(read_only=True)
    ownerUsername = serializers.CharField(source='owner_username', read_only=True)
    firstSeenAt = serializers.DateTimeField(source='first_seen_at', read_only=True)
    lastActiveAt = serializers.DateTimeField(source='last_active_at', read_only=True)
    trustStatus = serializers.CharField(source='trust_status', read_only=True)
    ip = serializers.CharField(read_only=True)
    location = serializers.CharField(read_only=True)


class DeviceTrustUpdateSerializer(serializers.Serializer):
    trust_status = serializers.ChoiceField(choices=['trusted', 'untrusted', 'suspicious'])


class BlockedIPSerializer(serializers.Serializer):
    id = serializers.CharField(read_only=True)
    address = serializers.CharField(read_only=True)
    reason = serializers.CharField(read_only=True)
    source = serializers.CharField(read_only=True)
    blockedAt = serializers.DateTimeField(source='blocked_at', read_only=True)


class BlockedIPCreateSerializer(serializers.Serializer):
    address = serializers.CharField(max_length=45)
    reason = serializers.CharField(max_length=200, required=False, allow_blank=True, default='')
