"""Image intake: validate, fingerprint and normalise an uploaded image."""
from __future__ import annotations

import io

from django.conf import settings
from django.core.exceptions import ValidationError
from PIL import Image, UnidentifiedImageError

# Pillow format -> (SecureFile extension, canonical mime type)
FORMAT_MAP = {
    'JPEG': ('JPEG', 'image/jpeg'),
    'PNG': ('PNG', 'image/png'),
    'WEBP': ('WEBP', 'image/webp'),
}


class ImageIntakeError(ValidationError):
    pass


def inspect_image(data: bytes, declared_mime: str = '') -> dict:
    """Validate that `data` is a supported image and report its properties.

    The declared mime type and filename are never trusted: the real format is
    read from the bytes with Pillow.
    """
    if not data:
        raise ImageIntakeError('The uploaded image is empty.')
    if len(data) > settings.MAX_IMAGE_BYTES:
        limit_mb = settings.MAX_IMAGE_BYTES // (1024 * 1024)
        raise ImageIntakeError(f'Images must be {limit_mb} MB or smaller.')

    try:
        with Image.open(io.BytesIO(data)) as probe:
            probe.verify()
        with Image.open(io.BytesIO(data)) as image:
            image_format = (image.format or '').upper()
            width, height = image.size
    except (UnidentifiedImageError, OSError) as exc:
        raise ImageIntakeError('That file is not a readable image.') from exc

    if image_format not in FORMAT_MAP:
        allowed = ', '.join(settings.ALLOWED_IMAGE_EXTENSIONS)
        raise ImageIntakeError(
            f'SecureFile protects images only ({allowed}). Received {image_format or "an unknown format"}.'
        )

    extension, mime_type = FORMAT_MAP[image_format]

    if declared_mime and declared_mime not in settings.ALLOWED_IMAGE_MIME_TYPES:
        # Advisory only: the bytes already decided the format.
        declared_mime = mime_type

    return {
        'extension': extension,
        'mime_type': mime_type,
        'width': width,
        'height': height,
    }
