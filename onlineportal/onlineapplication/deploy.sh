#!/usr/bin/env bash
# Automated Production VPS Deployment Script for Title Deed Online Application
# Server: 116.203.61.212
set -e

echo "=========================================================="
echo " Starting Title Deed Application VPS Deployment"
echo "=========================================================="

# 1. Update system & install dependencies
echo ">>> 1. Installing System Dependencies..."
sudo apt update
sudo apt install -y python3 python3-venv python3-pip postgresql postgresql-contrib nginx certbot python3-certbot-nginx nodejs npm redis-server git

sudo systemctl enable --now postgresql redis-server nginx

# 2. Configure PostgreSQL Database
echo ">>> 2. Provisioning PostgreSQL Database..."
sudo -u postgres psql -c "CREATE DATABASE lands;" 2>/dev/null || echo "Database 'lands' already exists."
sudo -u postgres psql -c "CREATE USER appuser WITH PASSWORD 'AppUserSecurePass2026!';" 2>/dev/null || echo "User 'appuser' already exists."
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE lands TO appuser;"
sudo -u postgres psql -c "ALTER DATABASE lands OWNER TO appuser;" 2>/dev/null || true

# 3. Application Directory Setup
echo ">>> 3. Setting Up Application Directory..."
sudo mkdir -p /opt/onlineapplication
sudo chown -R $USER:$USER /opt/onlineapplication

if [ ! -d "/opt/onlineapplication/.git" ]; then
    echo "Cloning repository to /opt/onlineapplication..."
    git clone https://github.com/kchiwakaya/onlineportal /opt/onlineapplication
else
    echo "Updating existing repository at /opt/onlineapplication..."
    cd /opt/onlineapplication
    git fetch origin main
    git reset --hard origin/main
fi

cd /opt/onlineapplication

# 4. Virtual Environment & Dependencies
echo ">>> 4. Installing Python Dependencies..."
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
pip install gunicorn

# 5. Production Environment File (.env)
echo ">>> 5. Generating Production .env Configuration..."
if [ ! -f ".env" ]; then
    SECRET_KEY=$(python3 -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())")
    cat <<EOF > .env
SECRET_KEY=${SECRET_KEY}
DEBUG=False
ALLOWED_HOSTS=116.203.61.212,localhost,127.0.0.1
DB_NAME=lands
DB_USER=appuser
DB_PASSWORD=AppUserSecurePass2026!
DB_HOST=127.0.0.1
DB_PORT=5432
CORS_ALLOWED_ORIGINS=http://116.203.61.212
CSRF_TRUSTED_ORIGINS=http://116.203.61.212
REDIS_URL=redis://127.0.0.1:6379/1
SECURE_SSL_REDIRECT=False
EOF
    echo ".env created with production security settings."
fi

# 6. Database Migrations
echo ">>> 6. Running Database Migrations..."
python manage.py migrate --noinput

# 7. Build Frontend SPA
echo ">>> 7. Building Frontend Bundle..."
if [ -d "frontend" ]; then
    cd frontend
    npm install
    npm run build
    cd ..
fi

mkdir -p templates
if [ -f "frontend/dist/index.html" ]; then
    cp frontend/dist/index.html templates/index.html
fi

# 8. Collect Static Files
echo ">>> 8. Collecting Static Files..."
python manage.py collectstatic --noinput

# 9. Permissions Setup
echo ">>> 9. Configuring File Permissions..."
mkdir -p logs media staticfiles
sudo chmod -R 755 /opt/onlineapplication
sudo chown -R www-data:www-data /opt/onlineapplication/onlineapplication/logs /opt/onlineapplication/onlineapplication/media /opt/onlineapplication/onlineapplication/staticfiles
sudo chmod -R 775 logs media staticfiles

# 10. Systemd Service Setup
echo ">>> 10. Configuring Gunicorn Systemd Service..."
sudo cat <<EOF | sudo tee /etc/systemd/system/onlineapp.service > /dev/null
[Unit]
Description=Title Deed Application (Gunicorn)
After=network.target postgresql.service redis-server.service

[Service]
User=www-data
Group=www-data
WorkingDirectory=/opt/onlineapplication/onlineapplication
RuntimeDirectory=onlineapp
ExecStart=/opt/onlineapplication/onlineapplication/venv/bin/gunicorn onlineapplication.wsgi:application \
    --bind unix:/run/onlineapp/onlineapp.sock \
    --workers 3 \
    --timeout 120
Restart=on-failure
RestartSec=5
EnvironmentFile=/opt/onlineapplication/onlineapplication/.env

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now onlineapp
sudo systemctl restart onlineapp

# 11. Nginx Reverse Proxy Setup
echo ">>> 11. Configuring Nginx Reverse Proxy..."
sudo cat <<EOF | sudo tee /etc/nginx/sites-available/onlineapp > /dev/null
server {
    listen 80;
    server_name 116.203.61.212 _;

    client_max_body_size 20M;

    # Static assets (collectstatic)
    location ^~ /static/ {
        alias /opt/onlineapplication/onlineapplication/staticfiles/;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # Vite compiled assets
    location ^~ /assets/ {
        alias /opt/onlineapplication/onlineapplication/staticfiles/assets/;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # User uploaded media files
    location ^~ /media/ {
        alias /opt/onlineapplication/onlineapplication/media/;
        expires 7d;
        access_log off;
    }

    # SPA routes & root static files (e.g. /hero-bg.png, /logo.png, /farmer-welcome.png)
    location / {
        root /opt/onlineapplication/onlineapplication/staticfiles;
        try_files \$uri @gunicorn;
    }

    location @gunicorn {
        proxy_pass http://unix:/run/onlineapp/onlineapp.sock;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120;
    }
}
EOF

sudo ln -sf /etc/nginx/sites-available/onlineapp /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx

echo "=========================================================="
echo " Deployment Complete!"
echo " Access the site at: http://116.203.61.212"
echo "=========================================================="
sudo systemctl status onlineapp --no-pager
