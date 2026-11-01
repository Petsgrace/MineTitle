# RBAC PERMISSION MATRIX: TITLE DEEDS ONE STOP CENTER
## Role-Based Access Control Specification ("One system, one database, one truth")

The system strictly enforces sequential stage transitions and queue isolation. Staff members can **ONLY** act on applications currently residing in their specific department stage and view **ONLY** their stage queue. Any out-of-turn or cross-department action returns **HTTP 403 Forbidden**.

---

### 1. The 9 Personas & System Administrator

| Persona Identifier | Role Name | Institutional Unit | Primary Responsibility |
|---|---|---|---|
| `applicant` | Citizen / Farmer | Public / Landholder | Submit initial application, upload tenure deeds, track status via 3-factor public portal |
| `resettlement` | Resettlement Officer | Department of Resettlement | Verify offer letter / allocation legitimacy, check spouse & deceased-estate checklist |
| `lims` | LIMS Officer | Land Information Management System | Cadastral search, assign official Cadastral ID, verify statutory application fee |
| `zlc` | ZLC Officer | Zimbabwe Land Commission | Dispute verification, conflict clearance, boundary integrity hearing sign-off |
| `gis` | GIS Officer | National GIS & Remote Sensing Unit | Spatial polygon boundary validation, ST_Intersects overlap check, AI conflict risk review |
| `surveyor` | Surveyor General | Department of the Surveyor General | Cadastral survey approval, beacon verification, survey tariff calculation |
| `valuation` | Valuations Officer | Ministry Valuation Directorate | Statutory valuation calculation (base rate/ha by region & land class + improvements) |
| `director` | Director of Lands | Executive Directorate | High-level ministerial review, legal compliance check, executive grant endorsement |
| `deeds` | Deeds Registry Officer | Department of Deeds & Intellectual Property | Final deed registration, volume/folio assignment, seal execution, collection issuance |
| `admin` | System Administrator | IT Systems Directorate | User provisioning, tariff table configuration, SLA configuration, audit ledger verification |

---

### 2. Stage-to-Role Sequential Queue & Transition Matrix

| Stage # | Stage Key (`status`) | Queue Visible To | Authorized Action | Next Forward Stage | Allowed Return Stage |
|---|---|---|---|---|---|
| **1** | `PENDING` | `applicant`, `resettlement` | Verify Allocation & Estate | `RESETTLEMENT_VERIFIED` | N/A (Initial stage) |
| **2** | `RESETTLEMENT_VERIFIED` | `lims` | Cadastral ID & Fee Check | `LIMS_VERIFIED` | `PENDING` (Mandatory comment) |
| **3** | `LIMS_VERIFIED` | `zlc` | Dispute & Conflict Hearing | `ZLC_CLEARED` | `RESETTLEMENT_VERIFIED` (Mandatory comment) |
| **4** | `ZLC_CLEARED` | `gis` | Spatial Overlap & AI Risk Review | `GIS_VALIDATED` | `LIMS_VERIFIED` (Mandatory comment) |
| **5** | `GIS_VALIDATED` | `surveyor` | Survey Approval & Tariff | `SURVEYED` | `ZLC_CLEARED` (Mandatory comment) |
| **6** | `SURVEYED` | `valuation` | Land & Improvements Valuation | `VALUATED` | `GIS_VALIDATED` (Mandatory comment) |
| **7** | `VALUATED` | `director` | Ministerial Executive Sign-Off | `APPROVED` | `VALUATED` / `SURVEYED` (Mandatory comment) |
| **8** | `APPROVED` | `deeds` | Deed Engrossment & Sealing | `READY_FOR_COLLECTION` | `APPROVED` (Mandatory comment) |
| **9** | `READY_FOR_COLLECTION` | `deeds`, `applicant` | Citizen Handover / Collection | Closed (Terminal) | N/A |

---

### 3. Endpoint Access Rules

| API Endpoint Pattern | Method | Permitted Personas | HTTP Failure Code |
|---|---|---|---|
| `/api/v1/applications/` | `GET` (List) | Staff: filtered strictly to role stage; Applicant: own applications; Admin/Director: all | HTTP 403 if unauthenticated or invalid role |
| `/api/v1/applications/<id>/` | `GET` (Detail) | Assigned department officer, applicant owner, director, admin | HTTP 403 |
| `/api/v1/applications/<id>/transition/` | `POST` | ONLY officer assigned to current stage | HTTP 403 if role != stage allowed role |
| `/api/v1/applications/<id>/document/<field>/` | `GET` | Applicant owner, current stage officer, director, admin | HTTP 401 (no auth) / HTTP 403 (unauthorized) |
| `/api/v1/tariffs/` | `GET`/`POST`/`PATCH` | Admin only for modification; staff read-only | HTTP 403 for non-admin writes |
| `/api/v1/reports/summary/` | `GET` | `director`, `admin`, department heads | HTTP 403 for general staff/applicants |
| `/api/v1/track/` | `POST` | Public (Unauthenticated) — Requires National ID + Ref + 6-digit PIN | HTTP 401 (Generic error) / HTTP 429 (Lockout) |
