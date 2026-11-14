"""Administrator endpoints for recipients and single-use links."""
from __future__ import annotations

import uuid

from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from core.pagination import CamelCasePageNumberPagination
from notifications.services import notify_access_revoked
from securefiles.models import Album, SecureFile, get_or_create_policy
from sharing.models import LinkState, Recipient, ShareLink
from sharing.serializers import (
    CreateSharesInputSerializer,
    RecipientSerializer,
    ShareLinkSerializer,
    SharePermissionsUpdateSerializer,
)
from sharing.services import issue_link, reissue_link, revoke_link

ORDERING_MAP = {
    'createdAt': 'created_at',
    '-createdAt': '-created_at',
    'lastAccessedAt': 'last_accessed_at',
    '-lastAccessedAt': '-last_accessed_at',
}


def _shares_for(user):
    return ShareLink.objects.select_related('file', 'recipient', 'album').filter(
        Q(file__owner=user) | Q(album__owner=user)
    ).prefetch_related('album__images')


def _create_shares(secure_file, album, rows):
    """Issue one single-use link per recipient for a file or an album."""
    policy = get_or_create_policy(secure_file)
    created_recipients: list[Recipient] = []
    created_shares: list[ShareLink] = []
    share_url = ''

    with transaction.atomic():
        for row in rows:
            permissions = row.get('permissions') or {}
            recipient = Recipient(
                file=secure_file,
                album=album,
                username=row['username'],
                display_name=row.get('display_name') or '',
                session_duration_minutes=permissions.get('sessionDurationMinutes')
                or policy.session_duration_minutes,
                expires_at=permissions.get('expiresAt') or policy.link_expires_at,
            )
            recipient.set_password(row['password'])
            recipient.save()

            link, plaintext = issue_link(recipient, recipient.expires_at)
            if not share_url:
                from sharing.services import build_share_url

                share_url = build_share_url(plaintext)

            created_recipients.append(recipient)
            created_shares.append(link)

    return {
        'shares': ShareLinkSerializer(created_shares, many=True).data,
        'recipients': RecipientSerializer(created_recipients, many=True).data,
        'shareUrl': share_url,
    }


def _filter_by_state(queryset, raw_state: str):
    state = (raw_state or '').strip().upper()
    if not state or state == 'ALL':
        return queryset
    now = timezone.now()
    if state == LinkState.ACTIVE:
        return queryset.filter(state=LinkState.ACTIVE).filter(
            Q(expires_at__isnull=True) | Q(expires_at__gt=now)
        )
    if state == LinkState.EXPIRED:
        return queryset.filter(
            Q(state=LinkState.EXPIRED) | Q(state=LinkState.ACTIVE, expires_at__lte=now)
        )
    return queryset.filter(state=state)


class ShareListView(APIView):
    """GET /api/shares/"""

    def get(self, request):
        queryset = _shares_for(request.user)

        file_id = (request.query_params.get('file_id') or '').strip()
        if file_id:
            try:
                selected_file_id = uuid.UUID(file_id)
                queryset = queryset.filter(
                    Q(file_id=selected_file_id) | Q(album__images__file_id=selected_file_id)
                ).distinct()
            except ValueError:
                return Response({'count': 0, 'page': 1, 'pageSize': 20, 'totalPages': 1, 'results': []})

        queryset = _filter_by_state(queryset, request.query_params.get('state', ''))

        search = (request.query_params.get('search') or '').strip()
        if search:
            queryset = queryset.filter(
                Q(recipient__username__icontains=search)
                | Q(file__name__icontains=search)
                | Q(album__name__icontains=search)
            )

        ordering = ORDERING_MAP.get((request.query_params.get('ordering') or '').strip())
        queryset = queryset.order_by(ordering) if ordering else queryset.order_by('-created_at')

        paginator = CamelCasePageNumberPagination()
        page = paginator.paginate_queryset(queryset, request, view=self)
        return paginator.get_paginated_response(ShareLinkSerializer(page, many=True).data)


class ShareDetailView(APIView):
    """GET /api/shares/{id}/"""

    def get(self, request, share_id):
        link = get_object_or_404(_shares_for(request.user), pk=share_id)
        return Response(ShareLinkSerializer(link).data)


