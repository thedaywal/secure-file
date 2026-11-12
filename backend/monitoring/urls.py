from django.urls import path

from monitoring.views import (
    AccessLogListView,
    DeviceDetailView,
    DeviceHistoryView,
    DeviceListView,
    RecentAccessView,
)

urlpatterns = [
    path('access-logs/', AccessLogListView.as_view(), name='access-log-list'),
    path('access-logs/recent/', RecentAccessView.as_view(), name='access-log-recent'),
    path('devices/', DeviceListView.as_view(), name='device-list'),
    path('devices/<uuid:device_id>/', DeviceDetailView.as_view(), name='device-detail'),
    path('devices/<uuid:device_id>/history/', DeviceHistoryView.as_view(), name='device-history'),
]
