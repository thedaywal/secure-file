"""Short-lived, self-authorizing capability URLs.

A browser cannot attach an `Authorization` header to an `<img>` request, so a
watermarked rendition is streamed through a URL that carries its own signature
and expiry. The signature is an HMAC-SHA256 over `path.exp` keyed with the
Django secret, so only the server can mint one and it stays valid only until it
expires.
"""
from __future__ import annotations

import hashlib
import hmac
import time

from django.conf import settings


def _signature(path: str, exp: int) -> str:
    message = f'{path}.{exp}'.encode('utf-8')
    return hmac.new(settings.SECRET_KEY.encode('utf-8'), message, hashlib.sha256).hexdigest()


def sign(path: str, ttl_seconds: int) -> tuple[int, str]:
    """Return `(exp, signature)` grants for `path`."""
    exp = int(time.time()) + max(1, int(ttl_seconds))
    return exp, _signature(path, exp)


def verify(path: str, exp, signature: str) -> bool:
    """Validate a `(exp, signature)` grant for `path`, honouring the expiry."""
    if signature is None:
        return False
    try:
        exp = int(exp)
    except (TypeError, ValueError):
        return False
    if exp <= int(time.time()):
        return False
    return hmac.compare_digest(_signature(path, exp), str(signature))


def sign_query(path: str, ttl_seconds: int) -> str:
    """Return `exp=…&sig=…` ready to append to a URL."""
    exp, signature = sign(path, ttl_seconds)
    return f'exp={exp}&sig={signature}'
