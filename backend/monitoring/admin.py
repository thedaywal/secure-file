from django.contrib import admin

from monitoring.models import AccessLog, Device


@admin.register(Device)
class DeviceAdmin(admin.ModelAdmin):
    list_display = ('label', 'owner_username', 'device_type', 'os', 'browser', 'trust_status', 'last_active_at')
    list_filter = ('trust_status', 'device_type')
    search_fields = ('label', 'owner_username', 'device_identifier')


@admin.register(AccessLog)
class AccessLogAdmin(admin.ModelAdmin):
    list_display = ('event_type', 'result', 'risk_level', 'recipient_username', 'ip', 'occurred_at')
    list_filter = ('event_type', 'result', 'risk_level')
    search_fields = ('recipient_username', 'ip', 'device')
    readonly_fields = ('occurred_at',)
