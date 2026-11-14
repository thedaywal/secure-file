"""Notification endpoints for the single administrator."""
from __future__ import annotations

from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from core.pagination import CamelCasePageNumberPagination
from notifications.models import Notification, ensure_preferences
from notifications.serializers import (
    NotificationPreferenceSerializer,
    NotificationSerializer,
    PreferencesUpdateSerializer,
)


class NotificationListView(APIView):
    """GET / DELETE /api/notifications/

    `DELETE` empties the inbox (honouring the same category/search filters as
    the list), so the operator clears exactly the notifications they are
    looking at. The underlying audit history is untouched.
    """

    def get(self, request):
        queryset = self._filtered(request)
        paginator = CamelCasePageNumberPagination()
        page = paginator.paginate_queryset(queryset, request, view=self)
        return paginator.get_paginated_response(NotificationSerializer(page, many=True).data)

    def delete(self, request):
        deleted, _ = self._filtered(request).delete()
        return Response({'deleted': deleted}, status=status.HTTP_200_OK)

    @staticmethod
    def _filtered(request):
        queryset = Notification.objects.select_related('file')

        search = (request.query_params.get('search') or '').strip()
        if search:
            queryset = queryset.filter(Q(title__icontains=search) | Q(message__icontains=search))

        category = (request.query_params.get('category') or '').strip()
        if category and category != 'all':
            queryset = queryset.filter(category=category)

        unread_only = (request.query_params.get('unread_only') or '').strip().lower()
        if unread_only in {'1', 'true', 'yes'}:
            queryset = queryset.filter(read=False)

        return queryset.order_by('-created_at')


class MarkNotificationReadView(APIView):
    """POST /api/notifications/{id}/read/"""

    def post(self, request, notification_id):
        notification = get_object_or_404(Notification, pk=notification_id)
        if not notification.read:
            notification.read = True
            notification.save(update_fields=['read'])
        return Response(NotificationSerializer(notification).data)


class NotificationDetailView(APIView):
    """DELETE /api/notifications/{id}/ — dismiss one administrator notification."""

    def delete(self, request, notification_id):
        notification = get_object_or_404(Notification, pk=notification_id)
        notification.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class MarkAllReadView(APIView):
    """POST /api/notifications/read-all/"""

    def post(self, _request):
        Notification.objects.filter(read=False).update(read=True)
        return Response(status=204)


class NotificationPreferencesView(APIView):
    """GET / PUT /api/notifications/preferences/"""

    def get(self, _request):
        return Response(NotificationPreferenceSerializer(ensure_preferences(), many=True).data)

    def put(self, request):
        serializer = PreferencesUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        saved = serializer.apply()
        return Response(NotificationPreferenceSerializer(saved, many=True).data)
