"""Give the administrator a 10-digit numeric username as the sign-in identity.

Email stays on the account (it receives password-reset links) but is no longer
the credential the operator types. Any pre-existing administrator is migrated to
the seeded username so a `migrate` alone restores access.
"""
import accounts.models
from django.db import migrations, models

EXISTING_ADMIN_USERNAME = '3141592653'


def set_existing_username(apps, schema_editor):
    AdminUser = apps.get_model('accounts', 'AdminUser')
    AdminUser.objects.filter(username__isnull=True).update(username=EXISTING_ADMIN_USERNAME)


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='adminuser',
            name='username',
            field=models.CharField(
                blank=True,
                max_length=10,
                null=True,
                validators=[accounts.models.ADMIN_USERNAME_VALIDATOR],
            ),
        ),
        migrations.RunPython(set_existing_username, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='adminuser',
            name='username',
            field=models.CharField(
                max_length=10,
                unique=True,
                validators=[accounts.models.ADMIN_USERNAME_VALIDATOR],
            ),
        ),
    ]
