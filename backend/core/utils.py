"""Shared helpers: request metadata, token generation, hashing and timestamps."""
from __future__ import annotations

import hashlib
import re
import secrets
from datetime import datetime

# --------------------------------------------------------------------------- #
# Tokens & hashing
# --------------------------------------------------------------------------- #
def random_token(nbytes: int = 32) -> str:
    """Cryptographically strong, URL-safe token used for links and sessions."""
    return secrets.token_urlsafe(nbytes)


def random_hex(length: int) -> str:
    return secrets.token_hex(max(1, length // 2))[:length]


def sha256_hex(payload) -> str:
    if isinstance(payload, str):
        payload = payload.encode('utf-8')
    return hashlib.sha256(payload).hexdigest()


def make_access_id() -> str:
    """Human-readable access identifier embedded in the watermark."""
    return f'SF-AC-{secrets.randbelow(9000) + 1000}-{secrets.randbelow(9000) + 1000}'


def iso(value: datetime) -> str | None:
    return value.isoformat() if value else None


# --------------------------------------------------------------------------- #
# Request metadata — audit evidence, never an authentication factor
# --------------------------------------------------------------------------- #
def client_ip(request) -> str:
    forwarded = request.META.get('HTTP_X_FORWARDED_FOR', '')
    if forwarded:
        return forwarded.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR', '') or '0.0.0.0'


_OS_PATTERNS = (
    (r'windows nt 10', 'Windows 10/11'),
    (r'windows nt 6\.3', 'Windows 8.1'),
    (r'windows', 'Windows'),
    (r'mac os x|macintosh', 'macOS'),
    (r'android', 'Android'),
    (r'iphone|ipad|ipod', 'iOS'),
    (r'linux', 'Linux'),
)

_BROWSER_PATTERNS = (
    (r'edg/', 'Edge'),
    (r'opr/|opera', 'Opera'),
    (r'chrome/', 'Chrome'),
    (r'firefox/', 'Firefox'),
    (r'safari/', 'Safari'),
)


def parse_user_agent(user_agent: str) -> dict[str, str]:
    """Best-effort device/browser/os classification for the audit trail."""
    ua = (user_agent or '').lower()

    os_name = 'Unknown'
    for pattern, label in _OS_PATTERNS:
        if re.search(pattern, ua):
            os_name = label
            break

    browser = 'Unknown'
    for pattern, label in _BROWSER_PATTERNS:
        if re.search(pattern, ua):
            browser = label
            break

    if any(marker in ua for marker in ('iphone', 'android', 'mobile')):
        device_type = 'mobile'
    elif 'ipad' in ua or 'tablet' in ua:
        device_type = 'tablet'
    elif 'macintosh' in ua or 'mac os x' in ua:
        device_type = 'laptop'
    elif ua:
        device_type = 'desktop'
    else:
        device_type = 'unknown'

    label = f'{browser} on {os_name}' if browser != 'Unknown' else 'Unrecognised device'
    identifier = sha256_hex(f'{user_agent}|{os_name}|{browser}')[:32]

    return {
        'os': os_name,
        'browser': browser,
        'device_type': device_type,
        'label': label,
        'device_identifier': identifier,
    }


# --------------------------------------------------------------------------- #
# Watermark stamp — must match the documented format, e.g.
# `john_2026 | 09 NOV 2026 - 10:30`
# --------------------------------------------------------------------------- #
_MONTHS = ('JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC')


def watermark_stamp(username: str, moment: datetime) -> str:
    local = moment.astimezone()
    return (
        f'{username} | {local.day:02d} {_MONTHS[local.month - 1]} {local.year} '
        f'- {local.hour:02d}:{local.minute:02d}'
    )
