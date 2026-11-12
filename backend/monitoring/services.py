"""Recording helpers for the audit trail.

These are the *only* writers of `AccessLog` and `Device`; keeping the write path
in one module makes the traceability guarantees easy to audit.
"""
from __future__ import annotations

from core.utils import client_ip, parse_user_agent
from monitoring.models import AccessEventType, AccessLog, AccessResult, Device, DeviceType, RiskLevel
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
) -> AccessLog:
    """Write one access-log row, filling audit metadata from the request."""
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
