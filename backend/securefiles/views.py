"""Protected-image endpoints (administrator only)."""
from __future__ import annotations

import csv
import uuid
from pathlib import Path

from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from core.utils import sha256_hex
from monitoring.models import AccessLog, Device
from notifications.models import Notification
from securefiles.intake import ImageIntakeError, inspect_image
from securefiles.models import Album, AlbumImage, ProtectionStatus, SecureFile, get_or_create_policy
from securefiles.serializers import (
    AlbumSerializer,
    FilePolicySerializer,
    FilePolicyUpdateSerializer,
    FileUpdateSerializer,
    SecureFileSerializer,
)
from securefiles.storage import delete_original, store_original
from sharing.services import revoke_links_for_file
from watermarks.models import WatermarkRecord
from watermarks.storage import delete_rendition

ORDERING_MAP = {
    'uploadedAt': 'uploaded_at',
    '-uploadedAt': '-uploaded_at',
    'name': 'name',
    '-name': '-name',
    'sizeBytes': 'size_bytes',
    '-sizeBytes': '-size_bytes',
    'updatedAt': 'updated_at',
    '-updatedAt': '-updated_at',
}


def scoped_files(user):
    return SecureFile.objects.filter(owner=user)


def purge_file_evidence(secure_file: SecureFile) -> None:
    """Remove everything the audit trail attached to one protected image.

    Deleting a file is a deliberate, confirmed act, so the records it produced
    go with it: its access events, the device fingerprints captured while its
    link was opened, its notifications and its watermark renditions. A device is
    matched on the (recipient, address, label) triple an access event recorded,
    so devices belonging to other files are left untouched.
    """
    events = AccessLog.objects.filter(file=secure_file)
    correlation = None
    for recipient_username, ip, device_label in events.values_list(
        'recipient_username', 'ip', 'device'
    ):
        clause = None
        if ip:
            clause = Q(owner_username=recipient_username) & Q(ip=ip)
        if device_label:
            label_clause = Q(owner_username=recipient_username) & Q(label=device_label)
            clause = label_clause if clause is None else clause | label_clause
        if clause is not None:
            correlation = clause if correlation is None else correlation | clause

    if correlation is not None:
        Device.objects.filter(correlation).delete()

    events.delete()
    Notification.objects.filter(file=secure_file).delete()

    for record in WatermarkRecord.objects.filter(file=secure_file):
        delete_rendition(record.rendition_path)
    WatermarkRecord.objects.filter(file=secure_file).delete()


def apply_file_query(queryset, params):
    search = (params.get('search') or '').strip()
    if search:
        queryset = queryset.filter(Q(name__icontains=search))

    status_filter = (params.get('status') or '').strip()
    if status_filter and status_filter != 'all':
        queryset = queryset.filter(protection_status=status_filter)

    kind = (params.get('kind') or '').strip()
    if kind and kind != 'all':
        queryset = queryset.filter(kind=kind)

    ordering = ORDERING_MAP.get((params.get('ordering') or '').strip())
    return queryset.order_by(ordering) if ordering else queryset.order_by('-uploaded_at')


class FileListView(APIView):
    """GET /api/files/ — paginated protected-image list."""

    def get(self, request):
        queryset = apply_file_query(scoped_files(request.user), request.query_params)
        paginator = self._paginator()
        page = paginator.paginate_queryset(queryset, request, view=self)
        serializer = SecureFileSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    @staticmethod
    def _paginator():
        from core.pagination import CamelCasePageNumberPagination

        return CamelCasePageNumberPagination()


class FileExportView(APIView):
    """GET /api/files/export/ — CSV of the filtered protected-image list.

    Honours the same search/status/kind filters as the list endpoint so the
    operator exports exactly what they see.
    """

    COLUMNS: tuple[tuple[str, str], ...] = (
        ('name', 'Name'),
        ('extension', 'Format'),
        ('mimeType', 'MIME type'),
        ('sizeBytes', 'Size (bytes)'),
        ('uploadedAt', 'Uploaded at'),
        ('protectionStatus', 'Status'),
        ('encryption', 'Encryption'),
        ('authorizedRecipients', 'Recipients'),
        ('activeShareLinks', 'Active links'),
        ('expiresAt', 'Expires at'),
        ('checksum', 'Checksum'),
        ('tags', 'Tags'),
        ('successfulViews', 'Successful views'),
        ('failedAttempts', 'Failed attempts'),
    )

    def get(self, request):
        queryset = apply_file_query(scoped_files(request.user), request.query_params)
        rows = SecureFileSerializer(queryset, many=True).data

        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="securefile-export.csv"'
        writer = csv.writer(response)
        writer.writerow([label for _, label in self.COLUMNS])
        for row in rows:
            writer.writerow([self._cell(row, key) for key, _ in self.COLUMNS])
        return response

    @staticmethod
    def _cell(row, key):
        value = row.get(key)
        if value is None:
            return ''
        if isinstance(value, list):
            return ', '.join(str(item) for item in value)
        return value


