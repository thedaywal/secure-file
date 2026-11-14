from django.urls import path

from securefiles.views import (
    AlbumUploadView,
    FileDetailView,
    FileExportView,
    FileListView,
    FilePolicyView,
    FileUploadView,
)

urlpatterns = [
    path('albums/upload/', AlbumUploadView.as_view(), name='album-upload'),
    path('files/', FileListView.as_view(), name='file-list'),
    path('files/export/', FileExportView.as_view(), name='file-export'),
    path('files/upload/', FileUploadView.as_view(), name='file-upload'),
    path('files/<uuid:file_id>/', FileDetailView.as_view(), name='file-detail'),
    path('files/<uuid:file_id>/policies/', FilePolicyView.as_view(), name='file-policy'),
]
