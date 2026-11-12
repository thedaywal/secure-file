"""Seed a realistic SecureFile dataset for local development.

Creates the single administrator, a handful of genuinely encrypted protected
images, per-image recipients with single-use links, a couple of completed
authorized sessions (with burned-in watermarked renditions) and a spread of
audit-trail activity so the dashboard, monitoring and traceability views have
believable data to render.

Idempotent by default: it will not create a second administrator and skips the
demo images if any files already exist. Pass ``--reset`` to wipe the demo data
first (this deletes every SecureFile, recipient, link, watermark, device,
access log and notification, but keeps the administrator account). Pass
``--clear`` to delete that data and stop without seeding anything.
"""
from __future__ import annotations

import io
import random
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone
from PIL import Image, ImageDraw

from accounts.models import AdminUser
from core.utils import make_access_id, sha256_hex
from monitoring.models import (
    AccessEventType,
    AccessLog,
    AccessResult,
    Device,
    DeviceType,
    RiskLevel,
    TrustStatus,
)
from notifications.models import Notification, ensure_preferences
from securefiles.intake import inspect_image
from securefiles.models import FilePolicy, SecureFile, get_or_create_policy
from securefiles.storage import delete_original, store_original
from sharing.models import LinkState, Recipient, ShareLink
from sharing.services import build_share_url, issue_link, link_plaintext, start_session
from watermarks.models import WatermarkRecord
from watermarks.services import create_rendition
from watermarks.storage import delete_rendition

ADMIN_EMAIL = 'admin@securefile.io'
ADMIN_PASSWORD = 'SecureFile#Admin2026'
RECIPIENT_PASSWORD = '2718281828'

# name, extension, width, height, headline, subhead, palette
IMAGE_BLUEPRINTS = [
    ('Q4 Financial Projections', 'JPEG', 1600, 1000, 'Q4 FINANCIALS', 'CONFIDENTIAL — INTERNAL ONLY', ((17, 24, 39), (37, 99, 235))),
    ('Patient Scan — MRI Series', 'PNG', 1200, 900, 'MR-2026-4471', 'RESTRICTED — PHI', ((15, 23, 42), (13, 148, 136))),
    ('Product Roadmap 2027', 'WEBP', 1400, 900, 'ROADMAP 2027', 'STRATEGIC — DO NOT DISTRIBUTE', ((30, 27, 75), (124, 58, 237))),
    ('Board Meeting Minutes', 'JPEG', 1500, 1100, 'BOARD MINUTES', 'CONFIDENTIAL — LEGAL PRIVILEGE', ((31, 41, 55), (220, 38, 38))),
    ('Acme Mutual NDA', 'PNG', 1000, 1400, 'MUTUAL NDA', 'EXECUTED — DO NOT COPY', ((24, 24, 27), (234, 179, 8))),
]

RECIPIENTS = [
    ('3141592653', 'Jordan Smith', 'Finance'),
    ('2718281828', 'Maya Okafor', 'Clinical Ops'),
    ('1618033988', 'Lena Chen', 'Product'),
    ('1414213562', 'Rafael Delgado', 'Legal'),
    ('1732050807', 'Sara Ahmed', 'Partnerships'),
]


