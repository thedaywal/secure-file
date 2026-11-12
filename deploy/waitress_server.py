"""Waitress WSGI runner for SecureFile on Windows.

This replaces the gunicorn/nginx pair used on Linux. Caddy terminates TLS and
reverse-proxies 127.0.0.1:8000; Waitress — a pure-Python, Windows-friendly WSGI
server — runs the Django application behind it.

Run it directly for a smoke test:

    python deploy/waitress_server.py

In production it is registered as a Windows service (see install-service.ps1).
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

# Make the backend importable regardless of the current working directory.
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'backend'))

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

from waitress import serve  # noqa: E402

from config.wsgi import application  # noqa: E402

HOST = os.environ.get('SECUREFILE_WAITRESS_HOST', '127.0.0.1')
PORT = int(os.environ.get('SECUREFILE_WAITRESS_PORT', '8000'))
THREADS = int(os.environ.get('SECUREFILE_WAITRESS_THREADS', '8'))

if __name__ == '__main__':
    serve(
        application,
        host=HOST,
        port=PORT,
        threads=THREADS,
        # Caddy runs on the same host and is the only client, so trust its
        # X-Forwarded-* headers. Django's client_ip() reads X-Forwarded-For for
        # the audit trail, and SECURE_PROXY_SSL_HEADER reads X-Forwarded-Proto
        # so request.is_secure() (and the Secure viewer cookie) is truthful.
        trusted_proxy=HOST,
        trusted_proxy_headers={'x-forwarded-for', 'x-forwarded-proto', 'x-forwarded-host'},
        # Watermark generation is CPU heavy; give slow requests room to finish.
        channel_timeout=120,
    )
