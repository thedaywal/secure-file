"""Shared helpers: request metadata, token generation, hashing and timestamps."""
from __future__ import annotations

import hashlib
import ipaddress
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
def _normalise_ip(value: str) -> str:
    """Strips a port/brackets so `1.2.3.4:5678` and `[::1]:80` compare cleanly."""
    candidate = (value or '').strip().strip('"')
    if not candidate:
        return ''
    if candidate.startswith('['):  # [::1]:443
        candidate = candidate[1:].split(']', 1)[0]
    elif candidate.count(':') == 1 and '.' in candidate:  # 1.2.3.4:443
        candidate = candidate.split(':', 1)[0]
    return candidate


def is_public_ip(value: str) -> bool:
    """True when the address is routable on the public internet."""
    try:
        address = ipaddress.ip_address(_normalise_ip(value))
    except ValueError:
        return False
    return not (
        address.is_private
        or address.is_loopback
        or address.is_link_local
        or address.is_multicast
        or address.is_reserved
        or address.is_unspecified
    )


def client_ip(request) -> str:
    """The recipient's real (public) address, for the audit trail.

    Behind the reverse proxy every hop appends to `X-Forwarded-For`, and the
    WSGI peer is the proxy itself, so the raw header can carry private or
    loopback addresses. The first *public* address in the chain is the actual
    client; only when no public address exists do we fall back to the first
    observed value so the audit trail still records something.
    """
    candidates: list[str] = []
    for header in ('HTTP_CF_CONNECTING_IP', 'HTTP_X_REAL_IP', 'HTTP_X_FORWARDED_FOR'):
        raw = request.META.get(header, '')
        if raw:
            candidates.extend(_normalise_ip(part) for part in raw.split(','))
    candidates.append(_normalise_ip(request.META.get('REMOTE_ADDR', '')))

    for candidate in candidates:
        if candidate and is_public_ip(candidate):
            return candidate
    for candidate in candidates:
        if candidate:
            return candidate
    return '0.0.0.0'


_PHONE_PATTERNS = (r'iphone', r'ipod', r'windows phone', r'blackberry')


def is_phone(user_agent: str) -> bool:
    """Best-effort: is this request coming from a mobile *phone*?

    Tablets are deliberately excluded. That includes the modern iPadOS case,
    where Safari reports a desktop `Macintosh` user agent rather than `iPad`.
    A user agent is trivially spoofable, so this is a policy gate for recipient
    links — a deterrent layered over the single-use link — never an
    authentication factor.
    """
    ua = (user_agent or '').lower()
    if not ua:
        return False
    if any(re.search(pattern, ua) for pattern in _PHONE_PATTERNS):
        return True
    # Android phones always advertise "Mobile"; Android tablets omit it.
    return 'android' in ua and 'mobile' in ua


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
