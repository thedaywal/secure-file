"""
Django settings for the SecureFile backend.

The backend owns every security boundary: authentication, authorization,
encryption at rest, single-use link consumption, permanent watermark
generation and the audit trail. The frontend is presentation only.
"""
from __future__ import annotations

import base64
import hashlib
import os
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent


def _load_env_file(path: Path) -> None:
    """Minimal .env loader so we do not add a dependency for local dev."""
    if not path.exists():
        return
    for raw_line in path.read_text(encoding='utf-8').splitlines():
        line = raw_line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, _, value = line.partition('=')
        os.environ.setdefault(key.strip(), value.strip())


_load_env_file(BASE_DIR / '.env')


def env_list(name: str, default: str = '') -> list[str]:
    raw = os.environ.get(name, default)
    return [item.strip() for item in raw.split(',') if item.strip()]


def env_bool(name: str, default: bool = False) -> bool:
    return os.environ.get(name, str(default)).strip().lower() in {'1', 'true', 'yes', 'on'}


# --------------------------------------------------------------------------- #
# Core
# --------------------------------------------------------------------------- #
# A deployment must supply its own secret. The fallback is only ever reachable
# from a local DEBUG run, so a production host cannot boot with a public value.
SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY', '').strip()
DEBUG = env_bool('DJANGO_DEBUG', False)
if not SECRET_KEY:
    if not DEBUG:
        raise ImproperlyConfigured('DJANGO_SECRET_KEY must be set when DJANGO_DEBUG is false.')
    SECRET_KEY = 'dev-only-insecure-secret-key'

ALLOWED_HOSTS = env_list('DJANGO_ALLOWED_HOSTS', 'localhost,127.0.0.1')

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'corsheaders',
    # SecureFile domain apps
    'accounts',
    'securefiles',
    'sharing',
    'watermarks',
    'monitoring',
    'notifications',
    'analytics',
    'viewer',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    # Serves the collected admin/DRF static files straight from the WSGI server.
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'
ASGI_APPLICATION = 'config.asgi.application'

# --------------------------------------------------------------------------- #
# Database
# --------------------------------------------------------------------------- #
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': os.environ.get('DJANGO_DB_PATH', str(BASE_DIR / 'db.sqlite3')),
        'OPTIONS': {'timeout': 20},
    }
}

# --------------------------------------------------------------------------- #
# Authentication — single administrator, Argon2 password hashing
# --------------------------------------------------------------------------- #
AUTH_USER_MODEL = 'accounts.AdminUser'

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
        'OPTIONS': {'min_length': 10},
    },
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
]

# Argon2 first: every administrator and recipient credential is hashed with it.
PASSWORD_HASHERS = [
    'django.contrib.auth.hashers.Argon2PasswordHasher',
    'django.contrib.auth.hashers.PBKDF2PasswordHasher',
    'django.contrib.auth.hashers.PBKDF2SHA1PasswordHasher',
    'django.contrib.auth.hashers.ScryptPasswordHasher',
]

# --------------------------------------------------------------------------- #
# DRF — camelCase responses, bearer tokens, camelCase pagination envelope
# --------------------------------------------------------------------------- #
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'core.authentication.BearerTokenAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'DEFAULT_PAGINATION_CLASS': 'core.pagination.CamelCasePageNumberPagination',
    'PAGE_SIZE': 20,
    'EXCEPTION_HANDLER': 'core.exceptions.securefile_exception_handler',
    'UNAUTHENTICATED_USER': None,
}

# --------------------------------------------------------------------------- #
# CORS / CSRF — the SPA is a separate origin during development only
# --------------------------------------------------------------------------- #
# Behind Caddy the SPA and API share one origin, so production needs no CORS
# entry at all. CSRF_TRUSTED_ORIGINS still matters because the Django admin
# posts forms from the public origin.
CORS_ALLOWED_ORIGINS = env_list(
    'CORS_ALLOWED_ORIGINS',
    'http://localhost:5173,http://127.0.0.1:5173',
)
CSRF_TRUSTED_ORIGINS = env_list('CSRF_TRUSTED_ORIGINS', '')
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOW_HEADERS = [
    'accept',
    'authorization',
    'content-type',
    'origin',
    'user-agent',
    'x-csrftoken',
    'x-requested-with',
]

# --------------------------------------------------------------------------- #
# SecureFile domain configuration
# --------------------------------------------------------------------------- #
MEDIA_ROOT = Path(os.environ.get('SECUREFILE_MEDIA_ROOT', str(BASE_DIR / 'private_storage')))
MEDIA_URL = '/media/'

