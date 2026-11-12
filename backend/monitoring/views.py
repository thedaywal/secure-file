"""Access-log and device endpoints (administrator only)."""
from __future__ import annotations

import uuid

from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from core.pagination import CamelCasePageNumberPagination
from monitoring.models import AccessLog, Device
from monitoring.serializers import AccessLogSerializer, DeviceSerializer, DeviceTrustUpdateSerializer

ORDERING_MAP = {
    'occurredAt': 'occurred_at',
    '-occurredAt': '-occurred_at',
}


def _logs_scoped(user):
    return AccessLog.objects.select_related('file').filter(
        Q(file__owner=user) | Q(file__isnull=True)
    )


def _apply_log_filters(queryset, params):
    search = (params.get('search') or '').strip()
    if search:
        queryset = queryset.filter(
            Q(recipient_username__icontains=search)
            | Q(file__name__icontains=search)
            | Q(ip__icontains=search)
            | Q(device__icontains=search)
        )

    result = (params.get('result') or '').strip()
    if result and result != 'all':
        queryset = queryset.filter(result=result)

    event_type = (params.get('event_type') or '').strip()
    if event_type and event_type != 'all':
        queryset = queryset.filter(event_type=event_type)

    file_id = (params.get('file_id') or '').strip()
    if file_id:
        try:
            queryset = queryset.filter(file_id=uuid.UUID(file_id))
        except ValueError:
            queryset = queryset.none()

    recipient = (params.get('recipient_username') or '').strip()
    if recipient:
        queryset = queryset.filter(recipient_username=recipient)

    date_from = (params.get('date_from') or '').strip()
    if date_from:
        queryset = queryset.filter(occurred_at__gte=date_from)

    date_to = (params.get('date_to') or '').strip()
    if date_to:
        queryset = queryset.filter(occurred_at__lte=date_to)

    ordering = ORDERING_MAP.get((params.get('ordering') or '').strip())
    return queryset.order_by(ordering) if ordering else queryset.order_by('-occurred_at')


class AccessLogListView(APIView):
    """GET /api/access-logs/"""

    def get(self, request: Request):
        queryset = _apply_log_filters(_logs_scoped(request.user), request.query_params)
        paginator = CamelCasePageNumberPagination()
        page = paginator.paginate_queryset(queryset, request, view=self)
        return paginator.get_paginated_response(AccessLogSerializer(page, many=True).data)


class RecentAccessView(APIView):
    """GET /api/access-logs/recent/ — the newest N events for the dashboard."""

    def get(self, request: Request):
        try:
            limit = int(request.query_params.get('limit', '8'))
        except ValueError:
            limit = 8
        limit = max(1, min(limit, 50))
        rows = _logs_scoped(request.user).order_by('-occurred_at')[:limit]
        return Response(AccessLogSerializer(rows, many=True).data)


class DeviceListView(APIView):
    """GET /api/devices/ — traceability evidence, not an authentication factor."""

    def get(self, request: Request):
        queryset = Device.objects.all()

        search = (request.query_params.get('search') or '').strip()
        if search:
            queryset = queryset.filter(
                Q(label__icontains=search)
                | Q(owner_username__icontains=search)
                | Q(device_identifier__icontains=search)
                | Q(os__icontains=search)
            )

        trust = (request.query_params.get('trust_status') or '').strip()
        if trust and trust != 'all':
            queryset = queryset.filter(trust_status=trust)

        owner = (request.query_params.get('owner_username') or '').strip()
        if owner:
            queryset = queryset.filter(owner_username=owner)

        queryset = queryset.order_by('-last_active_at')
        paginator = CamelCasePageNumberPagination()
        page = paginator.paginate_queryset(queryset, request, view=self)
        return paginator.get_paginated_response(DeviceSerializer(page, many=True).data)


class DeviceDetailView(APIView):
    """PATCH /api/devices/{id}/ — annotate the trust flag on a captured device."""

    def patch(self, request: Request, device_id):
        device = get_object_or_404(Device, pk=device_id)
        serializer = DeviceTrustUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        device.trust_status = serializer.validated_data['trust_status']
        device.save(update_fields=['trust_status'])
        return Response(DeviceSerializer(device).data)


class DeviceHistoryView(APIView):
    """GET /api/devices/{id}/history/ — the capture timeline for one device.

    Device metadata is stored as free-text *evidence* on each access log, so the
    timeline is correlated by device label (and recipient username, when known)
    rather than by a foreign key.
    """

    def get(self, request: Request, device_id):
        device = get_object_or_404(Device, pk=device_id)

        correlation = Q(device=device.label)
        if device.owner_username:
            correlation &= Q(recipient_username=device.owner_username)

        queryset = _logs_scoped(request.user).filter(correlation).order_by('-occurred_at')
        events = queryset[:200]

        return Response(
            {
                'deviceId': str(device.id),
                'deviceIdentifier': device.device_identifier,
                'total': queryset.count(),
                'events': AccessLogSerializer(events, many=True).data,
            }
        )
