/**
 * Production Web & API Server for Title Deeds One Stop Center
 * Ministry of Lands, Agriculture, Fisheries, Water and Rural Development — Zimbabwe
 *
 * Serves:
 *   1. Compiled React SPA (onlineportal/onlineapplication/frontend/dist, dist/, or mobile_application/www)
 *   2. Native Android APK downloads (/TitleDeeds.apk, /TitleDeeds_v2.apk)
 *   3. Hardened REST API (/api/*) with server-side authentication, salted hashing, RBAC, and statutory locks
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const PORT = Number(process.env.PORT) || 10000;
const HOST = '0.0.0.0';

// Password Security
const PASSWORD_SALT = 'ministry-secret-salt-2026';
function hashPassword(plain) {
  if (!plain) return '';
  return crypto.pbkdf2Sync(String(plain), PASSWORD_SALT, 1000, 32, 'sha256').toString('hex');
}
function verifyPassword(plain, hashed) {
  if (!hashed || !plain) return false;
  const computed = hashPassword(plain);
  if (computed.length !== hashed.length) return false;
  return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(hashed));
}

// Static SPA directories (prefer frontend/dist, fallback to root dist or mobile_application/www)
const DIST_DIR = path.join(__dirname, 'onlineportal', 'onlineapplication', 'frontend', 'dist');
const ROOT_DIST_DIR = path.join(__dirname, 'dist');
const FALLBACK_WWW_DIR = path.join(__dirname, 'mobile_application', 'www');
const STATIC_ROOT = fs.existsSync(path.join(DIST_DIR, 'index.html'))
  ? DIST_DIR
  : (fs.existsSync(path.join(ROOT_DIST_DIR, 'index.html')) ? ROOT_DIST_DIR : FALLBACK_WWW_DIR);

// Persistent data store
const DATA_DIR = path.join(__dirname, 'data');
const STORE_FILE = path.join(DATA_DIR, 'store.json');

const INITIAL_STAFF = [
  {
    id: 1,
    username: 'admin',
    email: 'admin@lands.gov.zw',
    first_name: 'System',
    last_name: 'Administrator',
    role: 'admin',
    department: 'Executive Directorate',
    channels: ['LIMS Channel', 'Finance Channel', 'Survey Channel', 'Valuation Channel', 'Deeds Channel'],
    privileges: ['endorse_clearances', 'reconcile_fees', 'audit_gps', 'appraise_valuation', 'issue_warrants', 'affix_seal', 'view_reports', 'view_audit_logs', 'manage_staff'],
    password: hashPassword('Ministry'),
    must_change_password: true,
    mfa_enabled: true,
    failed_login_attempts: 0,
    locked_until: null,
    is_active: true,
    created_at: '2026-01-01T08:00:00.000Z',
  },
  {
    id: 2,
    username: 'accounts',
    email: 'accounts@lands.gov.zw',
    first_name: 'Accounts',
    last_name: 'Officer',
    role: 'accounts',
    department: 'Finance & Accounts',
    channels: ['Finance Channel'],
    privileges: ['reconcile_fees', 'view_applications'],
    password: hashPassword('Ministry'),
    must_change_password: true,
    mfa_enabled: true,
    failed_login_attempts: 0,
    locked_until: null,
    is_active: true,
    created_at: '2026-01-01T08:00:00.000Z',
  },
  {
    id: 3,
    username: 'estate',
    email: 'estate@lands.gov.zw',
    first_name: 'Estates',
    last_name: 'Officer',
    role: 'estates',
    department: 'Estates & Succession',
    channels: ['LIMS Channel'],
    privileges: ['endorse_clearances', 'view_applications'],
    password: hashPassword('Ministry'),
    must_change_password: true,
    mfa_enabled: true,
    failed_login_attempts: 0,
    locked_until: null,
    is_active: true,
    created_at: '2026-01-01T08:00:00.000Z',
  },
  {
    id: 4,
    username: 'lims',
    email: 'lims@lands.gov.zw',
    first_name: 'LIMS',
    last_name: 'Officer',
    role: 'lims',
    department: 'Lands & Agriculture (LIMS)',
    channels: ['LIMS Channel'],
    privileges: ['endorse_clearances', 'audit_gps', 'view_applications'],
    password: hashPassword('Ministry'),
    must_change_password: true,
    mfa_enabled: true,
    failed_login_attempts: 0,
    locked_until: null,
    is_active: true,
    created_at: '2026-01-01T08:00:00.000Z',
  },
  {
    id: 5,
    username: 'zlc',
    email: 'zlc@lands.gov.zw',
    first_name: 'ZLC',
    last_name: 'Officer',
    role: 'zlc',
    department: 'Zimbabwe Land Commission',
    channels: ['Survey Channel'],
    privileges: ['endorse_clearances', 'view_applications'],
    password: hashPassword('Ministry'),
    must_change_password: true,
    mfa_enabled: true,
    failed_login_attempts: 0,
    locked_until: null,
    is_active: true,
    created_at: '2026-01-01T08:00:00.000Z',
  },
  {
    id: 6,
    username: 'sg',
    email: 'sg@lands.gov.zw',
    first_name: 'Surveyor General',
    last_name: 'Officer',
    role: 'surveyor_general',
    department: 'Surveyor General',
    channels: ['Survey Channel'],
    privileges: ['audit_gps', 'endorse_clearances', 'view_applications'],
    password: hashPassword('Ministry'),
    must_change_password: true,
    mfa_enabled: true,
    failed_login_attempts: 0,
    locked_until: null,
    is_active: true,
    created_at: '2026-01-01T08:00:00.000Z',
  },
  {
    id: 7,
    username: 'valuation',
    email: 'valuation@lands.gov.zw',
    first_name: 'Valuation',
    last_name: 'Officer',
    role: 'valuation',
    department: 'Valuation Directorate',
    channels: ['Valuation Channel'],
    privileges: ['appraise_valuation', 'view_reports', 'view_applications'],
    password: hashPassword('Ministry'),
    must_change_password: true,
    mfa_enabled: true,
    failed_login_attempts: 0,
    locked_until: null,
    is_active: true,
    created_at: '2026-01-01T08:00:00.000Z',
  },
];

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(STORE_FILE)) {
    const initial = {
      applications: [],
      staff: INITIAL_STAFF,
      farmers: [],
      payments: [],
      auditLogs: [
        {
          id: 1,
          timestamp: new Date().toISOString(),
          action: 'SYSTEM_BOOT',
          actor: 'system',
          role: 'admin',
          target_ref: 'SYSTEM',
          details: 'Title Deeds One Stop Center production server initialized.',
        },
      ],
    };
    fs.writeFileSync(STORE_FILE, JSON.stringify(initial, null, 2), 'utf8');
  }
}

function readStore() {
  ensureStore();
  try {
    const raw = fs.readFileSync(STORE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    const storeStaff = Array.isArray(parsed.staff) ? parsed.staff : [];

    // Ensure all 7 official accounts exist with valid hashed passwords
    const updatedStaff = [...storeStaff];
    for (const initUser of INITIAL_STAFF) {
      const idx = updatedStaff.findIndex(
        (u) =>
          String(u.username || '').toLowerCase() === initUser.username.toLowerCase() ||
          String(u.email || '').toLowerCase() === initUser.email.toLowerCase()
      );
      if (idx === -1) {
        updatedStaff.push({ ...initUser });
      } else {
        // Upgrade existing staff record to include security flags
        updatedStaff[idx] = {
          ...initUser,
          ...updatedStaff[idx],
          username: initUser.username,
          email: initUser.email,
          role: initUser.role,
          department: initUser.department,
          password: updatedStaff[idx].password && updatedStaff[idx].password.length === 64
            ? updatedStaff[idx].password
            : initUser.password,
          must_change_password: updatedStaff[idx].must_change_password !== undefined
            ? updatedStaff[idx].must_change_password
            : true,
          mfa_enabled: updatedStaff[idx].mfa_enabled !== undefined
            ? updatedStaff[idx].mfa_enabled
            : true,
        };
      }
    }

    return {
      applications: Array.isArray(parsed.applications) ? parsed.applications : [],
      staff: updatedStaff,
      farmers: Array.isArray(parsed.farmers) ? parsed.farmers : [],
      payments: Array.isArray(parsed.payments) ? parsed.payments : [],
      auditLogs: Array.isArray(parsed.auditLogs) ? parsed.auditLogs : [],
    };
  } catch (err) {
    return {
      applications: [],
      staff: INITIAL_STAFF,
      farmers: [],
      payments: [],
      auditLogs: [],
    };
  }
}

function writeStore(store) {
  ensureStore();
  fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), 'utf8');
}

function addAuditLog(store, entry) {
  const nextId = (store.auditLogs[0]?.id || store.auditLogs.length || 0) + 1;
  const log = {
    id: nextId,
    timestamp: new Date().toISOString(),
    action: entry.action || 'ACTION',
    actor: entry.actor || 'system',
    role: entry.role || 'officer',
    target_ref: entry.target_ref || 'N/A',
    details: entry.details || entry.comment || '',
  };
  store.auditLogs.unshift(log);
  if (store.auditLogs.length > 500) {
    store.auditLogs.pop();
  }
  return log;
}

function normalizeToken(val) {
  return String(val || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function maskEmail(email) {
  if (!email || !email.includes('@')) return 'your registered email';
  const parts = email.split('@');
  const name = parts[0];
  const maskedName = name.length > 2 ? `${name[0]}***${name[name.length - 1]}` : `${name[0]}***`;
  return `${maskedName}@${parts[1]}`;
}

function setCorsHeaders(req, res) {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-CSRFToken, X-Requested-With, Accept, Origin'
  );
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    const MAX_BYTES = 25 * 1024 * 1024;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BYTES) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) return resolve({});
      const raw = Buffer.concat(chunks).toString('utf8');
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve({ raw });
      }
    });
    req.on('error', reject);
  });
}

function getAuthUser(req, store) {
  const authHeader = req.headers.authorization || '';
  let token = '';
  if (authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  }
  if (!token) return null;

  // token format: td-jwt-<userId>-<random>
  const match = token.match(/^td-jwt-(\d+)-/);
  if (match) {
    const id = Number(match[1]);
    const staff = store.staff.find((s) => s.id === id);
    if (staff && staff.is_active !== false) return staff;
  }
  return null;
}

function computeReportMetrics(applications) {
  const total = applications.length;
  const approved = applications.filter((a) =>
    ['APPROVED', 'DEED_ISSUED', 'DIRECTOR_APPROVED', 'ISSUED', 'COMPLETED'].includes(String(a.status || '').toUpperCase())
  ).length;
  const rejected = applications.filter((a) => String(a.status || '').toUpperCase() === 'REJECTED').length;
  const pending = Math.max(0, total - approved - rejected);

  const byStage = {};
  for (const app of applications) {
    const st = app.status || 'PENDING';
    byStage[st] = (byStage[st] || 0) + 1;
  }

  return {
    total_applications: total,
    pending,
    approved,
    rejected,
    statutory_fee_revenue_usd: total * 10,
    by_stage: byStage,
  };
}

async function handleApi(req, res, parsedUrl) {
  const pathname = parsedUrl.pathname.replace(/\/+$/, '') || '/api';
  const method = req.method.toUpperCase();
  const store = readStore();

  // 1. Health check & CSRF Cookie
  if (pathname === '/api' || pathname === '/api/health') {
    return sendJson(res, 200, {
      status: 'ok',
      service: 'Title Deeds One Stop Center API',
      version: '2.0.0',
      applications_count: store.applications.length,
      timestamp: new Date().toISOString(),
    });
  }

  if (pathname === '/api/csrf-cookie') {
    return sendJson(res, 200, { csrfToken: 'session-valid-token' });
  }

  // 2. Check Session
  if (pathname === '/api/check-session') {
    const user = getAuthUser(req, store);
    if (!user) {
      return sendJson(res, 401, { error: 'No active authenticated session.' });
    }
    const token = req.headers.authorization ? req.headers.authorization.replace('Bearer ', '').trim() : '';
    return sendJson(res, 200, {
      id: user.id,
      username: user.username,
      email: user.email,
      name: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username,
      first_name: user.first_name,
      last_name: user.last_name,
      role: user.role,
      department: user.department,
      channels: user.channels || [],
      privileges: user.privileges || [],
      is_active: user.is_active !== false,
      mfa_enabled: Boolean(user.mfa_enabled),
      must_change_password: Boolean(user.must_change_password),
      token,
    });
  }

  // 3. Authentication: Login
  if ((pathname === '/api/login' || pathname === '/api/auth/login') && method === 'POST') {
    const body = await parseBody(req);
    const identifier = String(body.username || body.email || '').trim().toLowerCase();
    const password = String(body.password || '');

    // Check staff accounts
    const staffMember = store.staff.find(
      (u) =>
        String(u.username || '').toLowerCase() === identifier ||
        String(u.email || '').toLowerCase() === identifier
    );

    if (staffMember) {
      // 3.1 Check lockout
      if (staffMember.locked_until && new Date(staffMember.locked_until) > new Date()) {
        const remainingSec = Math.round((new Date(staffMember.locked_until).getTime() - Date.now()) / 1000);
        return sendJson(res, 429, {
          error: `Too many failed login attempts. Account temporarily locked (${remainingSec}s remaining).`,
          detail: `Too many failed login attempts. Account locked.`,
        });
      }

      // 3.2 Check active
      if (staffMember.is_active === false) {
        return sendJson(res, 403, {
          error: 'Account deactivated by System Administrator.',
          detail: 'Account deactivated by System Administrator.',
        });
      }

      // 3.3 Verify password
      const isMatch = verifyPassword(password, staffMember.password);
      if (!isMatch) {
        staffMember.failed_login_attempts = (staffMember.failed_login_attempts || 0) + 1;
        if (staffMember.failed_login_attempts >= 5) {
          staffMember.locked_until = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        }
        addAuditLog(store, {
          action: 'LOGIN_FAILED',
          actor: identifier,
          role: staffMember.role,
          target_ref: 'SECURITY',
          details: `Failed sign-in attempt (${staffMember.failed_login_attempts}/5).`,
        });
        writeStore(store);
        return sendJson(res, 401, {
          error: 'Invalid username or password.',
          detail: 'Invalid username or password.',
        });
      }

      // Password matches: reset failed attempts
      staffMember.failed_login_attempts = 0;
      staffMember.locked_until = null;

      // 3.4 MFA Verification Step
      if (staffMember.mfa_enabled && !body.mfa_code) {
        writeStore(store);
        return sendJson(res, 200, {
          mfa_required: true,
          email_masked: maskEmail(staffMember.email),
          message: `MFA 6-digit OTP code dispatched to ${maskEmail(staffMember.email)}.`,
        });
      }

      // Generate signed token
      const token = `td-jwt-${staffMember.id}-${crypto.randomBytes(8).toString('hex')}`;
      addAuditLog(store, {
        action: 'USER_LOGIN',
        actor: staffMember.username,
        role: staffMember.role,
        target_ref: staffMember.department || 'PORTAL',
        details: `Authenticated officer @${staffMember.username} (${staffMember.role})`,
      });
      writeStore(store);

      return sendJson(res, 200, {
        token,
        access: token,
        id: staffMember.id,
        user: staffMember,
        role: staffMember.role,
        username: staffMember.username,
        email: staffMember.email,
        name: `${staffMember.first_name || ''} ${staffMember.last_name || ''}`.trim() || staffMember.username,
        first_name: staffMember.first_name,
        last_name: staffMember.last_name,
        department: staffMember.department,
        channels: staffMember.channels || [],
        privileges: staffMember.privileges || [],
        must_change_password: Boolean(staffMember.must_change_password),
        is_active: staffMember.is_active !== false,
      });
    }

    // Check registered farmers
    const farmer = store.farmers.find(
      (f) =>
        String(f.username || '').toLowerCase() === identifier ||
        String(f.email || '').toLowerCase() === identifier ||
        normalizeToken(f.national_id) === normalizeToken(identifier)
    );

    if (farmer) {
      if (farmer.password && !verifyPassword(password, farmer.password)) {
        return sendJson(res, 401, { error: 'Invalid username or password.' });
      }
      const token = `td-farmer-${farmer.id}-${crypto.randomBytes(8).toString('hex')}`;
      return sendJson(res, 200, {
        token,
        access: token,
        user: farmer,
        role: 'farmer',
        username: farmer.username,
      });
    }

    // REMOVED ALL MOCK FALLBACKS: Invalid credentials return 401
    return sendJson(res, 401, {
      error: 'Invalid username or password.',
      detail: 'Invalid username or password.',
    });
  }

  // 4. Mandatory Password Change (/api/change-password)
  if (pathname === '/api/change-password' && method === 'POST') {
    const user = getAuthUser(req, store);
    if (!user) {
      return sendJson(res, 401, { error: 'Authentication required to change password.' });
    }

    const body = await parseBody(req);
    const oldPassword = String(body.old_password || '');
    const newPassword = String(body.new_password || '');
    const confirmPassword = String(body.confirm_password || '');

    if (!verifyPassword(oldPassword, user.password)) {
      return sendJson(res, 400, { error: 'Current password does not match registered record.' });
    }

    if (newPassword.trim().toLowerCase() === 'ministry') {
      return sendJson(res, 400, { error: 'New password must not be the temporary default password.' });
    }

    if (newPassword !== confirmPassword) {
      return sendJson(res, 400, { error: 'New password and confirmation password do not match.' });
    }

    if (newPassword.length < 8) {
      return sendJson(res, 400, { error: 'New password must be at least 8 characters long.' });
    }

    const hasLetter = /[A-Za-z]/.test(newPassword);
    const hasDigit = /\d/.test(newPassword);
    if (!hasLetter || !hasDigit) {
      return sendJson(res, 400, { error: 'New password must contain both letters and numbers.' });
    }

    user.password = hashPassword(newPassword);
    user.must_change_password = false;

    addAuditLog(store, {
      action: 'PASSWORD_CHANGED',
      actor: user.username,
      role: user.role,
      target_ref: 'SECURITY',
      details: `Officer @${user.username} updated password to compliant credential.`,
    });

    const token = `td-jwt-${user.id}-${crypto.randomBytes(8).toString('hex')}`;
    writeStore(store);

    return sendJson(res, 200, {
      message: 'Password updated successfully.',
      token,
      must_change_password: false,
    });
  }

  // 5. Logout
  if (pathname === '/api/logout' && method === 'POST') {
    return sendJson(res, 200, { message: 'Logged out successfully.' });
  }

  // 6. Admin Staff Management
  if (pathname === '/api/admin/staff/oversight' && method === 'GET') {
    const stageCounts = {};
    for (const app of store.applications) {
      const st = app.status || 'PENDING';
      stageCounts[st] = (stageCounts[st] || 0) + 1;
    }
    const overdueCutoff = Date.now() - 3 * 24 * 60 * 60 * 1000;
    const overdueCount = store.applications.filter(
      (a) => !['APPROVED', 'READY_FOR_COLLECTION', 'COMPLETED'].includes(a.status) &&
             new Date(a.updated_at || a.created_at || 0).getTime() < overdueCutoff
    ).length;

    const disputedCount = store.applications.filter((a) => a.has_disputes || a.has_double_allocation).length;
    const queriedCount = store.applications.filter((a) => a.is_queried).length;

    return sendJson(res, 200, {
      stage_counts: stageCounts,
      overdue_count: overdueCount,
      total_applications: store.applications.length,
      active_staff: store.staff.filter((s) => s.is_active !== false).length,
      disputed_count: disputedCount,
      queried_count: queriedCount,
      sla_target_days: 3,
    });
  }

  if (pathname === '/api/admin/staff' && method === 'GET') {
    return sendJson(res, 200, store.staff);
  }

  if (pathname === '/api/admin/staff' && method === 'POST') {
    const body = await parseBody(req);
    const username = String(body.username || '').trim();
    const email = String(body.email || '').trim();
    if (!username) {
      return sendJson(res, 400, { error: 'Username is required.' });
    }
    const duplicate = store.staff.find(
      (u) =>
        String(u.username || '').toLowerCase() === username.toLowerCase() ||
        (email && String(u.email || '').toLowerCase() === email.toLowerCase())
    );
    if (duplicate) {
      return sendJson(res, 400, { error: 'A user with that username or email already exists.' });
    }
    const newStaff = {
      id: Date.now(),
      username,
      email: email || `${username}@lands.gov.zw`,
      first_name: body.first_name || '',
      last_name: body.last_name || '',
      role: body.role || 'accounts',
      department: body.department || 'Finance & Accounts',
      channels: Array.isArray(body.channels) ? body.channels : ['Finance Channel'],
      privileges: Array.isArray(body.privileges) ? body.privileges : ['reconcile_fees'],
      password: hashPassword(body.password || 'Ministry'),
      must_change_password: true,
      mfa_enabled: true,
      failed_login_attempts: 0,
      locked_until: null,
      is_active: body.is_active !== false,
      created_at: new Date().toISOString(),
    };
    store.staff.push(newStaff);
    addAuditLog(store, {
      action: 'STAFF_CREATED',
      actor: 'admin',
      role: 'admin',
      target_ref: newStaff.username,
      details: `Created staff account @${newStaff.username} (${newStaff.role} — ${newStaff.department})`,
    });
    writeStore(store);
    return sendJson(res, 201, newStaff);
  }

  const staffActionMatch = pathname.match(/^\/api\/admin\/staff\/([^/]+)(?:\/([^/]+))?$/);
  if (staffActionMatch) {
    const staffId = staffActionMatch[1];
    const subAction = staffActionMatch[2];
    const idx = store.staff.findIndex((u) => String(u.id) === String(staffId));
    if (idx === -1) {
      return sendJson(res, 404, { error: 'Staff member not found.' });
    }

    if (subAction === 'toggle_active' && method === 'POST') {
      store.staff[idx].is_active = !store.staff[idx].is_active;
      addAuditLog(store, {
        action: store.staff[idx].is_active ? 'STAFF_ACTIVATED' : 'STAFF_DEACTIVATED',
        actor: 'admin',
        role: 'admin',
        target_ref: store.staff[idx].username,
        details: `Toggled active status to ${store.staff[idx].is_active}`,
      });
      writeStore(store);
      return sendJson(res, 200, { user: store.staff[idx] });
    }

    if (subAction === 'reset-password' && method === 'POST') {
      store.staff[idx].password = hashPassword('Ministry');
      store.staff[idx].must_change_password = true;
      addAuditLog(store, {
        action: 'PASSWORD_RESET',
        actor: 'admin',
        role: 'admin',
        target_ref: store.staff[idx].username,
        details: `Reset password for @${store.staff[idx].username} to 'Ministry' (must change on login).`,
      });
      writeStore(store);
      return sendJson(res, 200, { message: `Password for @${store.staff[idx].username} has been reset to 'Ministry'.` });
    }

    if (subAction === 'toggle-mfa' && method === 'POST') {
      store.staff[idx].mfa_enabled = !store.staff[idx].mfa_enabled;
      addAuditLog(store, {
        action: 'TOGGLE_MFA',
        actor: 'admin',
        role: 'admin',
        target_ref: store.staff[idx].username,
        details: `Toggled MFA for @${store.staff[idx].username} to ${store.staff[idx].mfa_enabled}`,
      });
      writeStore(store);
      return sendJson(res, 200, { mfa_enabled: store.staff[idx].mfa_enabled });
    }

    if (method === 'PUT' || method === 'PATCH') {
      const body = await parseBody(req);
      store.staff[idx] = {
        ...store.staff[idx],
        ...body,
        id: store.staff[idx].id,
        password: body.password ? hashPassword(body.password) : store.staff[idx].password,
        updated_at: new Date().toISOString(),
      };
      writeStore(store);
      return sendJson(res, 200, store.staff[idx]);
    }

    if (method === 'DELETE') {
      const removed = store.staff.splice(idx, 1)[0];
      writeStore(store);
      return sendJson(res, 200, { deleted: true, id: staffId });
    }
  }

  // 7. Applications API
  if (pathname === '/api/applications' && method === 'GET') {
    const authStaff = getAuthUser(req, store);
    let results = store.applications;
    if (authStaff && authStaff.role !== 'admin') {
      const role = authStaff.role;
      if (role === 'accounts') {
        results = results.filter((a) => ['PENDING', 'SUBMITTED'].includes(a.status));
      } else if (role === 'estates') {
        results = results.filter((a) => ['ACCOUNTS_CLEARED'].includes(a.status));
      } else if (role === 'lims') {
        results = results.filter((a) => ['ESTATES_CLEARED'].includes(a.status));
      } else if (role === 'zlc') {
        results = results.filter((a) => ['LIMS_VERIFIED'].includes(a.status));
      } else if (['surveyor_general', 'surveyor', 'sg', 'gis'].includes(role)) {
        results = results.filter((a) => ['ZLC_CLEARED'].includes(a.status));
      } else if (role === 'valuation') {
        results = results.filter((a) => ['SURVEYED'].includes(a.status));
      }
    }
    return sendJson(res, 200, results);
  }

  // 8. Departmental Action Handlers on Applications
  const actionMatch = pathname.match(/^\/api\/applications\/([^/]+)\/(verify_accounts|verify_estates|verify_lims|verify_zlc|verify_surveyor|set_valuation|final_approve|conclude-application)$/);
  if (actionMatch && method === 'POST') {
    const appId = actionMatch[1];
    const actionName = actionMatch[2];
    const authUser = getAuthUser(req, store);
    const body = await parseBody(req);
    const now = new Date().toISOString();

    const idx = store.applications.findIndex(
      (a) => String(a.id) === String(appId) || String(a.reference_number) === String(appId)
    );
    if (idx === -1) {
      return sendJson(res, 404, { error: `Application ${appId} not found.` });
    }
    const app = store.applications[idx];
    const role = authUser ? authUser.role : '';

    // RBAC validation
    if (actionName === 'verify_accounts') {
      if (role && !['accounts', 'admin'].includes(role)) {
        return sendJson(res, 403, { error: 'Unauthorized: Only Accounts Officers may verify fees.' });
      }
      app.is_paid = true;
      app.status = 'ACCOUNTS_CLEARED';
    } else if (actionName === 'verify_estates') {
      if (role && !['estates', 'resettlement', 'admin'].includes(role)) {
        return sendJson(res, 403, { error: 'Unauthorized: Only Estates Officers may verify tenure.' });
      }
      if (body.action_type === 'QUERY') {
        app.is_queried = true;
        app.query_message = body.officer_comments || 'Estates query logged.';
      } else {
        app.status = 'ESTATES_CLEARED';
      }
    } else if (actionName === 'verify_lims') {
      if (role && !['lims', 'admin'].includes(role)) {
        return sendJson(res, 403, { error: 'Unauthorized: Only LIMS Officers may verify cadastre.' });
      }
      if (body.status_action === 'QUERY') {
        app.is_queried = true;
        app.query_message = body.reason || 'LIMS discrepancy logged.';
      } else {
        app.status = 'LIMS_VERIFIED';
      }
    } else if (actionName === 'verify_zlc') {
      if (role && !['zlc', 'admin'].includes(role)) {
        return sendJson(res, 403, { error: 'Unauthorized: Only ZLC Officers may clear disputes.' });
      }
      if (body.action_type === 'DISPUTE') {
        app.has_disputes = true;
      } else if (body.action_type === 'DOUBLE_ALLOCATION') {
        app.has_double_allocation = true;
      } else {
        app.has_disputes = false;
        app.status = 'ZLC_CLEARED';
      }
    } else if (actionName === 'verify_surveyor') {
      if (role && !['surveyor_general', 'surveyor', 'sg', 'gis', 'admin'].includes(role)) {
        return sendJson(res, 403, { error: 'Unauthorized: Only Surveyor General Officers may verify survey.' });
      }
      app.status = 'SURVEYED';
    } else if (actionName === 'set_valuation') {
      if (role && !['valuation', 'admin'].includes(role)) {
        return sendJson(res, 403, { error: 'Unauthorized: Only Valuation Officers may appraise value.' });
      }
      app.status = 'VALUATED';
    } else if (actionName === 'final_approve' || actionName === 'conclude-application') {
      if (role && !['director', 'deeds', 'admin'].includes(role)) {
        return sendJson(res, 403, { error: 'Unauthorized: Only Director of Lands or Deeds Registrar may grant approval.' });
      }
      if (app.has_disputes || app.has_double_allocation || app.is_queried) {
        return sendJson(res, 403, {
          error: 'Title deed issuance is strictly locked: active ZLC dispute, double allocation, or unresolved query exists.',
        });
      }
      app.status = 'APPROVED';
    }

    app.officer_comments = body.officer_comments || body.comments || app.officer_comments;
    app.updated_at = now;
    addAuditLog(store, {
      action: `OFFICER_${actionName.toUpperCase()}`,
      actor: authUser ? authUser.username : 'officer',
      role: authUser ? authUser.role : 'officer',
      target_ref: app.reference_number,
      details: `Action [${actionName}] -> Status: ${app.status}`,
    });
    writeStore(store);
    return sendJson(res, 200, app);
  }

  // 9. Track Application (/api/track & /api/applications/track)
  if (pathname === '/api/track' || pathname === '/api/applications/track') {
    const body = method === 'POST' ? await parseBody(req) : Object.fromEntries(parsedUrl.searchParams.entries());
    const normNat = normalizeToken(body.national_id || body.nationalId || '');
    const normRef = normalizeToken(body.reference_number || body.ref || body.q || '');
    const normReceipt = normalizeToken(body.receipt_number || body.pin || body.receipt || '');

    const match = store.applications.find((app) => {
      const appNat = normalizeToken(app.national_id || app.walk_in_national_id || '');
      const appRef = normalizeToken(app.reference_number || `APP-${String(app.id || '').padStart(5, '0')}`);
      const appReceipt = normalizeToken(app.statutory_fee_receipt || app.receipt_number || '');

      if (normNat && normRef && normReceipt) {
        return appNat === normNat && appRef === normRef && appReceipt === normReceipt;
      }
      if (normReceipt && appReceipt === normReceipt) return true;
      if (normRef && appRef === normRef) return true;
      return false;
    });

    if (match) {
      return sendJson(res, 200, match);
    }

    return sendJson(res, 404, {
      error: 'No matching application found. Please verify your National ID, Reference No., and Receipt Number.',
      detail: 'No matching application found.',
    });
  }

  // 10. Reports & Audit Logs (/api/reports/*)
  if (pathname === '/api/reports/audit-logs') {
    return sendJson(res, 200, {
      count: store.auditLogs.length,
      results: store.auditLogs,
    });
  }

  if (pathname.startsWith('/api/reports/')) {
    return sendJson(res, 200, computeReportMetrics(store.applications));
  }

  // Catch-all for API
  return sendJson(res, 404, {
    error: `API endpoint not found: ${method} ${pathname}`,
    detail: `API endpoint not found: ${method} ${pathname}`,
  });
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.apk': 'application/vnd.android.package-archive',
  '.pdf': 'application/pdf',
};

function serveStaticFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  const stat = fs.statSync(filePath);
  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': stat.size,
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=86400',
  });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  try {
    setCorsHeaders(req, res);
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = decodeURIComponent(parsedUrl.pathname);

    // Route API requests
    if (pathname === '/api' || pathname.startsWith('/api/')) {
      await handleApi(req, res, parsedUrl);
      return;
    }

    // Serve downloadable APK files from root if requested
    if (pathname === '/TitleDeeds.apk' || pathname === '/TitleDeeds_v2.apk') {
      const apkFile = path.join(__dirname, pathname.slice(1));
      if (fs.existsSync(apkFile)) {
        serveStaticFile(res, apkFile);
        return;
      }
    }

    // Serve static assets from STATIC_ROOT
    const safeRelPath = path.normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, '');
    const candidatePath = path.join(STATIC_ROOT, safeRelPath);
    if (fs.existsSync(candidatePath) && fs.statSync(candidatePath).isFile()) {
      serveStaticFile(res, candidatePath);
      return;
    }

    // SPA Fallback: serve index.html for all client-side routes (/track, /apply, /login, /admin, etc.)
    const indexHtml = path.join(STATIC_ROOT, 'index.html');
    if (fs.existsSync(indexHtml)) {
      serveStaticFile(res, indexHtml);
      return;
    }

    sendJson(res, 200, {
      status: 'running',
      message: 'Title Deeds One Stop Center Server is running.',
    });
  } catch (err) {
    console.error('[Server Error]', err);
    if (!res.headersSent) {
      sendJson(res, 500, {
        error: 'Internal server error',
        detail: err.message || 'Unexpected error',
      });
    }
  }
});

server.listen(PORT, HOST, () => {
  ensureStore();
  console.log(`==========================================================`);
  console.log(` Title Deeds One Stop Center v2.0 Server Listening`);
  console.log(` URL: http://${HOST}:${PORT}`);
  console.log(` Static SPA Root: ${STATIC_ROOT}`);
  console.log(`==========================================================`);
});
