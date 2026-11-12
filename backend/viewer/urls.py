from django.urls import path

from viewer.views import (
    LinkAuthenticateView,
    LinkResolveView,
    LinkSessionView,
    SessionContentView,
    SessionEventView,
    SessionHeartbeatView,
)

urlpatterns = [
    path('links/<str:token>/', LinkResolveView.as_view(), name='viewer-link-resolve'),
    path('links/<str:token>/authenticate/', LinkAuthenticateView.as_view(), name='viewer-link-authenticate'),
    path('links/<str:token>/session/', LinkSessionView.as_view(), name='viewer-link-session'),
    path('sessions/<uuid:session_id>/heartbeat/', SessionHeartbeatView.as_view(), name='viewer-session-heartbeat'),
    path('sessions/<uuid:session_id>/events/', SessionEventView.as_view(), name='viewer-session-events'),
    path('sessions/<uuid:session_id>/content/', SessionContentView.as_view(), name='viewer-session-content'),
]
