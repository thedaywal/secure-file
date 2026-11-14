"""Recording helpers for the audit trail.

These are the *only* writers of `AccessLog` and `Device`; keeping the write path
in one module makes the traceability guarantees easy to audit.
"""
from __future__ import annotations

from datetime import timedelta

from django.conf import settings
from django.utils import timezone

from core.utils import client_ip, parse_user_agent
from monitoring.models import (
    AccessEventType,
    AccessLog,
    AccessResult,
    BlockedIP,
    BlockedIPSource,
    Device,
    DeviceType,
    RiskLevel,
    is_blocked,
)
from notifications.services import notify_access_event, notify_new_device

# Sensible defaults so a caller only has to supply the event type.
_EVENT_DEFAULTS: dict[str, tuple[str, str, bool]] = {
    # event_type: (result, risk_level, authenticated)
    AccessEventType.SUCCESSFUL_ACCESS: (AccessResult.SUCCESS, RiskLevel.LOW, True),
    AccessEventType.LINK_CONSUMED: (AccessResult.SUCCESS, RiskLevel.LOW, True),
    AccessEventType.LINK_OPENED: (AccessResult.SUCCESS, RiskLevel.LOW, False),
    AccessEventType.FAILED_ACCESS: (AccessResult.FAILED, RiskLevel.MEDIUM, False),
    AccessEventType.LINK_REUSE_BLOCKED: (AccessResult.BLOCKED, RiskLevel.HIGH, False),
    AccessEventType.EXPIRED_LINK: (AccessResult.BLOCKED, RiskLevel.MEDIUM, False),
    AccessEventType.REVOKED_LINK: (AccessResult.BLOCKED, RiskLevel.HIGH, False),
    AccessEventType.UNAUTHORIZED_DEVICE: (AccessResult.FAILED, RiskLevel.HIGH, False),
    AccessEventType.FORWARDED_LINK: (AccessResult.FAILED, RiskLevel.HIGH, False),
    AccessEventType.DOWNLOAD_BLOCKED: (AccessResult.BLOCKED, RiskLevel.MEDIUM, True),
    AccessEventType.IP_BLOCKED: (AccessResult.BLOCKED, RiskLevel.HIGH, False),
    AccessEventType.MOBILE_ONLY_BLOCKED: (AccessResult.BLOCKED, RiskLevel.MEDIUM, False),
    AccessEventType.LINK_LOCKED: (AccessResult.BLOCKED, RiskLevel.HIGH, False),
    AccessEventType.ADMIN_LOGIN_FAILED: (AccessResult.FAILED, RiskLevel.MEDIUM, False),
}


def upsert_device(*, request, owner_username: str = '', file=None) -> Device:
    """Create or refresh the device fingerprint for the current request.

    Devices are keyed by (owner, user-agent fingerprint, IP) so that two people
    who pass a link between themselves are recorded as separate devices even when
    they share the same browser and OS. IP is audit evidence only — it is never an
    authentication factor.
    """
    user_agent = request.META.get('HTTP_USER_AGENT', '')
    parsed = parse_user_agent(user_agent)
    ip = client_ip(request)

    device, created = Device.objects.get_or_create(
        device_identifier=parsed['device_identifier'] or 'unknown',
        owner_username=owner_username,
        ip=ip,
        defaults={
            'label': parsed['label'],
            'device_type': parsed['device_type'] or DeviceType.UNKNOWN,
            'os': parsed['os'],
            'browser': parsed['browser'],
        },
    )
    if created:
        notify_new_device(device=device, file=file)
        return device

    device.label = parsed['label'] or device.label
    device.device_type = parsed['device_type'] or device.device_type
    device.os = parsed['os'] or device.os
    device.browser = parsed['browser'] or device.browser
    device.touch()
    return device


