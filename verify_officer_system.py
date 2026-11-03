import os
import sys
import django

# Setup Django environment
sys.path.insert(0, os.path.abspath(r'onlineportal\onlineapplication'))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'onlineapplication.settings')
django.setup()

from decimal import Decimal
from django.contrib.auth.models import User
from django.test import Client
import json
from onlineapplicationapi.models import StaffProfile, TitleDeedApplication, ApplicationAction
from onlineapplicationapi.pricing import get_civil_servant_discount
from onlineapplicationapi.authentication import generate_signed_token

client = Client()

passed = 0
failed = 0

def test(name, condition, details=""):
    global passed, failed
    if condition:
        print(f"  [PASS] {name}")
        passed += 1
    else:
        print(f"  [FAIL] {name}: {details}")
        failed += 1

print("=" * 70)
print("COMPREHENSIVE OFFICER DASHBOARDS & AUTHENTICATION AUDIT SUITE")
print("=" * 70)

# -------------------------------------------------------------
# 1. OFFICER ACCOUNTS SEED AUDIT
# -------------------------------------------------------------
print("\n1. Testing Officer Accounts Seed...")
target_accounts = [
    ('admin', 'admin@lands.gov.zw', 'admin'),
    ('accounts', 'accounts@lands.gov.zw', 'accounts'),
    ('estate', 'estate@lands.gov.zw', 'estates'),
    ('lims', 'lims@lands.gov.zw', 'lims'),
    ('zlc', 'zlc@lands.gov.zw', 'zlc'),
    ('sg', 'sg@lands.gov.zw', 'surveyor_general'),
    ('valuation', 'valuation@lands.gov.zw', 'valuation'),
]

for username, email, expected_role in target_accounts:
    user = User.objects.filter(username=username).first()
    test(f"User @{username} exists", user is not None)
    if user:
        test(f"User @{username} has correct email", user.email.lower() == email.lower())
        test(f"User @{username} can authenticate with 'Ministry'", user.check_password('Ministry'))
        profile = getattr(user, 'staff_profile', None)
        test(f"User @{username} has StaffProfile with must_change_password=True", profile and profile.must_change_password is True)
        test(f"User @{username} has role '{expected_role}'", profile and profile.role == expected_role)

# -------------------------------------------------------------
# 2. SERVER-SIDE AUTHENTICATION SECURITY
# -------------------------------------------------------------
print("\n2. Testing Authentication Security & Lockout...")

# Test 2.1: Wrong password returns 401 with generic message
resp = client.post('/api/login/', data=json.dumps({
    'username': 'admin',
    'password': 'WrongPassword123'
}), content_type='application/json')
test("Wrong password returns HTTP 401", resp.status_code == 401)
test("Error message is generic ('Invalid username or password.')", 
     resp.json().get('error') == 'Invalid username or password.')

# Test 2.2: Case-insensitive username login triggers MFA dispatch
resp = client.post('/api/login/', data=json.dumps({
    'username': 'ADMIN',
    'password': 'Ministry'
}), content_type='application/json')
test("Case-insensitive username triggers MFA dispatch", resp.status_code == 200 and resp.json().get('mfa_required') is True)

# Test 2.3: MFA verification with dev code '123456' returns signed token
resp = client.post('/api/login/', data=json.dumps({
    'username': 'admin@lands.gov.zw',
    'password': 'Ministry',
    'mfa_code': '123456'
}), content_type='application/json')
test("MFA step completion succeeds", resp.status_code == 200)
token = resp.json().get('token')
test("Login returns signed session token", bool(token))
test("must_change_password flag returned as True", resp.json().get('must_change_password') is True)

# Test 2.4: Deactivated account returns HTTP 403
test_deact, _ = User.objects.get_or_create(username='deact_test', defaults={'email': 'deact@lands.gov.zw', 'is_staff': True})
test_deact.set_password('Ministry')
test_deact.is_active = False
test_deact.save()
StaffProfile.objects.get_or_create(user=test_deact, defaults={'role': 'accounts', 'must_change_password': True})

resp = client.post('/api/login/', data=json.dumps({
    'username': 'deact_test',
    'password': 'Ministry'
}), content_type='application/json')
test("Deactivated account rejected with HTTP 403", resp.status_code == 403)
test("Deactivated message matches policy", "deactivated" in resp.json().get('error', '').lower())
ApplicationAction.objects.filter(officer=test_deact).delete()
test_deact.delete()

# Test 2.5: Rate limiting lockout (5 failed attempts)
test_lock, _ = User.objects.get_or_create(username='lock_test', defaults={'email': 'lock@lands.gov.zw', 'is_staff': True})
test_lock.set_password('Ministry')
test_lock.is_active = True
test_lock.save()
StaffProfile.objects.get_or_create(user=test_lock, defaults={'role': 'accounts', 'failed_login_attempts': 0})

for i in range(5):
    client.post('/api/login/', data=json.dumps({'username': 'lock_test', 'password': 'BadPassword'}), content_type='application/json')

