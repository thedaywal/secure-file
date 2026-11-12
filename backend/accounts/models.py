"""Identity for a single-administrator platform.

There is exactly one administrator account. There is no public registration,
no email verification, no OTP, no MFA and no second administrator role.
Credentials are always hashed with Argon2 (see PASSWORD_HASHERS in settings).
"""
from __future__ import annotations

import uuid

from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.core.validators import RegexValidator
from django.db import models
from django.utils import timezone

# Retained because the already-applied 0002 migration imports this validator.
ADMIN_USERNAME_VALIDATOR = RegexValidator(
    regex=r'^\d{10}$',
    message='The administrator username must be exactly 10 digits.',
)


class AdminUserManager(BaseUserManager):
    use_in_migrations = True

    def create_user(self, email: str, password: str | None = None, **extra):
        if not email:
            raise ValueError('An email address is required.')
        user = self.model(email=self.normalize_email(email), **extra)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.full_clean(exclude=['password'])
        user.save(using=self._db)
        return user

    def create_superuser(self, email: str, password: str | None = None, **extra):
        extra.setdefault('is_staff', True)
        extra.setdefault('is_superuser', True)
        return self.create_user(email, password, **extra)


class AdminUser(AbstractBaseUser, PermissionsMixin):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True)
    full_name = models.CharField(max_length=150, blank=True)
    organization = models.CharField(max_length=150, blank=True)
    job_title = models.CharField(max_length=150, blank=True)
    avatar_url = models.URLField(blank=True)

    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)

    created_at = models.DateTimeField(default=timezone.now)

    objects = AdminUserManager()

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS: list[str] = []

    class Meta:
        verbose_name = 'administrator'
        verbose_name_plural = 'administrators'

    def __str__(self) -> str:
        return self.email

    @property
    def short_name(self) -> str:
        return self.full_name or self.email

    def mark_logged_in(self) -> None:
        self.last_login = timezone.now()
        self.save(update_fields=['last_login'])


class ApiToken(models.Model):
    """Opaque API tokens. Only the SHA-256 hash is persisted."""

    KIND_ACCESS = 'access'
    KIND_REFRESH = 'refresh'
    KIND_PASSWORD_RESET = 'password-reset'
    KIND_CHOICES = [
        (KIND_ACCESS, 'Access'),
        (KIND_REFRESH, 'Refresh'),
        (KIND_PASSWORD_RESET, 'Password reset'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(AdminUser, related_name='tokens', on_delete=models.CASCADE)
    kind = models.CharField(max_length=20, choices=KIND_CHOICES)
    key_hash = models.CharField(max_length=64, unique=True)
    key_preview = models.CharField(max_length=16, blank=True)

    created_at = models.DateTimeField(default=timezone.now)
    expires_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)
    used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [models.Index(fields=['key_hash'])]

    def __str__(self) -> str:
        return f'{self.kind} token for {self.user_id}'

    @property
    def is_usable(self) -> bool:
        if self.revoked_at is not None or self.used_at is not None:
            return False
        return self.expires_at is None or self.expires_at > timezone.now()