def record_access(
    event_type: str,
    *,
    request=None,
    file=None,
    share=None,
    recipient_username: str = '',
    device: Device | None = None,
    result: str | None = None,
    risk_level: str | None = None,
    authenticated: bool | None = None,
    location: str = '',
    dedupe_window_seconds: int = 0,
) -> AccessLog:
    """Write one access-log row, filling audit metadata from the request.

    `dedupe_window_seconds` collapses a repeat of the *same* event for the same
    link, address and device inside a short window. A page that resolves a link
    more than once (a re-mount, a refresh, a double tap) is one visit, not two,
    and should not inflate the audit trail.
    """
    default_result, default_risk, default_auth = _EVENT_DEFAULTS.get(
        event_type, (AccessResult.FAILED, RiskLevel.LOW, False)
    )

    ip = ''
    device_label = ''
    device_type = DeviceType.UNKNOWN
    browser = ''
    os_name = ''

    if device is not None:
        device_label = device.label
        device_type = device.device_type
        browser = device.browser
        os_name = device.os
        ip = device.ip or ''

    if request is not None:
        ip = client_ip(request) or ip
        if device is None:
            parsed = parse_user_agent(request.META.get('HTTP_USER_AGENT', ''))
            device_label = parsed['label']
            device_type = parsed['device_type'] or DeviceType.UNKNOWN
            browser = parsed['browser']
            os_name = parsed['os']

    if dedupe_window_seconds > 0:
        recent = (
            AccessLog.objects.filter(
                event_type=event_type,
                share=share,
                ip=ip,
                device=device_label,
                occurred_at__gte=timezone.now() - timedelta(seconds=dedupe_window_seconds),
            )
            .order_by('-occurred_at')
            .first()
        )
        if recent is not None:
            return recent

    log = AccessLog.objects.create(
        file=file,
        share=share,
        recipient_username=recipient_username,
        ip=ip,
        device=device_label,
        device_type=device_type,
        browser=browser,
        os=os_name,
        location=location,
        result=result or default_result,
        authenticated=default_auth if authenticated is None else authenticated,
        event_type=event_type,
        risk_level=risk_level or default_risk,
    )

    notify_access_event(
        event_type=event_type,
        file=file,
        recipient_username=recipient_username,
        device_label=log.device,
        ip=log.ip,
    )
    return log


# --------------------------------------------------------------------------- #
# Automatic blocking
#
# The blocklist is only useful if something adds to it. A burst of failures from
# one address is the clearest signal available: the count comes straight from the
# audit rows just written, so the block always has the evidence behind it.
# --------------------------------------------------------------------------- #
def _recent_failure_count(address: str, window_seconds: int) -> int:
    since = timezone.now() - timedelta(seconds=window_seconds)
    return AccessLog.objects.filter(
        ip=address,
        occurred_at__gte=since,
        result__in=[AccessResult.FAILED, AccessResult.BLOCKED],
    ).count()


def block_address(
    address: str, *, reason: str, source: str = BlockedIPSource.MANUAL
) -> BlockedIP | None:
    """Add an address to the blocklist, or refresh an existing row's reason."""
    if not address:
        return None
    block, created = BlockedIP.objects.get_or_create(
        address=address, defaults={'reason': reason[:200], 'source': source}
    )
    if not created:
        block.reason = reason[:200] or block.reason
        block.last_seen_at = timezone.now()
        block.save(update_fields=['reason', 'last_seen_at'])
    return block


def _auto_block(
    address: str,
    *,
    reason: str,
    request=None,
    file=None,
    share=None,
    recipient_username: str = '',
) -> BlockedIP | None:
    """Block an address automatically and record the block in the audit trail."""
    block = block_address(address, reason=reason, source=BlockedIPSource.AUTO)
    if block is None:
        return None
    record_access(
        AccessEventType.IP_BLOCKED,
        request=request,
        file=file,
        share=share,
        recipient_username=recipient_username,
    )
    return block


def guard_repeated_failures(
    address: str,
    *,
    reason: str,
    request=None,
    file=None,
    share=None,
    recipient_username: str = '',
) -> BlockedIP | None:
    """Block an address once enough recent failures have accumulated.

    Call this *after* the failure has been recorded, so the block rests on audit
    evidence. Returns the block row when one was created, else ``None`` — the
    caller only needs to react to a fresh block.

    The thresholds are read from settings at call time so they can be tuned (and
    overridden in tests) without a code change.
    """
    if not address or is_blocked(address):
        return None
    threshold = int(getattr(settings, 'AUTO_BLOCK_THRESHOLD', 10))
    window = int(getattr(settings, 'AUTO_BLOCK_WINDOW_SECONDS', 900))
    if threshold <= 0 or _recent_failure_count(address, window) < threshold:
        return None

    return _auto_block(
        address,
        reason=reason,
        request=request,
        file=file,
        share=share,
        recipient_username=recipient_username,
    )


def guard_link_reuse(
    address: str,
    *,
    request=None,
    file=None,
    share=None,
    recipient_username: str = '',
) -> BlockedIP | None:
    """Block an address outright when it tries to reuse a consumed link.

    Reuse of a single-use link is the strongest abuse signal available, so the
    address is blocked on the first attempt rather than waiting for a threshold.
    """
    if not address or is_blocked(address):
        return None
    return _auto_block(
        address,
        reason='Attempted to reuse a consumed single-use link',
        request=request,
        file=file,
        share=share,
        recipient_username=recipient_username,
    )
