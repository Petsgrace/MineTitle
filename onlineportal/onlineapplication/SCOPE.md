# SCOPE STATEMENT: TITLE DEEDS ONE STOP CENTER
## Unified Mobile App Title Deeds Processing & Land Management System
**Client / Beneficiary:** Ministry of Lands and Rural Development (Zimbabwe)  
**Academic Affiliation:** Harare Polytechnic — National Diploma in Information Technology  
**Baseline Proposal:** Approved March 2026 Project Proposal *"TITLE DEEDS ONE STOP CENTER: Unified Title Processing and Land Management System"*  
**Guiding Principle:** *"One system, one database, one truth"*

---

### 1. Scope Boundary & Prototype Delineation
* **Ministry-Wide Full Rollout (Proposal Specification):** The approved strategic project proposal outlines a comprehensive, nationwide 12-month phased rollout budget projected at **USD 713,000**, including inter-ministerial datacenter provisioning, wide-area provincial networking, and broad community field registration campaigns.
* **Prototype Deliverable (This Repository):** This codebase represents the **20-week working technical prototype** developed to validate the architectural, security, workflow, and spatial verification pillars of the system.
* **Projections vs. Empirical Claims:**
  * Performance, efficiency, and financial claims (e.g., 70% processing time reduction, 90% fraud prevention, 12–36 months reduced to 14–30 days, 18–24 month ROI) are **projected modeling targets** from the strategic proposal.
  * This repository does **NOT** claim live production deployment, measured nationwide fraud reduction, or realized financial ROI. All benchmarks documented herein reflect local simulated and empirical test harness results.

---

### 2. Architectural Pillars (Three Tiers, One Backend, One Database)
1. **Data Layer:**
   * PostgreSQL with PostGIS extension for spatial queries (`PolygonField`, `PointField`, `ST_Intersects` via GeoDjango ORM). Boundaries are stored natively as geographic features with SRID 4326, never as flat unindexed JSON.
   * Relational RBAC, configurable workflow transitions, SLA tracking, fee tables, and hash-chained audit trails.
2. **Application Layer:**
   * Python 3.12 & Django 5.x / 6.x with Django REST Framework (DRF).
   * Versioned RESTful API under `/api/v1/` with session and token/JWT authentication, role-based permission enforcement (HTTP 403 on queue violations), email OTP MFA, rate limiting, and generic error safety.
3. **Presentation Layer (Two Unified Clients):**
   * **Citizen Native Mobile App:** React Native with Expo (TypeScript), React Navigation, React Hook Form, Axios, and `expo-sqlite` for resilient offline draft persistence and automatic reconnect sync.
   * **Staff Web Console:** React 18 + Vite + Tailwind CSS, responsive across desktop and tablet for department queue management, GIS spatial overlap review, valuation forms, and executive analytics.
4. **Deployment & Operations:**
   * Production target: Nginx reverse proxy + Gunicorn bound via UNIX socket (`/run/onlineapp/gunicorn.sock`) + systemd service supervisor + SSL/TLS termination.
   * Environment isolation: Secrets loaded strictly via `.env`.

---

### 3. The 9-Stage Sequential Workflow
Applications advance through strictly enforced, non-skippable stages:
1. `PENDING` (Applicant submission)
2. `RESETTLEMENT_VERIFIED` (Resettlement: offer letter / allocation validation, spouse and deceased-estate checklist)
3. `LIMS_VERIFIED` (LIMS: parcel record, cadastral ID, statutory application fee receipt verification)
4. `ZLC_CLEARED` (Zimbabwe Land Commission: dispute clearance)
5. `GIS_VALIDATED` (GIS: boundary overlap check, ST_Intersects, AI conflict risk assessment)
6. `SURVEYED` (Surveyor General: survey approval, survey fee calculation)
7. `VALUATED` (Valuations: standard tariff & improvements valuation)
8. `APPROVED` (Director of Lands: executive sign-off)
9. `READY_FOR_COLLECTION` (Deeds Registry: deed issued, sealed, and ready for handover)

*Note: Any department reviewer may return an application to the immediately preceding stage accompanied by a mandatory explanatory comment.*

---

### 4. Explicit Exclusions & Out-of-Scope Constraints
* **SMS Messaging:** Excluded; notifications are transmitted strictly via asynchronous Email with console fallback.
* **Biometrics:** Excluded from the prototype scope (designated for future biometric voter/national registry federation).
* **Mobile Money / Real-Time Gateway Integrations:** Excluded; financial fee processing uses receipt reference validation and configurable tariff calculation engines.
* **Distributed Blockchain Anchoring:** Excluded; cryptographic integrity is established via a cryptographically linked SHA-256 hash-chained internal audit ledger with immutable row-level protections.
