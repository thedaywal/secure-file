"""Watermark records — one personalized rendition per authorized session.

Each record is the audit anchor for the traceability pillar: it binds a
recipient, an access id, a server timestamp and the SHA-256 of the exact bytes
that were served. The rendition itself is stored encrypted at rest; the original
is never re-served once a recipient-specific copy exists.
"""
from __future__ import annotations

import uuid

from django.db import models
from django.utils import timezone


class WatermarkVerification(models.TextChoices):
    VERIFIED = 'verified', 'Verified'
    UNVERIFIED = 'unverified', 'Unverified'
    MISMATCH = 'mismatch', 'Mismatch'


class WatermarkRecord(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    file = models.ForeignKey(
        'securefiles.SecureFile', related_name='watermark_records', on_delete=models.CASCADE
    )

    # Soft link to the authorized session (no FK, so the sharing app can own the
    # relation and reference this model without a circular migration).
    session_id = models.UUIDField(null=True, blank=True)

    recipient_username = models.CharField(max_length=150)
    access_id = models.CharField(max_length=32)

    generated_at = models.DateTimeField(default=timezone.now)

    output_hash = models.CharField(max_length=64)
    hash_algorithm = models.CharField(max_length=16, default='SHA-256')
    verification_status = models.CharField(
        max_length=12, choices=WatermarkVerification.choices, default=WatermarkVerification.VERIFIED
    )

    pattern = models.CharField(max_length=32, default='repeated-diagonal')
    opacity = models.FloatField(default=0.18)
    size = models.FloatField(default=1.0)
    securefile_reference = models.BooleanField(default=True)

    size_bytes = models.PositiveBigIntegerField(default=0)
    mime_type = models.CharField(max_length=64, default='image/jpeg')

    # AES-256-GCM encrypted rendition (MEDIA_ROOT-relative) + the lines burned
    # into the pixels, retained so an investigator can compare extracted lines.
    rendition_path = models.CharField(max_length=255, blank=True)
    watermark_lines = models.JSONField(default=list, blank=True)

    class Meta:
        ordering = ('-generated_at',)
        indexes = [models.Index(fields=['-generated_at']), models.Index(fields=['output_hash'])]

    def __str__(self) -> str:
        return f'{self.recipient_username} · {self.access_id}'
