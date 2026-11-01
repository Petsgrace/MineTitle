# System Architecture: Title Deeds One Stop Center (Mobile Client)
**Ministry of Lands, Agriculture, Fisheries, Water & Rural Development (March 2026 Statutory Alignment)**

## 1. Technology Stack
* **Mobile Runtime Container:** Capacitor 6 Native Android Container (Gradle, Java/Kotlin)
* **Frontend Web Client:** React 18 / Vite Single-Page Application (Bundled in www/ and native assets)
* **Backend API:** Django 5.1 + Django REST Framework (Serving REST API at /api/v1/)
* **Database & GIS:** PostgreSQL 16 with PostGIS extension (with automatic Shapely GEOS fallback for local environments)
* **Security & Cryptography:** 
  - SHA-256 Chained Immutable Audit Ledger for all workflow state transitions
  - SHA-256 Hashed Multi-Factor Authentication (MFA) OTPs (10-minute expiry)
  - Strict Server-Side Role-Based Access Control (RBAC) with zero-privilege defaults for unassigned staff
  - Production SSL/HTTPS enforcement, HSTS, and cleartext traffic disabled in Android release builds
* **Release Signing:** RSA-2048 production keystore (	itledeeds.keystore), signed and verified with Android Signature Schemes v2 & v3

## 2. Statutory 9 Sequential Workflow Stages
1. PENDING (Intake with  statutory fee gate, sequential receipt, and 4-point biometric dossier)
2. RESETTLEMENT_VERIFIED (Dept. of Resettlement: offer letter and land category verification)
3. LIMS_VERIFIED (Land Information Management System: allocation deduplication)
4. ZLC_CLEARED (Zimbabwe Land Commission: dispute clearance, automatically triggers AI Dispute Predictor)
5. GIS_VALIDATED (GIS & Mapping: cadastral boundary coordinates validation, re-evaluates AI score)
6. SURVEYED (Surveyor General: survey diagram approval and beacon coordinate verification)
7. VALUATED (Dept. of Land Valuations: automated statutory compounded valuation pricing engine)
8. APPROVED (Director of Lands: executive statutory endorsement)
9. READY_FOR_COLLECTION (Deeds Registry: title deed registration and volume/folio assignment)

## 3. Build & Release Pipeline
The production release APK is built automatically using uild_apk.ps1:
1. Native compilation: gradlew.bat assembleRelease
2. 4-byte memory-mapped alignment: zipalign.exe -p 4
3. Cryptographic signature: pksigner.bat sign --ks titledeeds.keystore
4. Strict signature verification: pksigner.bat verify --verbose
Output: TitleDeeds.apk (9.67 MB)
