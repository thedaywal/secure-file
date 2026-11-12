"""Administrator authentication endpoints.

Single administrator; no registration, verification, OTP or MFA.
"""
from __future__ import annotations

import logging
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import ApiToken
from accounts.serializers import (
    AuthSessionSerializer,
    ChangePasswordSerializer,
    ForgotPasswordSerializer,
    LoginSerializer,
    ResetPasswordSerializer,
    UpdateProfileSerializer,
    UserSerializer,
)
from core.utils import random_hex, random_token, sha256_hex

logger = logging.getLogger(__name__)

User = get_user_model()


def _issue_token(user, kind: str, ttl: timedelta | None) -> tuple[str, ApiToken]:
    """Create a token, persisting only its hash. Returns (plaintext, record)."""
    plaintext = random_token(32)
    token = ApiToken.objects.create(
        user=user,
        kind=kind,
        key_hash=sha256_hex(plaintext),
        key_preview=random_hex(6),
        expires_at=(timezone.now() + ttl) if ttl else None,
    )
    return plaintext, token


class LoginView(APIView):
    """Validate administrator credentials and issue an in-memory access token."""

    permission_classes = [AllowAny]
    authentication_classes: list = []

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data['email']
        password = serializer.validated_data['password']
        remember = serializer.validated_data.get('remember', False)

        user = authenticate(request, email=email, password=password)
        if user is None:
            return Response(
                {
                    'detail': 'Email or password is incorrect.',
                    'code': 'invalid_credentials',
                },
                status=status.HTTP_401_UNAUTHORIZED,
            )

        ttl = timedelta(minutes=settings.ACCESS_TOKEN_TTL_MINUTES)
        access_plaintext, access_token = _issue_token(user, ApiToken.KIND_ACCESS, ttl)

        refresh_plaintext = None
        if remember:
            refresh_plaintext, _ = _issue_token(user, ApiToken.KIND_REFRESH, timedelta(days=14))

        user.mark_logged_in()

        payload = {
            'user': user,
            'tokens': {
                'accessToken': access_plaintext,
                'refreshToken': refresh_plaintext,
                'expiresAt': access_token.expires_at,
            },
        }
        return Response(AuthSessionSerializer(payload).data)


class LogoutView(APIView):
    """Revoke the presented access token."""

    def post(self, request):
        token = request.auth
        if isinstance(token, ApiToken):
            token.revoked_at = timezone.now()
            token.save(update_fields=['revoked_at'])
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    """GET / PATCH the signed-in administrator's profile."""

    def get(self, request):
        return Response(UserSerializer(request.user).data)

    def patch(self, request):
        serializer = UpdateProfileSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        user = request.user
        update_fields: list[str] = []

        if 'fullName' in data:
            user.full_name = data['fullName'].strip()
            update_fields.append('full_name')
        if 'organization' in data:
            user.organization = data['organization'].strip()
            update_fields.append('organization')
        if 'jobTitle' in data:
            user.job_title = data['jobTitle'].strip()
            update_fields.append('job_title')
        if 'email' in data:
            email = data['email'].strip().lower()
            if email != user.email and User.objects.filter(email=email).exists():
                return Response(
                    {'detail': 'That email address is already in use.', 'code': 'email_taken'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            user.email = email
            update_fields.append('email')

        if update_fields:
            user.save(update_fields=update_fields)

        return Response(UserSerializer(user).data)


class ChangePasswordView(APIView):
    """POST /api/auth/change-password/ — rotate the administrator password.

    The caller's own token stays valid so the operator is not signed out; every
    other access token is revoked.
    """

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = request.user
        if not user.check_password(serializer.validated_data['currentPassword']):
            return Response(
                {
                    'detail': 'Your current password is incorrect.',
                    'code': 'invalid_current_password',
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            validate_password(serializer.validated_data['newPassword'], user)
        except DjangoValidationError as exc:
            return Response(
                {
                    'detail': exc.messages[0],
                    'newPassword': exc.messages,
                    'code': 'invalid_password',
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.set_password(serializer.validated_data['newPassword'])
        user.save(update_fields=['password'])

        others = ApiToken.objects.filter(
            user=user, kind=ApiToken.KIND_ACCESS, revoked_at__isnull=True
        )
        if isinstance(request.auth, ApiToken):
            others = others.exclude(pk=request.auth.pk)
        others.update(revoked_at=timezone.now())

        return Response(status=status.HTTP_204_NO_CONTENT)


class RevokeAllSessionsView(APIView):
    """POST /api/auth/sessions/revoke-all/ — sign out of every device."""

    def post(self, request):
        now = timezone.now()
        ApiToken.objects.filter(
            user=request.user,
            revoked_at__isnull=True,
            kind__in=[ApiToken.KIND_ACCESS, ApiToken.KIND_REFRESH],
        ).update(revoked_at=now)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ForgotPasswordView(APIView):
    """Always responds 204 so the endpoint cannot enumerate administrators."""

    permission_classes = [AllowAny]
    authentication_classes: list = []

    def post(self, request):
        serializer = ForgotPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data['email'].lower()

        user = User.objects.filter(email=email, is_active=True).first()
        if user is not None:
            plaintext, _ = _issue_token(user, ApiToken.KIND_PASSWORD_RESET, timedelta(hours=1))
            reset_url = (
                f'{settings.PUBLIC_VIEW_BASE_URL}/{settings.ADMIN_CONSOLE_PATH}'
                f'/reset-password?token={plaintext}'
            )
            # In production this is emailed. Locally it is logged so the flow is testable.
            logger.warning('Password reset link for %s: %s', email, reset_url)

        return Response(status=status.HTTP_204_NO_CONTENT)


class ResetPasswordView(APIView):
    permission_classes = [AllowAny]
    authentication_classes: list = []

    def post(self, request):
        serializer = ResetPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        token_hash = sha256_hex(serializer.validated_data['token'])

        token = (
            ApiToken.objects.select_related('user')
            .filter(key_hash=token_hash, kind=ApiToken.KIND_PASSWORD_RESET)
            .first()
        )
        if token is None or not token.is_usable:
            return Response(
                {
                    'detail': 'This reset link is invalid or has expired.',
                    'code': 'invalid_reset_token',
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            validate_password(serializer.validated_data['password'], token.user)
        except DjangoValidationError as exc:
            return Response(
                {'detail': exc.messages[0], 'password': exc.messages, 'code': 'invalid_password'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        token.user.set_password(serializer.validated_data['password'])
        token.user.save(update_fields=['password'])

        now = timezone.now()
        token.used_at = now
        token.save(update_fields=['used_at'])
        # Any existing session is invalidated when the password changes.
        ApiToken.objects.filter(user=token.user, kind=ApiToken.KIND_ACCESS, revoked_at__isnull=True).update(
            revoked_at=now
        )

        return Response(status=status.HTTP_204_NO_CONTENT)
