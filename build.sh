#!/usr/bin/env bash
set -o errexit

pip install --upgrade pip
pip install -r requirements.txt

# Ensure fallback SECRET_KEY is present during build step so collectstatic succeeds
export SECRET_KEY="${SECRET_KEY:-django-insecure-render-build-key-temporary}"

python manage.py collectstatic --noinput
python manage.py migrate
