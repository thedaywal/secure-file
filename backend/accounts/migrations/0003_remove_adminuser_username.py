"""Keep administrator sign-in email-based; numeric IDs belong to recipients."""
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0002_adminuser_username'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='adminuser',
            name='username',
        ),
    ]
