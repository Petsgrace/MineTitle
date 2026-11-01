# Title Deeds One Stop Center — Project Documentation

**Project Title:** Title Deeds One Stop Center  
**Subtitle:** Unified Mobile App Title Deeds Processing & Land Management System  
**Prepared For:** Ministry of Lands, Agriculture, Fisheries, Water and Rural Development (Zimbabwe)  
**Author:** Nyahuhu Peter  
**Institution:** Harare Polytechnic — Department of Information Technology  
**Qualification:** National Diploma in Information Technology  
**Version:** Version 2.1 (Production Baseline)  
**Publication Date:** October 2026  

---

## 1. Documentation Artifacts Summary

This directory contains the complete, authoritative technical documentation for the **Title Deeds One Stop Center** project (`onestopproject`), compiled directly from the live codebase, database schemas, test execution results, and compiled build outputs.

| File Name | File Type | Size | Description |
| :--- | :--- | :--- | :--- |
| **`Title_Deeds_One_Stop_Center_Project_Documentation.docx`** | Microsoft Word Document | 8.18 MB | Master technical documentation (89 pages) featuring professional cover page, document control, glossary, 21 numbered chapters, 7 appendices, embedded diagrams, and screenshots. |
| **`Title_Deeds_One_Stop_Center_Project_Documentation.pdf`** | Adobe PDF Document | 2.69 MB | High-fidelity print export of the Word document, generated directly via Microsoft Word COM automation (`docx2pdf`). |
| **`README.md`** | Markdown Document | ~8 KB | This file: documentation catalog, generation methodology, and reproduction guide. |
| **`inventory.md`** | Markdown Document | 23.3 KB | Exhaustive codebase file-by-file inventory generated via automated AST and filesystem analysis. |
| **`models_data.json`** | JSON Dataset | 85.3 KB | Structured schema export of all 11 Django models, 257 fields, data types, constraints, and relationships. |
| **`routes_data.json`** | JSON Dataset | 55.1 KB | Complete API route inventory detailing all 305 registered Django URL patterns, views, and callbacks. |
| **`diagrams/`** | Directory (16 PNG Files) | ~1.1 MB | Standalone high-resolution PNG system diagrams (Architectures, Sequences, ERD, DFDs, Flows). |
| **`screenshots/`** | Directory (18 PNG Files) | ~14.2 MB | Real, unedited screenshots of all core user interface screens captured from the running application. |

---

## 2. Directory Contents & Structure

```
onestopproject/documentation/
├── README.md                                              # This documentation guide
├── Title_Deeds_One_Stop_Center_Project_Documentation.docx # Master 89-page Word document
├── Title_Deeds_One_Stop_Center_Project_Documentation.pdf  # Master 89-page PDF export
├── inventory.md                                           # Codebase inventory manifest
├── models_data.json                                       # Extracted 11 Django models (257 fields)
├── routes_data.json                                       # Extracted API route inventory (305 endpoints)
├── diagrams/                                              # 16 Standalone PNG vector diagrams
│   ├── 01_three_tier_architecture.png                     # System layer interactions
│   ├── 02_deployment_diagram.png                          # Production deployment topology
│   ├── 03_hybrid_android_architecture.png                 # Capacitor native bridge
│   ├── 04_use_case_roles.png                              # Role-based use case model
│   ├── 05_full_application_journey.png                    # End-to-end 13-step journey flowchart
│   ├── 06_seq_payment_receipt.png                         # Payment & receipt sequence
│   ├── 07_seq_application_submission.png                  # Application submission sequence
│   ├── 08_seq_officer_stage_transition.png                # Departmental review sequence
│   ├── 09_seq_ai_risk_scoring.png                         # ML dispute risk scoring sequence
│   ├── 10_seq_citizen_tracking.png                        # Public tracking sequence
│   ├── 11_seq_staff_login_otp.png                         # Staff MFA OTP login sequence
│   ├── 12_database_erd.png                                # Relational database ERD
│   ├── 13_dfd_level_0.png                                 # Data Flow Diagram Level 0
│   ├── 14_dfd_level_1.png                                 # Data Flow Diagram Level 1
│   ├── 15_valuation_pricing_flow.png                      # Compounded land valuation flow
│   └── 16_audit_ledger_chain.png                          # SHA-256 block hash chain
└── screenshots/                                           # 18 Real application screenshots
    ├── 01_home_landing.png                                # Home landing page
    ├── 02_track_application.png                           # Citizen tracking portal
    ├── 03_farmer_login.png                                # Farmer login portal
    ├── 04_farmer_signup.png                               # Farmer registration screen
    ├── 05_officer_login_mfa.png                           # Staff MFA OTP screen
    ├── 06_apply_intake_part1.png                          # Form Step 2: Land details
    ├── 07_forgot_password.png                             # Password recovery screen
    ├── 08_officer_dashboard_resettlement.png              # Resettlement review queue
    ├── 09_officer_dashboard_gis.png                       # GIS spatial queue
    ├── 10_gis_map_view.png                                # GIS map & boundary inspector
    ├── 11_officer_dashboard_director.png                  # Director executive review
    ├── 12_admin_dashboard.png                             # Zero-privilege admin portal
    ├── 13_departmental_reports.png                        # Throughput analytics
    ├── 14_audit_ledger_logs.png                           # SHA-256 audit ledger inspector
    ├── 15_farmer_dashboard.png                            # Farmer application dashboard
    ├── 16_form_step0_payment_gate.png                     # Form Step 0: $10 payment gate
    ├── 17_form_receipt_screen.png                         # Digital receipt confirmation
    └── 18_form_part1_beneficiary.png                      # Form Step 1: Beneficiary & spouse
```

