"""Access monitoring — the traceability pillar.

Every state transition on a single-use link is recorded here: a successful
access, a failed authentication, a blocked reuse, an expired or revoked link, a
download attempt and an unexpected device. Device metadata is audit *evidence*
only — it is never an authentication factor.
"""
from __future__ import annotations

import uuid

from django.db import models
from django.utils import timezone


class DeviceType(models.TextChoices):
    DESKTOP = 'desktop', 'Desktop'
    LAPTOP = 'laptop', 'Laptop'
    TABLET = 'tablet', 'Tablet'
    MOBILE = 'mobile', 'Mobile'
    UNKNOWN = 'unknown', 'Unknown'


class TrustStatus(models.TextChoices):
    TRUSTED = 'trusted', 'Trusted'
    UNTRUSTED = 'untrusted', 'Untrusted'
    SUSPICIOUS = 'suspicious', 'Suspicious'


class AccessResult(models.TextChoices):
    SUCCESS = 'success', 'Success'
    FAILED = 'failed', 'Failed'
    BLOCKED = 'blocked', 'Blocked'


class RiskLevel(models.TextChoices):
    LOW = 'low', 'Low'
    MEDIUM = 'medium', 'Medium'
    HIGH = 'high', 'High'
    CRITICAL = 'critical', 'Critical'


class AccessEventType(models.TextChoices):
    SUCCESSFUL_ACCESS = 'successful-access', 'Successful access'
    FAILED_ACCESS = 'failed-access', 'Failed access'
    LINK_OPENED = 'link-opened', 'Link opened'
    LINK_CONSUMED = 'link-consumed', 'Link consumed'
    LINK_REUSE_BLOCKED = 'link-reuse-blocked', 'Link reuse blocked'
    EXPIRED_LINK = 'expired-link', 'Expired link'
    REVOKED_LINK = 'revoked-link', 'Revoked link'
    UNAUTHORIZED_DEVICE = 'unauthorized-device', 'Unauthorized device'
    FORWARDED_LINK = 'forwarded-link', 'Forwarded link'
    DOWNLOAD_BLOCKED = 'download-blocked', 'Download blocked'
    IP_BLOCKED = 'ip-blocked', 'Blocked address'
    MOBILE_ONLY_BLOCKED = 'mobile-only-blocked', 'Non-mobile device blocked'
    LINK_LOCKED = 'link-locked', 'Link locked'
    ADMIN_LOGIN_FAILED = 'admin-login-failed', 'Administrator sign-in failed'


class BlockedIPSource(models.TextChoices):
    MANUAL = 'manual', 'Manual'
    AUTO = 'auto', 'Automatic'


class BlockedIP(models.Model):
    """A block on a client address, added by the administrator or automatically.

    Only the public address is ever stored, and the block is enforced on the
    public viewer endpoints before any link state is revealed. Blocking is a
    deterrent layer on top of the single-use link — it never becomes an
    authentication factor.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    address = models.CharField(max_length=45, unique=True)
    reason = models.CharField(max_length=200, blank=True)
    source = models.CharField(max_length=8, choices=BlockedIPSource.choices, default=BlockedIPSource.MANUAL)
    blocked_at = models.DateTimeField(default=timezone.now)
    last_seen_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ('-blocked_at',)
        verbose_name = 'blocked IP address'
        verbose_name_plural = 'blocked IP addresses'

    def __str__(self) -> str:
        return self.address


def is_blocked(address: str) -> bool:
    """True when the given address (or host part of it) is on the blocklist."""
    if not address:
        return False
    candidate = address.strip()
    return BlockedIP.objects.filter(address=candidate).exists()


class Device(models.Model):
    """Best-effort device fingerprint captured for the audit trail."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner_username = models.CharField(max_length=150, blank=True)
    label = models.CharField(max_length=150)
    device_identifier = models.CharField(max_length=64, blank=True)
    device_type = models.CharField(max_length=16, choices=DeviceType.choices, default=DeviceType.UNKNOWN)
    os = models.CharField(max_length=64, blank=True)
    browser = models.CharField(max_length=64, blank=True)

    first_seen_at = models.DateTimeField(default=timezone.now)
    last_active_at = models.DateTimeField(default=timezone.now)

    trust_status = models.CharField(max_length=16, choices=TrustStatus.choices, default=TrustStatus.UNTRUSTED)
    ip = models.CharField(max_length=45, blank=True)
    location = models.CharField(max_length=120, blank=True)

    class Meta:
        ordering = ('-last_active_at',)

    def __str__(self) -> str:
        return f'{self.label} ({self.owner_username or "unknown"})'

    def touch(self, moment=None) -> None:
        self.last_active_at = moment or timezone.now()
        self.save(update_fields=['last_active_at'])


class AccessLog(models.Model):
    """One immutable row per observed access event."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    file = models.ForeignKey(
        'securefiles.SecureFile', related_name='access_logs', null=True, blank=True, on_delete=models.SET_NULL
    )
    share = models.ForeignKey(
        'sharing.ShareLink', related_name='access_logs', null=True, blank=True, on_delete=models.SET_NULL
    )

    recipient_username = models.CharField(max_length=150, blank=True)
    ip = models.CharField(max_length=45, blank=True)
    device = models.CharField(max_length=150, blank=True)
    device_type = models.CharField(max_length=16, choices=DeviceType.choices, default=DeviceType.UNKNOWN)
    browser = models.CharField(max_length=64, blank=True)
    os = models.CharField(max_length=64, blank=True)
    location = models.CharField(max_length=120, blank=True)

    occurred_at = models.DateTimeField(default=timezone.now)

    result = models.CharField(max_length=12, choices=AccessResult.choices, default=AccessResult.FAILED)
    authenticated = models.BooleanField(default=False)
    event_type = models.CharField(max_length=32, choices=AccessEventType.choices)
    risk_level = models.CharField(max_length=12, choices=RiskLevel.choices, default=RiskLevel.LOW)

    class Meta:
        ordering = ('-occurred_at',)
        indexes = [models.Index(fields=['-occurred_at'])]

    def __str__(self) -> str:
        return f'{self.event_type} · {self.recipient_username or "unknown"}'