# Public origin (scheme + host, no path) used to build the recipient links
# handed to the administrator. A link is `<origin>/<token>`, because the SPA's
# public viewer is mounted on the root route.
PUBLIC_VIEW_BASE_URL = os.environ.get('PUBLIC_VIEW_BASE_URL', 'http://localhost:5173')

# Path prefix the SPA mounts the administrator console on. Must stay in sync
# with ADMIN_BASE in frontend/src/routes/navigation.ts.
ADMIN_CONSOLE_PATH = os.environ.get('ADMIN_CONSOLE_PATH', 'unknown')

ACCESS_TOKEN_TTL_MINUTES = int(os.environ.get('ACCESS_TOKEN_TTL_MINUTES', '720'))

# Lifetime of the short-lived, signed URLs used to stream a watermarked
# rendition into an <img> tag (the browser cannot attach an Authorization
# header to an image request, so the URL itself is the capability).
CONTENT_URL_TTL_SECONDS = int(os.environ.get('CONTENT_URL_TTL_SECONDS', '300'))


def _encryption_key() -> bytes:
    configured = os.environ.get('ORIGINAL_ENCRYPTION_KEY', '').strip()
    if configured:
        key = base64.b64decode(configured)
        if len(key) != 32:
            raise ValueError('ORIGINAL_ENCRYPTION_KEY must decode to exactly 32 bytes.')
        return key
    # Development fallback: deterministic key derived from the Django secret.
    return hashlib.sha256(f'{SECRET_KEY}:securefile-originals'.encode()).digest()


ORIGINAL_ENCRYPTION_KEY = _encryption_key()

# Every watermark is mandatory; these bound the administrator's tuning.
WATERMARK_MIN_OPACITY = 0.05
WATERMARK_MAX_OPACITY = 0.5
WATERMARK_MIN_SIZE = 0.5
WATERMARK_MAX_SIZE = 2.0

DEFAULT_SESSION_DURATION_MINUTES = 30
MAX_SESSION_DURATION_MINUTES = 240

ALLOWED_IMAGE_EXTENSIONS = ('JPG', 'JPEG', 'PNG', 'WEBP')
ALLOWED_IMAGE_MIME_TYPES = {
    'image/jpeg': ('JPG', 'JPEG'),
    'image/png': ('PNG',),
    'image/webp': ('WEBP',),
}
MAX_IMAGE_BYTES = int(os.environ.get('MAX_IMAGE_BYTES', str(25 * 1024 * 1024)))

# --------------------------------------------------------------------------- #
# HTTPS — Caddy terminates TLS and forwards to Waitress
# --------------------------------------------------------------------------- #
# Leave this off until the certificate is installed: while it is off Django
# tolerates plain HTTP, and while it is on Django forces HTTPS and sends HSTS.
# The proxy header is what makes request.is_secure() truthful behind Caddy, so
# the viewer cookie picks up its Secure flag with no further change.
SECUREFILE_HTTPS = env_bool('SECUREFILE_HTTPS', False)
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')

if SECUREFILE_HTTPS:
    SECURE_SSL_REDIRECT = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_HSTS_SECONDS = 60 * 60 * 24 * 365
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True

# --------------------------------------------------------------------------- #
# I18N / static
# --------------------------------------------------------------------------- #
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

STATIC_URL = '/static/'
STATIC_ROOT = Path(os.environ.get('DJANGO_STATIC_ROOT', str(BASE_DIR / 'staticfiles')))

# Hashed, pre-compressed assets in production; plain storage while DEBUG so
# runserver keeps working without a collectstatic step.
STORAGES = {
    'default': {'BACKEND': 'django.core.files.storage.FileSystemStorage'},
    'staticfiles': {
        'BACKEND': (
            'django.contrib.staticfiles.storage.StaticFilesStorage'
            if DEBUG
            else 'whitenoise.storage.CompressedManifestStaticFilesStorage'
        ),
    },
}

# Log to stdout so the service manager captures the WSGI server's output.
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'standard': {'format': '{levelname} {asctime} {name}: {message}', 'style': '{'},
    },
    'handlers': {
        'console': {'class': 'logging.StreamHandler', 'formatter': 'standard'},
    },
    'root': {
        'handlers': ['console'],
        'level': os.environ.get('DJANGO_LOG_LEVEL', 'INFO'),
    },
}

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'
