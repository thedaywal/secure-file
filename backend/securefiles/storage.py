"""Encrypted original-image storage.

Originals only ever exist on disk as AES-256-GCM ciphertext. Reading one back
requires the server key and happens exclusively during watermark generation.
"""
from __future__ import annotations

from pathlib import Path

from django.conf import settings

from core.crypto import decrypt_bytes, encrypt_bytes

ORIGINALS_DIRNAME = 'originals'


def _originals_dir() -> Path:
    directory = Path(settings.MEDIA_ROOT) / ORIGINALS_DIRNAME
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def store_original(file_id: str, plaintext: bytes) -> str:
    """Encrypt and persist the original. Returns the MEDIA_ROOT-relative path."""
    path = _originals_dir() / f'{file_id}.enc'
    path.write_bytes(encrypt_bytes(plaintext))
    return f'{ORIGINALS_DIRNAME}/{path.name}'


def read_original(relative_path: str) -> bytes:
    path = Path(settings.MEDIA_ROOT) / relative_path
    return decrypt_bytes(path.read_bytes())


def delete_original(relative_path: str) -> None:
    if not relative_path:
        return
    path = Path(settings.MEDIA_ROOT) / relative_path
    if path.exists():
        path.unlink()
