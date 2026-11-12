"""Aggregated analytics for the administrator dashboard.

Every figure is derived from the same audit tables the rest of the console
reads, so the dashboard can never disagree with the underlying records.
"""
from __future__ import annotations

from datetime import timedelta

from django.db.models import Count, Q, Sum
from django.db.models.functions import TruncDate
from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView

from monitoring.models import AccessEventType, AccessLog, AccessResult
from securefiles.models import ProtectionStatus, SecureFile
from sharing.models import LinkState, Recipient, ShareLink, ViewerSession

EVENT_LABELS = dict(AccessEventType.choices)


def _direction(current: int, previous: int) -> dict:
    if previous == 0:
        if current == 0:
            return {'value': 0.0, 'direction': 'flat'}
        return {'value': 100.0, 'direction': 'up'}
    change = (current - previous) / previous * 100
    direction = 'up' if change > 0.5 else 'down' if change < -0.5 else 'flat'
    return {'value': round(abs(change), 1), 'direction': direction}


def dashboard_summary(user) -> dict:
    now = timezone.now()
    files = SecureFile.objects.filter(owner=user)
    file_ids = list(files.values_list('id', flat=True))

    logs = AccessLog.objects.filter(Q(file_id__in=file_ids) | Q(file__isnull=True))

    active_links = (
        ShareLink.objects.filter(file_id__in=file_ids, state=LinkState.ACTIVE)
        .filter(Q(expires_at__isnull=True) | Q(expires_at__gt=now))
        .count()
    )

    successful_total = logs.filter(result=AccessResult.SUCCESS).count()
    failed_total = logs.filter(result=AccessResult.FAILED).count()
    blocked_total = logs.filter(result=AccessResult.BLOCKED).count()

    window_start = now - timedelta(days=30)
    previous_start = now - timedelta(days=60)
    recent_logs = logs.filter(occurred_at__gte=window_start)
    previous_logs = logs.filter(occurred_at__gte=previous_start, occurred_at__lt=window_start)

    # 14-day activity series (oldest → newest).
    start_date = (now - timedelta(days=13)).date()
    rows = (
        logs.filter(occurred_at__gte=now - timedelta(days=14))
        .annotate(day=TruncDate('occurred_at'))
        .values('day', 'result')
        .annotate(total=Count('id'))
    )
    buckets: dict[str, dict[str, int]] = {}
    for row in rows:
        day = row['day'].isoformat()
        bucket = buckets.setdefault(day, {'successful': 0, 'failed': 0})
        if row['result'] == AccessResult.SUCCESS:
            bucket['successful'] += row['total']
        else:
            bucket['failed'] += row['total']

    access_activity = []
    for offset in range(14):
        day = (start_date + timedelta(days=offset)).isoformat()
        counts = buckets.get(day, {'successful': 0, 'failed': 0})
        access_activity.append(
            {
                'date': f'{day}T00:00:00Z',
                'successful': counts['successful'],
                'failed': counts['failed'],
            }
        )

    event_breakdown = [
        {
            'eventType': row['event_type'],
            'label': EVENT_LABELS.get(row['event_type'], row['event_type']),
            'count': row['total'],
        }
        for row in logs.values('event_type').annotate(total=Count('id')).order_by('-total')
    ]

    top_rows = files.annotate(
        views=Sum('share_links__successful_views'),
        failed=Sum('share_links__failed_attempts'),
    ).order_by('-views')[:6]
    top_files = [
        {
            'id': str(item.id),
            'name': item.name,
            'extension': item.extension,
            'views': item.views or 0,
            'failed': item.failed or 0,
        }
        for item in top_rows
    ]

    return {
        'metrics': {
            'totalProtectedFiles': files.filter(protection_status=ProtectionStatus.PROTECTED).count(),
            'activeShareLinks': active_links,
            'authorizedRecipients': Recipient.objects.filter(file_id__in=file_ids).count(),
            'successfulAccess': successful_total,
            'failedAccess': failed_total,
            'activeSessions': ViewerSession.objects.filter(
                file_id__in=file_ids, revoked_at__isnull=True, expires_at__gt=now
            ).count(),
        },
        'deltas': {
            'successfulAccess': _direction(
                recent_logs.filter(result=AccessResult.SUCCESS).count(),
                previous_logs.filter(result=AccessResult.SUCCESS).count(),
            ),
            'failedAccess': _direction(
                recent_logs.filter(result=AccessResult.FAILED).count(),
                previous_logs.filter(result=AccessResult.FAILED).count(),
            ),
        },
        'accessActivity': access_activity,
        'accessOutcome': [
            {'name': 'Successful', 'value': successful_total, 'tone': 'success'},
            {'name': 'Failed', 'value': failed_total, 'tone': 'failed'},
            {'name': 'Blocked', 'value': blocked_total, 'tone': 'blocked'},
        ],
        'eventBreakdown': event_breakdown,
        'topFiles': top_files,
    }


class DashboardSummaryView(APIView):
    """GET /api/dashboard/summary/"""

    def get(self, request):
        return Response(dashboard_summary(request.user))
