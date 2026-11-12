#!/usr/bin/env bash
#
# SecureFile — build and release on the VPS.
# ============================================================================
# FIRST-TIME SETUP (once, as root)
#
#   1. Runtime packages
#        sudo apt update
#        sudo apt install -y python3-venv python3-pip nginx rsync curl
#        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
#        sudo apt install -y nodejs
#
#   2. Service account and code
#        sudo useradd --system --create-home --home-dir /opt/securefile \
#             --shell /usr/sbin/nologin securefile
#        sudo -u securefile git clone <your-repo> /opt/securefile
#
#   3. Environment files (both are git-ignored — never commit them)
#        sudo -u securefile cp /opt/securefile/backend/.env.example \
#             /opt/securefile/backend/.env
#        sudo -u securefile cp /opt/securefile/frontend/.env.production.example \
#             /opt/securefile/frontend/.env.production
#        # generate the Django secret with:
#        #   python3 -c "import secrets; print(secrets.token_urlsafe(64))"
#        sudo -u securefile nano /opt/securefile/backend/.env
#        sudo -u securefile nano /opt/securefile/frontend/.env.production
#
#   4. service + vhost, then this script
#        sudo cp /opt/securefile/deploy/securefile-api.service /etc/systemd/system/
#        sudo cp /opt/securefile/deploy/nginx.conf /etc/nginx/sites-available/securefile
#        sudo ln -sf /etc/nginx/sites-available/securefile /etc/nginx/sites-enabled/securefile
#        sudo rm -f /etc/nginx/sites-enabled/default
#        sudo systemctl daemon-reload && sudo systemctl enable securefile-api
#        sudo bash /opt/securefile/deploy/deploy.sh
#
#   5. DNS -> this host, then TLS
#        sudo apt install -y certbot python3-certbot-nginx
#        sudo certbot --nginx -d serviceindex.duckdns.org
#        # then set SECUREFILE_HTTPS=true in backend/.env and:
#        sudo systemctl restart securefile-api
#
# RELEASES: re-run this script after pulling new code. It is idempotent.
#
# BACK THESE UP somewhere off the box. Without the first one your whole
# library is undecryptable, and the encryption key is derived from it unless
# you set ORIGINAL_ENCRYPTION_KEY explicitly:
#     backend/.env        (DJANGO_SECRET_KEY / ORIGINAL_ENCRYPTION_KEY)
#     backend/db.sqlite3
#     backend/private_storage/
# ============================================================================
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/securefile}"
WEB_ROOT="${WEB_ROOT:-/var/www/securefile}"
APP_USER="${APP_USER:-securefile}"
SERVICE="${SERVICE:-securefile-api}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:8001/api/health/}"
PYTHON="${PYTHON:-python3}"

if [ "$(id -un)" = "$APP_USER" ]; then
  as_app() { env "$@"; }
else
  as_app() { sudo -u "$APP_USER" env "$@"; }
fi

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }

step "Preflight"
[ -f "$APP_DIR/backend/manage.py" ] || { echo "No manage.py under $APP_DIR/backend" >&2; exit 1; }
[ -f "$APP_DIR/backend/.env" ] || { echo "Missing $APP_DIR/backend/.env — copy .env.example first." >&2; exit 1; }
[ -f "$APP_DIR/frontend/.env.production" ] || {
  echo "Missing frontend/.env.production — copy .env.production.example first." >&2; exit 1; }
# Vite gives .env.local precedence over .env.production, so a stray dev file
# would silently bake the LAN address into the production bundle.
[ -f "$APP_DIR/frontend/.env.local" ] && {
  echo "frontend/.env.local exists and would override .env.production — remove it on the server." >&2; exit 1; }
echo "layout ok: $APP_DIR -> $WEB_ROOT as $APP_USER"

step "Python dependencies"
cd "$APP_DIR/backend"
[ -d .venv ] || as_app "$PYTHON" -m venv .venv
as_app .venv/bin/python -m pip install --quiet --upgrade pip
as_app .venv/bin/python -m pip install --quiet -r requirements.txt
as_app .venv/bin/python manage.py check

step "Migrations"
as_app .venv/bin/python manage.py migrate --noinput

step "Collect static (admin + DRF, served by whitenoise)"
as_app .venv/bin/python manage.py collectstatic --noinput --clear

step "Frontend build"
cd "$APP_DIR/frontend"
as_app npm ci --no-audit --no-fund
as_app npm run build

step "Publish the built SPA"
mkdir -p "$WEB_ROOT"
rsync -a --delete --chown=root:root --chmod=D755,F644 "$APP_DIR/frontend/dist/" "$WEB_ROOT/"
echo "published $(find "$WEB_ROOT" -type f | wc -l) files to $WEB_ROOT"

step "Restart the API"
systemctl restart "$SERVICE"
for _ in $(seq 1 15); do
  if curl -fsS --max-time 2 "$HEALTH_URL" >/dev/null 2>&1; then
    echo "healthy: $HEALTH_URL"
    break
  fi
  sleep 1
done
curl -fsS --max-time 2 "$HEALTH_URL" >/dev/null || {
  echo "API did not come up — inspect: journalctl -u $SERVICE -n 50 --no-pager" >&2; exit 1; }

step "Reload nginx"
nginx -t
systemctl reload nginx

step "Done"
systemctl --no-pager --lines=0 status "$SERVICE" || true
echo
echo "Reminder: only after the first successful sign-in, consider"
echo "  journalctl -u $SERVICE -f      # live logs"
