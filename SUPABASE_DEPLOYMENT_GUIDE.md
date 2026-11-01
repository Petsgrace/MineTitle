# Supabase Online Deployment Guide
**Title Deeds One Stop Center System**
**Ministry of Lands, Agriculture, Fisheries, Water & Rural Development**

This guide provides step-by-step instructions to connect the Title Deeds One Stop Center to a live **Supabase** cloud database (PostgreSQL + PostGIS) and put the application online.

---

## What Has Been Implemented on the System
1. **Automated DATABASE_URL Parsing (`settings.py`):**
   - Django dynamically parses Supabase connection strings (direct or connection pooler on port 6543/5432).
   - Enforces SSL mode (`sslmode=require`) and connection pooling (`CONN_MAX_AGE=600`).
   - Automatically detects PostgreSQL vs SQLite without breaking local development or testing.
2. **Automated Supabase Migration Command:**
   - Command: `python manage.py migrate_to_supabase`
   - Tests live database connectivity, automatically enables the PostGIS extension (`CREATE EXTENSION IF NOT EXISTS postgis;`), runs all 48 Django migrations, and seeds the 9 statutory workflow stages and departmental staff.
3. **Dual-Mode PostGIS Engine:**
   - Boundary overlap detection uses native PostGIS `ST_Intersects` and `ST_Area` when connected to Supabase, with automatic fallback to Shapely geometry algorithms.
4. **Environment Templates:**
   - `.env.supabase.example` and updated `.env` in `onlineportal/onlineapplication/` with dedicated Supabase connection sections.

---

## Step-by-Step Instructions (What You Need to Do)

### Step 1: Create a Free Project on Supabase
1. Go to **[https://supabase.com](https://supabase.com)** and sign in (or create a free account).
2. Click **"New Project"**.
3. Fill in the project details:
   - **Name:** `title-deeds-onestop` (or any name you prefer)
   - **Database Password:** Enter a strong password (save this password, you will need it in Step 2).
   - **Region:** Choose the region closest to your users (e.g., `af-south-1` Cape Town / Johannesburg, or `eu-central-1` Frankfurt).
4. Click **"Create new project"** and wait ~2 minutes for Supabase to provision your database.

---

### Step 2: Copy Your Database Connection String
1. In your Supabase project dashboard, click the **Settings (gear icon)** at the bottom of the left sidebar.
2. Under Project Settings, click **"Database"**.
3. Scroll down to the **"Connection String"** section.
4. Select the **"URI"** tab:
   - Select **"Transaction Pooler"** (Port `6543` - recommended for web apps) or **"Session"** (Port `5432`).
5. Copy the connection URI. It will look like this:
   ```text
   postgresql://postgres.[YOUR-PROJECT-REF]:[YOUR-PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres
   ```
6. Replace `[YOUR-PASSWORD]` with the actual database password you created in Step 1.

---

### Step 3: Add the Connection String to Your Project
1. Open the file:
   `C:\Users\peter\Documents\onestopproject\onlineportal\onlineapplication\.env`
2. Update the database section to set `USE_SQLITE=False` and paste your `DATABASE_URL`:
   ```env
   USE_SQLITE=False
   DATABASE_URL=postgresql://postgres.abcdefghijklm:YourSecretPassword123@aws-0-eu-central-1.pooler.supabase.com:6543/postgres
   ```
3. Save the file.

---

### Step 4: Run the Automated Supabase Migration Command
Open PowerShell and run:
```powershell
cd C:\Users\peter\Documents\onestopproject\onlineportal\onlineapplication
.\.venv\Scripts\python.exe manage.py migrate_to_supabase --with-data
```

This single command will automatically:
- Verify your SSL connection to Supabase
- Enable the PostGIS extension (`CREATE EXTENSION IF NOT EXISTS postgis;`)
- Run all Django migrations to create all application tables
- Seed the statutory 9-stage workflows and departmental roles
- Migrate your local SQLite data across into Supabase PostgreSQL (via `--with-data`)

---

### Step 5: (Optional) Set Up Cloud Storage for Uploaded Dossiers
If you want applicant photos and documents stored in Supabase Cloud Storage:
1. In your Supabase dashboard, click **"Storage"** in the left sidebar.
2. Click **"New Bucket"**.
3. Name it: `title-deeds-dossiers`.
4. Leave it as Private (authenticated) and click **Create Bucket**.
5. Copy your **Project URL** and **anon/service_role key** from **Project Settings -> API** and add them to `.env`:
   ```env
   SUPABASE_URL=https://[YOUR-PROJECT-REF].supabase.co
   SUPABASE_ANON_KEY=eyJhbGci...
   SUPABASE_STORAGE_BUCKET=title-deeds-dossiers
   ```

---

### Step 6: Start the Server Connected to Supabase
Run the backend server:
```powershell
cd C:\Users\peter\Documents\onestopproject\onlineportal\onlineapplication
.\.venv\Scripts\python.exe manage.py runserver 0.0.0.0:8000
```
Your backend is now running live on your cloud Supabase database!

---

### Step 7: Accessing Online from Outside Your Local Network
To allow officers and citizens to access the system from anywhere over the internet:
1. **Option A (Instant Public URL for testing):**
   Use a secure tunnel like Cloudflare Tunnel or ngrok:
   ```powershell
   ngrok http 8000
   ```
2. **Option B (Permanent Cloud Hosting):**
   Deploy the Django backend container to **Render**, **Railway**, or **Fly.io**:
   - Connect your GitHub repository.
   - Add the `DATABASE_URL` environment variable pointing to Supabase.
   - Start command: `gunicorn onlineapplication.wsgi:application --bind 0.0.0.0:8000`.
   - The React frontend is automatically served by Django WhiteNoise from `staticfiles/`!