class CreateSharesView(APIView):
    """POST /api/files/{file_id}/share/ — issue single-use links for an image."""

    def post(self, request, file_id):
        secure_file = get_object_or_404(
            SecureFile.objects.filter(owner=request.user), pk=file_id
        )
        serializer = CreateSharesInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        rows = serializer.validated_data['recipients']

        usernames = [row['username'] for row in rows]
        if len(set(usernames)) != len(usernames):
            raise ValidationError(
                {'recipients': ['Each recipient in the request must have a unique username.']}
            )

        clashes = list(
            Recipient.objects.filter(
                file=secure_file, album__isnull=True, username__in=usernames
            ).values_list(
                'username', flat=True
            )
        )
        if clashes:
            raise ValidationError(
                {
                    'recipients': [
                        'These usernames already have access to this image: '
                        + ', '.join(sorted(clashes))
                        + '.'
                    ]
                }
            )

        return Response(
            _create_shares(secure_file, album=None, rows=rows),
            status=status.HTTP_201_CREATED,
        )


class CreateAlbumSharesView(APIView):
    """POST /api/albums/{album_id}/share/ — issue recipient-scoped album links."""

    def post(self, request, album_id):
        album = get_object_or_404(
            Album.objects.filter(owner=request.user).prefetch_related('images__file'),
            pk=album_id,
        )
        first_image = next(iter(album.images.all()), None)
        if first_image is None:
            raise ValidationError({'album': ['An empty album cannot be shared.']})

        serializer = CreateSharesInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        rows = serializer.validated_data['recipients']
        usernames = [row['username'] for row in rows]
        if len(set(usernames)) != len(usernames):
            raise ValidationError(
                {'recipients': ['Each recipient in the request must have a unique username.']}
            )

        clashes = list(
            Recipient.objects.filter(album=album, username__in=usernames).values_list(
                'username', flat=True
            )
        )
        if clashes:
            raise ValidationError(
                {
                    'recipients': [
                        'These usernames already have access to this album: '
                        + ', '.join(sorted(clashes))
                        + '.'
                    ]
                }
            )

        return Response(
            _create_shares(first_image.file, album=album, rows=rows),
            status=status.HTTP_201_CREATED,
        )


class SharePermissionsView(APIView):
    """PATCH /api/shares/{id}/permissions/ — adjust a recipient's tunables.

    Only the session duration and link expiry may be changed; view-only access,
    the single-use link and the single active session are fixed rules.
    """

    def patch(self, request, share_id):
        link = get_object_or_404(_shares_for(request.user), pk=share_id)
        serializer = SharePermissionsUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        recipient = link.recipient
        update_fields: list[str] = []
        if 'sessionDurationMinutes' in data:
            recipient.session_duration_minutes = data['sessionDurationMinutes']
            update_fields.append('session_duration_minutes')
        if 'expiresAt' in data:
            recipient.expires_at = data['expiresAt']
            update_fields.append('expires_at')
        if update_fields:
            recipient.save(update_fields=update_fields)

        # Keep an unconsumed link's expiry aligned with its recipient record.
        if 'expiresAt' in data and link.state == LinkState.ACTIVE:
            link.expires_at = data['expiresAt']
            link.save(update_fields=['expires_at'])

        return Response(ShareLinkSerializer(link).data)


class ReissueShareView(APIView):
    """POST /api/shares/{id}/reissue/ — replacement link, credentials unchanged."""

    def post(self, request, share_id):
        link = get_object_or_404(_shares_for(request.user), pk=share_id)
        new_link, _plaintext = reissue_link(link)
        return Response(ShareLinkSerializer(new_link).data)


class RevokeShareView(APIView):
    """POST /api/shares/{id}/revoke/ — revoke the link and its session."""

    def post(self, request, share_id):
        link = get_object_or_404(_shares_for(request.user), pk=share_id)
        recipient_username = link.recipient.username
        secure_file = link.file
        revoke_link(link)
        notify_access_revoked(file=secure_file, recipient_username=recipient_username)
        return Response(ShareLinkSerializer(link).data)


class RecipientDetailView(APIView):
    """DELETE /api/recipients/{id}/ — remove a recipient and their access.

    The recipient's share links and viewing sessions are deleted with them.
    Access logs and watermark records are deliberately kept: both reference the
    recipient by username rather than by foreign key, so removing a recipient
    never erases the traceability trail.
    """

    def delete(self, request, recipient_id):
        recipient = get_object_or_404(
            Recipient.objects.filter(file__owner=request.user), pk=recipient_id
        )
        recipient.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
