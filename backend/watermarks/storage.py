"""Encrypted storage for generated renditions.

A rendition is itself an asset worth protecting: it is written to disk only as
AES-256-GCM ciphertext and is streamed to a browser through a short-lived signed
URL, never as a static file.
"""
from __future__ import annotations

from pathlib import Path

from django.conf import settings

from core.crypto import decrypt_bytes, encrypt_bytes

RENDITIONS_DIRNAME = 'renditions'


def _renditions_dir() -> Path:
    directory = Path(settings.MEDIA_ROOT) / RENDITIONS_DIRNAME
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def store_rendition(record_id: str, plaintext: bytes) -> str:
    path = _renditions_dir() / f'{record_id}.enc'
    path.write_bytes(encrypt_bytes(plaintext))
    return f'{RENDITIONS_DIRNAME}/{path.name}'


def read_rendition(relative_path: str) -> bytes:
    return decrypt_bytes((Path(settings.MEDIA_ROOT) / relative_path).read_bytes())


def delete_rendition(relative_path: str) -> None:
    if not relative_path:
        return
    path = Path(settings.MEDIA_ROOT) / relative_path
    if path.exists():
        path.unlink()