class FileUploadView(APIView):
    """POST /api/files/upload/ — encrypt and store a new original image."""

    def post(self, request):
        upload = request.FILES.get('file')
        if upload is None:
            raise ValidationError({'file': ['An image file is required.']})

        payload = upload.read()
        try:
            info = inspect_image(payload, upload.content_type or '')
        except ImageIntakeError as exc:
            raise ValidationError({'file': exc.messages})

        name = (request.data.get('name') or '').strip() or Path(upload.name or 'image').stem
        if hasattr(request.data, 'getlist'):
            tags = [tag for tag in request.data.getlist('tags') if tag]
        else:
            raw_tags = request.data.get('tags') or []
            tags = raw_tags if isinstance(raw_tags, list) else [raw_tags]

        file_id = uuid.uuid4()
        # The original is encrypted before it touches disk.
        relative_path = store_original(str(file_id), payload)

        secure_file = SecureFile.objects.create(
            id=file_id,
            owner=request.user,
            name=name,
            extension=info['extension'],
            kind='image',
            mime_type=info['mime_type'],
            size_bytes=len(payload),
            checksum=sha256_hex(payload),
            tags=tags,
            original_path=relative_path,
            width=info['width'],
            height=info['height'],
        )
        get_or_create_policy(secure_file)

        return Response(
            SecureFileSerializer(secure_file).data,
            status=status.HTTP_201_CREATED,
        )


class AlbumUploadView(APIView):
    """POST /api/albums/upload/ — store multiple protected images as one album."""

    def post(self, request):
        uploads = request.FILES.getlist('files')
        if not 2 <= len(uploads) <= settings.MAX_ALBUM_IMAGE_COUNT:
            raise ValidationError(
                {'files': [f'Choose between 2 and {settings.MAX_ALBUM_IMAGE_COUNT} images.']}
            )

        total_bytes = sum(upload.size for upload in uploads)
        if total_bytes > settings.MAX_ALBUM_TOTAL_BYTES:
            limit_mb = settings.MAX_ALBUM_TOTAL_BYTES // (1024 * 1024)
            raise ValidationError({'files': [f'The combined album size must be {limit_mb} MB or less.']})

        prepared = []
        for upload in uploads:
            payload = upload.read()
            try:
                info = inspect_image(payload, upload.content_type or '')
            except ImageIntakeError as exc:
                raise ValidationError({upload.name: exc.messages})
            prepared.append((upload, payload, info))

        album_name = (request.data.get('name') or '').strip()
        if not album_name:
            album_name = Path(uploads[0].name or 'Image album').stem
        if len(album_name) > 255:
            raise ValidationError({'name': ['Album names must be 255 characters or fewer.']})

        if hasattr(request.data, 'getlist'):
            tags = [tag for tag in request.data.getlist('tags') if tag]
        else:
            raw_tags = request.data.get('tags') or []
            tags = raw_tags if isinstance(raw_tags, list) else [raw_tags]

        stored_paths: list[str] = []
        album = None
        try:
            with transaction.atomic():
                album = Album.objects.create(owner=request.user, name=album_name)
                for position, (upload, payload, info) in enumerate(prepared):
                    file_id = uuid.uuid4()
                    relative_path = store_original(str(file_id), payload)
                    stored_paths.append(relative_path)
                    secure_file = SecureFile.objects.create(
                        id=file_id,
                        owner=request.user,
                        name=Path(upload.name or f'image-{position + 1}').stem[:255],
                        extension=info['extension'],
                        kind='image',
                        mime_type=info['mime_type'],
                        size_bytes=len(payload),
                        checksum=sha256_hex(payload),
                        tags=tags,
                        original_path=relative_path,
                        width=info['width'],
                        height=info['height'],
                    )
                    AlbumImage.objects.create(album=album, file=secure_file, position=position)
                    get_or_create_policy(secure_file)
        except Exception:
            for relative_path in stored_paths:
                delete_original(relative_path)
            raise

        album = Album.objects.prefetch_related('images__file').get(pk=album.pk)
        return Response(AlbumSerializer(album).data, status=status.HTTP_201_CREATED)


class FileDetailView(APIView):
    """GET / PATCH / DELETE /api/files/{id}/"""

    def get_object(self, request, file_id) -> SecureFile:
        return get_object_or_404(scoped_files(request.user), pk=file_id)

    def get(self, request, file_id):
        return Response(SecureFileSerializer(self.get_object(request, file_id)).data)

    def patch(self, request, file_id):
        secure_file = self.get_object(request, file_id)
        serializer = FileUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        if 'name' in data:
            secure_file.name = data['name']
        if 'tags' in data:
            secure_file.tags = data['tags']
        if 'protectionStatus' in data:
            secure_file.protection_status = data['protectionStatus']
        if 'expiresAt' in data:
            secure_file.expires_at = data['expiresAt']

        secure_file.save()
        if secure_file.protection_status == ProtectionStatus.REVOKED:
            revoke_links_for_file(secure_file)
        return Response(SecureFileSerializer(secure_file).data)

    def delete(self, request, file_id):
        secure_file = self.get_object(request, file_id)
        revoke_links_for_file(secure_file)
        purge_file_evidence(secure_file)
        delete_original(secure_file.original_path)
        secure_file.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class FilePolicyView(APIView):
    """GET / PATCH /api/files/{id}/policies/"""

    def get_object(self, request, file_id) -> SecureFile:
        return get_object_or_404(scoped_files(request.user), pk=file_id)

    def get(self, request, file_id):
        policy = get_or_create_policy(self.get_object(request, file_id))
        return Response(FilePolicySerializer(policy).data)

    def patch(self, request, file_id):
        policy = get_or_create_policy(self.get_object(request, file_id))
        serializer = FilePolicyUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.apply(policy)
        return Response(FilePolicySerializer(policy).data)
