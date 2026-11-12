"""In-app notifications and their per-category delivery preferences."""
from __future__ import annotations

import uuid

from django.db import models
from django.utils import timezone

CATEGORY_CHOICES = [
    ('successful-access', 'Successful access'),
    ('unauthorized-access', 'Unauthorized access'),
    ('new-device', 'New device'),
    ('link-consumed', 'Link consumed'),
    ('link-forwarded', 'Link forwarded'),
    ('file-expiration', 'File expiration'),
    ('access-revoked', 'Access revoked'),
]

SEVERITY_CHOICES = [
    ('info', 'Info'),
    ('success', 'Success'),
    ('warning', 'Warning'),
    ('critical', 'Critical'),
]

DIGEST_CHOICES = [
    ('instant', 'Instant'),
    ('daily', 'Daily'),
    ('weekly', 'Weekly'),
]


class Notification(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    category = models.CharField(max_length=32, choices=CATEGORY_CHOICES)
    severity = models.CharField(max_length=16, choices=SEVERITY_CHOICES, default='info')
    title = models.CharField(max_length=200)
    message = models.TextField()

    created_at = models.DateTimeField(default=timezone.now)
    read = models.BooleanField(default=False)

    file = models.ForeignKey(
        'securefiles.SecureFile', related_name='notifications', null=True, blank=True, on_delete=models.SET_NULL
    )
    recipient_username = models.CharField(max_length=150, blank=True)

    class Meta:
        ordering = ('-created_at',)

    def __str__(self) -> str:
        return self.title


class NotificationPreference(models.Model):
    category = models.CharField(max_length=32, choices=CATEGORY_CHOICES, unique=True)
    email = models.BooleanField(default=True)
    in_app = models.BooleanField(default=True)
    digest = models.CharField(max_length=12, choices=DIGEST_CHOICES, default='instant')

    class Meta:
        ordering = ('category',)

    def __str__(self) -> str:
        return self.category


def ensure_preferences() -> list[NotificationPreference]:
    """Create the default preference rows on first use."""
    existing = {pref.category for pref in NotificationPreference.objects.all()}
    for category, _label in CATEGORY_CHOICES:
        if category not in existing:
            NotificationPreference.objects.create(
                category=category,
                email=category != 'successful-access',
                in_app=True,
                digest='daily' if category == 'successful-access' else 'instant',
            )
    return list(NotificationPreference.objects.all())
