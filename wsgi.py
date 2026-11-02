"""
WSGI config root wrapper for Render deployment.
"""
import os
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR / 'onlineportal' / 'onlineapplication'))

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'onlineapplication.settings')

from django.core.wsgi import get_wsgi_application
application = get_wsgi_application()

