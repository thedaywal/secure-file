"""Permanent, recipient-scoped watermarking rendered with Pillow.

The watermark is burned into the actual pixels — a repeated diagonal pattern
covering the entire image — so it survives screenshots, re-encoding and casual
editing. Nothing here is a CSS overlay: once a rendition is produced it cannot
be un-watermarked without visibly destroying the image.

The mark is the recipient's username only, drawn in bold black ink.
"""
from __future__ import annotations

from io import BytesIO
import os
from pathlib import Path

from django.conf import settings
from PIL import Image, ImageDraw, ImageFont

# Preferred TrueType faces, in order. A bundled sans-serif is used when none of
# the system fonts are present so generation never hard-fails.
_FONT_CANDIDATES = (
    '/usr/share/fonts/truetype/hack/Hack-Bold.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf',
    str(Path(os.environ.get('WINDIR', r'C:\Windows')) / 'Fonts' / 'arialbd.ttf'),
    str(Path(os.environ.get('WINDIR', r'C:\Windows')) / 'Fonts' / 'segoeuib.ttf'),
)

_GRID_COLUMNS = 4
_GRID_ROWS = 6
_ROTATION_DEGREES = -30
_STROKE_WIDTH = 2

# Bold black ink for the recipient's username; a thin white halo keeps the ink
# legible wherever the image behind it happens to be dark.
_INK = (0, 0, 0)
_HALO = (255, 255, 255)
def _load_font(px: int) -> ImageFont.FreeTypeFont:
    for path in _FONT_CANDIDATES:
        try:
            return ImageFont.truetype(path, px)
        except OSError:
            continue
    try:
        return ImageFont.load_default(size=px)
    except TypeError:
        return ImageFont.load_default()


def build_watermark_lines(*, username: str) -> list[str]:
    """The lines actually drawn onto the image (also stored for the audit).

    The mark carries the recipient's username only, so a leaked copy is
    attributable to the person it was issued to at a glance.
    """
    return [username]


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
    alpha = int(round(255 * max(0.0, min(opacity, 1.0))))
    text = '\n'.join(lines)
    spacing = max(4, font_size // 3)

    layer = Image.new('RGBA', base.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    halo_width = max(_STROKE_WIDTH, round(font_size * 0.05))
    bold_width = max(1, round(font_size * 0.03))
    for row in range(_GRID_ROWS):
        for column in range(_GRID_COLUMNS):
            cx = (column + 0.5) / _GRID_COLUMNS * width
            cy = (row + 0.5) / _GRID_ROWS * height
            draw.multiline_text(
                (cx, cy),
                text,
                font=font,
                fill=(*_HALO, alpha),
                anchor='mm',
                align='center',
                spacing=spacing,
                stroke_width=halo_width,
                stroke_fill=(*_HALO, alpha),
            )
            draw.multiline_text(
                (cx, cy),
                text,
                font=font,
                fill=(*_INK, alpha),
                anchor='mm',
                align='center',
                spacing=spacing,
                stroke_width=bold_width,
                stroke_fill=(*_INK, alpha),
            )

    rotated = layer.rotate(_ROTATION_DEGREES, resample=Image.BICUBIC, expand=False)
    composited = Image.alpha_composite(base, rotated).convert('RGB')

    buffer = BytesIO()
    composited.save(buffer, format='JPEG', quality=92)
    return buffer.getvalue()


def watermark_ttl_seconds() -> int:
    return settings.CONTENT_URL_TTL_SECONDS
