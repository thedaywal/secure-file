"""Bearer-token authentication for the administrator API.

The SPA holds the access token in memory only and attaches it as
`Authorization: Bearer <token>`; nothing else authenticates the admin API.
Only the SHA-256 hash of a token is stored, so a database dump cannot be
replayed against the API.
"""
from __future__ import annotations

from django.utils import timezone
from rest_framework.authentication import BaseAuthentication, get_authorization_header
from rest_framework.exceptions import AuthenticationFailed

from core.utils import sha256_hex


class BearerTokenAuthentication(BaseAuthentication):
    keyword = b'bearer'

    def authenticate(self, request):
        header = get_authorization_header(request).split()
        if not header or header[0].lower() != self.keyword:
            return None
        if len(header) == 1:
            raise AuthenticationFailed('Invalid authorization header: no credentials supplied.')
        if len(header) > 2:
            raise AuthenticationFailed('Invalid authorization header: credentials contain spaces.')
        try:
            key = header[1].decode()
        except UnicodeError:
            raise AuthenticationFailed('Invalid authorization header: malformed credentials.')

        return self.authenticate_credentials(key)

    def authenticate_credentials(self, key: str):
        # Imported lazily so the app registry is fully populated first.
        from accounts.models import ApiToken

        token = (
            ApiToken.objects.select_related('user')
            .filter(key_hash=sha256_hex(key), kind=ApiToken.KIND_ACCESS)
            .first()
        )
        if token is None:
            raise AuthenticationFailed('Invalid or unknown access token.')
        if token.revoked_at is not None:
            raise AuthenticationFailed('This session was signed out. Please sign in again.')
        if token.expires_at is not None and token.expires_at <= timezone.now():
            raise AuthenticationFailed('Your session has expired. Please sign in again.')
        if not token.user.is_active:
            raise AuthenticationFailed('This administrator account is disabled.')

        return (token.user, token)

    def authenticate_header(self, _request):
        return 'Bearer'
