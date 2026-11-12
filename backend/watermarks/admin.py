from django.contrib import admin

from watermarks.models import WatermarkRecord


@admin.register(WatermarkRecord)
class WatermarkRecordAdmin(admin.ModelAdmin):
    list_display = (
        'recipient_username',
        'access_id',
        'file',
        'verification_status',
        'generated_at',
    )
    list_filter = ('verification_status',)
    search_fields = ('recipient_username', 'access_id', 'output_hash')
    readonly_fields = ('output_hash', 'watermark_lines', 'rendition_path', 'generated_at')
