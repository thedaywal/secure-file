"""Protected images and their protection policies.

SecureFile stores images only. Every original is encrypted with AES-256-GCM
before it is written to disk and is never served to a recipient.
"""
from __future__ import annotations

import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone

from accounts.models import AdminUser


class ProtectionStatus(models.TextChoices):
    PROTECTED = 'protected', 'Protected'
    PROCESSING = 'processing', 'Processing'
    DRAFT = 'draft', 'Draft'
    EXPIRED = 'expired', 'Expired'
    REVOKED = 'revoked', 'Revoked'


class SecureFile(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(AdminUser, related_name='files', on_delete=models.CASCADE)

    name = models.CharField(max_length=255)
    extension = models.CharField(max_length=8)
    kind = models.CharField(max_length=16, default='image')
    mime_type = models.CharField(max_length=64)
    size_bytes = models.PositiveBigIntegerField(default=0)

    uploaded_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)
    expires_at = models.DateTimeField(null=True, blank=True)

    protection_status = models.CharField(
        max_length=16, choices=ProtectionStatus.choices, default=ProtectionStatus.PROTECTED
    )

    # SHA-256 of the plaintext original, used for integrity reporting.
    checksum = models.CharField(max_length=64, blank=True)
    tags = models.JSONField(default=list, blank=True)

    # Encrypted blob location (relative to MEDIA_ROOT) and intrinsic dimensions.
    original_path = models.CharField(max_length=255)
    width = models.PositiveIntegerField(default=0)
    height = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ('-uploaded_at',)
        indexes = [models.Index(fields=['-uploaded_at'])]

    def __str__(self) -> str:
        return f'{self.name} ({self.extension})'

    @property
    def owner_name(self) -> str:
        return self.owner.short_name if self.owner_id else 'SecureFile'

    @property
    def is_expired(self) -> bool:
        if self.protection_status == ProtectionStatus.EXPIRED:
            return True
        return bool(self.expires_at and self.expires_at <= timezone.now())

    @property
    def effective_status(self) -> str:
        if self.protection_status in (ProtectionStatus.REVOKED, ProtectionStatus.DRAFT):
            return self.protection_status
        if self.is_expired:
            return ProtectionStatus.EXPIRED
        return self.protection_status


class FilePolicy(models.Model):
    """Protection policy for one image.

    The four access rules, the permanent watermark and the delivery
    restrictions are non-negotiable; only the duration and expiry are tunable.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    file = models.OneToOneField(SecureFile, related_name='policy', on_delete=models.CASCADE)

    session_duration_minutes = models.PositiveIntegerField(default=settings.DEFAULT_SESSION_DURATION_MINUTES)
    link_expires_at = models.DateTimeField(null=True, blank=True)
    flag_unexpected_device = models.BooleanField(default=True)

    watermark_securefile_reference = models.BooleanField(default=True)
    watermark_opacity = models.FloatField(default=0.18)
    watermark_size = models.FloatField(default=1.0)

    class Meta:
        verbose_name_plural = 'file policies'

    def __str__(self) -> str:
        return f'Policy for {self.file_id}'

    def clamp(self) -> None:
        self.session_duration_minutes = max(
            1, min(int(self.session_duration_minutes), settings.MAX_SESSION_DURATION_MINUTES)
        )
        self.watermark_opacity = round(
            max(settings.WATERMARK_MIN_OPACITY, min(float(self.watermark_opacity), settings.WATERMARK_MAX_OPACITY)),
            3,
        )
        self.watermark_size = round(
            max(settings.WATERMARK_MIN_SIZE, min(float(self.watermark_size), settings.WATERMARK_MAX_SIZE)),
            3,
        )


def get_or_create_policy(file: SecureFile) -> FilePolicy:
    policy, _ = FilePolicy.objects.get_or_create(file=file)
    return policy
