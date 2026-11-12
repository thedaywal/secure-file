"""Serializers for administrator authentication."""
from __future__ import annotations

from rest_framework import serializers

from accounts.models import AdminUser

class UserSerializer(serializers.Serializer):
    id = serializers.CharField(read_only=True)
    email = serializers.EmailField(read_only=True)
    fullName = serializers.CharField(source='full_name', read_only=True)
    role = serializers.SerializerMethodField()
    avatarUrl = serializers.CharField(source='avatar_url', read_only=True)
    organization = serializers.CharField(read_only=True)
    jobTitle = serializers.CharField(source='job_title', read_only=True)
    createdAt = serializers.DateTimeField(source='created_at', read_only=True)
    lastLoginAt = serializers.DateTimeField(source='last_login', read_only=True)

    def get_role(self, _obj) -> str:
        # Single-administrator platform: the only role is 'admin'.
        return 'admin'


class UpdateProfileSerializer(serializers.Serializer):
    """Editable administrator profile fields.

    The single administrator may rename the account and change the address used
    to sign in. Roles and identifiers are not editable.
    """

    fullName = serializers.CharField(max_length=150, required=False, allow_blank=True)
    email = serializers.EmailField(required=False)
    organization = serializers.CharField(max_length=150, required=False, allow_blank=True)
    jobTitle = serializers.CharField(max_length=150, required=False, allow_blank=True)


class ChangePasswordSerializer(serializers.Serializer):
    currentPassword = serializers.CharField(trim_whitespace=False, write_only=True)
    newPassword = serializers.CharField(trim_whitespace=False, write_only=True, min_length=10)


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(trim_whitespace=False, write_only=True)
    remember = serializers.BooleanField(required=False, default=False)


class ForgotPasswordSerializer(serializers.Serializer):
    email = serializers.EmailField()


class ResetPasswordSerializer(serializers.Serializer):
    token = serializers.CharField()
    password = serializers.CharField(trim_whitespace=False, write_only=True, min_length=10)


class ApiTokenSerializer(serializers.Serializer):
    accessToken = serializers.CharField(read_only=True)
    refreshToken = serializers.CharField(read_only=True, allow_null=True)
    expiresAt = serializers.DateTimeField(read_only=True, allow_null=True)


class AuthSessionSerializer(serializers.Serializer):
    user = UserSerializer(read_only=True)
    tokens = ApiTokenSerializer(read_only=True)


def default_admin_exists() -> bool:
    return AdminUser.objects.exists()
