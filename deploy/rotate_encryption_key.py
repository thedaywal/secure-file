"""Offline migration for rotating SecureFile's AES-GCM storage key.

Run from an elevated PowerShell session while SecureFileAPI is stopped:
  $env:NEW_ORIGINAL_ENCRYPTION_KEY = '<base64-encoded 32-byte key>'
  python deploy/rotate_encryption_key.py --rotate --rollback-dir <external-path>

The old key is read from the active Django settings. Keep the rollback
directory until the application and representative shares have been verified.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import os
import shutil
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1] / 'backend'
sys.path.insert(0, str(BACKEND_DIR))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

import django

django.setup()

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from django.conf import settings
from django.db import transaction
from django.utils import timezone
from core.utils import random_token, sha256_hex

from securefiles.models import SecureFile
from sharing.models import LinkState, Recipient, ShareLink, ViewerSession
from watermarks.models import WatermarkRecord

NONCE_BYTES = 12
ENCRYPTED_DIRS = {'originals', 'renditions'}


def decrypt(blob: bytes, key: bytes) -> bytes:
    if len(blob) <= NONCE_BYTES:
        raise ValueError('Encrypted payload is truncated.')
    return AESGCM(key).decrypt(blob[:NONCE_BYTES], blob[NONCE_BYTES:], None)


def encrypt(plaintext: bytes, key: bytes) -> bytes:
    import secrets

    nonce = secrets.token_bytes(NONCE_BYTES)
    return nonce + AESGCM(key).encrypt(nonce, plaintext, None)


def expected_hashes() -> dict[str, str]:
    expected: dict[str, str] = {}
    for record in SecureFile.objects.exclude(original_path='').only('original_path', 'checksum'):
        expected[record.original_path] = record.checksum
    for record in WatermarkRecord.objects.exclude(rendition_path='').only(
        'rendition_path', 'output_hash'
    ):
        expected[record.rendition_path] = record.output_hash
    return expected


def verify_storage(
    root: Path, key: bytes, *, verify_active_links: bool = True
) -> tuple[list[Path], list[Path], list[ShareLink]]:
    if not root.is_dir():
        raise FileNotFoundError(f'Media directory does not exist: {root}')

    expected = expected_hashes()
    encrypted_files = sorted(
        path for path in root.rglob('*.enc') if path.is_file()
    )
    valid_files = []
    orphaned_files = []
    seen_paths = set()
    for path in encrypted_files:
        relative = path.relative_to(root)
        if not relative.parts or relative.parts[0] not in ENCRYPTED_DIRS:
            raise ValueError(f'Unrecognized encrypted asset location: {relative}')
        relative_name = relative.as_posix()
        try:
            plaintext = decrypt(path.read_bytes(), key)
        except Exception:
            if relative_name in expected:
                raise ValueError(f'Database-referenced asset cannot be decrypted: {relative_name}')
            orphaned_files.append(path)
            continue
        seen_paths.add(relative_name)
        valid_files.append(path)
        expected_hash = expected.get(relative_name)
        if expected_hash and hashlib.sha256(plaintext).hexdigest() != expected_hash:
            raise ValueError(f'Plaintext checksum mismatch for {relative_name}')

    missing = set(expected) - seen_paths
    if missing:
        raise FileNotFoundError(f'{len(missing)} database-referenced assets are missing.')

    links = list(ShareLink.objects.only('id', 'token_hash', 'token_sealed'))
    for link in links if verify_active_links else []:
        if link.state != LinkState.ACTIVE:
            continue
        token = decrypt(bytes(link.token_sealed), key)
        if hashlib.sha256(token).hexdigest() != link.token_hash:
            raise ValueError(f'Saved token hash mismatch for share link {link.pk}.')
    return valid_files, orphaned_files, links


def rotate(rollback_dir: Path, new_key: bytes) -> None:
    media_root = Path(settings.MEDIA_ROOT).resolve()
    rollback_dir = rollback_dir.resolve()
    stage_dir = media_root.with_name(f'{media_root.name}.rotation-stage')
    if stage_dir.exists() or rollback_dir.exists():
        raise FileExistsError('Stage or rollback directory already exists; refusing to overwrite.')
    if not rollback_dir.parent.is_dir():
        raise FileNotFoundError('The external rollback parent directory must already exist.')
    if os.stat(media_root).st_dev != os.stat(rollback_dir.parent).st_dev:
        raise OSError('The rollback directory must be on the same volume as media storage.')
    if rollback_dir == media_root or media_root in rollback_dir.parents:
        raise ValueError('The rollback directory must be outside media storage.')

    old_key = settings.ORIGINAL_ENCRYPTION_KEY
    encrypted_files, orphaned_files, _ = verify_storage(
        media_root, old_key, verify_active_links=False
    )
    if new_key == old_key:
        raise ValueError('The new encryption key must differ from the current key.')

    now = timezone.now()
    latest_links: dict[str, ShareLink] = {}
    for link in ShareLink.objects.select_related('recipient').order_by('created_at'):
        latest_links[str(link.recipient_id)] = link
    replacements = []
    for recipient in Recipient.objects.all():
        previous = latest_links.get(str(recipient.pk))
        if previous is None or previous.state not in (LinkState.ACTIVE, LinkState.CONSUMED):
            continue
        if previous.expires_at and previous.expires_at <= now:
            continue
        token = random_token(32)
        replacements.append(
            ShareLink(
                file=recipient.file,
                album=recipient.album,
                recipient=recipient,
                token_hash=sha256_hex(token),
                token_sealed=encrypt(token.encode('utf-8'), new_key),
                token_preview=f'******{token[-6:]}',
                expires_at=previous.expires_at,
            )
        )

    shutil.copytree(media_root, stage_dir, copy_function=shutil.copy2)
    try:
        for source in encrypted_files:
            relative = source.relative_to(media_root)
            plaintext = decrypt(source.read_bytes(), old_key)
            staged = stage_dir / relative
            staged.write_bytes(encrypt(plaintext, new_key))
            if decrypt(staged.read_bytes(), new_key) != plaintext:
                raise ValueError(f'New ciphertext verification failed for {relative}.')

        for orphan in orphaned_files:
            (stage_dir / orphan.relative_to(media_root)).unlink()

        staged_files, _, _ = verify_storage(
            stage_dir, new_key, verify_active_links=False
        )
        if len(staged_files) != len(encrypted_files):
            raise ValueError('Staged storage has an unexpected encrypted-file count.')

        moved_original = False
        try:
            with transaction.atomic():
                ShareLink.objects.filter(state=LinkState.ACTIVE).update(state=LinkState.REVOKED)
                ShareLink.objects.bulk_create(replacements)
                ViewerSession.objects.filter(
                    revoked_at__isnull=True, expires_at__gt=now
                ).update(revoked_at=now)
                os.replace(media_root, rollback_dir)
                moved_original = True
                os.replace(stage_dir, media_root)
                verified_files, _, _ = verify_storage(media_root, new_key)
                if len(verified_files) != len(encrypted_files):
                    raise ValueError('Post-swap encrypted-file verification failed.')
        except Exception:
            if moved_original and rollback_dir.exists():
                if media_root.exists():
                    os.replace(media_root, stage_dir)
                os.replace(rollback_dir, media_root)
            raise
    except Exception:
        if stage_dir.exists():
            shutil.rmtree(stage_dir)
        raise

    print(
        f'Rotated {len(encrypted_files)} encrypted files, retained '
        f'{len(orphaned_files)} unreferenced blobs in the rollback copy, and '
        f'issued {len(replacements)} replacement links.'
    )
    print(f'Original storage retained at: {rollback_dir}')


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--verify-only', action='store_true')
    mode.add_argument('--rotate', action='store_true')
    parser.add_argument('--rollback-dir', type=Path)
    args = parser.parse_args()

    current_key = settings.ORIGINAL_ENCRYPTION_KEY
    if args.verify_only:
        files, orphaned, links = verify_storage(Path(settings.MEDIA_ROOT), current_key)
        print(
            f'Verified {len(files)} encrypted files and {len(links)} active links; '
            f'{len(orphaned)} unreferenced encrypted files remain.'
        )
        return 0

    if args.rollback_dir is None:
        parser.error('--rollback-dir is required with --rotate.')
    encoded_key = os.environ.get('NEW_ORIGINAL_ENCRYPTION_KEY', '').strip()
    if not encoded_key:
        parser.error('NEW_ORIGINAL_ENCRYPTION_KEY must be set.')
    try:
        new_key = base64.b64decode(encoded_key, validate=True)
    except Exception as exc:
        parser.error(f'NEW_ORIGINAL_ENCRYPTION_KEY is not valid base64: {exc}')
    if len(new_key) != 32:
        parser.error('NEW_ORIGINAL_ENCRYPTION_KEY must decode to exactly 32 bytes.')

    rotate(args.rollback_dir, new_key)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
