"""Watermark record endpoints and the administrator leak investigation."""
from __future__ import annotations

import uuid

from django.conf import settings
from django.db.models import Q
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from core.pagination import CamelCasePageNumberPagination
from core.signing import verify as verify_signature
from core.utils import sha256_hex
from watermarks.models import WatermarkRecord, WatermarkVerification
from watermarks.serializers import WatermarkLookupInputSerializer, WatermarkRecordSerializer
from watermarks.storage import read_rendition


def _scoped_records(user):
    return WatermarkRecord.objects.select_related('file').filter(file__owner=user)


class WatermarkListView(APIView):
    """GET /api/watermarks/"""

    def get(self, request):
        queryset = _scoped_records(request.user)

        search = (request.query_params.get('search') or '').strip()
        if search:
            queryset = queryset.filter(
                Q(file__name__icontains=search)
                | Q(recipient_username__icontains=search)
                | Q(access_id__icontains=search)
            )

        file_id = (request.query_params.get('file_id') or '').strip()
        if file_id:
            try:
                queryset = queryset.filter(file_id=uuid.UUID(file_id))
            except ValueError:
                queryset = queryset.none()

        recipient = (request.query_params.get('recipient_username') or '').strip()
        if recipient:
            queryset = queryset.filter(recipient_username=recipient)

        queryset = queryset.order_by('-generated_at')
        paginator = CamelCasePageNumberPagination()
        page = paginator.paginate_queryset(queryset, request, view=self)
        return paginator.get_paginated_response(
            WatermarkRecordSerializer(page, many=True, context={'request': request}).data
        )


class WatermarkDetailView(APIView):
    """GET /api/watermarks/{id}/"""

    def get(self, request, watermark_id):
        record = get_object_or_404(_scoped_records(request.user), pk=watermark_id)
        return Response(WatermarkRecordSerializer(record, context={'request': request}).data)


class WatermarkVerifyView(APIView):
    """POST /api/watermarks/{id}/verify/ — recompute the rendition hash."""

    def post(self, request, watermark_id):
        record = get_object_or_404(_scoped_records(request.user), pk=watermark_id)
        try:
            recomputed = sha256_hex(read_rendition(record.rendition_path))
        except (OSError, ValueError):
            record.verification_status = WatermarkVerification.MISMATCH
            record.save(update_fields=['verification_status'])
            return Response(
                {
                    'detail': 'The stored rendition is missing or unreadable; integrity cannot be confirmed.',
                    'code': 'rendition_unavailable',
                },
                status=status.HTTP_409_CONFLICT,
            )

        record.verification_status = (
            WatermarkVerification.VERIFIED
            if recomputed == record.output_hash
            else WatermarkVerification.MISMATCH
        )
        record.save(update_fields=['verification_status'])
        return Response(WatermarkRecordSerializer(record, context={'request': request}).data)


class WatermarkLookupView(APIView):
    """POST /api/watermarks/lookup/ — attribute a suspected leak.

    The comparison never over-claims: a byte-exact hash match is reported as
    such, an access-id match is reported as a partial match, and no match at all
    is reported as "cannot attribute".
    """

    def post(self, request):
        serializer = WatermarkLookupInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        output_hash = (serializer.validated_data.get('output_hash') or '').strip().lower()
        access_id = (serializer.validated_data.get('access_id') or '').strip()

        record = None
        queryset = _scoped_records(request.user)
        if output_hash:
            record = queryset.filter(output_hash__iexact=output_hash).first()
        if record is None and access_id:
            record = queryset.filter(access_id__iexact=access_id).first()

        if record is None:
            return Response(
                {
                    'record': None,
                    'hashMatches': False,
                    'extractedLines': [],
                    'summary': (
                        'No stored record matches that hash or access ID. The image may be an '
                        'unwatermarked copy, or the watermark may have been removed or reconstructed '
                        '— in that case SecureFile cannot attribute the leak.'
                    ),
                }
            )

        hash_matches = bool(output_hash) and output_hash == record.output_hash.lower()
        serialized = WatermarkRecordSerializer(record, context={'request': request}).data
        return Response(
            {
                'record': serialized,
                'hashMatches': hash_matches,
                'extractedLines': list(record.watermark_lines or []),
                'summary': (
                    f'Byte-exact match. This rendition was generated for “{record.recipient_username}” '
                    f'and is bound to access ID {record.access_id}.'
                    if hash_matches
                    else f'Matched on access ID {record.access_id}. Confirm the extracted watermark '
                    f'lines against the stored record before attributing the leak.'
                ),
            }
        )


class WatermarkContentView(APIView):
    """GET /api/watermarks/{id}/content/?exp=…&sig=…

    Streams the watermarked rendition. The URL is its own capability: an
    HMAC-SHA256 signature over the path plus an expiry, so an `<img>` can load it
    without an Authorization header while it stays inaccessible to anyone else.
    """

    authentication_classes: list = []
    permission_classes: list = []

    def get(self, request, watermark_id):
        path = f'/api/watermarks/{watermark_id}/content/'
        if not verify_signature(
            path, request.query_params.get('exp'), request.query_params.get('sig', '')
        ):
            return HttpResponse(status=status.HTTP_403_FORBIDDEN)

        record = WatermarkRecord.objects.filter(pk=watermark_id).first()
        if record is None or not record.rendition_path:
            return HttpResponse(status=status.HTTP_404_NOT_FOUND)

        try:
            payload = read_rendition(record.rendition_path)
        except (OSError, ValueError):
            return HttpResponse(status=status.HTTP_404_NOT_FOUND)

        response = HttpResponse(payload, content_type=record.mime_type or 'image/jpeg')
        response['Cache-Control'] = 'private, max-age=60'
        response['Content-Disposition'] = 'inline'
        return response
