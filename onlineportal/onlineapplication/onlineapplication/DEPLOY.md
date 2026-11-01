# Title Deed Online Application — VPS Deployment Guide

## Prerequisites

- Ubuntu/Debian VPS with SSH access
- Python 3.12+, Node.js 18+, PostgreSQL, Nginx
- Domain name pointed to VPS IP (A record)

## 1. Server Setup

```bash
# Install system dependencies
sudo apt update && sudo apt install -y python3 python3-venv python3-pip \
    postgresql postgresql-contrib nginx certbot python3-certbot-nginx \
    nodejs npm redis-server

# Start and enable services
sudo systemctl enable --now postgresql redis-server nginx
```

## 2. Database

```bash
sudo -u postgres psql
CREATE DATABASE lands;
CREATE USER appuser WITH PASSWORD 'your-secure-password';
GRANT ALL PRIVILEGES ON DATABASE lands TO appuser;
\q
```

## 3. Application

```bash
# Clone / copy project to server
cd /opt
git clone <your-repo-url> onlineapplication
cd onlineapplication/onlineapplication

# Python virtual environment
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Environment file
cp .env.example .env
nano .env   # Fill in all production values. Generate SECRET_KEY:
            # python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"

# Database migrations
python manage.py migrate

# Build frontend
cd frontend
npm install
npm run build
cd ..

# Copy Vite's index.html to Django templates
cp frontend/dist/index.html templates/index.html

# Collect static files
python manage.py collectstatic --noinput

# Test it works
gunicorn onlineapplication.wsgi:application --bind 0.0.0.0:8000
# Ctrl+C after confirming

# ─────────────────────────────────────────────────────────────────────────────
# IMPORTANT: Media Folder Permissions
# ─────────────────────────────────────────────────────────────────────────────
# Ensure the application user (www-data) owns the media directory
sudo chown -R www-data:www-data /opt/onlineapplication/onlineapplication/media
sudo chmod -R 775 /opt/onlineapplication/onlineapplication/media
# ─────────────────────────────────────────────────────────────────────────────
```

## 4. Systemd Service

```bash
sudo nano /etc/systemd/system/onlineapp.service
```

Paste:

```ini
[Unit]
Description=Title Deed Application (Gunicorn)
After=network.target postgresql.service redis-server.service

[Service]
User=www-data
Group=www-data
WorkingDirectory=/opt/onlineapplication/onlineapplication
ExecStart=/opt/onlineapplication/onlineapplication/venv/bin/gunicorn \
    onlineapplication.wsgi:application \
    --bind unix:/run/onlineapp.sock \
    --workers 3 \
    --timeout 120
Restart=on-failure
RestartSec=5
EnvironmentFile=/opt/onlineapplication/onlineapplication/.env

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now onlineapp
sudo systemctl status onlineapp  # Verify running
```

## 5. Nginx Configuration

```bash
sudo nano /etc/nginx/sites-available/onlineapp
```

Paste:

```nginx
server {
    listen 80;
    server_name yourdomain.co.zw www.yourdomain.co.zw;

    client_max_body_size 20M;

    # Static files (served by Nginx directly)
    location /static/ {
        alias /opt/onlineapplication/onlineapplication/staticfiles/;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # Media uploads
    location /media/ {
        alias /opt/onlineapplication/onlineapplication/media/;
        expires 7d;
        # Ensure Nginx can read the files
        access_log off;
    }

    # API & Admin — proxy to Gunicorn
    location / {
        proxy_pass http://unix:/run/onlineapp.sock;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/onlineapp /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default  # Remove default site
sudo nginx -t                             # Test config
sudo systemctl reload nginx
```

## 6. SSL (Let's Encrypt)

```bash
sudo certbot --nginx -d yourdomain.co.zw -d www.yourdomain.co.zw
# Follow prompts to enable HTTPS redirect

# After SSL is working, update .env:
# SECURE_SSL_REDIRECT=True

sudo systemctl restart onlineapp
```

## 7. Update Workflow

When deploying updates:

```bash
cd /opt/onlineapplication/onlineapplication
source venv/bin/activate
git pull origin main

# Backend updates
pip install -r requirements.txt
python manage.py migrate

# Frontend updates
cd frontend && npm install && npm run build && cd ..
cp frontend/dist/index.html templates/index.html
python manage.py collectstatic --noinput

# Restart
sudo systemctl restart onlineapp
```
