from django.apps import AppConfig
from django.db.models.signals import post_migrate
import os

def create_default_admin(sender, **kwargs):
    from django.contrib.auth import get_user_model
    User = get_user_model()
    
    username = os.getenv('DJANGO_SUPERUSER_USERNAME', 'admin')
    email = os.getenv('DJANGO_SUPERUSER_EMAIL', 'admin@example.com')
    password = os.getenv('DJANGO_SUPERUSER_PASSWORD', 'admin')
    
    if not User.objects.filter(username=username).exists():
        print(f"Creating default superuser: {username}")
        user = User.objects.create_superuser(username=username, email=email, password=password)
        
        # Ensure StaffProfile exists for admin
        from onlineapplicationapi.models import StaffProfile
        StaffProfile.objects.get_or_create(user=user, defaults={'role': 'admin'})
    else:
        print(f"Superuser {username} already exists.")
        # Even if exists, ensure profile is there
        user = User.objects.get(username=username)
        from onlineapplicationapi.models import StaffProfile
        StaffProfile.objects.get_or_create(user=user, defaults={'role': 'admin'})

class OnlineapplicationapiConfig(AppConfig):
    name = 'onlineapplicationapi'

    def ready(self):
        post_migrate.connect(create_default_admin, sender=self)
