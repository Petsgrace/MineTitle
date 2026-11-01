# Unified Mobile Title Deeds (`TitleDeeds.apk`) — User Manual

**Application Name:** Unified Mobile Title Deeds  
**Package ID:** `zw.gov.lands.titledeeds`  
**Supported Devices:** Android Phones & Tablets (Android 6.0+ / API 23+, Portrait, Landscape & Split-Screen)  
**Installer File:** `TitleDeeds.apk`

---

## 1. Installation & First Launch

### Installing on an Android Phone or Tablet (e.g., Lenovo Tab M10 HD)
1. **Locate the Installer:**
   - Open the **Files** (or **My Files**) app on your Android phone or tablet.
   - Navigate to **Internal shared storage** or the **Downloads** folder and locate **`TitleDeeds.apk`**.
2. **Allow APK Installation (First Time Only):**
   - Tap **`TitleDeeds.apk`**. If prompted with *"For your security, your phone/tablet is not allowed to install unknown apps from this source"*, tap **Settings** and toggle **Allow from this source** ON, then press Back.
3. **Install / Update:**
   - Tap **Install** (or **Update** if a previous version is installed).
   - Once complete, tap **Open** or launch **Unified Mobile Title Deeds** from your home screen / app drawer.

> **Tablet & Landscape Support:** On tablets such as the **Lenovo Tab M10 HD**, you can rotate the device freely between portrait and landscape or run the app side-by-side in Android split-screen mode.

---

## 2. Navigation Overview

- **On Phones (Portrait):** Use the **Bottom Navigation Bar** with 5 quick-access tabs:
  - **Home:** System overview, statistics, and quick links.
  - **Apply:** Start or edit a 4-step Title Deed application.
  - **Track:** Look up live application status by Reference Number or National ID.
  - **GIS:** Interactive Cadastral & Farm Boundary Map viewer.
  - **Officer Portal:** Departmental login and workflow queue for Ministry officers and administrators.
- **On Tablets & Wide Screens:** The navigation links appear in the **Top Header Bar** alongside your active user profile badge and **Logout** button.

---

## 3. Signing In & Switching Roles

The app starts ready for **Land Beneficiaries / Farmers** out of the box, or you can sign in to a specific account:

### A. Beneficiary / Farmer Sign-In
1. Tap **Sign In** in the top header.
2. Select the **Farmer** tab at the top of the sign-in card.
3. Enter your **Email / Username** and **Password**, then tap **Sign In**.
   - *New applicants* can tap **Get Started** to register an account.

### B. Ministry Officer & Administrator Sign-In
You can sign in as an Officer in two ways:
1. **Via the Main Login Screen:**
   - Switch the role toggle at the top of the card to **Officer**.
   - Select your department tile (**LIMS**, **Accounts**, **Estates**, or **ZLC**).
   - Enter your credentials and tap **Sign In**.
2. **Via the Officer Portal Tab:**
   - Tap **Officer Portal** in the navigation bar.
   - Enter your authorized government username/email and password.
   - If Multi-Factor Authentication (MFA) is prompted, enter the 6-digit OTP code displayed or sent to your email.

---

## 4. Beneficiary (Farmer) Guide

### Step 1: Submitting a Title Deed Application (`Apply`)
Tap **Apply** in the navigation bar (or **+ New Application** on your dashboard) to open the 4-Step Application Wizard:

| Step | Section | Key Fields Required |
| :--- | :--- | :--- |
| **Step 1** | **Personal & Tenure Details** | Tenure Type (`Offer Letter`, `A2 Permit`, `99-Year Lease`), First Name, Surname, National ID (`XX-XXXXXXX-X-XX`), Gender, Address, Phone, Email |
| **Step 2** | **Land & Property Details** | District (searchable across all 8 provinces), Farm Name, Subdivision, Property Reference, Holding Number, Extent (Hectares), Payment Preferences |
| **Step 3** | **Required Documents** | Upload supporting documents (Offer Letter / Lease, National ID, Survey Diagram, Proof of Residence) in PDF, JPG, or PNG format (up to 10 MB each) |
| **Step 4** | **Declaration & Submit** | Review summary, check the statutory declaration box, and tap **Submit Application** |

- **Save Draft:** Tap **Save Draft** at any step to save your progress locally on the device.
- **Offline Submission:** If you submit while offline, the app automatically saves your submitted application on the device and assigns a `REF-...` reference number so it immediately appears on your dashboard.

### Step 2: Managing Applications on the Beneficiary Dashboard
On the **Beneficiary Dashboard**:
- **Summary Cards:** View counts for **Total Submitted**, **Approved / Issued**, **Pending Action**, and **Under Review**.
- **Search & Filter Bar:**
  - Type in the search box to filter live by **Farm Name**, **Reference Number**, **District**, **Applicant Name**, or **Status**.
  - Use the **Status Dropdown** (`All Status`, `Pending Review`, `Under Review`, `Approved`, `Rejected`) to narrow down your list, and tap **Reset** to clear filters.