---

## 3. How the Documentation Was Produced

All documentation was assembled through rigorous, automated extraction pipelines without relying on assumptions, memory, or external placeholders:

1. **Codebase Inventory Extraction (`build_inventory.py`):**
   - Traversed the entire `onestopproject` tree, recursively cataloging Python, JavaScript, JSX, JSON, and build configuration files. Recorded exact file paths, byte sizes, and line counts in `inventory.md`.

2. **Database & API Metadata Extraction (`extract_metadata.py`):**
   - Bootstrapped Django settings and inspected `django.apps.apps.get_models()`. Extracted 11 models, 257 field definitions, data types, nullability, choices, and relations into `models_data.json`.
   - Traversed Django URL patterns recursively via `get_resolver().url_patterns`, capturing 305 routes, names, and callbacks into `routes_data.json`.

3. **High-Resolution Diagram Rendering (`generate_diagrams.py`):**
   - Drafted pure SVG vector diagrams specifying exact system topologies, sequences, ERD schemas, and data flow layers.
   - Rendered each SVG to a crisp PNG file (1200x750 or 1200x800 resolution) using Chrome Headless (`--headless=new --screenshot`), saved in `diagrams/`.

4. **Live Screenshot Capture (`capture_all_screens.js` & `capture_form_steps.js`):**
   - Launched the live backend (`manage.py runserver 127.0.0.1:8000`) and frontend Vite dev server (`http://localhost:5173`).
   - Automated Headless Chrome to capture real screenshots across all 18 views. Simulated payment, form step progression, officer logins, and administrative dashboards using sample/synthetic data only.

5. **Master Document Assembly (`build_master_doc.py`):**
   - Assembled `Title_Deeds_One_Stop_Center_Project_Documentation.docx` using `python-docx`.
   - Structured the document into Cover Page, Document Control, Glossary, 21 Numbered Chapters, and Appendices A through G.
   - Formatted tables with deep navy headers (`#1E3A8A`), zebra striping (`#F8FAFC`), and subtle borders. Added figure captions, callout alerts, code blocks, and source citations.
   - Exported the complete Word document directly to PDF (`Title_Deeds_One_Stop_Center_Project_Documentation.pdf`, 89 pages) using Microsoft Word COM automation (`docx2pdf`).

---

## 4. Empirical Test and Verification Evidence

All claims in the documentation are backed by verified empirical test runs against the physical codebase:

* **Master Statutory Aligned Suite (`test_aligned_suite.py`):**
  - Command: `python manage.py test onlineapplicationapi.test_aligned_suite`
  - Results: **15 of 15 tests PASSED (100% OK)** in 57.072s (TC-01 to TC-15).
* **Compounded Valuation Suite (`test_pricing_compounded.py`):**
  - Command: `python manage.py test onlineapplicationapi.tests.test_pricing_compounded`
  - Results: **5 of 5 tests PASSED (100% OK)** in 5.534s.
* **Frontend Vitest Suite:**
  - Command: `npx vitest run`
  - Results: **17 of 17 tests PASSED (100% OK)** in 24.80s (`ApplicationForm.test.jsx`, `OfficerDashboard.test.jsx`, `UserAuth.test.jsx`).
* **Frontend Production Build:**
  - Command: `npm run build`
  - Results: Successfully built in 25.79s (`dist/index.html` 2.95 kB, CSS 26.58 kB, JS 864.88 kB).
* **Android Release APK Verification:**
  - File: `TitleDeeds.apk` (9,672,731 bytes, ~9.67 MB).
  - Command: `apksigner verify --verbose TitleDeeds.apk`
  - Results: **Verified using v2 scheme: true, Verified using v3 scheme: true, 1 Signer**.
* **Cryptographic Audit Ledger Verification:**
  - Command: `python manage.py verify_audit_ledger`
  - Results: **0 Tamper Events Detected. Cryptographic hash chain is intact**.

---

## 5. Reproduction Instructions

To regenerate the documentation from scratch:

```powershell
# 1. Activate backend environment
cd onestopproject\onlineportal\onlineapplication
.\.venv\Scripts\activate

# 2. Re-extract metadata (if schemas or routes changed)
python documentation\extract_metadata.py

# 3. Re-generate master Word and PDF documentation
python C:\Users\peter\.gemini\antigravity-ide\brain\e9c442fe-0241-4b50-990b-56669a36eedc\scratch\build_master_doc.py
```
