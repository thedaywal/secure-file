"""Normalised API error responses.

The frontend reads `detail` (or `message`/`error`) for the human-readable
message, `code` for branching and any per-field arrays for form validation.
"""
from __future__ import annotations

from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.http import Http404
from rest_framework import exceptions as drf_exceptions
from rest_framework.views import exception_handler

_STATUS_CODES = {
    400: 'invalid_request',
    401: 'not_authenticated',
    403: 'permission_denied',
    404: 'not_found',
    405: 'method_not_allowed',
    409: 'conflict',
    410: 'gone',
    429: 'throttled',
    500: 'server_error',
}


def securefile_exception_handler(exc, context):
    if isinstance(exc, Http404):
        exc = drf_exceptions.NotFound()
    elif isinstance(exc, DjangoPermissionDenied):
        exc = drf_exceptions.PermissionDenied()

    response = exception_handler(exc, context)
    if response is None:
        return None

    data = response.data
    code = _STATUS_CODES.get(response.status_code, f'http_{response.status_code}')

    if isinstance(data, dict):
        detail = data.get('detail')
        if detail is not None and not isinstance(detail, str):
            data['detail'] = str(detail)
        data.setdefault('code', code)
    else:
        response.data = {'detail': str(data), 'code': code}

    return response
