# Title Deeds Mobile Application (Official Release)
**Ministry of Lands, Agriculture, Fisheries, Water & Rural Development**

This directory contains the official, up-to-date mobile application for the **Title Deeds One Stop Center** system.

---

## Architecture & Technology Stack
- **Native Container:** Capacitor 6 (Android native runtime)
- **Web Runtime:** React 18 / Vite Single-Page Application (bundled in `www/` and `android/app/src/main/assets/public/`)
- **Backend API:** Django 5.1 + Django REST Framework (at `/api/v1/`)
- **Release Signing:** RSA-2048 (`titledeeds.keystore`), verified with Android Signature Schemes v2 & v3
- **Network Security:** Strict HTTPS enforced (`network_security_config.xml`), cleartext traffic disabled for release

---

## Directory Structure
```text
mobile_application/
├── android/              # Native Android Gradle project (Capacitor 6 container)
│   ├── app/              # Android app module (source, assets, and AndroidManifest.xml)
│   ├── gradle/           # Gradle wrapper binaries
│   ├── gradlew.bat       # Gradle build executable
│   └── titledeeds.keystore # Production release signing key
├── www/                  # Compiled production web assets (from React/Vite)
├── TitleDeeds.apk        # Signed, page-aligned, installable Android release APK
├── build_apk.ps1         # Automated release build, zipalign & apksigner script
└── _legacy_prototype_archive/ # Archived legacy prototypes (PHP/static mockups)
```

---

## Building the Release APK
Run the automated build script in PowerShell:
```powershell
.\build_apk.ps1
```
This script will:
1. Compile the native Android binary with `gradlew assembleRelease`
2. 4-byte page-align the APK using `zipalign.exe -p 4`
3. Sign the APK using `apksigner.bat` and `titledeeds.keystore`
4. Verify signature validity under APK Signature Schemes v2 & v3
5. Output the installable APK to `TitleDeeds.apk`
