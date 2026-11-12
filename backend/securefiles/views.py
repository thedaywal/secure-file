"""Protected-image endpoints (administrator only)."""
from __future__ import annotations

import csv
import uuid
from pathlib import Path

from django.db.models import Q
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from core.utils import sha256_hex
from securefiles.intake import ImageIntakeError, inspect_image
from securefiles.models import SecureFile, get_or_create_policy
from securefiles.serializers import (
    FilePolicySerializer,
    FilePolicyUpdateSerializer,
    FileUpdateSerializer,
    SecureFileSerializer,
)
from securefiles.storage import delete_original, store_original

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
        return Response(SecureFileSerializer(secure_file).data)

    def delete(self, request, file_id):
        secure_file = self.get_object(request, file_id)
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
