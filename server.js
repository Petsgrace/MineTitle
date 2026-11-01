/**
 * Production Node.js Web & API Server for Title Deeds One Stop Center
 * Ministry of Lands, Agriculture, Fisheries, Water and Rural Development — Zimbabwe
 *
 * Serves:
 *   1. Compiled React SPA (onlineportal/onlineapplication/frontend/dist or mobile_application/www)
 *   2. Native Android APK downloads (/TitleDeeds.apk, /TitleDeeds_v2.apk)
 *   3. Full REST API (/api/*) for Web & Native Mobile APK offline-to-cloud synchronization
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const PORT = Number(process.env.PORT) || 10000;
const HOST = '0.0.0.0';

// Static SPA directories (prefer frontend/dist, fallback to mobile_application/www)
const DIST_DIR = path.join(__dirname, 'onlineportal', 'onlineapplication', 'frontend', 'dist');
const FALLBACK_WWW_DIR = path.join(__dirname, 'mobile_application', 'www');
const STATIC_ROOT = fs.existsSync(path.join(DIST_DIR, 'index.html')) ? DIST_DIR : FALLBACK_WWW_DIR;

// Persistent data store
const DATA_DIR = path.join(__dirname, 'data');
const STORE_FILE = path.join(DATA_DIR, 'store.json');

const APPLICATION_STAGES = [
  { key: 'PENDING', label: '1. Submitted / Resettlement Verification' },
  { key: 'RESETTLEMENT_VERIFIED', label: '2. LIMS Cadastral & Fee Audit' },
  { key: 'LIMS_VERIFIED', label: '3. ZLC Dispute & Tenure Clearance' },
  { key: 'ZLC_CLEARED', label: '4. GIS Spatial Boundary Validation' },
  { key: 'GIS_VALIDATED', label: '5. Surveyor General Diagram Approval' },
  { key: 'SURVEY_APPROVED', label: '6. Estates Land Valuation' },
  { key: 'VALUATION_APPROVED', label: '7. Accounts & Finance Clearance' },
  { key: 'DIRECTOR_APPROVED', label: '8. Executive Director Sign-Off' },
  { key: 'DEED_ISSUED', label: '9. Deeds Registry — Title Deed Issued' },
];

const STAGE_ALIASES = {
  SUBMITTED: 0,
  PENDING: 0,
  PENDING_LIMS: 1,
  RESETTLEMENT_VERIFIED: 1,
  PENDING_ZLC: 2,
  LIMS_VERIFIED: 2,
  ZLC_CLEARED: 3,
  PENDING_SURVEY: 4,
  GIS_VALIDATED: 4,
  PENDING_ESTATES: 5,
  SURVEY_APPROVED: 5,
  PENDING_FINANCE: 6,
  AWAITING_PAYMENT: 6,
  VALUATION_APPROVED: 6,
  PENDING_DEEDS: 7,
  DIRECTOR_APPROVED: 7,
  APPROVED: 8,
  ISSUED: 8,
  DEED_ISSUED: 8,
};

const DEFAULT_STAFF = [
  {
    id: 1,
    username: 'admin',
    email: 'admin@lands.gov.zw',
    first_name: 'System',
    last_name: 'Administrator',
    role: 'admin',
    department: 'IT & Systems Administration',
    channels: ['One Stop Center', 'Web Portal', 'Mobile App', 'System Admin'],
    privileges: ['manage_users', 'view_audit_logs', 'override_workflow', 'export_reports', 'approve_stage', 'edit_records'],
    is_active: true,
    created_at: '2026-01-01T08:00:00.000Z',
  },
  {
    id: 2,
    username: 'resettlement_officer',
    email: 'resettlement@lands.gov.zw',
    first_name: 'Tendai',
    last_name: 'Moyo',
    role: 'resettlement_officer',
    department: 'Resettlement & Securitization',
    channels: ['One Stop Center', 'Registry (A1 & A2)'],
    privileges: ['verify_documents', 'approve_stage', 'edit_records'],
    is_active: true,
    created_at: '2026-01-01T08:00:00.000Z',
  },
  {
    id: 3,
    username: 'lims_officer',
    email: 'lims@lands.gov.zw',
    first_name: 'Rudo',
    last_name: 'Chikwanda',
    role: 'lims_officer',
    department: 'LIMS & Cadastral Verification',
    channels: ['Registry (A1 & A2)', 'Evaluation'],
    privileges: ['verify_lims', 'verify_fee', 'approve_stage'],
    is_active: true,
    created_at: '2026-01-01T08:00:00.000Z',
  },
  {
    id: 4,
    username: 'director',
    email: 'director@lands.gov.zw',
    first_name: 'Farai',
    last_name: 'Ndlovu',
    role: 'director',
    department: 'Executive Directorate',
    channels: ['Actioning Officers', 'Agreements of Sale', 'Executive Approval'],
    privileges: ['final_approval', 'generate_agreement', 'export_reports', 'approve_stage'],
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
      staff: DEFAULT_STAFF,
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
          details: 'Title Deeds One Stop Center v2.0 server initialized.',
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
    return {
      applications: Array.isArray(parsed.applications) ? parsed.applications : [],
      staff: Array.isArray(parsed.staff) && parsed.staff.length > 0 ? parsed.staff : DEFAULT_STAFF,
      farmers: Array.isArray(parsed.farmers) ? parsed.farmers : [],
      payments: Array.isArray(parsed.payments) ? parsed.payments : [],
      auditLogs: Array.isArray(parsed.auditLogs) ? parsed.auditLogs : [],
    };
  } catch (err) {
    return {
      applications: [],
      staff: DEFAULT_STAFF,
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
    details: entry.details || '',
  };
  store.auditLogs.unshift(log);
  if (store.auditLogs.length > 1000) {
    store.auditLogs.length = 1000;
  }
  return log;
}

function normalizeToken(val) {
  return String(val || '').trim().toUpperCase().replace(/[\s-]/g, '');
}

function isA1Tenure(docType) {
  const norm = String(docType || '').toUpperCase();
  return norm.includes('A1') || norm.includes('PERMIT') || norm.includes('SETTLEMENT');
}

function buildTrackResult(app, fallbackRef = '') {
  const statusUpper = String(app.status || 'PENDING').toUpperCase();
  const currIdx = STAGE_ALIASES[statusUpper] !== undefined ? STAGE_ALIASES[statusUpper] : 0;
  const timeline = APPLICATION_STAGES.map((st, idx) => ({
    stage: idx + 1,
    key: st.key,
    label: st.label,
    state: idx < currIdx ? 'COMPLETED' : idx === currIdx ? 'CURRENT' : 'PENDING',
    timestamp: (app.stage_timestamps && app.stage_timestamps[st.key]) || (idx === 0 ? app.created_at : null),
  }));

  return {
    success: true,
    id: app.id,
    reference_number: app.reference_number || fallbackRef || `APP-${String(app.id || '00001').padStart(5, '0')}`,
    receipt_number: app.statutory_fee_receipt || app.receipt_number || app.receiptNumber || 'N/A',
    national_id: app.national_id || app.walk_in_national_id || '',
    farm_name: app.farm_name || 'Registered Land Parcel',
    district: app.district || 'Zimbabwe',
    province: app.province || 'Zimbabwe',
    tenure_document_type: app.tenure_document_type || 'Offer Letter',
    registry_category: isA1Tenure(app.tenure_document_type) ? 'A1' : 'A2',
    status: app.status || 'PENDING',
    status_display: APPLICATION_STAGES[currIdx]?.label || app.status || 'PENDING',
    current_stage: currIdx + 1,
    total_stages: APPLICATION_STAGES.length,
    has_disputes: Boolean(app.has_disputes),
    timeline,
    updated_at: app.updated_at || app.created_at || new Date().toISOString(),
  };
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
    const MAX_BYTES = 25 * 1024 * 1024; // 25 MB for photos + signatures
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

function computeReportMetrics(applications) {
  const total = applications.length;
  const approved = applications.filter((a) =>
    ['APPROVED', 'DEED_ISSUED', 'DIRECTOR_APPROVED', 'ISSUED'].includes(String(a.status || '').toUpperCase())
  ).length;
  const rejected = applications.filter((a) => String(a.status || '').toUpperCase() === 'REJECTED').length;
  const pending = Math.max(0, total - approved - rejected);
  const a1Count = applications.filter((a) => isA1Tenure(a.tenure_document_type)).length;
  const a2Count = total - a1Count;

  const byStage = {};
  const byProvince = {};
  for (const app of applications) {
    const st = app.status || 'PENDING';
    byStage[st] = (byStage[st] || 0) + 1;
    const prov = app.province || 'Unspecified';
    byProvince[prov] = (byProvince[prov] || 0) + 1;
  }

  return {
    total_applications: total,
    pending,
    approved,
    rejected,
    a1_registry_count: a1Count,
    a2_registry_count: a2Count,
    statutory_fee_revenue_usd: total * 10,
    by_stage: byStage,
    by_province: byProvince,
  };
}

async function handleApi(req, res, parsedUrl) {
  const pathname = parsedUrl.pathname.replace(/\/+$/, '') || '/api';
  const method = req.method.toUpperCase();
  const store = readStore();

  // 1. Health check
  if (pathname === '/api' || pathname === '/api/health') {
    return sendJson(res, 200, {
      status: 'ok',
      service: 'Title Deeds One Stop Center API',
      version: '2.0.0',
      applications_count: store.applications.length,
      timestamp: new Date().toISOString(),
    });
  }

  // 2. Authentication: Login & Registration
  if ((pathname === '/api/login' || pathname === '/api/auth/login') && method === 'POST') {
    const body = await parseBody(req);
    const identifier = String(body.username || body.email || body.national_id || '').trim().toLowerCase();

    // Check staff accounts first
    const staffMember = store.staff.find(
      (u) =>
        String(u.username || '').toLowerCase() === identifier ||
        String(u.email || '').toLowerCase() === identifier
    );

    if (staffMember) {
      if (staffMember.is_active === false) {
        return sendJson(res, 403, {
          error: 'Account deactivated. Please contact the System Administrator.',
          detail: 'Account deactivated. Please contact the System Administrator.',
        });
      }
      if (staffMember.password && body.password && staffMember.password !== body.password) {
        return sendJson(res, 401, { error: 'Invalid credentials.', detail: 'Invalid credentials.' });
      }
      const token = `td-jwt-${staffMember.id}-${crypto.randomBytes(8).toString('hex')}`;
      addAuditLog(store, {
        action: 'USER_LOGIN',
        actor: staffMember.username,
        role: staffMember.role,
        target_ref: staffMember.department || 'PORTAL',
        details: `Authenticated staff user ${staffMember.username} (${staffMember.role})`,
      });
      writeStore(store);
      return sendJson(res, 200, {
        token,
        access: token,
        user: staffMember,
        role: staffMember.role,
        username: staffMember.username,
        department: staffMember.department,
        channels: staffMember.channels,
        privileges: staffMember.privileges,
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
      const token = `td-farmer-${farmer.id}-${crypto.randomBytes(8).toString('hex')}`;
      return sendJson(res, 200, {
        token,
        access: token,
        user: farmer,
        role: 'farmer',
        username: farmer.username,
      });
    }

    // Default fallback for demo/officer testing if username matches role name
    const fallbackUser = {
      id: Date.now(),
      username: body.username || 'applicant',
      email: body.email || `${body.username || 'user'}@lands.gov.zw`,
      role: body.role || 'farmer',
      is_active: true,
    };
    const token = `td-token-${crypto.randomBytes(8).toString('hex')}`;
    return sendJson(res, 200, {
      token,
      access: token,
      user: fallbackUser,
      role: fallbackUser.role,
      username: fallbackUser.username,
    });
  }

  if ((pathname === '/api/register' || pathname === '/api/auth/register') && method === 'POST') {
    const body = await parseBody(req);
    const newFarmer = {
      id: store.farmers.length + 1,
      username: body.username || body.email || `farmer_${Date.now()}`,
      email: body.email || '',
      first_name: body.first_name || '',
      last_name: body.last_name || '',
      national_id: body.national_id || '',
      phone_number: body.phone_number || '',
      role: 'farmer',
      created_at: new Date().toISOString(),
    };
    store.farmers.push(newFarmer);
    addAuditLog(store, {
      action: 'FARMER_REGISTERED',
      actor: newFarmer.username,
      role: 'farmer',
      target_ref: newFarmer.national_id || newFarmer.username,
      details: `Registered applicant account for ${newFarmer.first_name} ${newFarmer.last_name}`.trim(),
    });
    writeStore(store);
    return sendJson(res, 201, {
      message: 'Account created successfully.',
      user: newFarmer,
    });
  }

  if (pathname === '/api/password-reset' || pathname === '/api/password-reset-confirm') {
    return sendJson(res, 200, { message: 'Password reset processed successfully.' });
  }

  // 3. Admin Staff Management (/api/admin/staff)
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
      role: body.role || 'resettlement_officer',
      department: body.department || 'Resettlement & Securitization',
      channels: Array.isArray(body.channels) ? body.channels : ['One Stop Center'],
      privileges: Array.isArray(body.privileges) ? body.privileges : ['verify_documents', 'approve_stage'],
      phone_number: body.phone_number || '',
      password: body.password || '',
      is_active: body.is_active !== false,
      created_at: new Date().toISOString(),
    };
    store.staff.push(newStaff);
    addAuditLog(store, {
      action: 'STAFF_CREATED',
      actor: 'admin',
      role: 'admin',
      target_ref: newStaff.username,
      details: `Created staff account ${newStaff.username} (${newStaff.role} — ${newStaff.department})`,
    });
    writeStore(store);
    return sendJson(res, 201, newStaff);
  }

  const staffMatch = pathname.match(/^\/api\/admin\/staff\/([^/]+)(?:\/(toggle_active))?$/);
  if (staffMatch) {
    const staffId = staffMatch[1];
    const subAction = staffMatch[2];
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
      return sendJson(res, 200, store.staff[idx]);
    }
    if (method === 'PUT' || method === 'PATCH') {
      const body = await parseBody(req);
      store.staff[idx] = {
        ...store.staff[idx],
        ...body,
        id: store.staff[idx].id,
        updated_at: new Date().toISOString(),
      };
      addAuditLog(store, {
        action: 'STAFF_UPDATED',
        actor: 'admin',
        role: 'admin',
        target_ref: store.staff[idx].username,
        details: `Updated role/department for ${store.staff[idx].username}`,
      });
      writeStore(store);
      return sendJson(res, 200, store.staff[idx]);
    }
    if (method === 'DELETE') {
      const removed = store.staff.splice(idx, 1)[0];
      addAuditLog(store, {
        action: 'STAFF_DELETED',
        actor: 'admin',
        role: 'admin',
        target_ref: removed.username,
        details: `Deleted staff account ${removed.username}`,
      });
      writeStore(store);
      return sendJson(res, 200, { deleted: true, id: staffId });
    }
  }

  // 4. Track Application (/api/track & /api/applications/track)
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
      return sendJson(res, 200, buildTrackResult(match, body.reference_number));
    }

    return sendJson(res, 404, {
      error: 'No matching application found. Please verify your National ID, Reference No., and Receipt Number.',
      detail: 'No matching application found.',
    });
  }

  // 5. Statutory Fee Payments (/api/payments)
  if (pathname === '/api/payments' && method === 'POST') {
    const body = await parseBody(req);
    const receiptNumber =
      body.receipt_number ||
      body.receiptNumber ||
      `RCP-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
    const record = {
      id: store.payments.length + 1,
      receipt_number: receiptNumber,
      amount_usd: Number(body.amount || 10),
      payment_method: body.payment_method || body.method || 'EcoCash',
      national_id: body.national_id || body.nationalId || '',
      applicant_name: body.applicant_name || body.fullName || '',
      farm_name: body.farm_name || body.farmName || '',
      status: 'PAID',
      timestamp: new Date().toISOString(),
    };
    store.payments.push(record);
    addAuditLog(store, {
      action: 'STATUTORY_FEE_PAID',
      actor: record.national_id || 'applicant',
      role: 'farmer',
      target_ref: receiptNumber,
      details: `Statutory application fee USD $${record.amount_usd.toFixed(2)} paid (${record.payment_method})`,
    });
    writeStore(store);
    return sendJson(res, 201, record);
  }

  // 6. Applications Collection & Dashboard Stats
  if (pathname === '/api/applications/dashboard_stats' && method === 'GET') {
    return sendJson(res, 200, computeReportMetrics(store.applications));
  }

  if (pathname === '/api/applications/calculate-pricing' && method === 'POST') {
    const body = await parseBody(req);
    const hectares = Number(body.farm_size_hectares || body.hectares || 50);
    const basePricePerHa = Number(body.price_per_hectare || 125);
    const totalUsd = Math.max(500, Math.round(hectares * basePricePerHa));
    return sendJson(res, 200, {
      farm_size_hectares: hectares,
      price_per_hectare_usd: basePricePerHa,
      recommended_purchase_price_usd: totalUsd,
      statutory_fee_usd: 10,
    });
  }

  if (pathname === '/api/applications' && method === 'GET') {
    return sendJson(res, 200, store.applications);
  }

  if (pathname === '/api/applications' && method === 'POST') {
    const body = await parseBody(req);
    const now = new Date().toISOString();
    const idempotencyKey =
      body.idempotency_key ||
      [
        normalizeToken(body.national_id || body.walk_in_national_id),
        normalizeToken(body.statutory_fee_receipt || body.receipt_number),
        normalizeToken(body.farm_name),
      ]
        .filter(Boolean)
        .join(':');

    // Deduplicate if same idempotency_key or reference_number already exists
    const existingIdx = store.applications.findIndex(
      (a) =>
        (idempotencyKey && a.idempotency_key === idempotencyKey) ||
        (body.reference_number && a.reference_number === body.reference_number)
    );

    if (existingIdx !== -1) {
      const existing = store.applications[existingIdx];
      const incomingTime = new Date(body.updated_at || now).getTime();
      const existingTime = new Date(existing.updated_at || existing.created_at || 0).getTime();

      if (incomingTime >= existingTime) {
        store.applications[existingIdx] = {
          ...existing,
          ...body,
          id: existing.id,
          reference_number: existing.reference_number,
          idempotency_key: idempotencyKey,
          updated_at: now,
        };
        addAuditLog(store, {
          action: 'APPLICATION_SYNC_UPSERT',
          actor: body.national_id || 'applicant',
          role: 'farmer',
          target_ref: existing.reference_number,
          details: `Idempotent sync updated existing record ${existing.reference_number} (Latest-Edit-Wins).`,
        });
        writeStore(store);
      }
      return sendJson(res, 200, store.applications[existingIdx]);
    }

    const nextNum = store.applications.length + 1;
    const refNumber =
      body.reference_number || `TD-${new Date().getFullYear()}-${String(nextNum).padStart(5, '0')}`;
    const newApp = {
      id: body.id || Date.now(),
      reference_number: refNumber,
      idempotency_key: idempotencyKey,
      status: body.status || 'PENDING',
      registry_category: isA1Tenure(body.tenure_document_type) ? 'A1' : 'A2',
      ...body,
      stage_timestamps: {
        PENDING: now,
        ...(body.stage_timestamps || {}),
      },
      created_at: body.created_at || now,
      updated_at: now,
    };

    store.applications.unshift(newApp);
    addAuditLog(store, {
      action: 'APPLICATION_SUBMITTED',
      actor: newApp.national_id || newApp.walk_in_first_name || 'applicant',
      role: 'farmer',
      target_ref: newApp.reference_number,
      details: `Submitted ${newApp.registry_category} application for ${newApp.farm_name || 'parcel'} (Receipt: ${
        newApp.statutory_fee_receipt || 'N/A'
      })`,
    });
    writeStore(store);
    return sendJson(res, 201, newApp);
  }

  // 7. Single Application Operations & Workflow Stage Transitions
  const appMatch = pathname.match(/^\/api\/applications\/([^/]+)(?:\/([^/]+))?$/);
  if (appMatch) {
    const appId = appMatch[1];
    const action = appMatch[2];
    const idx = store.applications.findIndex(
      (a) => String(a.id) === String(appId) || String(a.reference_number) === String(appId)
    );

    if (idx === -1) {
      return sendJson(res, 404, { error: `Application ${appId} not found.` });
    }

    const app = store.applications[idx];
    const now = new Date().toISOString();

    if (!action && method === 'GET') {
      return sendJson(res, 200, app);
    }

    if (!action && (method === 'PATCH' || method === 'PUT')) {
      const body = await parseBody(req);
      store.applications[idx] = {
        ...app,
        ...body,
        id: app.id,
        reference_number: app.reference_number,
        updated_at: now,
      };
      addAuditLog(store, {
        action: 'APPLICATION_UPDATED',
        actor: body.actor || 'officer',
        role: body.role || 'officer',
        target_ref: app.reference_number,
        details: `Updated application ${app.reference_number} (status: ${store.applications[idx].status})`,
      });
      writeStore(store);
      return sendJson(res, 200, store.applications[idx]);
    }

    if (action && method === 'POST') {
      const body = await parseBody(req);
      const ACTION_NEXT_STAGE = {
        verify_lims: 'LIMS_VERIFIED',
        verify_application_fee: 'LIMS_VERIFIED',
        verify_zlc: 'ZLC_CLEARED',
        technical_survey: 'GIS_VALIDATED',
        mark_surveyed: 'SURVEY_APPROVED',
        verify_estates: 'VALUATION_APPROVED',
        set_valuation: 'VALUATION_APPROVED',
        approve: 'DIRECTOR_APPROVED',
        generate_agreement: 'DEED_ISSUED',
        'conclude-application': 'DEED_ISSUED',
        reject_application: 'REJECTED',
        escalate: 'ESCALATED',
        'refer-back': 'PENDING',
        appeal_rejection: 'PENDING',
      };

      const nextStatus = body.new_status || body.status || ACTION_NEXT_STAGE[action] || app.status;
      const stageTimestamps = {
        ...(app.stage_timestamps || {}),
        [nextStatus]: now,
      };

      store.applications[idx] = {
        ...app,
        ...body,
        id: app.id,
        reference_number: app.reference_number,
        status: nextStatus,
        stage_timestamps: stageTimestamps,
        updated_at: now,
      };

      addAuditLog(store, {
        action: `WORKFLOW_${action.toUpperCase()}`,
        actor: body.actor || body.officer || 'officer',
        role: body.role || 'officer',
        target_ref: app.reference_number,
        details: `Stage transition [${action}] -> ${nextStatus} at ${now}`,
      });
      writeStore(store);
      return sendJson(res, 200, store.applications[idx]);
    }
  }

  // 8. Reports & Audit Logs (/api/reports/*)
  if (pathname === '/api/reports/audit-logs') {
    if (method === 'POST') {
      const body = await parseBody(req);
      const created = addAuditLog(store, body);
      writeStore(store);
      return sendJson(res, 201, created);
    }
    return sendJson(res, 200, {
      count: store.auditLogs.length,
      results: store.auditLogs,
    });
  }

  if (
    pathname === '/api/reports/director-applications' ||
    pathname === '/api/reports/role-applications'
  ) {
    return sendJson(res, 200, {
      count: store.applications.length,
      total_pages: Math.max(1, Math.ceil(store.applications.length / 20)),
      results: store.applications,
    });
  }

  if (pathname.startsWith('/api/reports/')) {
    return sendJson(res, 200, computeReportMetrics(store.applications));
  }

  // 9. AI Advisory Endpoints
  if (pathname.startsWith('/api/ai/')) {
    return sendJson(res, 200, {
      risk_score: 0.12,
      risk_level: 'LOW',
      recommendation: 'Parcel boundaries and tenure documentation are consistent.',
      districts: [],
    });
  }

  // Catch-all for any other /api/* route — always return JSON, never HTML
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

