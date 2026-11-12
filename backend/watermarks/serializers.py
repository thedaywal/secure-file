"""Serializers for watermark records and leak investigation."""
from __future__ import annotations

from django.conf import settings
from rest_framework import serializers

from core.signing import sign_query
from watermarks.models import WatermarkRecord


def build_preview_url(request, record: WatermarkRecord) -> str:
    """A short-lived, self-authorizing URL to stream the rendition."""
    path = f'/api/watermarks/{record.id}/content/'
    query = sign_query(path, settings.CONTENT_URL_TTL_SECONDS)
    if request is not None:
        return request.build_absolute_uri(f'{path}?{query}')
    return f'{path}?{query}'


class WatermarkRecordSerializer(serializers.Serializer):
    id = serializers.CharField(read_only=True)
    fileId = serializers.CharField(source='file_id', read_only=True)
    fileName = serializers.CharField(source='file.name', read_only=True)
    fileKind = serializers.CharField(source='file.kind', read_only=True)
    extension = serializers.CharField(source='file.extension', read_only=True)
    recipientUsername = serializers.CharField(source='recipient_username', read_only=True)
    accessId = serializers.CharField(source='access_id', read_only=True)
    sessionId = serializers.SerializerMethodField()
    generatedAt = serializers.DateTimeField(source='generated_at', read_only=True)
    outputHash = serializers.CharField(source='output_hash', read_only=True)
    hashAlgorithm = serializers.CharField(source='hash_algorithm', read_only=True)
    verificationStatus = serializers.CharField(source='verification_status', read_only=True)
    pattern = serializers.CharField(read_only=True)
    opacity = serializers.FloatField(read_only=True)
    size = serializers.FloatField(read_only=True)
    sizeBytes = serializers.IntegerField(source='size_bytes', read_only=True)
    previewUrl = serializers.SerializerMethodField()

    def get_sessionId(self, obj: WatermarkRecord) -> str:
        return str(obj.session_id) if obj.session_id else ''

    def get_previewUrl(self, obj: WatermarkRecord) -> str:
        return build_preview_url(self.context.get('request'), obj)


class WatermarkLookupInputSerializer(serializers.Serializer):
    output_hash = serializers.CharField(required=False, allow_blank=True)
    access_id = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        if not (attrs.get('output_hash') or '').strip() and not (attrs.get('access_id') or '').strip():
            raise serializers.ValidationError(
                'Provide a SHA-256 output hash or an access ID to compare against the stored records.'
            )
        return attrs
