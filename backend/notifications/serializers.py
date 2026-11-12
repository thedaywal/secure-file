"""Serializers for notifications and preferences."""
from __future__ import annotations

from rest_framework import serializers

from notifications.models import CATEGORY_CHOICES, Notification, NotificationPreference


class NotificationSerializer(serializers.Serializer):
    id = serializers.CharField(read_only=True)
    category = serializers.CharField(read_only=True)
    title = serializers.CharField(read_only=True)
    message = serializers.CharField(read_only=True)
    createdAt = serializers.DateTimeField(source='created_at', read_only=True)
    read = serializers.BooleanField(read_only=True)
    severity = serializers.CharField(read_only=True)
    fileId = serializers.SerializerMethodField()
    recipientUsername = serializers.CharField(source='recipient_username', read_only=True)

    def get_fileId(self, obj: Notification) -> str | None:
        return str(obj.file_id) if obj.file_id else None


class NotificationPreferenceSerializer(serializers.Serializer):
    """Output shape for a delivery preference."""

    category = serializers.CharField(read_only=True)
    email = serializers.BooleanField(read_only=True)
    inApp = serializers.BooleanField(source='in_app', read_only=True)
    digest = serializers.CharField(read_only=True)


class PreferenceInputSerializer(serializers.Serializer):
    """Input shape — camelCase, mapped onto the model by `apply`."""

    category = serializers.ChoiceField(choices=[value for value, _ in CATEGORY_CHOICES])
    email = serializers.BooleanField(required=False, default=True)
    inApp = serializers.BooleanField(required=False, default=True)
    digest = serializers.ChoiceField(choices=['instant', 'daily', 'weekly'], required=False, default='instant')


class PreferencesUpdateSerializer(serializers.Serializer):
    preferences = PreferenceInputSerializer(many=True, allow_empty=False)

    def apply(self) -> list[NotificationPreference]:
        saved: list[NotificationPreference] = []
        for row in self.validated_data['preferences']:
            preference, _ = NotificationPreference.objects.get_or_create(category=row['category'])
            preference.email = row['email']
            preference.in_app = row['inApp']
            preference.digest = row['digest']
            preference.save()
            saved.append(preference)
        return saved
