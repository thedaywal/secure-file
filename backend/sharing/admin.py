from django.contrib import admin

from sharing.models import Recipient, ShareLink, ViewerSession


@admin.register(Recipient)
class RecipientAdmin(admin.ModelAdmin):
    list_display = ('username', 'display_name', 'file', 'created_at', 'last_authenticated_at')
    search_fields = ('username',)
    readonly_fields = ('password', 'created_at')
    exclude = ('password',)


@admin.register(ShareLink)
class ShareLinkAdmin(admin.ModelAdmin):
    list_display = ('recipient', 'file', 'state', 'created_at', 'expires_at', 'consumed_at')
    list_filter = ('state',)
    readonly_fields = ('token_hash', 'token_sealed', 'token_preview', 'created_at', 'consumed_at')
    search_fields = ('recipient__username', 'file__name')


@admin.register(ViewerSession)
class ViewerSessionAdmin(admin.ModelAdmin):
    list_display = ('id', 'recipient', 'file', 'started_at', 'expires_at', 'revoked_at')
    readonly_fields = ('access_id', 'started_at', 'expires_at', 'revoked_at', 'ip', 'user_agent')