- **Application Actions:**
  - Tap **View** (eye icon) to open the full application modal, inspect the **9-Stage Progress Tracker**, and download your **Title Deed Certificate (PDF)** or **Acknowledgment Receipt (PDF)**.
  - Tap **Edit** (pencil icon) on pending applications to update details and resubmit.

### Step 3: Tracking Application Progress (`Track`)
1. Tap **Track** in the navigation bar.
2. Enter your **1. National ID**, **2. Reference No.** (e.g., `TD-2026-00005`), and **3. Receipt Number** (e.g., `REC-2026-00001`).
3. View real-time stage completion across the 9 official processing stages.

### Step 4: Viewing Farm Boundaries on the GIS Map (`GIS`)
1. Tap **GIS** in the navigation bar.
2. Search or tap parcels on the interactive map to inspect cadastral boundaries, farm extent (hectares), coordinates, and verification status.

---

## 5. Officer Portal Guide

Ministry Officers use the **Officer Dashboard** to process applications through the **9-Stage One-Stop Centre Pipeline**:

### The 9-Stage Workflow Pipeline

| Stage # | Status Code | Responsible Role / Channel | Action Performed |
| :---: | :--- | :--- | :--- |
| **1** | `SUBMITTED` | **Resettlement (`resettlement`)** | Verify Offer Letter / Tenure & forward to LIMS (`PENDING_LIMS`) |
| **2** | `PENDING_LIMS` | **LIMS (`lims`)** | Audit Gazette & Cadastral status; verify & forward to Survey (`PENDING_SURVEY`) |
| **3** | `PENDING_SURVEY` | **GIS / Survey (`gis`)** | Confirm Diagram / Beacon Coordinates & forward to Estates (`PENDING_ESTATES`) |
| **4** | `PENDING_ESTATES` | **Estates (`estates`)** | Compute Land Valuation (USD) & generate Offer Price (`PENDING_FINANCE`) |
| **5** | `PENDING_FINANCE` | **Accounts (`accounts`)** | Issue Invoice (`AWAITING_PAYMENT`) & confirm Payment Receipt (`PENDING_ZLC`) |
| **6** | `AWAITING_PAYMENT` | **Beneficiary / Accounts** | Beneficiary pays fee; Accounts confirms receipt & forwards to ZLC |
| **7** | `PENDING_ZLC` | **ZLC (`zlc`)** | Record Board Resolution & forward to Deeds Registry (`PENDING_DEEDS`) |
| **8** | `PENDING_DEEDS` | **Deeds (`deeds`)** | Execute Conveyancing & register final Title Deed (`DEED_ISSUED`) |
| **9** | `DEED_ISSUED` | **Completed** | Final Title Deed issued and downloadable by Beneficiary |

### How Officers Process an Application
1. **Filter Your Queue:** Upon login, the dashboard automatically filters to your department's queue, or you can use the **Search Box** and **Status Dropdown** at any time to inspect other stages.
2. **Inspect & Verify:** Tap **Review / Action** on any application row to open the detailed departmental review modal.
3. **Execute Departmental Action:** Fill in your department's required verification fields and tap **Verify / Approve & Forward** to advance the application to the next stage, or tap **Reject** (with mandatory comment) if discrepancies are found.

---

## 6. Administrator Portal Guide

System Administrators (`admin` role) have access to the **Portals Switcher** in the top header (`Admin Portal`, `Officer Portal`, `Farmer Portal`) and can:
1. **Provision Staff & Channels:** Register new Ministry Officers, assign them to specific operational channels (**LIMS**, **Accounts**, **Estates**, **ZLC**, **GIS**, **Deeds**), and configure privileges.
2. **Override Workflow Stages:** Advance, audit, or reject applications at any stage of the 9-stage pipeline.
3. **View Reports & Audit Logs:** Inspect provincial/district processing metrics, revenue summaries, and security audit trails.

---

## 7. Troubleshooting & Tips

| Issue | Solution |
| :--- | :--- |
| **Applications not showing in list** | Check the **Status Dropdown** next to the search bar and tap **Reset** (or select `All Status` / `All Stages`) to display all records. |
| **Using the app without internet** | An amber **Offline Mode** banner appears at the top of the screen when disconnected. You can still fill out forms, save drafts, submit applications, and test officer stage transitions—changes are stored locally on the device. |
| **Updating the APK on your device** | Copy the latest `TitleDeeds.apk` to `Internal shared storage` or `Download` and install it over the existing app; your saved local applications remain intact. |