def _render_image(width: int, height: int, headline: str, subhead: str, palette, image_format: str) -> bytes:
    """Draw a plausible-looking document/scan so watermarks have content to sit on."""
    top, bottom = palette
    image = Image.new('RGB', (width, height), top)
    draw = ImageDraw.Draw(image)

    for y in range(height):
        blend = y / max(1, height - 1)
        draw.line(
            [(0, y), (width, y)],
            fill=(
                int(top[0] + (bottom[0] - top[0]) * blend),
                int(top[1] + (bottom[1] - top[1]) * blend),
                int(top[2] + (bottom[2] - top[2]) * blend),
            ),
        )

    panel = (
        int(width * 0.08),
        int(height * 0.12),
        int(width * 0.92),
        int(height * 0.88),
    )
    draw.rectangle(panel, outline=(255, 255, 255), width=max(2, width // 400))

    banner_h = int(height * 0.11)
    draw.rectangle(
        (panel[0], panel[1], panel[2], panel[1] + banner_h),
        fill=(255, 255, 255),
    )
    draw.text((panel[0] + 24, panel[1] + banner_h // 4), headline, fill=top)
    draw.text((panel[0] + 24, panel[1] + banner_h // 2 + 6), subhead, fill=(70, 70, 70))

    rows = random.randint(8, 14)
    y = panel[1] + banner_h + 40
    for _ in range(rows):
        if y > panel[3] - 60:
            break
        line_w = random.randint(int((panel[2] - panel[0]) * 0.35), int((panel[2] - panel[0]) * 0.9))
        line_h = max(6, height // 140)
        draw.rectangle((panel[0] + 24, y, panel[0] + 24 + line_w, y + line_h), fill=(225, 225, 225))
        y += line_h * 3

    draw.rectangle(
        (panel[0] + 24, panel[3] - 44, panel[0] + 24 + 160, panel[3] - 16),
        fill=bottom,
    )

    buffer = io.BytesIO()
    if image_format == 'PNG':
        image.save(buffer, format='PNG', optimize=True)
    elif image_format == 'WEBP':
        image.save(buffer, format='WEBP', quality=88)
    else:
        image.save(buffer, format='JPEG', quality=88, optimize=True)
    return buffer.getvalue()


class Command(BaseCommand):
    help = 'Seed the SecureFile demo dataset (single administrator, protected images, links, audit trail).'

    def add_arguments(self, parser):
        parser.add_argument('--reset', action='store_true', help='Delete existing demo data before seeding.')
        parser.add_argument(
            '--clear',
            action='store_true',
            help='Delete every domain record (images, recipients, links, watermarks, audit trail) '
            'and exit without seeding. The administrator account is preserved.',
        )
        parser.add_argument('--seed', type=int, default=20261109, help='Random seed for reproducible demo images.')

    def handle(self, *args, **options):
        if options['clear']:
            self._reset()
            self.stdout.write(self.style.SUCCESS('Domain data cleared — administrator preserved.'))
            return

        random.seed(options['seed'])
        self.stdout.write(self.style.MIGRATE_HEADING('SecureFile demo seed'))

        if options['reset']:
            self._reset()

        admin = self._ensure_admin()
        self._ensure_preferences()

        if SecureFile.objects.exists():
            self.stdout.write(self.style.WARNING('Protected images already exist — skipping image/link seeding.'))
        else:
            self._seed_files(admin)

        self._seed_audit_trail()
        self._seed_notifications()

        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS('Seed complete.'))
        self.stdout.write(f'  Administrator : {ADMIN_EMAIL} / {ADMIN_PASSWORD}')
        self.stdout.write(f'  Recipients    : any username below / {RECIPIENT_PASSWORD}')
        self.stdout.write('')
        self._print_links()

    # ------------------------------------------------------------------ #
    def _reset(self) -> None:
        self.stdout.write(self.style.WARNING('Clearing domain data (administrator is preserved)…'))
        Notification.objects.all().delete()
        AccessLog.objects.all().delete()
        Device.objects.all().delete()
        # Remove the encrypted rendition ciphertext before dropping each record.
        for record in WatermarkRecord.objects.all():
            delete_rendition(record.rendition_path)
            record.delete()
        for link in ShareLink.objects.all():
            session = link.viewer_session
            if session is not None:
                session.delete()
        ShareLink.objects.all().delete()
        Recipient.objects.all().delete()
        FilePolicy.objects.all().delete()
        # Remove the encrypted original ciphertext before dropping each file.
        for secure_file in SecureFile.objects.all():
            delete_original(secure_file.original_path)
            secure_file.delete()

    def _ensure_admin(self) -> AdminUser:
        admin = AdminUser.objects.filter(email=ADMIN_EMAIL).first()
        if admin is not None:
            # Keep the printed credential truthful for a demo database.
            if not admin.check_password(ADMIN_PASSWORD):
                admin.set_password(ADMIN_PASSWORD)
                admin.save(update_fields=['password'])
                self.stdout.write(self.style.SUCCESS(f'Administrator password reset: {admin.email}'))
            else:
                self.stdout.write(f'Administrator exists: {admin.email}')
            return admin

        # A single administrator may already exist with another contact address.
        legacy = AdminUser.objects.first()
        if legacy is not None:
            legacy.email = ADMIN_EMAIL
            legacy.set_password(ADMIN_PASSWORD)
            legacy.save(update_fields=['email', 'password'])
            self.stdout.write(self.style.SUCCESS(f'Administrator updated: {legacy.email}'))
            return legacy

        admin = AdminUser.objects.create_superuser(
            email=ADMIN_EMAIL,
            password=ADMIN_PASSWORD,
            full_name='Alex Morgan',
            organization='SecureFile Labs',
            job_title='Security Administrator',
        )
        self.stdout.write(self.style.SUCCESS(f'Created administrator: {admin.email}'))
        return admin

    def _ensure_preferences(self) -> None:
        ensure_preferences()
        self.stdout.write('Notification preferences ensured.')

    def _seed_files(self, admin: AdminUser) -> None:
        now = timezone.now()
        for index, (name, extension, width, height, headline, subhead, palette) in enumerate(IMAGE_BLUEPRINTS):
            payload = _render_image(width, height, headline, subhead, palette, extension)
            info = inspect_image(payload, '')

            secure_file = SecureFile.objects.create(
                owner=admin,
                name=name,
                extension=info['extension'],
                kind='image',
                mime_type=info['mime_type'],
                size_bytes=len(payload),
                checksum=sha256_hex(payload),
                tags=[info['extension'].lower(), 'confidential'],
                original_path='',  # set after we know the id
                width=info['width'],
                height=info['height'],
                uploaded_at=now - timedelta(days=len(IMAGE_BLUEPRINTS) - index, hours=index * 3),
            )
            # The original is encrypted before it touches disk.
            secure_file.original_path = store_original(str(secure_file.id), payload)
            secure_file.save(update_fields=['original_path'])

            policy = get_or_create_policy(secure_file)
            policy.session_duration_minutes = 30
            policy.watermark_opacity = 0.18
            policy.watermark_size = 1.0
            policy.clamp()
            policy.save()

            username, display_name, _team = RECIPIENTS[index % len(RECIPIENTS)]
            recipient = Recipient.objects.create(
                file=secure_file,
                username=username,
                display_name=display_name,
                session_duration_minutes=30,
                expires_at=now + timedelta(days=14),
            )
            recipient.set_password(RECIPIENT_PASSWORD)
            recipient.save(update_fields=['password'])

            link, _token = issue_link(recipient, expires_at=now + timedelta(days=14))

            # The first two files get a completed authorized session so the
            # traceability views have real watermark records and burned-in
            # marks; the first session is still open so the dashboard reports a
            # live session.
            if index < 2:
                moment = now - timedelta(minutes=12) if index == 0 else now - timedelta(hours=9)
                self._complete_session(secure_file, recipient, link, moment)

            self.stdout.write(f'  + {secure_file.name} ({secure_file.extension}) → {username}')

    def _complete_session(self, secure_file: SecureFile, recipient: Recipient, link: ShareLink, moment) -> None:
        link.state = LinkState.CONSUMED
        link.consumed_at = moment
        link.consumed_ip = '203.0.113.42'
        link.successful_views = 1
        link.last_accessed_at = moment
        link.save(update_fields=['state', 'consumed_at', 'consumed_ip', 'successful_views', 'last_accessed_at'])

        recipient.last_authenticated_at = moment
        recipient.save(update_fields=['last_authenticated_at'])

        session = start_session(link, recipient, make_access_id(), '203.0.113.42', 'Mozilla/5.0 (Windows NT 10.0) Chrome/131.0')
        rend = create_rendition(
            file=secure_file,
            recipient_username=recipient.username,
            access_id=session.access_id,
            session_id=session.id,
            opacity=0.18,
            size=1.0,
            moment=moment,
        )
        session.watermark = rend
        session.started_at = moment
        session.expires_at = moment + timedelta(minutes=30)
        session.save(update_fields=['watermark', 'started_at', 'expires_at'])

        AccessLog.objects.create(
            file=secure_file, share=link, recipient_username=recipient.username,
            ip='203.0.113.42', device='Chrome on Windows 10/11', device_type=DeviceType.DESKTOP,
            browser='Chrome', os='Windows 10/11', location='Chicago, US',
            occurred_at=moment, result=AccessResult.SUCCESS, authenticated=True,
            event_type=AccessEventType.SUCCESSFUL_ACCESS, risk_level=RiskLevel.LOW,
        )
        AccessLog.objects.create(
            file=secure_file, share=link, recipient_username=recipient.username,
            ip='203.0.113.42', device='Chrome on Windows 10/11', device_type=DeviceType.DESKTOP,
            browser='Chrome', os='Windows 10/11', location='Chicago, US',
            occurred_at=moment - timedelta(minutes=2), result=AccessResult.SUCCESS, authenticated=True,
            event_type=AccessEventType.LINK_CONSUMED, risk_level=RiskLevel.LOW,
        )

    # ------------------------------------------------------------------ #
    def _seed_audit_trail(self) -> None:
        if AccessLog.objects.filter(event_type=AccessEventType.FAILED_ACCESS).exists():
            return

        now = timezone.now()
        files = list(SecureFile.objects.all())
        if not files:
            return

        for file in files[:3]:
            link = file.share_links.first()
            recipient = link.recipient if link else None
            username = recipient.username if recipient else 'unknown'

            AccessLog.objects.create(
                file=file, share=link, recipient_username=username,
                ip='198.51.100.23', device='Firefox on macOS', device_type=DeviceType.LAPTOP,
                browser='Firefox', os='macOS', location='Austin, US',
                occurred_at=now - timedelta(days=random.randint(1, 6), hours=random.randint(0, 20)),
                result=AccessResult.FAILED, authenticated=False,
                event_type=AccessEventType.FAILED_ACCESS, risk_level=RiskLevel.MEDIUM,
            )
            AccessLog.objects.create(
                file=file, share=link, recipient_username=username,
                ip='192.0.2.77', device='Safari on iOS', device_type=DeviceType.MOBILE,
                browser='Safari', os='iOS', location='London, UK',
                occurred_at=now - timedelta(days=random.randint(1, 8), hours=random.randint(0, 20)),
                result=AccessResult.BLOCKED, authenticated=False,
                event_type=AccessEventType.LINK_REUSE_BLOCKED, risk_level=RiskLevel.HIGH,
            )

        AccessLog.objects.create(
            file=files[0], share=files[0].share_links.first(),
            recipient_username=RECIPIENTS[0][0], ip='203.0.113.42',
            device='Chrome on Windows 10/11', device_type=DeviceType.DESKTOP,
            browser='Chrome', os='Windows 10/11', location='Chicago, US',
            occurred_at=now - timedelta(hours=4), result=AccessResult.BLOCKED, authenticated=True,
            event_type=AccessEventType.DOWNLOAD_BLOCKED, risk_level=RiskLevel.MEDIUM,
        )

        Device.objects.get_or_create(
            device_identifier='demo-windows-chrome',
            owner_username=RECIPIENTS[0][0],
            defaults=dict(
                label='Chrome on Windows 10/11', device_type=DeviceType.DESKTOP, os='Windows 10/11',
                browser='Chrome', ip='203.0.113.42', location='Chicago, US', trust_status=TrustStatus.TRUSTED,
            ),
        )
        Device.objects.get_or_create(
            device_identifier='demo-ios-safari',
            owner_username=RECIPIENTS[1][0],
            defaults=dict(
                label='Safari on iOS', device_type=DeviceType.MOBILE, os='iOS',
                browser='Safari', ip='192.0.2.77', location='London, UK', trust_status=TrustStatus.SUSPICIOUS,
            ),
        )

    def _seed_notifications(self) -> None:
        if Notification.objects.exists():
            return

        now = timezone.now()
        file = SecureFile.objects.first()
        Notification.objects.bulk_create([
            Notification(
                category='successful-access', severity='success',
                title='Protected image accessed',
                message='Jordan Smith opened “Q4 Financial Projections” from a trusted device.',
                created_at=now - timedelta(hours=6), file=file, recipient_username=RECIPIENTS[0][0],
            ),
            Notification(
                category='link-forwarded', severity='critical',
                title='Possible link forwarding detected',
                message='A single-use link was opened from an unrecognised device in London.',
                created_at=now - timedelta(days=1, hours=2), file=file, recipient_username=RECIPIENTS[1][0],
            ),
            Notification(
                category='file-expiration', severity='warning',
                title='Share link expiring soon',
                message='The link for “Product Roadmap 2027” expires in 14 days.',
                created_at=now - timedelta(days=2), file=file, recipient_username=RECIPIENTS[2][0],
            ),
            Notification(
                category='unauthorized-access', severity='warning',
                title='Failed authentication',
                message='Three failed password attempts on “Board Meeting Minutes”.',
                created_at=now - timedelta(days=3), file=file, recipient_username=RECIPIENTS[3][0],
            ),
        ])

    # ------------------------------------------------------------------ #
    def _print_links(self) -> None:
        self.stdout.write(self.style.MIGRATE_HEADING('Recipient links'))
        for link in ShareLink.objects.select_related('recipient', 'file').order_by('created_at'):
            state = link.effective_state
            url = build_share_url(link_plaintext(link))
            self.stdout.write(f'  [{state:8}] {link.recipient.username:10} {link.file.name}')
            self.stdout.write(f'             {url}')
            self.stdout.write(f'             password: {RECIPIENT_PASSWORD}')
