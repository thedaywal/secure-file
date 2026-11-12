"""Permanent, recipient-scoped watermarking rendered with Pillow.

The watermark is burned into the actual pixels — a repeated diagonal pattern
covering the entire image — so it survives screenshots, re-encoding and casual
editing. Nothing here is a CSS overlay: once a rendition is produced it cannot
be un-watermarked without visibly destroying the image.

The stamp follows the documented format, e.g. `john_2026 | 09 NOV 2026 - 10:30`.
"""
from __future__ import annotations

from io import BytesIO

from django.conf import settings
from PIL import Image, ImageDraw, ImageFont

# Preferred TrueType faces, in order. A bundled sans-serif is used when none of
# the system fonts are present so generation never hard-fails.
_FONT_CANDIDATES = (
    '/usr/share/fonts/truetype/hack/Hack-Bold.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf',
)

_GRID_COLUMNS = 4
_GRID_ROWS = 6
_ROTATION_DEGREES = -30
_STROKE_WIDTH = 2


def _load_font(px: int) -> ImageFont.FreeTypeFont:
    for path in _FONT_CANDIDATES:
        try:
            return ImageFont.truetype(path, px)
        except OSError:
            continue
    return ImageFont.load_default()


def build_watermark_lines(
    *,
    stamp: str,
    access_id: str,
    file_label: str = '',
    securefile_reference: bool = True,
) -> list[str]:
    """The lines actually drawn onto the image (also stored for the audit)."""
    lines = [stamp]
    if securefile_reference:
        reference = f'SecureFile · {access_id}'
        if file_label:
            reference = f'SecureFile · {file_label} · {access_id}'
        lines.append(reference)
    return lines


def render_watermarked(original_bytes: bytes, lines: list[str], *, opacity: float, size: float) -> bytes:
    """Return JPEG bytes of `original_bytes` with the repeated diagonal mark."""
    source = Image.open(BytesIO(original_bytes))
    source.load()
    if source.mode not in ('RGB', 'RGBA'):
        source = source.convert('RGBA')
    base = source.convert('RGBA')
    width, height = base.size

    if not lines or width == 0 or height == 0:
        buffer = BytesIO()
        base.convert('RGB').save(buffer, format='JPEG', quality=92)
        return buffer.getvalue()

    font_size = max(14, round(width * 0.0125 * max(0.5, size)))
    font = _load_font(font_size)
    alpha = int(round(255 * max(0.05, min(opacity, 0.6))))
    text = '\n'.join(lines)
    spacing = max(4, font_size // 3)

    layer = Image.new('RGBA', base.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    for row in range(_GRID_ROWS):
        for column in range(_GRID_COLUMNS):
            cx = (column + 0.5) / _GRID_COLUMNS * width
            cy = (row + 0.5) / _GRID_ROWS * height
            draw.multiline_text(
                (cx, cy),
                text,
                font=font,
                fill=(255, 255, 255, alpha),
                anchor='mm',
                align='center',
                spacing=spacing,
                stroke_width=_STROKE_WIDTH,
                stroke_fill=(15, 23, 42, alpha),
            )

    rotated = layer.rotate(_ROTATION_DEGREES, resample=Image.BICUBIC, expand=False)
    composited = Image.alpha_composite(base, rotated).convert('RGB')

    buffer = BytesIO()
    composited.save(buffer, format='JPEG', quality=92)
    return buffer.getvalue()


def watermark_ttl_seconds() -> int:
    return settings.CONTENT_URL_TTL_SECONDS
