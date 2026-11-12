from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from accounts.models import AdminUser, ApiToken


@admin.register(AdminUser)
class AdminUserAdmin(BaseUserAdmin):
    ordering = ('email',)
    list_display = ('email', 'full_name', 'is_active', 'last_login')
    search_fields = ('email', 'full_name')
    fieldsets = (
        (None, {'fields': ('email', 'password')}),
        ('Profile', {'fields': ('full_name', 'organization', 'job_title', 'avatar_url')}),
        ('Permissions', {'fields': ('is_active', 'is_staff', 'is_superuser')}),
        ('Timestamps', {'fields': ('last_login', 'created_at')}),
    )
    readonly_fields = ('created_at', 'last_login')
    add_fieldsets = (
        (None, {'classes': ('wide',), 'fields': ('email', 'password1', 'password2')}),
    )


@admin.register(ApiToken)
class ApiTokenAdmin(admin.ModelAdmin):
    list_display = ('kind', 'user', 'created_at', 'expires_at', 'revoked_at', 'used_at')
    list_filter = ('kind',)
    search_fields = ('user__email',)
    readonly_fields = ('key_hash', 'key_preview', 'created_at')