resp = client.post('/api/login/', data=json.dumps({'username': 'lock_test', 'password': 'Ministry'}), content_type='application/json')
test("Account locked after 5 failed attempts (HTTP 429)", resp.status_code == 429)
err_msg = (resp.json().get('error') or resp.json().get('detail') or '').lower()
test("Lockout message details temporary lock", "locked" in err_msg or "throttled" in err_msg or "too many" in err_msg or "expected" in err_msg)
ApplicationAction.objects.filter(officer=test_lock).delete()
test_lock.delete()

# -------------------------------------------------------------
# 3. MANDATORY PASSWORD CHANGE POLICY
# -------------------------------------------------------------
print("\n3. Testing Mandatory Password Change Policy...")
user_val = User.objects.get(username='valuation')
user_val.set_password('Ministry')
user_val.save()
val_profile = user_val.staff_profile
val_profile.must_change_password = True
val_profile.save()

val_token = generate_signed_token(user_val)

# Cannot set new password as "Ministry"
resp = client.post('/api/change-password/', data=json.dumps({
    'old_password': 'Ministry',
    'new_password': 'Ministry',
    'confirm_password': 'Ministry'
}), content_type='application/json', HTTP_AUTHORIZATION=f'Bearer {val_token}')
test("Reject setting new password to 'Ministry'", resp.status_code == 400)

# Cannot set new password under 8 characters
resp = client.post('/api/change-password/', data=json.dumps({
    'old_password': 'Ministry',
    'new_password': 'Short1',
    'confirm_password': 'Short1'
}), content_type='application/json', HTTP_AUTHORIZATION=f'Bearer {val_token}')
test("Reject password shorter than 8 characters", resp.status_code == 400)

# Cannot set password with no numbers
resp = client.post('/api/change-password/', data=json.dumps({
    'old_password': 'Ministry',
    'new_password': 'LettersOnlyHere',
    'confirm_password': 'LettersOnlyHere'
}), content_type='application/json', HTTP_AUTHORIZATION=f'Bearer {val_token}')
test("Reject password without numbers", resp.status_code == 400)

# Valid new password
resp = client.post('/api/change-password/', data=json.dumps({
    'old_password': 'Ministry',
    'new_password': 'SecureVal2026!',
    'confirm_password': 'SecureVal2026!'
}), content_type='application/json', HTTP_AUTHORIZATION=f'Bearer {val_token}')
test("Accept compliant new password", resp.status_code == 200)

val_profile.refresh_from_db()
test("must_change_password cleared to False", val_profile.must_change_password is False)
user_val.refresh_from_db()
test("New password successfully authenticated", user_val.check_password('SecureVal2026!'))

# Reset password back to Ministry for ongoing dev
user_val.set_password('Ministry')
user_val.save()
val_profile.must_change_password = True
val_profile.save()

# -------------------------------------------------------------
# 4. STRICT ROLE-BASED ACCESS CONTROL (RBAC) ON API ENDPOINTS
# -------------------------------------------------------------
print("\n4. Testing Role-Based API Endpoint Isolation...")
app_test = TitleDeedApplication.objects.first()
orig_status = app_test.status
orig_disputes = app_test.has_disputes
orig_queried = getattr(app_test, 'is_queried', False)

accounts_user = User.objects.get(username='accounts')
accounts_token = generate_signed_token(accounts_user)

estates_user = User.objects.get(username='estate')
estates_token = generate_signed_token(estates_user)

zlc_user = User.objects.get(username='zlc')
zlc_token = generate_signed_token(zlc_user)

sg_user = User.objects.get(username='sg')
sg_token = generate_signed_token(sg_user)

val_user = User.objects.get(username='valuation')
val_token = generate_signed_token(val_user)

admin_user = User.objects.get(username='admin')
admin_token = generate_signed_token(admin_user)

# 4.1 Accounts officer CANNOT verify estates
resp = client.post(f'/api/applications/{app_test.id}/verify_estates/', data=json.dumps({'action_type': 'CLEAR'}),
                   content_type='application/json', HTTP_AUTHORIZATION=f'Bearer {accounts_token}')
test("Accounts officer calling verify_estates blocked (403)", resp.status_code == 403)

# 4.2 Accounts officer CANNOT verify lims
resp = client.post(f'/api/applications/{app_test.id}/verify_lims/', data=json.dumps({'status_action': 'VERIFIED'}),
                   content_type='application/json', HTTP_AUTHORIZATION=f'Bearer {accounts_token}')
test("Accounts officer calling verify_lims blocked (403)", resp.status_code == 403)

# 4.3 Accounts officer CANNOT verify zlc
resp = client.post(f'/api/applications/{app_test.id}/verify_zlc/', data=json.dumps({'action_type': 'CLEARED'}),
                   content_type='application/json', HTTP_AUTHORIZATION=f'Bearer {accounts_token}')
test("Accounts officer calling verify_zlc blocked (403)", resp.status_code == 403)

