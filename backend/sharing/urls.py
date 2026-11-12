from django.urls import path

from sharing.views import (
    CreateSharesView,
    RecipientDetailView,
    ReissueShareView,
    RevokeShareView,
    ShareDetailView,
    ShareListView,
    SharePermissionsView,
)

urlpatterns = [
    path('shares/', ShareListView.as_view(), name='share-list'),
    path('shares/<uuid:share_id>/', ShareDetailView.as_view(), name='share-detail'),
    path('shares/<uuid:share_id>/permissions/', SharePermissionsView.as_view(), name='share-permissions'),
    path('shares/<uuid:share_id>/reissue/', ReissueShareView.as_view(), name='share-reissue'),
    path('shares/<uuid:share_id>/revoke/', RevokeShareView.as_view(), name='share-revoke'),
    path('recipients/<uuid:recipient_id>/', RecipientDetailView.as_view(), name='recipient-detail'),
    path('files/<uuid:file_id>/share/', CreateSharesView.as_view(), name='file-share'),
]
