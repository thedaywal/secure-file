from django.urls import path

from watermarks.views import (
    WatermarkContentView,
    WatermarkDetailView,
    WatermarkListView,
    WatermarkLookupView,
    WatermarkVerifyView,
)

urlpatterns = [
    path('watermarks/', WatermarkListView.as_view(), name='watermark-list'),
    path('watermarks/lookup/', WatermarkLookupView.as_view(), name='watermark-lookup'),
    path('watermarks/<uuid:watermark_id>/', WatermarkDetailView.as_view(), name='watermark-detail'),
    path('watermarks/<uuid:watermark_id>/verify/', WatermarkVerifyView.as_view(), name='watermark-verify'),
    path('watermarks/<uuid:watermark_id>/content/', WatermarkContentView.as_view(), name='watermark-content'),
]
