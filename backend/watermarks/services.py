"""Rendition generation — the only place a watermarked image is produced."""
from __future__ import annotations

import uuid

from django.utils import timezone

from core.utils import make_access_id, sha256_hex
from securefiles.storage import read_original
from watermarks.generator import build_watermark_lines, render_watermarked
from watermarks.models import WatermarkRecord
from watermarks.storage import store_rendition


def create_rendition(
    *,
    file,
    recipient_username: str,
    access_id: str | None = None,
    session_id=None,
    opacity: float = 0.18,
    size: float = 1.0,
    securefile_reference: bool = True,
    moment=None,
) -> WatermarkRecord:
    """Decrypt the original, burn the mark in and persist the record.

    Returns the created `WatermarkRecord`; the caller (the viewer) links it to
    the authorized session so the two share one access id.
    """
    moment = moment or timezone.now()
    access_id = access_id or make_access_id()

    original = read_original(file.original_path)
    lines = build_watermark_lines(username=recipient_username)
    rendered = render_watermarked(original, lines, opacity=opacity, size=size)

    record_id = uuid.uuid4()
    rendition_path = store_rendition(str(record_id), rendered)

    return WatermarkRecord.objects.create(
        id=record_id,
        file=file,
        session_id=session_id,
        recipient_username=recipient_username,
        access_id=access_id,
        generated_at=moment,
        output_hash=sha256_hex(rendered),
        verification_status='verified',
        pattern='repeated-diagonal',
        opacity=opacity,
        size=size,
        securefile_reference=securefile_reference,
        size_bytes=len(rendered),
        mime_type='image/jpeg',
        rendition_path=rendition_path,
        watermark_lines=lines,
    )
