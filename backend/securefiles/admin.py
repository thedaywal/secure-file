from django.contrib import admin

from securefiles.models import FilePolicy, SecureFile


class FilePolicyInline(admin.StackedInline):
    model = FilePolicy
    extra = 0


@admin.register(SecureFile)
class SecureFileAdmin(admin.ModelAdmin):
    list_display = ('name', 'extension', 'protection_status', 'size_bytes', 'uploaded_at', 'owner')
    list_filter = ('protection_status', 'extension')
    search_fields = ('name',)
    readonly_fields = ('checksum', 'original_path', 'width', 'height', 'uploaded_at', 'updated_at')
    inlines = [FilePolicyInline]