# 4.4 Estates officer CANNOT verify accounts
resp = client.post(f'/api/applications/{app_test.id}/verify_accounts/', data=json.dumps({'is_paid': True}),
                   content_type='application/json', HTTP_AUTHORIZATION=f'Bearer {estates_token}')
test("Estates officer calling verify_accounts blocked (403)", resp.status_code == 403)

# 4.5 ZLC officer CANNOT set valuation
resp = client.post(f'/api/applications/{app_test.id}/set_valuation/', data=json.dumps({'manual_price': 1000}),
                   content_type='application/json', HTTP_AUTHORIZATION=f'Bearer {zlc_token}')
test("ZLC officer calling set_valuation blocked (403)", resp.status_code == 403)

# 4.6 Surveyor General CANNOT give final approval
resp = client.post(f'/api/applications/{app_test.id}/final_approve/', data=json.dumps({'officer_comments': 'Approved'}),
                   content_type='application/json', HTTP_AUTHORIZATION=f'Bearer {sg_token}')
test("Surveyor General calling final_approve blocked (403)", resp.status_code == 403)

# 4.7 Authorized role: Accounts Officer CAN verify accounts when application is in SUBMITTED queue
app_test.status = 'SUBMITTED'
app_test.save()

resp = client.post(f'/api/applications/{app_test.id}/verify_accounts/', data=json.dumps({'is_paid': True}),
                   content_type='application/json', HTTP_AUTHORIZATION=f'Bearer {accounts_token}')
test("Accounts Officer CAN verify accounts fee (200)", resp.status_code == 200)

# 4.8 Authorized role: Estates Officer CAN verify estates when application is in ESTATES queue (ACCOUNTS_CLEARED)
app_test.refresh_from_db()
test("Application advanced to ACCOUNTS_CLEARED", app_test.status == 'ACCOUNTS_CLEARED')

resp = client.post(f'/api/applications/{app_test.id}/verify_estates/', data=json.dumps({'action_type': 'CLEAR'}),
                   content_type='application/json', HTTP_AUTHORIZATION=f'Bearer {estates_token}')
test("Estates Officer CAN verify estates (200)", resp.status_code == 200)

# -------------------------------------------------------------
# 5. DISPUTE & QUERY LOCK ON FINAL DEED ISSUANCE
# -------------------------------------------------------------
print("\n5. Testing Dispute & Query Lock on Deed Issuance...")

# Flag dispute
app_test.has_disputes = True
app_test.is_queried = False
app_test.save()

resp = client.post(f'/api/applications/{app_test.id}/final_approve/', data=json.dumps({'officer_comments': 'Deed approve'}),
                   content_type='application/json', HTTP_AUTHORIZATION=f'Bearer {admin_token}')
test("Final deed approval strictly locked when has_disputes=True (403)", resp.status_code == 403)

app_test.has_disputes = False
app_test.is_queried = True
app_test.save()

resp = client.post(f'/api/applications/{app_test.id}/final_approve/', data=json.dumps({'officer_comments': 'Deed approve'}),
                   content_type='application/json', HTTP_AUTHORIZATION=f'Bearer {admin_token}')
test("Final deed approval strictly locked when is_queried=True (403)", resp.status_code == 403)

app_test.has_disputes = False
app_test.is_queried = False
app_test.save()

resp = client.post(f'/api/applications/{app_test.id}/final_approve/', data=json.dumps({'officer_comments': 'Clean approval'}),
                   content_type='application/json', HTTP_AUTHORIZATION=f'Bearer {admin_token}')
test("Final deed approval permitted when dispute and query cleared (200)", resp.status_code == 200)

# Restore original application status
app_test.status = orig_status
app_test.has_disputes = orig_disputes
app_test.is_queried = orig_queried
app_test.save()

# -------------------------------------------------------------
# 6. VALUATION & PRICING FORMULA VERIFICATION
# -------------------------------------------------------------
print("\n6. Testing Valuation Formula & Linear Civil Service Interpolation...")

# Test 6.1: Linear Civil Service Discount
disc_10 = get_civil_servant_discount(10)
test("Civil servant 10 yrs: 2.5%", disc_10 == Decimal('2.5'))

disc_15 = get_civil_servant_discount(15)
test("Civil servant 15 yrs linear interpolation: 3.89%", disc_15 == Decimal('3.89'))

disc_20 = get_civil_servant_discount(20)
test("Civil servant 20 yrs: 5.0%", disc_20 == Decimal('5.0'))

disc_30 = get_civil_servant_discount(30)
test("Civil servant 30 yrs linear interpolation: 10.26%", disc_30 == Decimal('10.26'))

disc_40 = get_civil_servant_discount(40)
test("Civil servant 40 yrs: 30%", disc_40 == Decimal('30'))

# -------------------------------------------------------------
# SUMMARY REPORT
# -------------------------------------------------------------
print("\n" + "=" * 70)
print(f"AUDIT SUMMARY: {passed} PASSED, {failed} FAILED")
print("=" * 70)

if failed > 0:
    sys.exit(1)
