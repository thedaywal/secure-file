from django.urls import path

from viewer.views import (
    LinkAuthenticateView,
    LinkResolveView,
    LinkSessionView,
    SessionCloseView,
    SessionContentView,
    SessionEventView,
    SessionHeartbeatView,
    SessionRenditionContentView,
)

urlpatterns = [
    path('links/<str:token>/', LinkResolveView.as_view(), name='viewer-link-resolve'),
    path('links/<str:token>/authenticate/', LinkAuthenticateView.as_view(), name='viewer-link-authenticate'),
    path('links/<str:token>/session/', LinkSessionView.as_view(), name='viewer-link-session'),
    path('sessions/<uuid:session_id>/heartbeat/', SessionHeartbeatView.as_view(), name='viewer-session-heartbeat'),
    path('sessions/<uuid:session_id>/close/', SessionCloseView.as_view(), name='viewer-session-close'),
    path('sessions/<uuid:session_id>/content/', SessionContentView.as_view(), name='viewer-session-content'),
    path(
        'sessions/<uuid:session_id>/content/<uuid:rendition_id>/',
        SessionRenditionContentView.as_view(),
        name='viewer-session-rendition-content',
    ),
]
