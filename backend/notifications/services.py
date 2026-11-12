"""Runtime notification generation.

The inbox is populated from the security events the platform actually observes:
a consumed single-use link, an unrecognised device, a failed or forwarded
authentication, an expired or revoked link, and an administrator revocation.

Generation is best-effort — a notification must never break the operation that
produced it — and each category honours the operator's in-app delivery
preference. Security-critical alerts bypass that preference.
"""
from __future__ import annotations

from notifications.models import Notification, NotificationPreference

# AccessEventType value -> (notification category, severity, title)
_ACCESS_EVENT_SPECS: dict[str, tuple[str, str, str]] = {
    'successful-access': ('successful-access', 'success', 'Protected image accessed'),
    'link-consumed': ('link-consumed', 'info', 'Access link consumed'),
    'failed-access': ('unauthorized-access', 'warning', 'Failed authentication'),
    'link-reuse-blocked': ('unauthorized-access', 'critical', 'Single-use link reused'),
    'expired-link': ('file-expiration', 'warning', 'Expired link opened'),
    'revoked-link': ('unauthorized-access', 'warning', 'Revoked link opened'),
    'unauthorized-device': ('new-device', 'warning', 'Unrecognised device'),
    'forwarded-link': ('link-forwarded', 'critical', 'Possible link forwarding detected'),
    'download-blocked': ('unauthorized-access', 'warning', 'Download attempt blocked'),
}

# AccessEventType value -> message template. Placeholders: {who} {file} {where} {ip}
_ACCESS_EVENT_MESSAGES: dict[str, str] = {
    'successful-access': '{who} opened “{file}”{where}.',
    'link-consumed': '{who} consumed the single-use link for “{file}”{where}.',
    'failed-access': 'A failed authentication attempt was recorded on “{file}”{where}{ip}.',
    'link-reuse-blocked': 'An already-consumed link for “{file}” was reused{where}{ip}.',
    'expired-link': 'An expired link for “{file}” was opened{where}.',
    'revoked-link': 'A revoked link for “{file}” was opened{where}.',
    'unauthorized-device': 'Access to “{file}” came from an unrecognised device{where}.',
    'forwarded-link': 'The link for “{file}” was opened with unknown credentials{where}{ip}.',
    'download-blocked': 'A download attempt on “{file}” was blocked{where}.',
}


def notify(
    *,
    category: str,
    severity: str,
    title: str,
    message: str,
    file=None,
    recipient_username: str = '',
) -> Notification | None:
    """Create one in-app notification, honouring the category's in-app preference.

    Returns the created row, or ``None`` when the category is muted (non-critical)
    or when creation fails. A notification is never allowed to break its caller.
    """
    try:
        preference, _ = NotificationPreference.objects.get_or_create(category=category)
        if not preference.in_app and severity != 'critical':
            return None
        return Notification.objects.create(
            category=category,
            severity=severity,
            title=title,
            message=message,
            file=file,
            recipient_username=recipient_username,
        )
    except Exception:  # pragma: no cover - notifications are best-effort
        return None


def notify_access_event(
    *,
    event_type: str,
    file=None,
    recipient_username: str = '',
    device_label: str = '',
    ip: str = '',
) -> Notification | None:
    """Raise an in-app notification for one observed access event, if warranted."""
    spec = _ACCESS_EVENT_SPECS.get(event_type)
    template = _ACCESS_EVENT_MESSAGES.get(event_type)
    if spec is None or template is None:
        return None
    category, severity, title = spec
    message = template.format(
        who=recipient_username or 'A recipient',
        file=getattr(file, 'name', '') or 'a protected image',
        where=f' from {device_label}' if device_label else '',
        ip=f' (IP {ip})' if ip else '',
    )
    return notify(
        category=category,
        severity=severity,
        title=title,
        message=message,
        file=file,
        recipient_username=recipient_username,
    )


def notify_new_device(*, device, file=None) -> Notification | None:
    """Alert the operator the first time a device fingerprint is seen."""
    return notify(
        category='new-device',
        severity='warning',
        title='Unrecognised device',
        message=(
            f'A new device ({device.label}) was fingerprinted for '
            f'{device.owner_username or "a recipient"}.'
        ),
        file=file,
        recipient_username=device.owner_username or '',
    )


def notify_access_revoked(*, file=None, recipient_username: str = '') -> Notification | None:
    """Confirm that an administrator revoked a recipient's access."""
    return notify(
        category='access-revoked',
        severity='info',
        title='Access revoked',
        message=(
            f'Access to “{getattr(file, "name", "") or "a protected image"}” was revoked for '
            f'{recipient_username or "a recipient"}.'
        ),
        file=file,
        recipient_username=recipient_username,
    )
