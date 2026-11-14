from django.urls import path

from notifications.views import (
    MarkAllReadView,
    MarkNotificationReadView,
    NotificationDetailView,
    NotificationListView,
    NotificationPreferencesView,
)

urlpatterns = [
    path('notifications/', NotificationListView.as_view(), name='notification-list'),
    path('notifications/read-all/', MarkAllReadView.as_view(), name='notification-read-all'),
    path('notifications/preferences/', NotificationPreferencesView.as_view(), name='notification-preferences'),
    path('notifications/<uuid:notification_id>/', NotificationDetailView.as_view(), name='notification-detail'),
    path('notifications/<uuid:notification_id>/read/', MarkNotificationReadView.as_view(), name='notification-read'),
]
