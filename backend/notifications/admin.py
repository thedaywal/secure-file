from django.contrib import admin

from notifications.models import Notification, NotificationPreference


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ('title', 'category', 'severity', 'read', 'created_at')
    list_filter = ('category', 'severity', 'read')
    search_fields = ('title', 'message')


@admin.register(NotificationPreference)
class NotificationPreferenceAdmin(admin.ModelAdmin):
    list_display = ('category', 'email', 'in_app', 'digest')
