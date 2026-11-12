"""Root URL configuration — everything the SPA calls lives under /api/.

There is deliberately no `django.contrib.admin` route: the administrator uses
the SPA console (mounted at /unknown), so the built-in admin surface is not
exposed over HTTP at all.
"""
from django.http import JsonResponse
from django.urls import include, path


def health(_request):
    """Unauthenticated liveness probe used by the frontend connection check."""
    return JsonResponse({'status': 'ok', 'service': 'securefile-api'})


urlpatterns = [
    path('api/health/', health, name='health'),
    path('api/auth/', include('accounts.urls')),
    path('api/', include('securefiles.urls')),
    path('api/', include('sharing.urls')),
    path('api/', include('monitoring.urls')),
    path('api/', include('watermarks.urls')),
    path('api/', include('notifications.urls')),
    path('api/', include('analytics.urls')),
    path('api/public/', include('viewer.urls')),
]
