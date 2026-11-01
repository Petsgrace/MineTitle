# Centralized PostgreSQL + PostGIS Database Setup Guide
Title Deeds One Stop Center - Ministry of Lands, Agriculture, Fisheries, Water and Rural Development

---

## 1. Quickstart with Docker Compose

To spin up a production-ready PostgreSQL 16 instance with PostGIS 3.4 enabled:

```bash
# In the root repository directory
docker-compose up -d
```

Verify the database container is healthy:
```bash
docker ps --filter "name=onestop_postgis"
```

---

## 2. Environment Variables Configuration

To switch the Django backend from SQLite to PostgreSQL + PostGIS, set the following environment variables in your `.env` or deployment runtime environment:

```ini
# Database Engine Selection
USE_SQLITE=False
USE_POSTGIS=True

# Database Credentials
DB_NAME=onestop_lands
DB_USER=lands_admin
DB_PASSWORD=lands_secure_password_2026
DB_HOST=localhost
DB_PORT=5432
```

---

## 3. Applying Migrations & Migrating Data from SQLite

1. Apply the statutory database migrations:
```bash
python manage.py migrate
```

2. Run the automated data migration tool to transfer all existing records from SQLite into PostGIS:
```bash
python manage.py migrate_sqlite_to_postgis
```

3. Confirm that spatial queries and the immutable audit ledger are intact:
```bash
python manage.py verify_audit_ledger
```
