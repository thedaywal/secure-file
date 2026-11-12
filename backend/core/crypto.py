"""AES-256-GCM encryption for original images at rest.

Originals are encrypted before they ever touch disk. Only the server holds the
key; recipients only ever receive a personalized, watermarked derivative.
"""
from __future__ import annotations

import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from django.conf import settings

NONCE_BYTES = 12


def _key() -> bytes:
    return settings.ORIGINAL_ENCRYPTION_KEY


def encrypt_bytes(plaintext: bytes) -> bytes:
    """Return `nonce || ciphertext` (the GCM tag is appended by the AEAD)."""
    nonce = os.urandom(NONCE_BYTES)
    ciphertext = AESGCM(_key()).encrypt(nonce, plaintext, None)
    return nonce + ciphertext


def decrypt_bytes(blob: bytes) -> bytes:
    if len(blob) <= NONCE_BYTES:
        raise ValueError('Encrypted payload is truncated.')
    nonce, ciphertext = blob[:NONCE_BYTES], blob[NONCE_BYTES:]
    return AESGCM(_key()).decrypt(nonce, ciphertext, None)
