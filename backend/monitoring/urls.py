from django.urls import path

from monitoring.views import (
    AccessLogDetailView,
    AccessLogListView,
    BlockedIPDetailView,
    BlockedIPListView,
    DeviceDetailView,
    DeviceHistoryView,
    DeviceListView,
    RecentAccessView,
)

urlpatterns = [
    path('access-logs/', AccessLogListView.as_view(), name='access-log-list'),
    path('access-logs/recent/', RecentAccessView.as_view(), name='access-log-recent'),
    path('access-logs/<uuid:log_id>/', AccessLogDetailView.as_view(), name='access-log-detail'),
    path('devices/', DeviceListView.as_view(), name='device-list'),
    path('devices/<uuid:device_id>/', DeviceDetailView.as_view(), name='device-detail'),
    path('devices/<uuid:device_id>/history/', DeviceHistoryView.as_view(), name='device-history'),
    path('blocked-ips/', BlockedIPListView.as_view(), name='blocked-ip-list'),
    path('blocked-ips/<uuid:block_id>/', BlockedIPDetailView.as_view(), name='blocked-ip-detail'),
]
