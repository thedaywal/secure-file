"""Access-log and device endpoints (administrator only)."""
from __future__ import annotations

import uuid

from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from core.pagination import CamelCasePageNumberPagination
from core.utils import is_public_ip
from monitoring.models import AccessLog, BlockedIP, BlockedIPSource, Device
from monitoring.serializers import (
    AccessLogSerializer,
    BlockedIPCreateSerializer,
    BlockedIPSerializer,
    DeviceSerializer,
    DeviceTrustUpdateSerializer,
)
from sharing.models import ShareLink
from sharing.services import revoke_link

ORDERING_MAP = {
    'occurredAt': 'occurred_at',
    '-occurredAt': '-occurred_at',
}


def _logs_scoped(user):
    return AccessLog.objects.select_related('file').filter(
        Q(file__owner=user) | Q(file__isnull=True)
    )


def _device_correlation(device) -> Q:
    """Correlate free-text access-log evidence back to one device record.

    Device metadata is stored as evidence on each access log rather than as a
    foreign key, so the timeline — and the delete cascade — match on the device
    label, plus the recipient username when it is known.
    """
    correlation = Q(device=device.label)
    if device.owner_username:
        correlation &= Q(recipient_username=device.owner_username)
    return correlation


def _revoke_recipient_access(username: str) -> None:
    """Revoke every outstanding link and live session held by one recipient.

    Removing a device record cuts the recipient off entirely: links they have
    not opened yet, the links they have, and every viewing session still open —
    not just the session bound to this particular fingerprint.
    """
    if not username:
        return
    for link in ShareLink.objects.filter(recipient__username=username):
        revoke_link(link)


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
    """GET / DELETE /api/access-logs/

    `DELETE` clears the events matching the same filters as the list, so the
    operator removes exactly the rows the table is showing.
    """

    def get(self, request: Request):
        queryset = _apply_log_filters(_logs_scoped(request.user), request.query_params)
        paginator = CamelCasePageNumberPagination()
        page = paginator.paginate_queryset(queryset, request, view=self)
        return paginator.get_paginated_response(AccessLogSerializer(page, many=True).data)

    def delete(self, request: Request):
        queryset = _apply_log_filters(_logs_scoped(request.user), request.query_params)
        deleted, _ = queryset.delete()
        return Response({'deleted': deleted}, status=status.HTTP_200_OK)


class AccessLogDetailView(APIView):
    """DELETE /api/access-logs/{id}/ — remove one recorded event."""

    def delete(self, request: Request, log_id):
        log = get_object_or_404(_logs_scoped(request.user), pk=log_id)
        log.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


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
    """PATCH / DELETE /api/devices/{id}/ — annotate or remove a device record."""

    def patch(self, request: Request, device_id):
        device = get_object_or_404(Device, pk=device_id)
        serializer = DeviceTrustUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        device.trust_status = serializer.validated_data['trust_status']
        device.save(update_fields=['trust_status'])
        return Response(DeviceSerializer(device).data)

    def delete(self, request: Request, device_id):
        device = get_object_or_404(Device, pk=device_id)
        # Cut the recipient's access first, then drop the monitoring evidence
        # captured for this device, so the access history never references a
        # device record that no longer exists.
        _revoke_recipient_access(device.owner_username)
        _logs_scoped(request.user).filter(_device_correlation(device)).delete()
        device.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class DeviceHistoryView(APIView):
    """GET /api/devices/{id}/history/ — the capture timeline for one device.

    Device metadata is stored as free-text *evidence* on each access log, so the
    timeline is correlated by device label (and recipient username, when known)
    rather than by a foreign key.
    """

    def get(self, request: Request, device_id):
        device = get_object_or_404(Device, pk=device_id)

        queryset = (
            _logs_scoped(request.user)
            .filter(_device_correlation(device))
            .order_by('-occurred_at')
        )
        events = queryset[:200]

        return Response(
            {
                'deviceId': str(device.id),
                'deviceIdentifier': device.device_identifier,
                'total': queryset.count(),
                'events': AccessLogSerializer(events, many=True).data,
            }
        )


class BlockedIPListView(APIView):
    """GET / POST /api/blocked-ips/ — the administrator's address blocklist."""

    def get(self, request: Request):
        queryset = BlockedIP.objects.all()
        search = (request.query_params.get('search') or '').strip()
        if search:
            queryset = queryset.filter(Q(address__icontains=search) | Q(reason__icontains=search))
        return Response(BlockedIPSerializer(queryset, many=True).data)

    def post(self, request: Request):
        serializer = BlockedIPCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        address = serializer.validated_data['address'].strip()
        if not is_public_ip(address):
            raise ValidationError(
                {
                    'address': [
                        'Enter the public IP address of the client, for example 203.0.113.42.'
                    ]
                }
            )
        blocked, created = BlockedIP.objects.get_or_create(
            address=address,
            defaults={
                'reason': serializer.validated_data.get('reason', ''),
                'source': BlockedIPSource.MANUAL,
            },
        )
        if not created:
            return Response(
                {'detail': 'That address is already blocked.', 'code': 'already_blocked'},
                status=status.HTTP_409_CONFLICT,
            )
        return Response(BlockedIPSerializer(blocked).data, status=status.HTTP_201_CREATED)


class BlockedIPDetailView(APIView):
    """DELETE /api/blocked-ips/{id}/ — lift a block."""

    def delete(self, request: Request, block_id):
        blocked = get_object_or_404(BlockedIP, pk=block_id)
        blocked.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
