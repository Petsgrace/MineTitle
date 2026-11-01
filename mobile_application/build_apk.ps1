# build_apk.ps1 - Production Android Release APK Builder for Title Deeds Mobile App
$ErrorActionPreference = "Stop"

$ProjectDir = $PSScriptRoot
$AndroidDir = "$ProjectDir\android"
$JavaHome = "C:\Users\peter\AppData\Local\jdk-21\jdk-21.0.12.1+1"
$AndroidSdk = "C:\Users\peter\AppData\Local\Android\Sdk"
$BuildTools = "$AndroidSdk\build-tools\34.0.0"
$KeystorePath = "$AndroidDir\titledeeds.keystore"
if (-not (Test-Path $KeystorePath)) { $KeystorePath = "$ProjectDir\titledeeds.keystore" }
$FinalApk = "$ProjectDir\TitleDeeds.apk"
$RootApk = (Split-Path $ProjectDir -Parent) + "\TitleDeeds.apk"

Write-Host "=== Title Deeds System: Building Release APK ===" -ForegroundColor Green

# 1. Ensure local.properties exists
$LocalProps = "$AndroidDir\local.properties"
Set-Content -Path $LocalProps -Value "sdk.dir=$AndroidSdk"

# 2. Build Release APK using Gradle
Write-Host "=== 1. Compiling with Gradle (assembleRelease) ===" -ForegroundColor Cyan
$env:JAVA_HOME = $JavaHome
Push-Location $AndroidDir
try {
    & .\gradlew.bat assembleRelease
    if ($LASTEXITCODE -ne 0) { throw "Gradle assembleRelease failed" }
} finally {
    Pop-Location
}

# 3. Locate generated APK
$ReleaseDir = "$AndroidDir\app\build\outputs\apk\release"
$CandidateApk = Get-ChildItem -Path $ReleaseDir -Filter "*.apk" | Where-Object { $_.Name -like "*unsigned*" -or $_.Name -like "*release*" } | Select-Object -First 1
if (-not $CandidateApk) { throw "No APK generated in $ReleaseDir" }

# 4. Zipalign
Write-Host "=== 2. Aligning APK with zipalign (4-byte boundary) ===" -ForegroundColor Cyan
$AlignedApk = "$ReleaseDir\app-release-aligned.apk"
if (Test-Path $AlignedApk) { Remove-Item -Force $AlignedApk }
& "$BuildTools\zipalign.exe" -v -p 4 $CandidateApk.FullName $AlignedApk
if ($LASTEXITCODE -ne 0) { throw "zipalign failed" }

# 5. Sign with apksigner
Write-Host "=== 3. Cryptographically Signing APK with apksigner ===" -ForegroundColor Cyan
$KsPass = $env:RELEASE_KEYSTORE_PASSWORD
if (-not $KsPass) { $KsPass = $env:KEYSTORE_PASSWORD }
if (-not $KsPass) { $KsPass = "titledeeds123" }

& "$BuildTools\apksigner.bat" sign `
    --ks $KeystorePath `
    --ks-pass "pass:$KsPass" `
    --key-pass "pass:$KsPass" `
    --out $FinalApk `
    $AlignedApk

if ($LASTEXITCODE -ne 0) { throw "apksigner failed" }

# Copy to project root
Copy-Item -Path $FinalApk -Destination $RootApk -Force

# 6. Verify signature
Write-Host "=== 4. Verifying APK Signature ===" -ForegroundColor Cyan
& "$BuildTools\apksigner.bat" verify --verbose $FinalApk

Write-Host "SUCCESS: Release APK built, aligned, and signed at:" -ForegroundColor Green
Write-Host "  -> $FinalApk" -ForegroundColor Green
Write-Host "  -> $RootApk" -ForegroundColor Green
