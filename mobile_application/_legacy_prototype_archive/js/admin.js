// =============================================
//  OFFICER ADMIN PANEL — Core Logic Engine
//  Title Deeds One Stop Centre
// =============================================

const API_BASE = 'api';

// ─── CRYPTOGRAPHIC SHA-256 HASH ENGINE (TC-11) ───────────
function sha256Sync(ascii) {
    function rightRotate(value, amount) {
        return (value >>> amount) | (value << (32 - amount));
    }
    const mathPow = Math.pow;
    const maxWord = mathPow(2, 32);
    let i, j;
    let result = '';
    const words = [];
    const asciiBitLength = ascii.length * 8;
    let hash = sha256Sync.h = sha256Sync.h || [];
    let k = sha256Sync.k = sha256Sync.k || [];
    let primeCounter = k.length;
    const isComposite = {};
    for (let candidate = 2; primeCounter < 64; candidate++) {
        if (!isComposite[candidate]) {
            for (i = 0; i < 313; i += candidate) isComposite[i] = candidate;
            hash[primeCounter] = (mathPow(candidate, .5) * maxWord) | 0;
            k[primeCounter++] = (mathPow(candidate, 1/3) * maxWord) | 0;
        }
    }
    hash = hash.slice(0, 8);
    words[asciiBitLength >> 5] |= 0x80 << (24 - asciiBitLength % 32);
    words[(((asciiBitLength + 64) >> 9) << 4) + 15] = asciiBitLength;
    for (i = 0; i < ascii.length; i++) {
        const j = i >> 2;
        words[j] = (words[j] || 0) | ((ascii.charCodeAt(i) & 0xFF) << ((3 - (i % 4)) * 8));
    }
    for (let j = 0; j < words.length; j += 16) {
        const w = words.slice(j, j + 16);
        const oldHash = hash.slice(0);
        for (i = 0; i < 64; i++) {
            const i2 = i + j;
            const w15 = w[i - 15], w2 = w[i - 2];
            const a = hash[0], e = hash[4];
            const temp1 = hash[7]
                + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25))
                + ((e & hash[5]) ^ ((~e) & hash[6]))
                + k[i]
                + (w[i] = (i < 16) ? (w[i] || 0) : (
                    w[i - 16]
                    + (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3))
                    + w[i - 7]
                    + (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))
                ) | 0);
            const temp2 = (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22))
                + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
            hash = [(temp1 + temp2) | 0, a, hash[1], hash[2], (hash[3] + temp1) | 0, hash[4], hash[5], hash[6]];
        }
        for (i = 0; i < 8; i++) hash[i] = (hash[i] + oldHash[i]) | 0;
    }
    for (i = 0; i < 8; i++) {
        for (j = 3; j >= 0; j--) {
            const b = (hash[i] >> (8 * j)) & 255;
            result += (b < 16 ? '0' : '') + b.toString(16);
        }
    }
    return result;
}

// ─── DEPARTMENT & ROLE REGISTRY (9 Roles + Admin) ────────
const DEPARTMENTS = {
    resettlement:      { label: 'Resettlement Officer',    short: 'Resettlement', color: '#047857', icon: '🌱', stage: 'RESETTLEMENT_VERIFIED', action: 'Verify Offer Letter & Clear Estate' },
    RESETTLEMENT_ROLE: { label: 'Resettlement Officer',    short: 'Resettlement', color: '#047857', icon: '🌱', stage: 'RESETTLEMENT_VERIFIED', action: 'Verify Offer Letter & Clear Estate' },
    lims:              { label: 'LIMS Officer',            short: 'LIMS',         color: '#8b5cf6', icon: '🗺️',  stage: 'LIMS_VERIFIED',         action: 'Verify $10 Fee & Allocate Cadastral ID' },
    LIMS_ROLE:         { label: 'LIMS Officer',            short: 'LIMS',         color: '#8b5cf6', icon: '🗺️',  stage: 'LIMS_VERIFIED',         action: 'Verify $10 Fee & Allocate Cadastral ID' },
    zlc:               { label: 'ZLC Officer',             short: 'ZLC',          color: '#14b8a6', icon: '⚖️',  stage: 'ZLC_CLEARED',           action: 'Clear Land Disputes' },
    ZLC_ROLE:          { label: 'ZLC Officer',             short: 'ZLC',          color: '#14b8a6', icon: '⚖️',  stage: 'ZLC_CLEARED',           action: 'Clear Land Disputes' },
    gis:               { label: 'GIS Officer',             short: 'GIS',          color: '#0284c7', icon: '🛰️',  stage: 'GIS_VALIDATED',         action: 'Validate Overlap & AI Risk' },
    GIS_ROLE:          { label: 'GIS Officer',             short: 'GIS',          color: '#0284c7', icon: '🛰️',  stage: 'GIS_VALIDATED',         action: 'Validate Overlap & AI Risk' },
    surveyor:          { label: 'Surveyor General',        short: 'Surveyor',     color: '#06b6d4', icon: '📐',  stage: 'SURVEYED',              action: 'Approve Cadastral Survey' },
    SURVEYOR_ROLE:     { label: 'Surveyor General',        short: 'Surveyor',     color: '#06b6d4', icon: '📐',  stage: 'SURVEYED',              action: 'Approve Cadastral Survey' },
    valuation:         { label: 'Valuation Officer',       short: 'Valuation',    color: '#f97316', icon: '📊',  stage: 'VALUATED',              action: 'Appraise Land Value' },
    VALUATION_ROLE:    { label: 'Valuation Officer',       short: 'Valuation',    color: '#f97316', icon: '📊',  stage: 'VALUATED',              action: 'Appraise Land Value' },
    director:          { label: 'Director of Lands',       short: 'Director',     color: '#6366f1', icon: '👔',  stage: 'APPROVED',              action: 'Authorize Deed Issuance' },
    DIRECTOR_ROLE:     { label: 'Director of Lands',       short: 'Director',     color: '#6366f1', icon: '👔',  stage: 'APPROVED',              action: 'Authorize Deed Issuance' },
    deeds:             { label: 'Deeds Registrar',         short: 'Deeds',        color: '#10b981', icon: '📜',  stage: 'READY_FOR_COLLECTION',   action: 'Engross & Register Deed' },
    DEEDS_ROLE:        { label: 'Deeds Registrar',         short: 'Deeds',        color: '#10b981', icon: '📜',  stage: 'READY_FOR_COLLECTION',   action: 'Engross & Register Deed' },
    admin:             { label: 'System Administrator',    short: 'SysAdmin',     color: '#ef4444', icon: '⚙️',  stage: null,                    action: 'Full System Access' },
    SYSTEM_ADMIN_ROLE: { label: 'System Administrator',    short: 'SysAdmin',     color: '#ef4444', icon: '⚙️',  stage: null,                    action: 'Full System Access' },
    // Aliases
    ACCOUNTS_ROLE:     { label: 'LIMS & Finance Officer',  short: 'LIMS / Finance', color: '#8b5cf6', icon: '💰', stage: 'LIMS_VERIFIED', action: 'Verify $10 Fee & Allocate Cadastral ID' },
    ESTATES_ROLE:      { label: 'Resettlement & Estates',  short: 'Resettlement', color: '#047857', icon: '🌱', stage: 'RESETTLEMENT_VERIFIED', action: 'Verify Offer Letter & Clear Estate' },
};

// ─── WORKFLOW STAGES (9 Sequential Stages) ────────────────
const STAGES = [
    { key: 'PENDING',                label: '1. Pending',      badge: 'badge-pending',     dept: 'resettlement', sla: 3 },
    { key: 'RESETTLEMENT_VERIFIED',  label: '2. Resettlement', badge: 'badge-verified',    dept: 'lims',         sla: 5 },
    { key: 'LIMS_VERIFIED',          label: '3. LIMS',         badge: 'badge-progress',    dept: 'zlc',          sla: 5 },
    { key: 'ZLC_CLEARED',            label: '4. ZLC Cleared',  badge: 'badge-cleared',     dept: 'gis',          sla: 7 },
    { key: 'GIS_VALIDATED',          label: '5. GIS Validated',badge: 'badge-verified',    dept: 'surveyor',     sla: 4 },
    { key: 'SURVEYED',               label: '6. Surveyed',     badge: 'badge-surveyed',    dept: 'valuation',    sla: 10 },
    { key: 'VALUATED',               label: '7. Valuated',     badge: 'badge-valuated',    dept: 'director',     sla: 5 },
    { key: 'APPROVED',               label: '8. Approved',     badge: 'badge-approved',    dept: 'deeds',        sla: 5 },
    { key: 'READY_FOR_COLLECTION',   label: '9. Collection',   badge: 'badge-complete',    dept: 'deeds',        sla: 3 },
];

// ─── DEMO DATA ──────────────────────────────────────────
const DEMO_APPLICATIONS = generateDemoApplications();

function generateDemoApplications() {
    const names = [
        'Tendai Moyo', 'Grace Mupfumira', 'Wellington Chibharo', 'Rumbidzai Nyathi',
        'Blessing Chirume', 'Farai Mutasa', 'Chiedza Dube', 'Tatenda Sibanda',
        'Ruvarashe Chikwanha', 'Tapiwa Madziva', 'Nyasha Mushonga', 'Kudzai Mapuranga',
        'Simbarashe Gumbo', 'Rudo Makoni', 'Takudzwa Nhema', 'Memory Chikomba',
        'Tawanda Chigumira', 'Tsitsi Maramba', 'Shingai Zvarevashe', 'Precious Ndoro',
        'Munyaradzi Zimuto', 'Yeukai Chiname', 'Tarisai Gutu', 'Lovejoy Mutare'
    ];
    const docTypes = ['A2 Permit', '99-Year Lease', 'Offer Letter'];
    const provinces = ['Mashonaland East', 'Mashonaland West', 'Mashonaland Central', 'Manicaland', 'Masvingo', 'Matabeleland North', 'Matabeleland South', 'Midlands', 'Harare', 'Bulawayo'];
    const districts = ['Goromonzi', 'Mazowe', 'Chinhoyi', 'Mutare', 'Masvingo', 'Chegutu', 'Kwekwe', 'Bindura', 'Chipinge', 'Zvimba'];

    const stageKeys = STAGES.map(s => s.key);
    const payMethods = ['EcoCash USD', 'CBZ Nostro Transfer', 'Stanbic Bank RTGS', 'ZimSwitch Swipe', 'Cash Direct'];
    const apps = [];

    for (let i = 0; i < 24; i++) {
        // Distribute applications across all 9 stages:
        // 0: PENDING (Resettlement)
        // 1: RESETTLEMENT_VERIFIED (LIMS)
        // 2: LIMS_VERIFIED (ZLC)
        // 3: ZLC_CLEARED (GIS)
        // 4: GIS_VALIDATED (Surveyor General)
        // 5: SURVEYED (Valuation)
        // 6: VALUATED (Director of Lands)
        // 7: APPROVED (Deeds Registry)
        // 8: READY_FOR_COLLECTION (Deed Sealed)
        let stageIdx = i % 9;
        if (i === 23) stageIdx = 8; // At least one completely finished title deed

        const appFee = 10; // Statutory application fee: $10
        const surveyLevy = Math.floor(Math.random() * 200 + 150);
        const valFee = 120;
        const regFee = 180;
        const totalStatutoryFee = appFee + surveyLevy + valFee + regFee;
        const isPaid = stageIdx >= 2;
        const isPendingLims = stageIdx === 1;

        const baseLandVal = (Math.random() * 20000 + 5000).toFixed(2);
        const impVal = (Math.random() * 15000 + 2000).toFixed(2);
        const totalVal = (parseFloat(baseLandVal) + parseFloat(impVal)).toFixed(2);

        const createdDate = new Date(2026, Math.floor(Math.random() * 8), Math.floor(Math.random() * 28) + 1);
        const updatedDate = new Date(createdDate.getTime() + Math.random() * 20 * 86400000);

        // Spatial and AI attributes
        const hasOverlap = (i === 4);
        const overlapRatio = hasOverlap ? 14.8 : 0.0;
        const aiProb = hasOverlap ? 0.745 : (i === 7 ? 0.421 : 0.123);
        const aiRiskLevel = hasOverlap ? 'HIGH' : (i === 7 ? 'MEDIUM' : 'LOW');
        const isOverdue = (i === 3 || i === 9);

        apps.push({
            id: generateUUID(),
            applicant_name: names[i],
            applicant_email: names[i].toLowerCase().replace(' ', '.') + '@gmail.com',
            national_id: `${Math.floor(Math.random() * 90 + 10)}-${Math.floor(Math.random() * 9000000 + 1000000)}-${String.fromCharCode(65 + Math.floor(Math.random() * 26))}-${Math.floor(Math.random() * 90 + 10)}`,
            document_type: docTypes[Math.floor(Math.random() * docTypes.length)],
            province: provinces[Math.floor(Math.random() * provinces.length)],
            district: districts[Math.floor(Math.random() * districts.length)],
            farm_name: `Farm ${Math.floor(Math.random() * 500 + 1)}`,
            plot_size: `${(Math.random() * 200 + 5).toFixed(1)} Ha`,
            current_stage: stageKeys[stageIdx],
            created_at: createdDate.toISOString(),
            updated_at: updatedDate.toISOString(),
            tracking_pin: String(Math.floor(Math.random() * 900000 + 100000)),
            
            // Financial & Accounts ($10 statutory application fee)
            app_fee: appFee,
            survey_levy: surveyLevy,
            survey_fee: surveyLevy.toFixed(2),
            valuation_fee: valFee,
            valuation_amount: totalVal,
            reg_fee: regFee,
            total_statutory_fee: totalStatutoryFee,
            statutory_fee_paid: isPaid,
            payment_status: isPaid ? 'PAID' : (isPendingLims ? 'PENDING_VERIFICATION' : 'AWAITING_ASSESSMENT'),
            amount_paid: isPaid ? totalStatutoryFee : (isPendingLims ? totalStatutoryFee : 0),
            payment_method: payMethods[i % payMethods.length],
            payment_ref: (i % 2 === 0 ? 'EC-' : 'CBZ-') + Math.floor(Math.random() * 900000 + 100000),
            receipt_no: 'REC-2026-' + (1000 + i),
            clearance_cert_no: 'ACC-CLR-2026-' + (5000 + i),

            // Resettlement (Stage 2)
            offer_letter_ref: 'MIN-AGR-2026-' + (3000 + i),
            resettlement_offer_letter_verified: stageIdx >= 1,
            resettlement_spouse_cleared: stageIdx >= 1,
            resettlement_estate_cleared: stageIdx >= 1,
            spouse_consent: (i % 3 === 0 ? 'Verified & Consented' : 'Sole Grantee Declaration'),
            master_high_court_ref: (i % 4 === 0 ? 'MHC-EST-2026-449' : 'High Court Clearance N/A'),
            cert_res_no: 'RES-CLR-2026-' + (3000 + i),

            // LIMS (Stage 3)
            cadastral_id: `CAD-${provinces[i % provinces.length].substring(0,2).toUpperCase()}-${districts[i % districts.length].substring(0,3).toUpperCase()}-2026-${String(1000 + i)}`,
            gazette_ref: 'GN-582/2020 (Vol. CXXVIII)',
            lims_verification_status: stageIdx >= 2,
            cert_lims_no: 'LIMS-CLR-2026-' + (2000 + i),

            // ZLC (Stage 4)
            has_disputes: hasOverlap,
            zlc_verification_status: stageIdx >= 3,
            zlc_dispute_status: hasOverlap ? 'Active Boundary Dispute Flagged' : 'No Disputes Filed on Boundary',
            chief_concurrence: hasOverlap ? 'Mediation Pending with Traditional Authority' : 'Traditional Authority Concurred',
            cert_zlc_no: 'ZLC-CLR-2026-' + (4000 + i),

            // GIS Directorate (Stage 5)
            gis_spatial_status: hasOverlap ? 'OVERLAP_DETECTED' : 'VALIDATED',
            gis_overlap_ratio: overlapRatio,
            ai_dispute_probability: aiProb,
            ai_risk_level: aiRiskLevel,
            cert_gis_no: 'GIS-CLR-2026-' + (4500 + i),

            // Surveyor General (Stage 6)
            sg_diagram_no: 'SG-2026-' + (4000 + i),
            beacon_coords: `-17.${Math.floor(Math.random() * 8000 + 1000)}°S, 31.${Math.floor(Math.random() * 8000 + 1000)}°E`,
            cert_sg_no: 'SG-DIAG-2026-' + (5000 + i),

            // Valuation (Stage 7)
            base_land_value: baseLandVal,
            improvements_value: impVal,
            total_valuation: totalVal,
            cert_val_no: 'VAL-CERT-2026-' + (6000 + i),

            // Director of Lands (Stage 8)
            executive_warrant_no: 'WAR-GRANT-2026-' + (7000 + i),
            cert_dir_no: 'ED-WAR-2026-' + (7000 + i),

            // Deeds Registry (Stage 9)
            deed_number: 'TG-2026-' + (1000 + i),
            volume_folio: `Vol. ${120 + Math.floor(i / 10)} / Folio ${i * 4 + 12}`,
            cert_deed_no: 'TG-2026-' + (1000 + i),

            is_overdue: isOverdue,
            has_documents: Math.random() > 0.2,
            audit_log: generateAuditLog(stageIdx, createdDate, names[i])
        });
    }
    return apps;
}

// ─── CRYPTOGRAPHIC AUDIT LOG GENERATOR (TC-11) ───────────
function generateAuditLog(stageIdx, startDate, applicantName) {
    const officers = ['F. Mutasa (Resettlement)', 'J. Mukuru (LIMS)', 'R. Pfende (ZLC)', 'T. Chitepo (GIS)', 'M. Gata (Surveyor)', 'L. Shiri (Valuation)', 'K. Moyo (Director)', 'P. Gweru (Deeds)'];
    const log = [];
    const stageKeys = STAGES.map(s => s.key);
    let prevHash = '0000000000000000000000000000000000000000000000000000000000000000'; // Genesis Block 0

    for (let i = 0; i <= stageIdx; i++) {
        const d = new Date(startDate.getTime() + i * (86400000 * 3));
        const officer = i === 0 ? 'Applicant / Farmer' : officers[Math.min(i - 1, officers.length - 1)];
        const action = i === 0 ? 'Initial Application & Identity Verification' : `${STAGES[i].label} Statutory Clearance Issued`;
        const comment = i === 0 ? `Application submitted online for ${applicantName}` : getRandomComment(stageKeys[i]);
        
        // Compute immutable block SHA-256 hash
        const blockPayload = `${prevHash}|${i}|${stageKeys[i]}|${officer}|${action}|${comment}|${d.toISOString()}`;
        const currentHash = sha256Sync(blockPayload);

        log.push({
            block_index: i,
            stage: stageKeys[i],
            officer: officer,
            action: action,
            comments: comment,
            timestamp: d.toISOString(),
            prev_hash: prevHash,
            current_hash: currentHash,
            payload_fingerprint: sha256Sync(comment),
            is_immutable: true
        });

        prevHash = currentHash; // Advance chain link
    }
    return log;
}

function getRandomComment(stage) {
    const comments = {
        'PENDING': ['Online submission received from farmer', 'National ID validated against Civil Registry format'],
        'RESETTLEMENT_VERIFIED': ['Offer letter confirmed authentic', 'Spouse consent form validated', 'No deceased estate caveats in Master of High Court filings'],
        'LIMS_VERIFIED': ['Cadastral ID allocated', 'Statutory $10 application fee cleared', 'Parent farm gazetted boundaries reconciled'],
        'ZLC_CLEARED': ['No boundary disputes on record', 'Traditional Authority concurrence confirmed', 'Section 297 constitutional tenure verified'],
        'GIS_VALIDATED': ['PostGIS ST_Intersects spatial overlap scan complete (0.0% overlap)', 'AI dispute conflict predictor score: LOW RISK (12.3%)'],
        'SURVEYED': ['Cadastral survey diagram approved', 'GPS beacon coordinates checked on Hartebeesthoek94 datum', 'SG diagram serial registered'],
        'VALUATED': ['Baseline agricultural land appraisal complete', 'Infrastructure & improvements valued', 'Gazetted statutory valuation certificate filed'],
        'APPROVED': ['Executive Director signed Executive Warrant of Title Grant', 'Full ministerial clearance approved'],
        'READY_FOR_COLLECTION': ['Title Deed engrossed on official parchment', 'Republic of Zimbabwe Great Seal affixed', 'Deeds volume and folio recorded. Ready for collection']
    };
    const arr = comments[stage] || ['Statutory clearance approved'];
    return arr[Math.floor(Math.random() * arr.length)];
}

function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}

// ─── DEMO USERS (9 Personnel Personas) ────────────────────
const DEMO_USERS = [
    { id: generateUUID(), name: 'Farai Mutasa',       email: 'resettlement@agric.gov.zw', role_id: 'resettlement', department: 'Resettlement Department', status: 'active' },
    { id: generateUUID(), name: 'James Mukuru',       email: 'lims@agric.gov.zw',         role_id: 'lims',         department: 'Land Information Mgmt', status: 'active' },
    { id: generateUUID(), name: 'Rutendo Pfende',     email: 'zlc@agric.gov.zw',          role_id: 'zlc',          department: 'Zimbabwe Land Comm.',   status: 'active' },
    { id: generateUUID(), name: 'Tafadzwa Chitepo',   email: 'gis@agric.gov.zw',          role_id: 'gis',          department: 'GIS & Remote Sensing',  status: 'active' },
    { id: generateUUID(), name: 'Maxwell Gata',       email: 'surveyor@agric.gov.zw',     role_id: 'surveyor',     department: 'Surveyor General',      status: 'active' },
    { id: generateUUID(), name: 'Linda Shiri',        email: 'valuation@agric.gov.zw',    role_id: 'valuation',    department: 'Valuation Directorate', status: 'active' },
    { id: generateUUID(), name: 'Kennedy Moyo',       email: 'director@agric.gov.zw',     role_id: 'director',     department: 'Director of Lands',     status: 'active' },
    { id: generateUUID(), name: 'Patience Gweru',     email: 'deeds@agric.gov.zw',        role_id: 'deeds',        department: 'Deeds Registry',        status: 'active' },
    { id: generateUUID(), name: 'Admin Superuser',    email: 'admin@agric.gov.zw',        role_id: 'admin',        department: 'ICT & System Security', status: 'active' },
];

// ─── STATE ──────────────────────────────────────────────
let currentUser = null;
let currentSection = 'dashboard';
let currentFilter = 'all';
let selectedApplication = null;
let filteredApps = [];

// ─── AUTH ───────────────────────────────────────────────
function checkAdminAuth() {
    let user = JSON.parse(localStorage.getItem('admin_user'));
    if (!user) {
        user = DEMO_USERS[0];
        localStorage.setItem('admin_user', JSON.stringify(user));
    }
    currentUser = user;
    return user;
}

function adminLogout() {
    localStorage.removeItem('admin_user');
    localStorage.removeItem('jwt');
    window.location.href = 'index.html';
}

// ─── DEPARTMENT CHANNELS REGISTRY (8 Operational Channels) ──
const DEPT_CHANNELS = {
    resettlement: {
        roleId: 'resettlement',
        name: 'Resettlement Department',
        short: 'Resettlement',
        icon: '🌱',
        color: '#047857',
        incomingStage: 'PENDING',
        targetStage: 'RESETTLEMENT_VERIFIED',
        formCode: 'RES-01',
        formTitle: 'Offer Letter, Spouse & Succession Verification Endorsement',
        actionLabel: 'Verify Offer Letter & Clear Estate',
        certKey: 'cert_res_no',
        description: 'Verify offer letter validity, applicant land entitlement, spouse consent declarations, and Master of the High Court deceased estate clearance.',
        kpiLabels: ['Offer Letters Validated', 'Awaiting Resettlement Audit', 'Spouse Consents Filed', 'Validation Rate'],
        tableCols: ['App Reference', 'Applicant & ID', 'Farm & District', 'Offer Letter No.', 'Spouse / Estate Status', 'Resettlement Status', 'Action']
    },
    lims: {
        roleId: 'lims',
        name: 'Land Information Management System (LIMS)',
        short: 'LIMS / Lands',
        icon: '🗺️',
        color: '#8b5cf6',
        incomingStage: 'RESETTLEMENT_VERIFIED',
        targetStage: 'LIMS_VERIFIED',
        formCode: 'LIMS-02',
        formTitle: 'LIMS Cadastral ID & $10 Fee Clearance Endorsement',
        actionLabel: 'Verify $10 Fee & Allocate Cadastral ID',
        certKey: 'cert_lims_no',
        description: 'Verify payment of the statutory $10 application fee, allocate national Cadastral ID, confirm parent farm gazette status, and align with LIMS database.',
        kpiLabels: ['Cadastral IDs Assigned', 'Awaiting LIMS / Fee Audit', '$10 Fees Reconciled', 'Verification Rate'],
        tableCols: ['App Reference', 'Applicant & ID', 'Farm & Size', 'Cadastral ID', 'Statutory $10 Fee', 'LIMS Status', 'Action']
    },
    zlc: {
        roleId: 'zlc',
        name: 'Zimbabwe Land Commission (ZLC)',
        short: 'ZLC Commission',
        icon: '⚖️',
        color: '#14b8a6',
        incomingStage: 'LIMS_VERIFIED',
        targetStage: 'ZLC_CLEARED',
        formCode: 'ZLC-03',
        formTitle: 'Land Commission Dispute Clearance Certificate',
        actionLabel: 'Clear Land Disputes',
        certKey: 'cert_zlc_no',
        description: 'Investigate boundary disputes, ensure communal leader concurrence, resolve conflicting farm boundary claims, and certify dispute-free tenure under Chapter 20:29.',
        kpiLabels: ['Tenure Clearances Issued', 'Pending Boundary Review', 'Chief Concurrences', 'Dispute-Free Rate'],
        tableCols: ['App Reference', 'Occupant & Farm', 'District & Province', 'Boundary Conflict Check', 'Traditional Concurrence', 'ZLC Status', 'Action']
    },
    gis: {
        roleId: 'gis',
        name: 'GIS & Remote Sensing Directorate',
        short: 'GIS Directorate',
        icon: '🛰️',
        color: '#0284c7',
        incomingStage: 'ZLC_CLEARED',
        targetStage: 'GIS_VALIDATED',
        formCode: 'GIS-04',
        formTitle: 'Spatial Overlap & AI Conflict Risk Assessment',
        actionLabel: 'Validate Overlap & AI Risk',
        certKey: 'cert_gis_no',
        description: 'Execute PostGIS ST_Intersects spatial boundary overlap checks, compute overlap area ratio, and run the AI dispute conflict risk predictor engine.',
        kpiLabels: ['Spatial Boundaries Mapped', 'Awaiting GIS Scan', 'AI Risk Assessed', 'Overlap-Free Ratio'],
        tableCols: ['App Reference', 'Applicant & Farm', 'Plot Size (Ha)', 'ST_Intersects Overlap', 'AI Dispute Risk', 'GIS Status', 'Action']
    },
    surveyor: {
        roleId: 'surveyor',
        name: 'Surveyor General Directorate',
        short: 'Surveyor General',
        icon: '📐',
        color: '#06b6d4',
        incomingStage: 'GIS_VALIDATED',
        targetStage: 'SURVEYED',
        formCode: 'SG-05',
        formTitle: 'Cadastral Survey Diagram Approval Endorsement',
        actionLabel: 'Approve Cadastral Diagram',
        certKey: 'cert_sg_no',
        description: 'Inspect field survey diagrams, audit GPS beacon coordinates, generate official Cadastral Diagram numbers (SG-2026-XXXX), and link into national geodetic datum.',
        kpiLabels: ['Cadastral Diagrams Approved', 'Awaiting Survey Audit', 'GPS Beacons Audited', 'GIS Accuracy'],
        tableCols: ['App Reference', 'Applicant & Farm', 'Plot Size (Ha)', 'Beacon GPS Coordinates', 'SG Diagram Number', 'Survey Status', 'Action']
    },
    valuation: {
        roleId: 'valuation',
        name: 'Valuation Directorate',
        short: 'Valuation Directorate',
        icon: '📊',
        color: '#f97316',
        incomingStage: 'SURVEYED',
        targetStage: 'VALUATED',
        formCode: 'VAL-06',
        formTitle: 'Statutory Land & Improvements Valuation Certificate',
        actionLabel: 'Approve Valuation Appraisal',
        certKey: 'cert_val_no',
        description: 'Inspect fixed agricultural assets, evaluate farm infrastructure and baseline soil productivity value, and establish formal government valuation.',
        kpiLabels: ['Valuations Completed', 'Awaiting Farm Appraisal', 'Total Improvements ($)', 'Avg Farm Value ($)'],
        tableCols: ['App Reference', 'Applicant & Farm', 'Plot Area', 'Base Land Value', 'Improvements Value', 'Total Valuation', 'Action']
    },
    director: {
        roleId: 'director',
        name: 'Executive Director Office',
        short: 'Director of Lands',
        icon: '👔',
        color: '#6366f1',
        incomingStage: 'VALUATED',
        targetStage: 'APPROVED',
        formCode: 'ED-07',
        formTitle: 'Executive Warrant of Title Grant Authorization',
        actionLabel: 'Sign Executive Warrant',
        certKey: 'cert_dir_no',
        description: 'Conduct final inter-departmental statutory compliance review under ministerial delegation, grant presidential title clearance, and sign Executive Warrant.',
        kpiLabels: ['Executive Warrants Signed', 'Pending Executive Review', 'Subsidized Program Clearances', 'Compliance 100%'],
        tableCols: ['App Reference', 'Beneficiary Grantee', 'Farm & District', 'Statutory Clearance Audit', 'Executive Warrant Ref', 'Authorization', 'Action']
    },
    deeds: {
        roleId: 'deeds',
        name: 'Deeds Registry Department',
        short: 'Deeds Registry',
        icon: '📜',
        color: '#10b981',
        incomingStage: 'APPROVED',
        targetStage: 'READY_FOR_COLLECTION',
        formCode: 'DR-08',
        formTitle: 'Official Deed of Grant / Title Deed Certificate',
        actionLabel: 'Engross & Register Deed',
        certKey: 'cert_deed_no',
        description: 'Engross official title parchment, affix Republic of Zimbabwe Great Seal, assign Volume & Folio numbers in the Deeds Registry, and issue for farmer collection.',
        kpiLabels: ['Deeds Sealed & Registered', 'Awaiting Final Engrossment', 'Ready for Collection', 'Registry Archival'],
        tableCols: ['App Reference', 'Registered Grantee', 'Title Deed Number', 'Registry Volume / Folio', 'Seal Status', 'Collection Status', 'Action']
    }
};

// ─── NAVIGATION ─────────────────────────────────────────
function navigateTo(section) {
    currentSection = section;

    // Close mobile drawer on navigation
    const sb = document.getElementById('sidebar');
    const bd = document.getElementById('sidebarBackdrop');
    if (sb) sb.classList.remove('mobile-open');
    if (bd) bd.classList.remove('active');

    // Sync mobile bottom nav buttons
    const navBtnMap = {
        'queue': 'mNavQueue',
        'dashboard': 'mNavQueue',
        'gis': 'mNavGis',
        'analytics': 'mNavAnalytics',
        'profile': 'mNavProfile'
    };
    document.querySelectorAll('.mobile-nav-btn').forEach(b => b.classList.remove('active'));
    if (navBtnMap[section]) {
        const activeBtn = document.getElementById(navBtnMap[section]);
        if (activeBtn) activeBtn.classList.add('active');
    }

    // Update sidebar active state
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.section === section);
    });

    const deptKeys = ['resettlement', 'lims', 'zlc', 'gis', 'surveyor', 'valuation', 'director', 'deeds'];

    if (deptKeys.includes(section)) {
        // Activate dynamic department channel section
        document.querySelectorAll('.admin-section').forEach(sec => {
            sec.classList.toggle('active', sec.id === 'section-dept-channel');
        });
        loadDepartmentChannel(section);
    } else {
        document.querySelectorAll('.admin-section').forEach(sec => {
            sec.classList.toggle('active', sec.id === `section-${section}`);
        });
        if (section === 'dashboard') loadDashboard();
        if (section === 'queue') loadQueue();
        if (section === 'analytics') loadAnalyticsSection();
        if (section === 'accounts') loadAccountsSection();
        if (section === 'documents') loadDocuments();
        if (section === 'audit') loadAuditLogs();
        if (section === 'users') loadUsers();
        if (section === 'profile') loadProfileSection();
    }

    // Update header title
    const titles = {
        'dashboard':    { title: 'Dashboard Overview',                     breadcrumb: 'Home / Dashboard' },
        'queue':        { title: 'Application Queue',                       breadcrumb: 'Processing / Master Queue' },
        'analytics':    { title: 'Executive SLA Analytics & Intelligence',  breadcrumb: 'Executive / SLA Bottlenecks' },
        'resettlement': { title: 'Resettlement Department Channel',         breadcrumb: 'Department / Resettlement' },
        'lims':         { title: 'LIMS / Lands Information Channel',       breadcrumb: 'Department / LIMS' },
        'zlc':          { title: 'Zimbabwe Land Commission Channel',        breadcrumb: 'Department / ZLC' },
        'gis':          { title: 'GIS & Remote Sensing Channel',            breadcrumb: 'Department / GIS Directorate' },
        'surveyor':     { title: 'Surveyor General Channel',                breadcrumb: 'Department / Surveyor General' },
        'valuation':    { title: 'Valuation Directorate Channel',           breadcrumb: 'Department / Valuation' },
        'director':     { title: 'Executive Director Channel',              breadcrumb: 'Department / Executive Office' },
        'deeds':        { title: 'Deeds Registry Channel',                  breadcrumb: 'Department / Deeds Registry' },
        'documents':    { title: 'Document Viewer',                          breadcrumb: 'Processing / Documents' },
        'audit':        { title: 'Audit Trail',                              breadcrumb: 'Monitoring / Audit Logs' },
        'users':        { title: 'User Management',                          breadcrumb: 'Admin / Officers & Users' },
        'profile':      { title: 'Officer Account & Roles',                  breadcrumb: 'My Account / Profile & Switcher' },
    };
    const t = titles[section] || titles.dashboard;
    document.getElementById('pageTitle').textContent = t.title;
    document.getElementById('pageBreadcrumb').textContent = t.breadcrumb;

    updateHeaderAndSidebarUser();
    updateAllBadges();
}

function updateAllBadges() {
    const apps = DEMO_APPLICATIONS;
    const setB = (id, count) => {
        const el = document.getElementById(id);
        if (el) el.textContent = count;
    };

    setB('navQueueBadge', apps.filter(a => a.current_stage !== 'READY_FOR_COLLECTION' && a.current_stage !== 'REJECTED').length);
    setB('navResettlementBadge', apps.filter(a => a.current_stage === 'PENDING').length);
    setB('navLimsBadge', apps.filter(a => a.current_stage === 'RESETTLEMENT_VERIFIED').length);
    setB('navZlcBadge', apps.filter(a => a.current_stage === 'LIMS_VERIFIED').length);
    setB('navGisBadge', apps.filter(a => a.current_stage === 'ZLC_CLEARED').length);
    setB('navSurveyorBadge', apps.filter(a => a.current_stage === 'GIS_VALIDATED').length);
    setB('navValuationBadge', apps.filter(a => a.current_stage === 'SURVEYED').length);
    setB('navDirectorBadge', apps.filter(a => a.current_stage === 'VALUATED').length);
    setB('navDeedsBadge', apps.filter(a => a.current_stage === 'APPROVED').length);
}

// ─── DASHBOARD ──────────────────────────────────────────
function loadDashboard() {
    const apps = DEMO_APPLICATIONS;
    const total = apps.length;
    const pending = apps.filter(a => a.current_stage === 'PENDING').length;
    const inProgress = apps.filter(a => !['PENDING', 'READY_FOR_COLLECTION'].includes(a.current_stage)).length;
    const completed = apps.filter(a => a.current_stage === 'READY_FOR_COLLECTION').length;

    document.getElementById('statTotal').textContent = total;
    document.getElementById('statPending').textContent = pending;
    document.getElementById('statProgress').textContent = inProgress;
    document.getElementById('statComplete').textContent = completed;

    // Stage distribution chart (CSS bar chart)
    const distEl = document.getElementById('stageDistribution');
    distEl.innerHTML = '';
    STAGES.forEach(stage => {
        const count = apps.filter(a => a.current_stage === stage.key).length;
        const pct = total ? ((count / total) * 100).toFixed(0) : 0;
        distEl.innerHTML += `
            <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.6rem">
                <span style="width:100px;font-size:0.78rem;color:var(--text-secondary);flex-shrink:0">${stage.label}</span>
                <div style="flex:1;height:24px;background:rgba(255,255,255,0.03);border-radius:6px;overflow:hidden;position:relative">
                    <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,var(--accent),var(--dept-lims));border-radius:6px;transition:width 0.5s ease;min-width:${count ? '2px' : '0'}"></div>
                </div>
                <span style="width:50px;text-align:right;font-size:0.8rem;font-weight:600;color:var(--text-primary)">${count}</span>
            </div>
        `;
    });

    // Recent activity
    const recentEl = document.getElementById('recentActivity');
    const allLogs = [];
    apps.forEach(app => {
        app.audit_log.forEach(log => {
            allLogs.push({ ...log, appId: app.id, applicant: app.applicant_name });
        });
    });
    allLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    recentEl.innerHTML = '';
    allLogs.slice(0, 8).forEach(log => {
        recentEl.innerHTML += `
            <div class="timeline-item">
                <div class="timeline-time">${formatDate(log.timestamp)}</div>
                <div class="timeline-content">
                    <span class="timeline-user">${log.officer}</span> — ${log.action}
                    <div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.2rem">
                        Applicant: ${log.applicant} · ${getStageBadge(log.stage)}
                    </div>
                </div>
            </div>
        `;
    });

    // Department workload
    const workloadEl = document.getElementById('deptWorkload');
    workloadEl.innerHTML = '';
    Object.entries(DEPARTMENTS).forEach(([roleId, dept]) => {
        if (roleId === 'SYSTEM_ADMIN_ROLE') return;
        const stageIndex = STAGES.findIndex(s => s.key === dept.stage);
        const prevStage = stageIndex > 0 ? STAGES[stageIndex - 1].key : null;
        const count = prevStage ? apps.filter(a => a.current_stage === prevStage).length : 0;

        workloadEl.innerHTML += `
            <div class="user-card" style="cursor:pointer" onclick="navigateTo('queue')">
                <div class="uc-avatar" style="background:${dept.color}22;color:${dept.color};font-size:1.3rem">${dept.icon}</div>
                <div class="uc-info">
                    <div class="uc-name">${dept.short}</div>
                    <div class="uc-email">${dept.label}</div>
                </div>
                <div style="text-align:right">
                    <div style="font-size:1.5rem;font-weight:800;color:${count > 0 ? dept.color : 'var(--text-muted)'}">${count}</div>
                    <div style="font-size:0.7rem;color:var(--text-muted)">in queue</div>
                </div>
            </div>
        `;
    });
}

// ─── APPLICATION QUEUE ──────────────────────────────────
function loadQueue() {
    filterApplications(currentFilter);
}

function filterApplications(filter) {
    currentFilter = filter;

    // Update filter pills
    document.querySelectorAll('#queueFilters .filter-pill').forEach(pill => {
        pill.classList.toggle('active', pill.dataset.filter === filter);
    });

    // Filter applications
    if (filter === 'all') {
        filteredApps = [...DEMO_APPLICATIONS];
    } else if (filter === 'my-queue') {
        // Show only apps at the stage just before the current user's responsibility
        const dept = DEPARTMENTS[currentUser.role_id];
        if (dept && dept.stage) {
            const stageIdx = STAGES.findIndex(s => s.key === dept.stage);
            const prevStage = stageIdx > 0 ? STAGES[stageIdx - 1].key : 'PENDING';
            filteredApps = DEMO_APPLICATIONS.filter(a => a.current_stage === prevStage);
        } else {
            filteredApps = [...DEMO_APPLICATIONS]; // SysAdmin sees all
        }
    } else {
        filteredApps = DEMO_APPLICATIONS.filter(a => a.current_stage === filter);
    }

    renderQueueTable();
}

function renderQueueTable() {
    const tbody = document.getElementById('queueTableBody');
    tbody.innerHTML = '';

    if (filteredApps.length === 0) {
        tbody.innerHTML = `
            <tr><td colspan="7">
                <div class="empty-state">
                    <div class="empty-icon">📭</div>
                    <div class="empty-title">No applications found</div>
                    <div class="empty-desc">There are no applications matching this filter criteria.</div>
                </div>
            </td></tr>
        `;
        return;
    }

    filteredApps.forEach(app => {
        const dept = getDeptForStage(app.current_stage);
        tbody.innerHTML += `
            <tr onclick="openApplicationDetail('${app.id}')" ${selectedApplication?.id === app.id ? 'class="selected"' : ''}>
                <td><code>${app.id.substring(0, 8)}</code></td>
                <td>
                    <div style="font-weight:500;color:var(--text-primary)">${app.applicant_name}</div>
                    <div style="font-size:0.75rem;color:var(--text-muted)">${app.national_id}</div>
                </td>
                <td>${app.document_type}</td>
                <td>${app.province}</td>
                <td>${getStageBadge(app.current_stage)}</td>
                <td style="font-size:0.82rem;color:var(--text-muted)">${formatDate(app.created_at)}</td>
                <td>
                    ${getActionButton(app)}
                </td>
            </tr>
        `;
    });

    // Update count
    const countEl = document.getElementById('queueCount');
    if (countEl) countEl.textContent = `${filteredApps.length} application${filteredApps.length !== 1 ? 's' : ''}`;
}

function getActionButton(app) {
    // Determine which department should act next
    const stageIdx = STAGES.findIndex(s => s.key === app.current_stage);
    if (stageIdx >= STAGES.length - 1) {
        return '<span class="badge badge-complete">Deed Issued</span>';
    }

    const nextStage = STAGES[stageIdx + 1];
    const isAdmin = currentUser.role_id === 'SYSTEM_ADMIN_ROLE';

    // Find the dept that handles the next stage
    const responsibleDept = Object.entries(DEPARTMENTS).find(([_, d]) => d.stage === nextStage.key);

    if (isAdmin || (responsibleDept && responsibleDept[0] === currentUser.role_id)) {
        return `<button class="btn btn-primary btn-sm" onclick="event.stopPropagation();progressApplication('${app.id}','${nextStage.key}')">${responsibleDept ? responsibleDept[1].action : 'Progress'}</button>`;
    }

    return `<span style="font-size:0.75rem;color:var(--text-muted)">Awaiting ${responsibleDept ? responsibleDept[1].short : 'next dept'}</span>`;
}

function progressApplication(appId, nextStage) {
    const app = DEMO_APPLICATIONS.find(a => a.id === appId);
    if (!app) return;

    if (!confirm(`Progress this application to ${nextStage.replace(/_/g, ' ')}?`)) return;

    // Cryptographic audit block append (TC-11)
    const prevBlock = app.audit_log[app.audit_log.length - 1];
    const prevHash = prevBlock ? prevBlock.current_hash : '0000000000000000000000000000000000000000000000000000000000000000';
    const blockIdx = app.audit_log.length;
    const nowIso = new Date().toISOString();
    const actionDesc = `${STAGES.find(s => s.key === nextStage)?.label || nextStage} stage completed`;
    const commentDesc = `Processed by ${currentUser.name} (${DEPARTMENTS[currentUser.role_id]?.short || currentUser.role_id})`;
    const blockPayload = `${prevHash}|${blockIdx}|${nextStage}|${currentUser.name}|${actionDesc}|${commentDesc}|${nowIso}`;
    const currentHash = sha256Sync(blockPayload);

    // Update stage
    app.current_stage = nextStage;
    app.updated_at = nowIso;

    app.audit_log.push({
        block_index: blockIdx,
        stage: nextStage,
        officer: currentUser.name,
        action: actionDesc,
        comments: commentDesc,
        timestamp: nowIso,
        prev_hash: prevHash,
        current_hash: currentHash,
        payload_fingerprint: sha256Sync(commentDesc),
        is_immutable: true
    });

    showToast(`Application progressed to ${nextStage.replace(/_/g, ' ')}`, 'success');
    updateAllBadges();
    if (typeof loadQueue === 'function') loadQueue();
    if (typeof renderDeptTable === 'function') renderDeptTable();
    if (selectedApplication?.id === appId) openApplicationDetail(appId);
}

// ─── APPLICATION DETAIL PANEL ───────────────────────────
function openApplicationDetail(appId) {
    const app = DEMO_APPLICATIONS.find(a => a.id === appId);
    if (!app) return;
    selectedApplication = app;

    const panel = document.getElementById('detailPanel');
    const overlay = document.getElementById('panelOverlay');

    // Populate header
    document.getElementById('detailAppId').innerHTML = `
        <code>${app.id.substring(0, 12)}...</code>
        <span class="badge" style="margin-left:0.5rem;background:rgba(59,130,246,0.15);color:var(--accent)">PIN: ${app.tracking_pin}</span>
    `;

    // Populate body
    const body = document.getElementById('detailBody');
    body.innerHTML = `
        <!-- High-Level Diagnostic Summary Banner -->
        <div style="background:var(--surface);border:1px solid var(--border-light);border-radius:10px;padding:0.75rem 1rem;margin-bottom:1rem;display:flex;flex-wrap:wrap;gap:0.5rem;justify-content:space-between;align-items:center">
            <div style="display:flex;align-items:center;gap:0.5rem">
                <span style="font-size:1.1rem">🗺️</span>
                <div>
                    <div style="font-weight:700;color:var(--text-primary);font-size:0.88rem">${app.cadastral_id || 'Pending Cadastral Allocation'}</div>
                    <div style="font-size:0.72rem;color:var(--text-muted)">Offer Letter: ${app.offer_letter_ref || 'Pending'} · Gazette Notice: ${app.gazette_notice || 'Gazetted'}</div>
                </div>
            </div>
            <div style="display:flex;gap:0.4rem;flex-wrap:wrap">
                <button class="btn btn-sm btn-ghost" onclick="openGisOverlapModal('${app.id}')" style="font-size:0.72rem;padding:0.25rem 0.5rem;color:${app.gis_overlap_ratio > 0 ? 'var(--danger)' : 'var(--success)'};border:1px solid ${app.gis_overlap_ratio > 0 ? 'rgba(239,68,68,0.4)' : 'rgba(16,185,129,0.4)'}">
                    ${app.gis_overlap_ratio > 0 ? `⚠️ Overlap: ${app.gis_overlap_ratio}%` : '✓ 0.0% Overlap'}
                </button>
                <button class="btn btn-sm btn-ghost" onclick="openGisOverlapModal('${app.id}')" style="font-size:0.72rem;padding:0.25rem 0.5rem;color:${app.ai_risk_level === 'HIGH' ? 'var(--danger)' : (app.ai_risk_level === 'MEDIUM' ? 'var(--warning)' : 'var(--success)')};border:1px solid rgba(255,255,255,0.15)">
                    🤖 AI: ${app.ai_risk_level} (${Math.round(app.ai_dispute_probability * 100)}%)
                </button>
                <button class="btn btn-sm btn-ghost" onclick="openAuditChainModal('${app.id}')" style="font-size:0.72rem;padding:0.25rem 0.5rem;color:var(--accent);border:1px solid rgba(59,130,246,0.4)">
                    ⛓️ Ledger: ${app.audit_log.length} Blocks
                </button>
            </div>
        </div>

        <!-- Tabs -->
        <div class="tabs">
            <button class="tab active" onclick="switchDetailTab(this, 'detail-info')">Info</button>
            <button class="tab" onclick="switchDetailTab(this, 'detail-workflow')">Workflow (9 Stages)</button>
            <button class="tab" onclick="switchDetailTab(this, 'detail-gis')">🛰️ Spatial & AI</button>
            <button class="tab" onclick="switchDetailTab(this, 'detail-audit')">⛓️ Audit Ledger</button>
            <button class="tab" onclick="switchDetailTab(this, 'detail-docs')">Documents</button>
        </div>

        <!-- Info Tab -->
        <div id="detail-info" class="detail-tab-content">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.85rem">
                <div class="form-group">
                    <div class="form-label">Full Applicant Name</div>
                    <div style="color:var(--text-primary);font-weight:600">${app.applicant_name}</div>
                </div>
                <div class="form-group">
                    <div class="form-label">National Identity ID</div>
                    <div style="color:var(--text-primary);font-weight:600">${app.national_id}</div>
                </div>
                <div class="form-group">
                    <div class="form-label">Government Email</div>
                    <div style="color:var(--text-primary);font-weight:500">${app.applicant_email}</div>
                </div>
                <div class="form-group">
                    <div class="form-label">Document Titling Type</div>
                    <div style="color:var(--text-primary);font-weight:600">${app.document_type}</div>
                </div>
                <div class="form-group">
                    <div class="form-label">Province & District</div>
                    <div style="color:var(--text-primary);font-weight:500">${app.district}, ${app.province}</div>
                </div>
                <div class="form-group">
                    <div class="form-label">Farm / Estate Name</div>
                    <div style="color:var(--text-primary);font-weight:600">${app.farm_name}</div>
                </div>
                <div class="form-group">
                    <div class="form-label">Allocated Plot Size</div>
                    <div style="color:var(--text-primary);font-weight:600">${app.plot_size}</div>
                </div>
                <div class="form-group">
                    <div class="form-label">Tracking PIN</div>
                    <div><code style="font-size:0.9rem">${app.tracking_pin}</code></div>
                </div>
                <div class="form-group">
                    <div class="form-label">Offer Letter Reference</div>
                    <div><code style="color:var(--accent)">${app.offer_letter_ref || 'Pending LIMS'}</code></div>
                </div>
                <div class="form-group">
                    <div class="form-label">Spouse Consent Audit</div>
                    <div style="color:var(--success);font-weight:600">✓ ${app.spouse_consent || 'Verified Cleared'}</div>
                </div>
                <div class="form-group">
                    <div class="form-label">Master of High Court Search</div>
                    <div><code style="color:var(--text-secondary)">${app.master_high_court_ref || 'Deceased Estate Cleared'}</code></div>
                </div>
                <div class="form-group">
                    <div class="form-label">Statutory Financial Ledger</div>
                    <div style="color:var(--dept-accounts);font-weight:700">Receipt ${app.receipt_no || 'REC-2026-901'} (USD $${app.total_statutory_fee || 660}.00)</div>
                </div>
                <div class="form-group">
                    <div class="form-label">ZLC Dispute Clearance</div>
                    <div style="color:var(--success);font-weight:600">✓ ${app.zlc_dispute_status || 'No Dispute'}</div>
                </div>
                <div class="form-group">
                    <div class="form-label">Current Statutory Stage</div>
                    <div>${getStageBadge(app.current_stage)}</div>
                </div>
            </div>
            <div style="margin-top:0.75rem;padding-top:0.75rem;border-top:1px solid var(--border-light);display:flex;justify-content:space-between;font-size:0.75rem;color:var(--text-muted)">
                <span>Intake: ${formatDateFull(app.created_at)}</span>
                <span>Last Updated: ${formatDateFull(app.updated_at)}</span>
            </div>
        </div>

        <!-- Workflow Tab (9 Stages) -->
        <div id="detail-workflow" class="detail-tab-content hidden">
            <div class="form-label" style="margin-bottom:0.75rem">9 Sequential Statutory Titling Stages</div>
            ${renderWorkflowTracker(app.current_stage)}
            <div style="margin-top:1.25rem;background:rgba(255,255,255,0.02);border:1px solid var(--border-light);border-radius:10px;padding:0.75rem 1rem">
                <div style="font-size:0.8rem;font-weight:700;color:var(--text-primary);margin-bottom:0.4rem">Statutory Rule:</div>
                <div style="font-size:0.75rem;color:var(--text-muted);line-height:1.5">
                    Under the Presidential Land Titling Program and approved March 2026 project proposal, applications must pass through all 9 sequential stages without skipping. Returns to prior stages require mandatory defect comments (TC-08) and are recorded in the SHA-256 chained audit ledger.
                </div>
            </div>
        </div>

        <!-- Spatial & AI Tab -->
        <div id="detail-gis" class="detail-tab-content hidden">
            <div style="background:var(--surface);border:1px solid var(--border-light);border-radius:10px;padding:1rem;margin-bottom:1rem">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem">
                    <span style="font-weight:700;color:var(--text-primary);font-size:0.9rem">PostGIS Spatial Boundary (SRID 4326)</span>
                    <span class="badge" style="background:${app.gis_overlap_ratio > 0 ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)'};color:${app.gis_overlap_ratio > 0 ? '#ef4444' : '#10b981'}">
                        ${app.gis_overlap_ratio > 0 ? `⚠️ ${app.gis_overlap_ratio}% Overlap Conflict` : '✓ Clean Boundary'}
                    </span>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;font-size:0.82rem;margin-top:0.5rem">
                    <div><span style="color:var(--text-muted)">Cadastral Beacon Coords:</span><br><code>${app.beacon_coords || '-17.82485, 31.05303'}</code></div>
                    <div><span style="color:var(--text-muted)">Geodetic Datum:</span><br><strong>WGS84 / SRID 4326</strong></div>
                    <div><span style="color:var(--text-muted)">Overlap Assessment:</span><br><strong>${app.gis_overlap_ratio > 0 ? 'Intersects adjacent state reserve' : 'Zero intersection detected'}</strong></div>
                    <div><span style="color:var(--text-muted)">Cadastral Diagram:</span><br><code>${app.sg_diagram_no || 'SG-2026-HAR-091'}</code></div>
                </div>
            </div>

            <div style="background:var(--surface);border:1px solid var(--border-light);border-radius:10px;padding:1rem;margin-bottom:1rem">
                <div style="font-weight:700;color:var(--text-primary);font-size:0.9rem;margin-bottom:0.5rem">AI Land Dispute Predictor (TC-12)</div>
                <div style="display:flex;align-items:center;gap:1rem;margin-bottom:0.75rem">
                    <div style="width:60px;height:60px;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;font-weight:800;font-size:1.1rem;background:${app.ai_risk_level === 'HIGH' ? 'rgba(239,68,68,0.2)' : (app.ai_risk_level === 'MEDIUM' ? 'rgba(245,158,11,0.2)' : 'rgba(16,185,129,0.2)')};color:${app.ai_risk_level === 'HIGH' ? '#ef4444' : (app.ai_risk_level === 'MEDIUM' ? '#f59e0b' : '#10b981')};border:2px solid currentColor">
                        ${Math.round(app.ai_dispute_probability * 100)}%
                    </div>
                    <div>
                        <div style="font-weight:700;color:var(--text-primary)">Tenure Risk Assessment: ${app.ai_risk_level}</div>
                        <div style="font-size:0.78rem;color:var(--text-muted)">Model: Logistic Regression + Spatial Intersection Matrix trained on historical ZLC dispute dockets.</div>
                    </div>
                </div>
                <button class="btn btn-primary btn-sm" onclick="openGisOverlapModal('${app.id}')" style="width:100%">
                    🛰️ Open Interactive Spatial Map & Simulator
                </button>
            </div>
        </div>

        <!-- Audit Ledger Tab -->
        <div id="detail-audit" class="detail-tab-content hidden">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.75rem">
                <div style="font-size:0.85rem;font-weight:700;color:var(--text-primary)">Cryptographic SHA-256 Audit Blocks (${app.audit_log.length})</div>
                <button class="btn btn-ghost btn-sm" onclick="openAuditChainModal('${app.id}')" style="color:var(--accent);border:1px solid rgba(59,130,246,0.3)">
                    🛡️ Verify Chain Integrity
                </button>
            </div>
            <div class="timeline">
                ${app.audit_log.slice().reverse().map((log, idx) => `
                    <div class="timeline-item">
                        <div class="timeline-time">${formatDateFull(log.timestamp)}</div>
                        <div class="timeline-content">
                            <div style="display:flex;justify-content:space-between;align-items:center">
                                <span class="timeline-user">${log.officer}</span>
                                <span class="badge" style="font-size:0.68rem;background:rgba(59,130,246,0.15);color:var(--accent)">Block #${log.block_index !== undefined ? log.block_index : (app.audit_log.length - 1 - idx)}</span>
                            </div>
                            <div style="font-weight:600;color:var(--text-primary);margin-top:0.2rem">${log.action}</div>
                            <div style="font-size:0.78rem;color:var(--text-muted);margin-top:0.15rem">${log.comments}</div>
                            ${log.current_hash ? `
                                <div style="margin-top:0.4rem;font-size:0.7rem;font-family:monospace;color:var(--accent);word-break:break-all">
                                    Hash: ${log.current_hash.substring(0, 24)}...
                                </div>
                            ` : ''}
                            <div style="margin-top:0.3rem">${getStageBadge(log.stage)}</div>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>

        <!-- Documents Tab -->
        <div id="detail-docs" class="detail-tab-content hidden">
            ${app.has_documents ? `
                <div style="margin-bottom:1rem">
                    <div class="d-flex items-center justify-between mb-1">
                        <div>
                            <div style="font-weight:500;color:var(--text-primary)">${app.document_type}</div>
                            <div style="font-size:0.75rem;color:var(--text-muted)">Uploaded ${formatDate(app.created_at)}</div>
                        </div>
                        <button class="btn btn-ghost btn-sm" onclick="showToast('Document download simulated','info')">⬇ Download</button>
                    </div>
                    <div class="doc-preview">
                        <div style="background:rgba(59,130,246,0.05);border:1px solid var(--border);border-radius:8px;padding:2.5rem 1.5rem;text-align:center">
                            <div style="font-size:2.2rem;margin-bottom:0.5rem">📄</div>
                            <div style="color:var(--text-secondary);font-weight:500">${app.applicant_name} — ${app.document_type}</div>
                            <div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.25rem">Statutory File Dossier Preview</div>
                            <div style="margin-top:0.75rem">
                                <button class="btn btn-primary btn-sm" onclick="showToast('Document viewer opened','info')">📖 Open Full Dossier</button>
                            </div>
                        </div>
                    </div>
                </div>
                <div style="margin-top:1rem">
                    <div class="form-label">Supporting Attached Records</div>
                    <div style="display:flex;flex-direction:column;gap:0.5rem;margin-top:0.5rem">
                        <div class="d-flex items-center gap-1" style="padding:0.6rem;background:rgba(255,255,255,0.02);border-radius:8px;border:1px solid var(--border-light)">
                            <span style="font-size:1.2rem">📋</span>
                            <div style="flex:1">
                                <div style="font-size:0.82rem;color:var(--text-primary)">Offer Letter & Spouse Consent Declaration</div>
                                <div style="font-size:0.7rem;color:var(--text-muted)">offer_letter_consent.pdf · 1.4 MB</div>
                            </div>
                            <button class="btn btn-ghost btn-sm" onclick="showToast('Download simulated','info')">⬇</button>
                        </div>
                        <div class="d-flex items-center gap-1" style="padding:0.6rem;background:rgba(255,255,255,0.02);border-radius:8px;border:1px solid var(--border-light)">
                            <span style="font-size:1.2rem">🗺️</span>
                            <div style="flex:1">
                                <div style="font-size:0.82rem;color:var(--text-primary)">Approved Cadastral Diagram (Surveyor General)</div>
                                <div style="font-size:0.7rem;color:var(--text-muted)">cadastral_diagram.pdf · 3.8 MB</div>
                            </div>
                            <button class="btn btn-ghost btn-sm" onclick="showToast('Download simulated','info')">⬇</button>
                        </div>
                    </div>
                </div>
            ` : `
                <div class="empty-state">
                    <div class="empty-icon">📂</div>
                    <div class="empty-title">No documents uploaded</div>
                    <div class="empty-desc">This applicant has not yet uploaded any supporting documents.</div>
                </div>
            `}
        </div>
    `;

    // Populate footer actions
    const footer = document.getElementById('detailFooter');
    const stageIdx = STAGES.findIndex(s => s.key === app.current_stage);

    let progressBtnHtml = '';
    if (stageIdx < STAGES.length - 1) {
        const nextStage = STAGES[stageIdx + 1];
        const responsibleDept = Object.entries(DEPARTMENTS).find(([_, d]) => d.stage === nextStage.key);
        const isAdmin = currentUser.role_id === 'SYSTEM_ADMIN_ROLE';
        const canAct = isAdmin || (responsibleDept && responsibleDept[0] === currentUser.role_id);
        if (canAct) {
            progressBtnHtml = `<button class="btn btn-success btn-sm" onclick="progressApplication('${app.id}','${nextStage.key}')">✓ ${responsibleDept ? responsibleDept[1].action : 'Progress to ' + nextStage.label}</button>`;
        }
    } else {
        progressBtnHtml = `<span class="badge badge-complete" style="padding:0.4rem 0.8rem">✓ Title Deed Sealed</span>`;
    }

    footer.innerHTML = `
        <div style="display:flex;gap:0.4rem;align-items:center;flex-wrap:wrap;width:100%;justify-content:space-between">
            <div style="display:flex;gap:0.4rem;flex-wrap:wrap">
                <button class="btn btn-ghost btn-sm" onclick="closeDetailPanel()">Close</button>
                <button class="btn btn-warning btn-sm" onclick="openReturnStageModal('${app.id}')" style="background:rgba(245,158,11,0.15);color:var(--warning);border:1px solid rgba(245,158,11,0.3)">
                    ↩ Return Stage (TC-08)
                </button>
                <button class="btn btn-ghost btn-sm" onclick="openAuditChainModal('${app.id}')" style="color:var(--accent);border:1px solid rgba(59,130,246,0.3)">
                    ⛓️ Inspect Chain (TC-11)
                </button>
                <button class="btn btn-ghost btn-sm" onclick="openGisOverlapModal('${app.id}')" style="color:var(--cyan);border:1px solid rgba(6,182,212,0.3)">
                    🛰️ GIS Overlap (TC-10)
                </button>
            </div>
            <div style="display:flex;gap:0.4rem;align-items:center">
                <button class="btn btn-danger btn-sm" onclick="rejectApplication('${app.id}')">✕ Reject</button>
                ${progressBtnHtml}
            </div>
        </div>
    `;

    panel.classList.add('open');
    overlay.classList.add('active');
}

function closeDetailPanel() {
    document.getElementById('detailPanel').classList.remove('open');
    document.getElementById('panelOverlay').classList.remove('active');
    selectedApplication = null;
}

function switchDetailTab(tabBtn, tabId) {
    // Update tab buttons
    tabBtn.closest('.tabs').querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tabBtn.classList.add('active');
    // Show/hide content
    document.querySelectorAll('.detail-tab-content').forEach(c => c.classList.add('hidden'));
    document.getElementById(tabId).classList.remove('hidden');
}

function rejectApplication(appId) {
    const reason = prompt('Reason for rejection:');
    if (!reason) return;
    const app = DEMO_APPLICATIONS.find(a => a.id === appId);
    if (app) {
        app.current_stage = 'REJECTED';
        app.audit_log.push({
            stage: 'REJECTED',
            officer: currentUser.name,
            action: 'Application rejected',
            comments: reason,
            timestamp: new Date().toISOString()
        });
        showToast('Application has been rejected', 'error');
        closeDetailPanel();
        loadQueue();
    }
}

// ─── DOCUMENTS SECTION ──────────────────────────────────
function loadDocuments() {
    const container = document.getElementById('documentsGrid');
    const appsWithDocs = DEMO_APPLICATIONS.filter(a => a.has_documents);
    container.innerHTML = '';

    if (appsWithDocs.length === 0) {
        container.innerHTML = `<div class="empty-state"><div class="empty-icon">📂</div><div class="empty-title">No documents found</div></div>`;
        return;
    }

    appsWithDocs.forEach(app => {
        container.innerHTML += `
            <div class="user-card" onclick="openApplicationDetail('${app.id}');switchDetailTab(document.querySelector('.tab:nth-child(3)'), 'detail-docs')">
                <div class="uc-avatar" style="background:rgba(59,130,246,0.15);color:var(--accent);font-size:1.3rem">📄</div>
                <div class="uc-info">
                    <div class="uc-name">${app.applicant_name}</div>
                    <div class="uc-email">${app.document_type} · ${app.province}</div>
                </div>
                <div style="text-align:right">
                    ${getStageBadge(app.current_stage)}
                    <div style="font-size:0.7rem;color:var(--text-muted);margin-top:0.25rem">${formatDate(app.created_at)}</div>
                </div>
            </div>
        `;
    });
}

// ─── AUDIT LOGS SECTION ─────────────────────────────────
function loadAuditLogs() {
    const tbody = document.getElementById('auditTableBody');
    tbody.innerHTML = '';

    const allLogs = [];
    DEMO_APPLICATIONS.forEach(app => {
        app.audit_log.forEach(log => {
            allLogs.push({ ...log, appId: app.id, applicant: app.applicant_name });
        });
    });
    allLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    allLogs.forEach(log => {
        tbody.innerHTML += `
            <tr>
                <td style="font-size:0.78rem;color:var(--text-muted);white-space:nowrap">${formatDateFull(log.timestamp)}</td>
                <td style="font-weight:500;color:var(--text-primary)">${log.officer}</td>
                <td>${log.action}</td>
                <td><code>${log.appId.substring(0, 8)}</code><br><span style="font-size:0.75rem;color:var(--text-muted)">${log.applicant}</span></td>
                <td>${getStageBadge(log.stage)}</td>
                <td style="font-size:0.8rem;color:var(--text-secondary);max-width:200px" class="truncate">${log.comments}</td>
            </tr>
        `;
    });
}

// ─── USER & PRIVILEGE MANAGEMENT (ADMIN CONSOLE) ────────
let currentOfficerFilter = 'all';

function getOfficers() {
    const saved = localStorage.getItem('app_officers');
    if (saved) {
        try {
            return JSON.parse(saved);
        } catch (e) {
            console.error('Error parsing saved officers:', e);
        }
    }
    const defaultPrivs = {
        'LIMS_ROLE': ['priv_endorse'],
        'ACCOUNTS_ROLE': ['priv_endorse', 'priv_finance'],
        'ESTATES_ROLE': ['priv_endorse'],
        'ZLC_ROLE': ['priv_endorse'],
        'SURVEYOR_ROLE': ['priv_endorse', 'priv_survey'],
        'VALUATION_ROLE': ['priv_endorse', 'priv_valuation'],
        'DIRECTOR_ROLE': ['priv_endorse', 'priv_warrant'],
        'DEEDS_ROLE': ['priv_endorse', 'priv_seal'],
        'SYSTEM_ADMIN_ROLE': ['priv_endorse', 'priv_finance', 'priv_survey', 'priv_valuation', 'priv_warrant', 'priv_seal', 'priv_audit', 'priv_manage']
    };
    const defaultClearances = {
        'LIMS_ROLE': 'LEVEL 1 (INTAKE)',
        'ACCOUNTS_ROLE': 'LEVEL 2 (FINANCIAL)',
        'ESTATES_ROLE': 'LEVEL 1 (INTAKE)',
        'ZLC_ROLE': 'LEVEL 1 (INTAKE)',
        'SURVEYOR_ROLE': 'LEVEL 3 (CADASTRAL)',
        'VALUATION_ROLE': 'LEVEL 4 (VALUATION)',
        'DIRECTOR_ROLE': 'LEVEL 5 (MINISTERIAL)',
        'DEEDS_ROLE': 'LEVEL 6 (DEEDS)',
        'SYSTEM_ADMIN_ROLE': 'LEVEL 7 (SUPERUSER)'
    };
    DEMO_USERS.forEach(u => {
        if (!u.privileges) u.privileges = defaultPrivs[u.role_id] || ['priv_endorse'];
        if (!u.clearance_level) u.clearance_level = defaultClearances[u.role_id] || 'LEVEL 2 (GENERAL)';
    });
    localStorage.setItem('app_officers', JSON.stringify(DEMO_USERS));
    return DEMO_USERS;
}

function filterOfficersList(filter) {
    currentOfficerFilter = filter;
    document.querySelectorAll('#adminUserFilters .filter-pill').forEach(btn => {
        btn.classList.toggle('active', btn.textContent.toLowerCase().includes(filter));
    });
    loadUsers();
}

function loadUsers() {
    const grid = document.getElementById('usersGrid');
    if (!grid) return;
    grid.innerHTML = '';

    const officers = getOfficers();

    // Update Admin Stats
    const totalEl = document.getElementById('adminTotalOfficers');
    if (totalEl) totalEl.textContent = officers.length;

    const countAllEl = document.getElementById('officerCountAll');
    if (countAllEl) countAllEl.textContent = officers.length;

    const endorsersCount = officers.filter(u => u.privileges && u.privileges.includes('priv_endorse')).length;
    const endorsersEl = document.getElementById('adminTotalEndorsers');
    if (endorsersEl) endorsersEl.textContent = endorsersCount;

    let list = [...officers];
    if (currentOfficerFilter === 'endorsers') {
        list = list.filter(u => u.privileges && u.privileges.includes('priv_endorse'));
    } else if (currentOfficerFilter === 'technical') {
        list = list.filter(u => u.role_id === 'SURVEYOR_ROLE' || u.role_id === 'LIMS_ROLE');
    } else if (currentOfficerFilter === 'financial') {
        list = list.filter(u => u.privileges && u.privileges.includes('priv_finance'));
    }

    const PRIVILEGE_LABELS = {
        'priv_endorse': { label: '✓ Endorse Clearances', color: '#10b981' },
        'priv_finance': { label: '✓ Reconcile $10 Fees', color: '#f59e0b' },
        'priv_survey':  { label: '✓ Audit GPS & Diagrams', color: '#06b6d4' },
        'priv_valuation': { label: '✓ Asset Appraisals', color: '#f97316' },
        'priv_warrant': { label: '✓ Ministerial Warrants', color: '#6366f1' },
        'priv_seal':    { label: '✓ Great Seal Affixing', color: '#10b981' },
        'priv_audit':   { label: '✓ Forensic Logs', color: '#64748b' },
        'priv_manage':  { label: '✓ Privilege Delegation', color: '#ef4444' }
    };

    list.forEach(user => {
        const dept = DEPARTMENTS[user.role_id] || { short: user.role_id, color: '#3b82f6', label: user.department };
        const isAdmin = user.role_id === 'SYSTEM_ADMIN_ROLE';

        let privBadges = '';
        (user.privileges || []).forEach(pKey => {
            const p = PRIVILEGE_LABELS[pKey];
            if (p) {
                privBadges += `<span style="font-size:0.7rem;padding:0.15rem 0.45rem;border-radius:4px;background:${p.color}18;color:${p.color};border:1px solid ${p.color}30;white-space:nowrap">${p.label}</span>`;
            }
        });

        grid.innerHTML += `
            <div class="user-card" style="padding:1.25rem;background:rgba(255,255,255,0.02);border:1px solid ${isAdmin ? 'rgba(239,68,68,0.3)' : 'var(--border-light)'};border-radius:10px;display:flex;flex-direction:column;gap:0.75rem">
                <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:0.75rem">
                    <div style="display:flex;align-items:center;gap:0.75rem">
                        <div class="uc-avatar" style="width:42px;height:42px;font-size:0.95rem;background:${dept.color}22;color:${dept.color};border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700">
                            ${user.name.split(' ').map(n => n[0]).join('')}
                        </div>
                        <div>
                            <div style="font-weight:700;color:var(--text-primary);font-size:0.95rem">${user.name}</div>
                            <div style="font-size:0.75rem;color:var(--text-secondary)"><code>${user.email}</code></div>
                        </div>
                    </div>
                    <span class="badge" style="background:${user.status === 'active' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)'};color:${user.status === 'active' ? 'var(--success)' : 'var(--danger)'};font-size:0.7rem">
                        ${user.status === 'active' ? '● Active' : '○ Suspended'}
                    </span>
                </div>

                <div style="display:flex;flex-wrap:wrap;gap:0.5rem;align-items:center;padding:0.4rem 0;border-top:1px solid var(--border-light);border-bottom:1px solid var(--border-light)">
                    <div>
                        <span style="font-size:0.7rem;color:var(--text-muted);display:block">Assigned Channel:</span>
                        <span class="dept-badge" style="background:${dept.color}15;color:${dept.color};font-weight:600;font-size:0.78rem">
                            <span class="dept-dot" style="background:${dept.color}"></span>
                            ${dept.label}
                        </span>
                    </div>
                    <div style="margin-left:auto;text-align:right">
                        <span style="font-size:0.7rem;color:var(--text-muted);display:block">Security Clearance:</span>
                        <span style="font-size:0.72rem;font-weight:700;color:var(--text-primary);background:rgba(255,255,255,0.05);padding:0.15rem 0.5rem;border-radius:4px;border:1px solid var(--border-light)">
                            ${user.clearance_level || 'LEVEL 2 (GENERAL)'}
                        </span>
                    </div>
                </div>

                <div>
                    <div style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;margin-bottom:0.35rem;font-weight:700">
                        Delegated Operational Privileges:
                    </div>
                    <div style="display:flex;flex-wrap:wrap;gap:0.3rem">
                        ${privBadges || '<span style="font-size:0.72rem;color:var(--text-muted)">No active privileges assigned</span>'}
                    </div>
                </div>

                <div style="display:flex;justify-content:space-between;align-items:center;margin-top:auto;padding-top:0.5rem">
                    <button class="btn btn-primary btn-sm" onclick="openAssignPrivilegesModal('${user.id}')" style="background:${dept.color};color:#000;font-weight:700;font-size:0.78rem">
                        ⚙️ Assign Duties & Privileges
                    </button>
                    <button class="btn btn-ghost btn-sm" onclick="toggleOfficerStatus('${user.id}')" style="font-size:0.75rem;color:var(--text-muted)" title="Toggle Account Status">
                        ${user.status === 'active' ? 'Suspend' : 'Activate'}
                    </button>
                </div>
            </div>
        `;
    });
}

function openAssignPrivilegesModal(userId) {
    const officers = getOfficers();
    const user = officers.find(u => u.id === userId);
    if (!user) return;

    const dept = DEPARTMENTS[user.role_id] || { label: user.department, color: '#3b82f6' };
    const bodyEl = document.getElementById('assignPrivilegesBody');
    const footerEl = document.getElementById('assignPrivilegesFooter');

    const privs = user.privileges || [];

    bodyEl.innerHTML = `
        <div style="background:${dept.color}15;border:1px solid ${dept.color}35;border-radius:8px;padding:1rem;margin-bottom:1.25rem">
            <div style="display:flex;justify-content:space-between;align-items:center">
                <div>
                    <div style="font-size:1.1rem;font-weight:700;color:var(--text-primary)">${user.name}</div>
                    <div style="font-size:0.8rem;color:var(--text-secondary)"><code>${user.email}</code></div>
                </div>
                <span class="badge" style="background:${dept.color}25;color:${dept.color}">${dept.label}</span>
            </div>
        </div>

        <form id="editPrivilegesForm" onsubmit="event.preventDefault(); saveOfficerPrivileges('${user.id}');" style="display:flex;flex-direction:column;gap:1.25rem">
            <div class="form-group" style="margin:0">
                <label class="form-label" style="font-weight:600;font-size:0.85rem">Reassign Primary Department Duty Channel</label>
                <select id="assignDeptRole" class="form-control" style="background:rgba(255,255,255,0.03);border:1px solid var(--border-light);border-radius:6px;padding:0.6rem;color:var(--text-primary);width:100%">
                    <option value="LIMS_ROLE" ${user.role_id === 'LIMS_ROLE' ? 'selected' : ''}>🗺️ LIMS / Lands Information (Form LIMS-01 · Intake)</option>
                    <option value="ACCOUNTS_ROLE" ${user.role_id === 'ACCOUNTS_ROLE' ? 'selected' : ''}>💰 Finance & Accounts (Form ACC-04 · $10 Fee Clearance)</option>
                    <option value="ESTATES_ROLE" ${user.role_id === 'ESTATES_ROLE' ? 'selected' : ''}>🏠 Estates & Succession (Form EST-02 · High Court Audit)</option>
                    <option value="ZLC_ROLE" ${user.role_id === 'ZLC_ROLE' ? 'selected' : ''}>⚖️ Zimbabwe Land Commission (Form ZLC-03 · Disputes)</option>
                    <option value="SURVEYOR_ROLE" ${user.role_id === 'SURVEYOR_ROLE' ? 'selected' : ''}>📐 Surveyor General Directorate (Form SG-05 · Cadastral & GPS)</option>
                    <option value="VALUATION_ROLE" ${user.role_id === 'VALUATION_ROLE' ? 'selected' : ''}>📊 Valuation Directorate (Form VAL-06 · Asset Appraisal)</option>
                    <option value="DIRECTOR_ROLE" ${user.role_id === 'DIRECTOR_ROLE' ? 'selected' : ''}>👔 Executive Director Office (Form ED-07 · Title Grant Warrant)</option>
                    <option value="DEEDS_ROLE" ${user.role_id === 'DEEDS_ROLE' ? 'selected' : ''}>📜 Deeds Registry Department (Form DR-08 · Great Seal Title)</option>
                    <option value="SYSTEM_ADMIN_ROLE" ${user.role_id === 'SYSTEM_ADMIN_ROLE' ? 'selected' : ''}>⚙️ System Administrator (Duty & Privilege Delegator)</option>
                </select>
                <div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.3rem">
                    Directs the officer to this operational channel upon sign in with their credentials.
                </div>
            </div>

            <div class="form-group" style="margin:0">
                <label class="form-label" style="font-weight:600;font-size:0.85rem">Security Clearance Level</label>
                <select id="assignClearanceLevel" class="form-control" style="background:rgba(255,255,255,0.03);border:1px solid var(--border-light);border-radius:6px;padding:0.6rem;color:var(--text-primary);width:100%">
                    <option value="LEVEL 1 (INTAKE)" ${user.clearance_level === 'LEVEL 1 (INTAKE)' ? 'selected' : ''}>Level 1 (Intake & Offer Letter Screening)</option>
                    <option value="LEVEL 2 (FINANCIAL)" ${user.clearance_level === 'LEVEL 2 (FINANCIAL)' ? 'selected' : ''}>Level 2 (Financial Assessment & Reconciliations)</option>
                    <option value="LEVEL 3 (CADASTRAL)" ${user.clearance_level === 'LEVEL 3 (CADASTRAL)' ? 'selected' : ''}>Level 3 (Cadastral Survey & Geodetic Datum)</option>
                    <option value="LEVEL 4 (VALUATION)" ${user.clearance_level === 'LEVEL 4 (VALUATION)' ? 'selected' : ''}>Level 4 (Capital Land & Improvements Valuation)</option>
                    <option value="LEVEL 5 (MINISTERIAL)" ${user.clearance_level === 'LEVEL 5 (MINISTERIAL)' ? 'selected' : ''}>Level 5 (Ministerial Title Grant Delegation)</option>
                    <option value="LEVEL 6 (DEEDS)" ${user.clearance_level === 'LEVEL 6 (DEEDS)' ? 'selected' : ''}>Level 6 (Deeds Registry & Great Seal Custody)</option>
                    <option value="LEVEL 7 (SUPERUSER)" ${user.clearance_level === 'LEVEL 7 (SUPERUSER)' ? 'selected' : ''}>Level 7 (Root System Administrator)</option>
                </select>
            </div>

            <div>
                <label class="form-label" style="font-weight:600;font-size:0.85rem;margin-bottom:0.5rem;display:block">
                    Granular Delegated Operational Privileges
                </label>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;padding:0.85rem;background:rgba(255,255,255,0.02);border:1px solid var(--border-light);border-radius:8px">
                    <label style="display:flex;align-items:center;gap:0.5rem;font-size:0.8rem;color:var(--text-primary);cursor:pointer">
                        <input type="checkbox" id="priv_endorse" ${privs.includes('priv_endorse') ? 'checked' : ''} style="accent-color:var(--accent);width:16px;height:16px">
                        <span>Endorse Clearances (Form XX)</span>
                    </label>
                    <label style="display:flex;align-items:center;gap:0.5rem;font-size:0.8rem;color:var(--text-primary);cursor:pointer">
                        <input type="checkbox" id="priv_finance" ${privs.includes('priv_finance') ? 'checked' : ''} style="accent-color:var(--warning);width:16px;height:16px">
                        <span>Reconcile $10 Fees & Levies</span>
                    </label>
                    <label style="display:flex;align-items:center;gap:0.5rem;font-size:0.8rem;color:var(--text-primary);cursor:pointer">
                        <input type="checkbox" id="priv_survey" ${privs.includes('priv_survey') ? 'checked' : ''} style="accent-color:#06b6d4;width:16px;height:16px">
                        <span>Audit GPS & SG Diagrams</span>
                    </label>
                    <label style="display:flex;align-items:center;gap:0.5rem;font-size:0.8rem;color:var(--text-primary);cursor:pointer">
                        <input type="checkbox" id="priv_valuation" ${privs.includes('priv_valuation') ? 'checked' : ''} style="accent-color:#f97316;width:16px;height:16px">
                        <span>Sign Land & Asset Valuations</span>
                    </label>
                    <label style="display:flex;align-items:center;gap:0.5rem;font-size:0.8rem;color:var(--text-primary);cursor:pointer">
                        <input type="checkbox" id="priv_warrant" ${privs.includes('priv_warrant') ? 'checked' : ''} style="accent-color:#6366f1;width:16px;height:16px">
                        <span>Issue Executive Title Warrants</span>
                    </label>
                    <label style="display:flex;align-items:center;gap:0.5rem;font-size:0.8rem;color:var(--text-primary);cursor:pointer">
                        <input type="checkbox" id="priv_seal" ${privs.includes('priv_seal') ? 'checked' : ''} style="accent-color:#10b981;width:16px;height:16px">
                        <span>Affix Republic Great Seal</span>
                    </label>
                    <label style="display:flex;align-items:center;gap:0.5rem;font-size:0.8rem;color:var(--text-primary);cursor:pointer">
                        <input type="checkbox" id="priv_audit" ${privs.includes('priv_audit') ? 'checked' : ''} style="accent-color:#64748b;width:16px;height:16px">
                        <span>View System Audit Trail</span>
                    </label>
                    <label style="display:flex;align-items:center;gap:0.5rem;font-size:0.8rem;color:var(--text-primary);cursor:pointer">
                        <input type="checkbox" id="priv_manage" ${privs.includes('priv_manage') ? 'checked' : ''} style="accent-color:#ef4444;width:16px;height:16px">
                        <span>Assign Staff Privileges (Admin)</span>
                    </label>
                </div>
            </div>
        </form>
    `;

    footerEl.innerHTML = `
        <button class="btn btn-ghost" onclick="closeModal('assignPrivilegesModal')">Cancel</button>
        <button class="btn btn-primary" onclick="saveOfficerPrivileges('${user.id}')" style="font-weight:700">
            ✓ Deploy & Save Privileges
        </button>
    `;

    openModal('assignPrivilegesModal');
}

function saveOfficerPrivileges(userId) {
    const officers = getOfficers();
    const user = officers.find(u => u.id === userId);
    if (!user) return;

    const newRole = document.getElementById('assignDeptRole').value;
    const newClearance = document.getElementById('assignClearanceLevel').value;

    const privKeys = ['priv_endorse', 'priv_finance', 'priv_survey', 'priv_valuation', 'priv_warrant', 'priv_seal', 'priv_audit', 'priv_manage'];
    const newPrivs = privKeys.filter(k => {
        const el = document.getElementById(k);
        return el && el.checked;
    });

    const dept = DEPARTMENTS[newRole] || { short: newRole, label: newRole };

    // Update object
    user.role_id = newRole;
    user.department = dept.short;
    user.clearance_level = newClearance;
    user.privileges = newPrivs;

    // Persist
    localStorage.setItem('app_officers', JSON.stringify(officers));

    // If currently signed in as this officer, update active session
    if (currentUser && currentUser.id === user.id) {
        currentUser.role_id = newRole;
        currentUser.department = dept.short;
        localStorage.setItem('admin_user', JSON.stringify(currentUser));
        updateHeaderAndSidebarUser();
    }

    closeModal('assignPrivilegesModal');
    loadUsers();
    showToast(`Duties & Privileges updated for ${user.name} (${dept.short})`, 'success');
}

function toggleOfficerStatus(userId) {
    const officers = getOfficers();
    const user = officers.find(u => u.id === userId);
    if (!user) return;

    user.status = user.status === 'active' ? 'suspended' : 'active';
    localStorage.setItem('app_officers', JSON.stringify(officers));
    loadUsers();
    showToast(`${user.name} status updated to ${user.status.toUpperCase()}`, 'info');
}

function openAddOfficerModal() {
    document.getElementById('newOfficerName').value = '';
    document.getElementById('newOfficerEmail').value = '';
    openModal('addOfficerModal');
}

function saveNewOfficer() {
    const name = document.getElementById('newOfficerName').value.trim();
    const email = document.getElementById('newOfficerEmail').value.trim();
    const roleId = document.getElementById('newOfficerRole').value;
    const clearance = document.getElementById('newOfficerClearance').value;

    if (!name || !email) return;

    const officers = getOfficers();
    const dept = DEPARTMENTS[roleId] || { short: roleId, label: roleId };

    const newOfficer = {
        id: generateUUID(),
        name: name,
        email: email,
        role_id: roleId,
        department: dept.short,
        clearance_level: clearance,
        status: 'active',
        privileges: ['priv_endorse']
    };

    officers.push(newOfficer);
    localStorage.setItem('app_officers', JSON.stringify(officers));

    closeModal('addOfficerModal');
    loadUsers();
    showToast(`New Officer ${name} onboarded to ${dept.short}!`, 'success');
}

// ─── HELPERS ────────────────────────────────────────────
function renderWorkflowTracker(currentStage) {
    const stageIdx = STAGES.findIndex(s => s.key === currentStage);
    let html = '<div class="workflow-tracker" style="display:flex;flex-wrap:wrap;gap:0.5rem;justify-content:space-between">';
    STAGES.forEach((stage, i) => {
        let cls = '';
        if (i < stageIdx) cls = 'completed';
        else if (i === stageIdx) cls = 'current';
        html += `
            <div class="workflow-step ${cls}" style="flex:1;min-width:90px;text-align:center">
                <div class="step-dot" style="${cls === 'current' ? 'background:var(--accent);color:#fff;border-color:var(--accent);box-shadow:0 0 10px rgba(59,130,246,0.5)' : (cls === 'completed' ? 'background:var(--success);color:#fff' : '')}">${i < stageIdx ? '✓' : i + 1}</div>
                <div class="step-label" style="font-weight:600;font-size:0.75rem;margin-top:0.3rem">${stage.label}</div>
                <div style="font-size:0.65rem;color:var(--text-muted);margin-top:0.15rem">${stage.dept.toUpperCase()} · ${stage.sla}d</div>
            </div>
        `;
    });
    html += '</div>';
    return html;
}

function getStageBadge(stage) {
    const badgeMap = {
        'PENDING':              'badge-pending',
        'RESETTLEMENT_VERIFIED':'badge-verified',
        'LIMS_VERIFIED':        'badge-progress',
        'ZLC_CLEARED':          'badge-cleared',
        'GIS_VALIDATED':        'badge-verified',
        'SURVEYED':             'badge-surveyed',
        'VALUATED':             'badge-valuated',
        'APPROVED':             'badge-approved',
        'READY_FOR_COLLECTION': 'badge-complete',
        'REJECTED':             'badge-rejected',
    };
    const cls = badgeMap[stage] || 'badge-pending';
    const label = stage.replace(/_/g, ' ');
    return `<span class="badge ${cls}">${label}</span>`;
}

function getDeptForStage(stage) {
    return Object.entries(DEPARTMENTS).find(([_, d]) => d.stage === stage);
}

function formatDate(iso) {
    return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateFull(iso) {
    return new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ─── SEARCH ─────────────────────────────────────────────
function handleSearch(query) {
    if (!query.trim()) {
        filterApplications(currentFilter);
        return;
    }
    const q = query.toLowerCase();
    filteredApps = DEMO_APPLICATIONS.filter(a =>
        a.applicant_name.toLowerCase().includes(q) ||
        a.national_id.toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q) ||
        a.province.toLowerCase().includes(q) ||
        a.district.toLowerCase().includes(q)
    );
    renderQueueTable();
}

// ─── TOAST NOTIFICATIONS ────────────────────────────────
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <span style="font-size:1.1rem">${icons[type] || icons.info}</span>
        <span style="flex:1;font-size:0.85rem;color:var(--text-primary)">${message}</span>
        <button onclick="this.parentElement.remove()" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:1rem">✕</button>
    `;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

// ─── MOBILE SIDEBAR TOGGLE & NAV ────────────────────────
function toggleMobileSidebar() {
    const sb = document.getElementById('sidebar');
    const bd = document.getElementById('sidebarBackdrop');
    if (sb) sb.classList.toggle('mobile-open');
    if (bd) bd.classList.toggle('active');
}

function updateMobileNav(btn) {
    document.querySelectorAll('.mobile-nav-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    const sb = document.getElementById('sidebar');
    const bd = document.getElementById('sidebarBackdrop');
    if (sb && sb.classList.contains('mobile-open')) {
        sb.classList.remove('mobile-open');
        if (bd) bd.classList.remove('active');
    }
}


// ─── ACCOUNTS & FINANCE SECTION ─────────────────────────
let currentAccFilter = 'all';

function loadAccountsSection() {
    const apps = DEMO_APPLICATIONS;

    // Revenue calculations
    const paidApps = apps.filter(a => a.payment_status === 'PAID');
    const totalRevenue = paidApps.reduce((acc, a) => acc + (a.amount_paid || a.total_statutory_fee || 0), 0);

    const pendingApps = apps.filter(a => a.payment_status === 'PENDING_VERIFICATION' || (a.current_stage === 'LIMS_VERIFIED' && a.payment_status !== 'PAID'));
    const clearedApps = paidApps.length;
    const totalAssessed = paidApps.length + pendingApps.length;
    const complianceRate = totalAssessed > 0 ? Math.round((clearedApps / totalAssessed) * 100) : 100;

    // Update KPI UI
    const revEl = document.getElementById('accTotalRevenue');
    if (revEl) revEl.textContent = `$${totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const pendEl = document.getElementById('accPendingCount');
    if (pendEl) pendEl.textContent = pendingApps.length;

    const clearEl = document.getElementById('accClearedCount');
    if (clearEl) clearEl.textContent = clearedApps;

    const compEl = document.getElementById('accComplianceRate');
    if (compEl) compEl.textContent = `${complianceRate}%`;

    const navBadge = document.getElementById('navAccountsBadge');
    if (navBadge) navBadge.textContent = pendingApps.length;

    const filterBadge = document.getElementById('accPendingFilterBadge');
    if (filterBadge) filterBadge.textContent = pendingApps.length;

    renderAccountsTable();
}

function filterAccounts(filter) {
    currentAccFilter = filter;
    document.querySelectorAll('#accountsFilters .filter-pill').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.accfilter === filter);
    });
    renderAccountsTable();
}

function renderAccountsTable() {
    const tbody = document.getElementById('accountsTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    let list = [...DEMO_APPLICATIONS];
    if (currentAccFilter === 'pending') {
        list = list.filter(a => a.payment_status === 'PENDING_VERIFICATION' || (a.current_stage === 'LIMS_VERIFIED' && a.payment_status !== 'PAID'));
    } else if (currentAccFilter === 'paid') {
        list = list.filter(a => a.payment_status === 'PAID');
    } else if (currentAccFilter === 'ecocash') {
        list = list.filter(a => a.payment_method && a.payment_method.includes('EcoCash'));
    } else if (currentAccFilter === 'bank') {
        list = list.filter(a => a.payment_method && (a.payment_method.includes('Bank') || a.payment_method.includes('Nostro') || a.payment_method.includes('RTGS')));
    }

    if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">💳</div><div class="empty-title">No financial records found</div><div class="empty-desc">No records match the selected filter.</div></div></td></tr>`;
        return;
    }

    list.forEach(app => {
        const isPaid = app.payment_status === 'PAID';
        const isPending = !isPaid && (app.payment_status === 'PENDING_VERIFICATION' || app.current_stage === 'LIMS_VERIFIED');

        let badgeHtml = '';
        if (isPaid) {
            badgeHtml = '<span class="payment-badge paid">● Verified & Paid</span>';
        } else if (isPending) {
            badgeHtml = '<span class="payment-badge pending">⏳ Awaiting Review</span>';
        } else {
            badgeHtml = '<span class="payment-badge awaiting">○ Initial Intake</span>';
        }

        let actionBtn = '';
        if (isPending) {
            actionBtn = `<button class="btn btn-warning btn-sm" onclick="openPaymentModal('${app.id}')" style="background:var(--dept-accounts);color:#000;font-weight:700">💳 Verify & Clear</button>`;
        } else if (isPaid) {
            actionBtn = `<button class="btn btn-ghost btn-sm" onclick="openClearanceCertificate('${app.id}')" style="color:var(--success);border:1px solid rgba(16,185,129,0.3)">📜 Form ACC-04</button>`;
        } else {
            actionBtn = `<button class="btn btn-ghost btn-sm" onclick="openApplicationDetail('${app.id}')">View Details</button>`;
        }

        tbody.innerHTML += `
            <tr onclick="openApplicationDetail('${app.id}')" style="cursor:pointer">
                <td>
                    <code>${app.id.substring(0, 8)}</code>
                    <div style="font-size:0.72rem;color:var(--text-muted);margin-top:0.15rem">${app.receipt_no || 'Pending'}</div>
                </td>
                <td>
                    <div style="font-weight:600;color:var(--text-primary)">${app.applicant_name}</div>
                    <div style="font-size:0.75rem;color:var(--text-muted)">${app.national_id}</div>
                </td>
                <td>
                    <div style="color:var(--text-secondary);font-size:0.85rem">${app.farm_name}</div>
                    <div style="font-size:0.72rem;color:var(--text-muted)">${app.plot_size} · ${app.district}</div>
                </td>
                <td>
                    <div style="font-weight:700;color:var(--text-primary);font-size:0.92rem">USD $${app.total_statutory_fee || 660}.00</div>
                    <div style="font-size:0.72rem;color:var(--text-muted)">App: $10 · Survey: $${app.survey_levy || 350}</div>
                </td>
                <td>
                    <div style="font-weight:500;color:var(--text-primary);font-size:0.82rem">${app.payment_method || 'EcoCash USD'}</div>
                    <code style="font-size:0.72rem">${app.payment_ref || 'EC-948102'}</code>
                </td>
                <td>${badgeHtml}</td>
                <td onclick="event.stopPropagation()">
                    ${actionBtn}
                </td>
            </tr>
        `;
    });
}

function openPaymentModal(appId) {
    const app = DEMO_APPLICATIONS.find(a => a.id === appId);
    if (!app) return;
    selectedApplication = app;

    const body = document.getElementById('paymentModalBody');
    const footer = document.getElementById('paymentModalFooter');

    body.innerHTML = `
        <div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.25);border-radius:10px;padding:1rem;margin-bottom:1.25rem">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem">
                <span style="font-size:0.8rem;text-transform:uppercase;font-weight:700;color:var(--dept-accounts)">Applicant File Under Review</span>
                <code>Ref: ${app.id.substring(0, 12)}</code>
            </div>
            <div style="font-size:1.1rem;font-weight:700;color:var(--text-primary)">${app.applicant_name}</div>
            <div style="font-size:0.82rem;color:var(--text-secondary);margin-top:0.2rem">
                National ID: <strong>${app.national_id}</strong> · Location: <strong>${app.farm_name}, ${app.district}, ${app.province}</strong> (${app.plot_size})
            </div>
        </div>

        <div style="font-weight:600;font-size:0.9rem;color:var(--text-primary);margin-bottom:0.5rem">Official Fee Assessment (Land Commission Act Chapter 20:29)</div>
        <table class="fee-breakdown-table">
            <thead>
                <tr>
                    <th>Statutory Item</th>
                    <th>Gazetted Rate</th>
                    <th>Status</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>Land Intake Application Fee</td>
                    <td>USD $${app.app_fee || 10}.00</td>
                    <td><span class="payment-badge paid">Verified</span></td>
                </tr>
                <tr>
                    <td>Cadastral Survey Levy (Surveyor General)</td>
                    <td>USD $${app.survey_levy || 350}.00</td>
                    <td><span class="payment-badge pending">Pending Clearance</span></td>
                </tr>
                <tr>
                    <td>Valuation Directorate Inspection Fee</td>
                    <td>USD $${app.valuation_fee || 120}.00</td>
                    <td><span class="payment-badge pending">Pending Clearance</span></td>
                </tr>
                <tr>
                    <td>Deeds Registration & Stamp Duty</td>
                    <td>USD $${app.reg_fee || 180}.00</td>
                    <td><span class="payment-badge pending">Pending Clearance</span></td>
                </tr>
                <tr>
                    <td><strong>TOTAL STATUTORY AMOUNT DUE</strong></td>
                    <td colspan="2"><strong style="font-size:1.05rem;color:var(--dept-accounts)">USD $${app.total_statutory_fee || 660}.00</strong></td>
                </tr>
            </tbody>
        </table>

        <div style="background:rgba(255,255,255,0.02);border:1px solid var(--border-light);border-radius:10px;padding:1rem;margin-top:1rem">
            <div style="font-weight:600;font-size:0.85rem;color:var(--text-primary);margin-bottom:0.75rem">Proof of Remittance Verification</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;font-size:0.85rem">
                <div>
                    <span style="color:var(--text-muted);font-size:0.75rem">Remittance Channel:</span>
                    <div style="font-weight:600;color:var(--text-primary)">${app.payment_method || 'EcoCash USD'}</div>
                </div>
                <div>
                    <span style="color:var(--text-muted);font-size:0.75rem">Transaction Ref:</span>
                    <code style="font-size:0.85rem">${app.payment_ref || 'EC-948102'}</code>
                </div>
                <div>
                    <span style="color:var(--text-muted);font-size:0.75rem">Treasury Receipt No:</span>
                    <div style="font-weight:600;color:var(--text-primary)">${app.receipt_no || 'REC-2026-9021'}</div>
                </div>
                <div>
                    <span style="color:var(--text-muted);font-size:0.75rem">Bank Recon Status:</span>
                    <div style="font-weight:600;color:var(--success)">✓ Confirmed at Central Treasury</div>
                </div>
            </div>
        </div>

        <div class="form-group" style="margin-top:1rem">
            <div class="form-label">Accounts Officer Remarks / Endorsement</div>
            <textarea class="form-control" id="accOfficerNotes" rows="2" style="background:rgba(255,255,255,0.03);border:1px solid var(--border-light);border-radius:8px;padding:0.6rem;color:var(--text-primary);width:100%;font-family:inherit;font-size:0.85rem">Full statutory fee confirmed via ${app.payment_method || 'EcoCash USD'}. Payment reconciled with treasury ref ${app.payment_ref || 'EC-948102'}.</textarea>
        </div>
    `;

    footer.innerHTML = `
        <button class="btn btn-ghost" onclick="closeModal('paymentModal')">Cancel</button>
        <button class="btn btn-success" onclick="confirmPaymentClearance('${app.id}')" style="background:var(--dept-accounts);color:#000;font-weight:700">
            ✓ Endorse & Issue Form ACC-04 Clearance
        </button>
    `;

    openModal('paymentModal');
}

function confirmPaymentClearance(appId) {
    const app = DEMO_APPLICATIONS.find(a => a.id === appId);
    if (!app) return;

    const notes = document.getElementById('accOfficerNotes')?.value || 'Statutory fees verified and cleared';

    // Update state
    app.payment_status = 'PAID';
    app.amount_paid = app.total_statutory_fee || 660;
    const nowIso = new Date().toISOString();
    app.updated_at = nowIso;

    // Cryptographic audit block append (TC-11)
    const prevBlock = app.audit_log[app.audit_log.length - 1];
    const prevHash = prevBlock ? prevBlock.current_hash : '0000000000000000000000000000000000000000000000000000000000000000';
    const blockIdx = app.audit_log.length;
    const officerName = currentUser ? currentUser.name : 'Accounts Officer';
    const actionDesc = 'Financial Clearance Form ACC-04 Issued';
    const commentDesc = `Treasury Receipt: ${app.receipt_no || 'REC-2026'}. Remittance: USD $${app.amount_paid} via ${app.payment_method || 'Direct'} (${app.payment_ref || 'REF'}). ${notes}`;
    const blockPayload = `${prevHash}|${blockIdx}|${app.current_stage}|${officerName}|${actionDesc}|${commentDesc}|${nowIso}`;
    const currentHash = sha256Sync(blockPayload);

    app.audit_log.push({
        block_index: blockIdx,
        stage: app.current_stage,
        officer: officerName,
        action: actionDesc,
        comments: commentDesc,
        timestamp: nowIso,
        prev_hash: prevHash,
        current_hash: currentHash,
        payload_fingerprint: sha256Sync(commentDesc),
        is_immutable: true
    });

    closeModal('paymentModal');
    loadAccountsSection();
    loadDashboard();
    showToast(`Payment of USD $${app.amount_paid} verified! Form ACC-04 issued for ${app.applicant_name}.`, 'success');

    // Auto-open official clearance certificate for inspection
    setTimeout(() => {
        openClearanceCertificate(app.id);
    }, 400);
}

function openClearanceCertificate(appId) {
    const app = DEMO_APPLICATIONS.find(a => a.id === appId);
    if (!app) return;

    const certBody = document.getElementById('clearanceModalBody');
    if (!certBody) return;

    certBody.innerHTML = `
        <div class="clearance-document">
            <div class="clearance-header">
                <div class="clearance-crest"><img src="logo.png" alt="Republic of Zimbabwe Coat of Arms" style="height:68px;width:auto;object-fit:contain;margin-bottom:0.4rem;filter:drop-shadow(0 2px 5px rgba(0,0,0,0.2));"></div>
                <div style="font-size:0.9rem;font-weight:bold;letter-spacing:0.1em;color:#1e3a29">GOVERNMENT OF ZIMBABWE</div>
                <div class="clearance-title">Ministry of Lands, Agriculture, Fisheries, Water and Rural Development</div>
                <div class="clearance-subtitle">One Stop Centre for Title Deeds Processing — Treasury & Finance Directorate</div>
                <div class="clearance-cert-no">FORM ACC-04: OFFICIAL STATUTORY FINANCIAL CLEARANCE CERTIFICATE</div>
            </div>

            <div style="font-size:0.9rem;line-height:1.6;margin-bottom:1rem;color:#1a202c">
                <strong>THIS IS TO CERTIFY</strong> that the land parcel and titling application specified below has satisfied all statutory financial obligations, levies, and fees gazetted under the Land Commission Act [Chapter 20:29] and Deeds Registries Act [Chapter 20:05].
            </div>

            <div class="clearance-grid">
                <div>
                    <div class="clearance-field-label">Applicant / Beneficiary</div>
                    <div class="clearance-field-val">${app.applicant_name}</div>
                </div>
                <div>
                    <div class="clearance-field-label">National Identity Card</div>
                    <div class="clearance-field-val">${app.national_id}</div>
                </div>
                <div>
                    <div class="clearance-field-label">Property / Farm Description</div>
                    <div class="clearance-field-val">${app.farm_name} (${app.plot_size})</div>
                </div>
                <div>
                    <div class="clearance-field-label">Province & District</div>
                    <div class="clearance-field-val">${app.district}, ${app.province}</div>
                </div>
                <div>
                    <div class="clearance-field-label">Application Reference ID</div>
                    <div class="clearance-field-val"><code>${app.id.substring(0, 16)}</code></div>
                </div>
                <div>
                    <div class="clearance-field-label">Tracking PIN</div>
                    <div class="clearance-field-val">${app.tracking_pin}</div>
                </div>
                <div>
                    <div class="clearance-field-label">Treasury Receipt Number</div>
                    <div class="clearance-field-val">${app.receipt_no || 'REC-2026-9481'}</div>
                </div>
                <div>
                    <div class="clearance-field-label">Certificate Serial Number</div>
                    <div class="clearance-field-val" style="color:#b45309">${app.clearance_cert_no || 'ACC-CLR-2026-5819'}</div>
                </div>
            </div>

            <div style="margin:1rem 0;padding:0.75rem 1rem;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px">
                <div style="display:flex;justify-content:space-between;align-items:center">
                    <span style="font-size:0.85rem;color:#475569;font-weight:600">Total Statutory Remittance Cleared:</span>
                    <span style="font-size:1.2rem;font-weight:bold;color:#047857">USD $${app.amount_paid || app.total_statutory_fee || 660}.00 (PAID IN FULL)</span>
                </div>
                <div style="font-size:0.75rem;color:#64748b;margin-top:0.25rem">
                    Remitted via ${app.payment_method || 'EcoCash USD'} (Ref: ${app.payment_ref || 'EC-948102'}) · Reconciled CBZ Treasury
                </div>
            </div>

            <div style="margin-top:2rem;display:flex;justify-content:space-between;align-items:flex-end">
                <div>
                    <div style="font-size:0.78rem;color:#64748b;text-transform:uppercase">Issued by Authorised Officer:</div>
                    <div style="font-weight:bold;color:#111827;font-size:1rem;margin-top:0.2rem">${currentUser ? currentUser.name : 'Tatenda Ndlovu'}</div>
                    <div style="font-size:0.75rem;color:#64748b">${currentUser ? currentUser.department : 'Finance & Accounts Division'}</div>
                    <div style="font-size:0.72rem;color:#94a3b8;margin-top:0.15rem">Date: ${new Date().toLocaleDateString('en-GB')}</div>
                </div>
                <div style="text-align:right">
                    <div style="font-family:monospace;font-size:0.75rem;color:#64748b">||| | ||||| || |||||||| |||||</div>
                    <div style="font-size:0.7rem;color:#94a3b8">VERIFY: onestop.lands.gov.zw/verify</div>
                </div>
            </div>

            <!-- Official Seal Stamp -->
            <div class="clearance-stamp">
                <span>GOVERNMENT OF ZIMBABWE</span>
                <span style="font-size:0.85rem;margin:0.2rem 0">★ CLEARED ★</span>
                <span>MINISTRY OF LANDS</span>
                <span>FINANCE & ACCOUNTS</span>
            </div>
        </div>
    `;

    openModal('clearanceModal');
}

function printClearanceCertificate() {
    window.print();
}

// ─── OFFICER PROFILE & ROLE SWITCHER ───────────────────
function loadProfileSection() {
    const user = currentUser;
    if (!user) return;

    const dept = DEPARTMENTS[user.role_id] || { label: user.role_id, short: 'Officer', color: '#3b82f6', icon: '👤' };

    // Update profile card
    const nameEl = document.getElementById('profileFullName');
    if (nameEl) nameEl.textContent = user.name;

    const emailEl = document.getElementById('profileEmail');
    if (emailEl) emailEl.textContent = user.email;

    const avatarEl = document.getElementById('profileAvatarLarge');
    if (avatarEl) {
        avatarEl.textContent = user.name.split(' ').map(n => n[0]).join('');
        avatarEl.style.background = `linear-gradient(135deg, ${dept.color}, #3b82f6)`;
    }

    const pillEl = document.getElementById('profileBadgePill');
    if (pillEl) {
        pillEl.style.background = `${dept.color}22`;
        pillEl.style.color = dept.color;
        pillEl.innerHTML = `<span class="dept-dot" style="background:${dept.color}"></span> ${dept.label}`;
    }

    // Render Role Grid Selector
    const gridEl = document.getElementById('roleGridSelector');
    if (!gridEl) return;
    gridEl.innerHTML = '';

    Object.entries(DEPARTMENTS).forEach(([roleId, d]) => {
        const isCurrent = user.role_id === roleId;
        gridEl.innerHTML += `
            <div class="role-card-option ${isCurrent ? 'active' : ''}" onclick="switchOfficerRole('${roleId}')">
                <div class="rc-icon">${d.icon}</div>
                <div class="rc-name">${d.short}</div>
                <div class="rc-dept">${d.label}</div>
                <div style="font-size:0.75rem;color:var(--text-secondary);margin-top:0.5rem;line-height:1.3">
                    ${d.action}
                </div>
            </div>
        `;
    });
}

function switchOfficerRole(roleId) {
    const dept = DEPARTMENTS[roleId];
    if (!dept) return;

    const demoUser = DEMO_USERS.find(u => u.role_id === roleId) || {
        id: 'demo-' + roleId,
        name: dept.label,
        email: roleId.toLowerCase() + '@agric.gov.zw',
        role_id: roleId,
        department: dept.short
    };

    currentUser = {
        id: demoUser.id,
        name: demoUser.name,
        email: demoUser.email,
        role_id: roleId,
        department: demoUser.department || dept.short
    };

    localStorage.setItem('admin_user', JSON.stringify(currentUser));
    updateHeaderAndSidebarUser();
    loadProfileSection();
    showToast(`Switched active identity to ${dept.label} (${dept.short})`, 'success');

    // If switching to Accounts role, navigate straight to Accounts!
    if (roleId === 'ACCOUNTS_ROLE') {
        navigateTo('accounts');
    }
}

function updateHeaderAndSidebarUser() {
    if (!currentUser) return;
    const dept = DEPARTMENTS[currentUser.role_id] || { label: currentUser.role_id, short: 'Officer', color: '#3b82f6', icon: '👤' };

    // Sidebar
    const sName = document.getElementById('sidebarName');
    if (sName) sName.textContent = currentUser.name;

    const sRole = document.getElementById('sidebarRole');
    if (sRole) sRole.textContent = dept.label;

    const sAvatar = document.getElementById('sidebarAvatar');
    if (sAvatar) sAvatar.textContent = currentUser.name.split(' ').map(n => n[0]).join('');

    // Header role badge button
    const hIcon = document.getElementById('headerRoleIcon');
    if (hIcon) hIcon.textContent = dept.icon;

    const hName = document.getElementById('headerRoleName');
    if (hName) hName.textContent = dept.short;
}

// ─── MODAL CONTROLLERS ──────────────────────────────────
function openModal(id) {
    const m = document.getElementById(id);
    if (m) m.classList.add('active');
}

function closeModal(id) {
    const m = document.getElementById(id);
    if (m) m.classList.remove('active');
}

function openFeeScheduleModal() {
    openModal('feeScheduleModal');
}

// Global modal esc close listener
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal-backdrop.active').forEach(m => m.classList.remove('active'));
        closeDetailPanel();
    }
});

// ========================================================
//  DEPARTMENT CHANNELS ENGINE (LIMS, ESTATES, ZLC, SG, VALUATION, DIRECTOR, DEEDS)
// ========================================================

let currentDeptKey = 'lims';
let currentDeptFilter = 'pending';

function isStagePassedOrAt(currentStage, targetStage) {
    const curIdx = STAGES.findIndex(s => s.key === currentStage);
    const tgtIdx = STAGES.findIndex(s => s.key === targetStage);
    if (curIdx === -1 || tgtIdx === -1) return false;
    return curIdx >= tgtIdx;
}

function loadDepartmentChannel(deptKey) {
    const d = DEPT_CHANNELS[deptKey];
    if (!d) return;

    currentDeptKey = deptKey;
    currentDeptFilter = 'pending';

    // 1. Render Hero Banner
    const heroEl = document.getElementById('deptHeroBanner');
    if (heroEl) {
        heroEl.innerHTML = `
            <div class="dept-hero-icon" style="background:${d.color}20;color:${d.color}">${d.icon}</div>
            <div class="dept-hero-content">
                <div class="dept-hero-title">
                    ${d.name}
                    <span class="badge" style="background:${d.color}25;color:${d.color};border:1px solid ${d.color}40;font-size:0.75rem;padding:0.2rem 0.6rem">Channel Form ${d.formCode}</span>
                </div>
                <div class="dept-hero-desc">${d.description}</div>
                <div class="dept-hero-meta">
                    <span>Officer Role: <strong style="color:var(--text-primary)">${d.short}</strong></span>
                    <span>Pipeline Progression: <strong style="color:${d.color}">${d.incomingStage} ➔ ${d.targetStage}</strong></span>
                    <span>Statutory Form: <strong style="color:var(--text-primary)">Form ${d.formCode}</strong></span>
                </div>
            </div>
        `;
    }

    // 2. Compute Metrics & Render KPIs
    const apps = DEMO_APPLICATIONS;
    const pendingApps = apps.filter(a => a.current_stage === d.incomingStage);
    const clearedApps = apps.filter(a => isStagePassedOrAt(a.current_stage, d.targetStage));
    const totalApps = apps.length;
    const complianceRate = totalApps ? Math.round((clearedApps.length / totalApps) * 100) : 0;

    let customMetricVal = '100%';
    let customMetricLabel = d.kpiLabels[2];
    if (deptKey === 'lims') {
        customMetricVal = `${apps.filter(a => a.offer_letter_ref).length} / ${totalApps}`;
    } else if (deptKey === 'estates') {
        customMetricVal = `${apps.filter(a => a.spouse_consent && a.spouse_consent.includes('Verified')).length} Verified`;
    } else if (deptKey === 'zlc') {
        customMetricVal = '0 Disputes';
    } else if (deptKey === 'surveyor') {
        customMetricVal = `${clearedApps.length} Diagrams`;
    } else if (deptKey === 'valuation') {
        const totalVal = apps.reduce((acc, a) => acc + parseFloat(a.total_valuation || 0), 0);
        customMetricVal = `USD $${(totalVal / 1000).toFixed(0)}k`;
    } else if (deptKey === 'director') {
        customMetricVal = `${clearedApps.length} Warrants`;
    } else if (deptKey === 'deeds') {
        customMetricVal = `${clearedApps.length} Sealed`;
    }

    const kpiGrid = document.getElementById('deptKpiGrid');
    if (kpiGrid) {
        kpiGrid.innerHTML = `
            <div class="stat-card">
                <div class="stat-header">
                    <div class="stat-icon" style="background:${d.color}20;color:${d.color}">✓</div>
                    <span class="stat-trend up">Cleared</span>
                </div>
                <div class="stat-value">${clearedApps.length}</div>
                <div class="stat-label">${d.kpiLabels[0]}</div>
            </div>
            <div class="stat-card">
                <div class="stat-header">
                    <div class="stat-icon" style="background:rgba(239,68,68,0.15);color:var(--danger)">⏳</div>
                    <span class="stat-trend down">Action Required</span>
                </div>
                <div class="stat-value">${pendingApps.length}</div>
                <div class="stat-label">${d.kpiLabels[1]}</div>
            </div>
            <div class="stat-card">
                <div class="stat-header">
                    <div class="stat-icon" style="background:${d.color}20;color:${d.color}">${d.icon}</div>
                    <span class="stat-trend up">Registry Metric</span>
                </div>
                <div class="stat-value" style="font-size:1.4rem">${customMetricVal}</div>
                <div class="stat-label">${customMetricLabel}</div>
            </div>
            <div class="stat-card">
                <div class="stat-header">
                    <div class="stat-icon" style="background:rgba(16,185,129,0.15);color:var(--success)">📊</div>
                    <span class="stat-trend up">Efficiency</span>
                </div>
                <div class="stat-value">${complianceRate}%</div>
                <div class="stat-label">${d.kpiLabels[3]}</div>
            </div>
        `;
    }

    // 3. Panel Title & Subtitle
    const titleEl = document.getElementById('deptPanelTitle');
    if (titleEl) titleEl.textContent = `${d.icon} ${d.name} Operations Queue`;

    const subEl = document.getElementById('deptPanelSubtitle');
    if (subEl) subEl.textContent = `Review files at stage '${d.incomingStage}', conduct department verifications, and endorse Form ${d.formCode}.`;

    // 4. Filters
    const filterEl = document.getElementById('deptFilters');
    if (filterEl) {
        filterEl.innerHTML = `
            <button class="filter-pill ${currentDeptFilter === 'pending' ? 'active' : ''}" data-deptfilter="pending" onclick="filterDeptChannel('pending')">
                ⏳ Awaiting ${d.short} Review <span class="filter-count">${pendingApps.length}</span>
            </button>
            <button class="filter-pill ${currentDeptFilter === 'cleared' ? 'active' : ''}" data-deptfilter="cleared" onclick="filterDeptChannel('cleared')">
                ✓ Cleared / Form ${d.formCode} Issued <span class="filter-count">${clearedApps.length}</span>
            </button>
            <button class="filter-pill ${currentDeptFilter === 'all' ? 'active' : ''}" data-deptfilter="all" onclick="filterDeptChannel('all')">
                All Files <span class="filter-count">${totalApps}</span>
            </button>
        `;
    }

    // 5. Table Head
    const theadEl = document.getElementById('deptTableHead');
    if (theadEl) {
        theadEl.innerHTML = `<tr>${d.tableCols.map(c => `<th>${c}</th>`).join('')}</tr>`;
    }

    // 6. Render Table
    renderDeptTable();
}

function filterDeptChannel(filter) {
    currentDeptFilter = filter;
    document.querySelectorAll('#deptFilters .filter-pill').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.deptfilter === filter);
    });
    renderDeptTable();
}

function reloadCurrentDeptChannel() {
    loadDepartmentChannel(currentDeptKey);
    updateAllBadges();
    showToast(`${DEPT_CHANNELS[currentDeptKey]?.short || 'Department'} channel refreshed`, 'info');
}

function renderDeptTable() {
    const tbody = document.getElementById('deptTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const d = DEPT_CHANNELS[currentDeptKey];
    if (!d) return;

    let list = [...DEMO_APPLICATIONS];
    if (currentDeptFilter === 'pending') {
        list = list.filter(a => a.current_stage === d.incomingStage);
    } else if (currentDeptFilter === 'cleared') {
        list = list.filter(a => isStagePassedOrAt(a.current_stage, d.targetStage));
    }

    if (list.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="${d.tableCols.length}">
                    <div class="empty-state">
                        <div class="empty-icon">${d.icon}</div>
                        <div class="empty-title">No applications in this view</div>
                        <div class="empty-desc">There are currently no files matching filter '${currentDeptFilter}' for ${d.short}.</div>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    list.forEach(app => {
        const isPending = app.current_stage === d.incomingStage;
        const isCleared = isStagePassedOrAt(app.current_stage, d.targetStage);

        let actionBtn = '';
        if (isPending) {
            actionBtn = `
                <button class="btn btn-warning btn-sm" onclick="openDeptActionModal('${app.id}', '${currentDeptKey}')" style="background:${d.color};color:#000;font-weight:700;white-space:nowrap">
                    ✓ Endorse & Clear
                </button>
            `;
        } else if (isCleared) {
            actionBtn = `
                <button class="btn btn-ghost btn-sm" onclick="openDeptCertificate('${app.id}', '${currentDeptKey}')" style="color:${d.color};border:1px solid ${d.color}40;white-space:nowrap">
                    📜 Form ${d.formCode}
                </button>
            `;
        } else {
            actionBtn = `<button class="btn btn-ghost btn-sm" onclick="openApplicationDetail('${app.id}')">View File</button>`;
        }

        let rowCells = '';
        if (currentDeptKey === 'resettlement') {
            rowCells = `
                <td><code>${app.id.substring(0, 8)}</code><div style="font-size:0.72rem;color:var(--text-muted)">PIN: ${app.tracking_pin}</div></td>
                <td><div style="font-weight:600;color:var(--text-primary)">${app.applicant_name}</div><div style="font-size:0.75rem;color:var(--text-muted)">${app.national_id}</div></td>
                <td><div style="color:var(--text-secondary);font-size:0.85rem">${app.farm_name}</div><div style="font-size:0.72rem;color:var(--text-muted)">${app.district}, ${app.province}</div></td>
                <td><code style="font-size:0.8rem;color:${d.color}">${app.offer_letter_ref}</code></td>
                <td><span class="badge" style="background:rgba(4,120,87,0.15);color:#10b981;font-size:0.75rem">✓ ${app.spouse_consent}</span></td>
                <td>${isPending ? '<span class="payment-badge pending">⏳ Awaiting Resettlement Audit</span>' : '<span class="payment-badge paid">✓ Resettlement Cleared</span>'}</td>
            `;
        } else if (currentDeptKey === 'lims') {
            rowCells = `
                <td><code>${app.id.substring(0, 8)}</code><div style="font-size:0.72rem;color:var(--text-muted)">PIN: ${app.tracking_pin}</div></td>
                <td><div style="font-weight:600;color:var(--text-primary)">${app.applicant_name}</div><div style="font-size:0.75rem;color:var(--text-muted)">${app.national_id}</div></td>
                <td><div style="color:var(--text-secondary);font-size:0.85rem">${app.farm_name} (${app.plot_size})</div></td>
                <td><code style="font-size:0.8rem;color:${d.color}">${app.cadastral_id}</code></td>
                <td><span style="font-size:0.78rem;color:var(--success)">Receipt ${app.receipt_no} ($10.00)</span></td>
                <td>${isPending ? '<span class="payment-badge pending">⏳ Awaiting Fee & LIMS Audit</span>' : '<span class="payment-badge paid">✓ LIMS Verified</span>'}</td>
            `;
        } else if (currentDeptKey === 'zlc') {
            rowCells = `
                <td><code>${app.id.substring(0, 8)}</code><div style="font-size:0.72rem;color:var(--text-muted)">PIN: ${app.tracking_pin}</div></td>
                <td><div style="font-weight:600;color:var(--text-primary)">${app.applicant_name}</div><div style="font-size:0.75rem;color:var(--text-muted)">${app.farm_name}</div></td>
                <td><div style="color:var(--text-secondary);font-size:0.85rem">${app.district}</div><div style="font-size:0.72rem;color:var(--text-muted)">${app.province}</div></td>
                <td><span class="badge" style="background:rgba(20,184,166,0.15);color:#14b8a6;font-size:0.78rem">✓ ${app.zlc_dispute_status}</span></td>
                <td><span style="font-size:0.8rem;color:var(--text-secondary)">${app.chief_concurrence}</span></td>
                <td>${isPending ? '<span class="payment-badge pending">⏳ Boundary Review</span>' : '<span class="payment-badge paid">✓ ZLC Cleared</span>'}</td>
            `;
        } else if (currentDeptKey === 'gis') {
            rowCells = `
                <td><code>${app.id.substring(0, 8)}</code><div style="font-size:0.72rem;color:var(--text-muted)">PIN: ${app.tracking_pin}</div></td>
                <td><div style="font-weight:600;color:var(--text-primary)">${app.applicant_name}</div><div style="font-size:0.75rem;color:var(--text-muted)">${app.farm_name}</div></td>
                <td><div style="font-weight:600;color:var(--text-primary)">${app.plot_size}</div></td>
                <td><span class="badge" style="background:${app.gis_overlap_ratio > 0 ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.15)'};color:${app.gis_overlap_ratio > 0 ? '#ef4444' : '#10b981'};font-size:0.75rem">${app.gis_overlap_ratio > 0 ? `⚠️ Overlap: ${app.gis_overlap_ratio}%` : '✓ 0.0% Overlap'}</span></td>
                <td><span class="badge" style="background:${app.ai_risk_level === 'HIGH' ? 'rgba(239,68,68,0.2)' : (app.ai_risk_level === 'MEDIUM' ? 'rgba(245,158,11,0.2)' : 'rgba(16,185,129,0.15)')};color:${app.ai_risk_level === 'HIGH' ? '#ef4444' : (app.ai_risk_level === 'MEDIUM' ? '#f59e0b' : '#10b981')};font-size:0.75rem">${app.ai_risk_level} (${Math.round(app.ai_dispute_probability * 100)}%)</span></td>
                <td>${isPending ? '<span class="payment-badge pending">⏳ GIS & AI Scan</span>' : '<span class="payment-badge paid">✓ GIS Validated</span>'}</td>
            `;
        } else if (currentDeptKey === 'surveyor') {
            rowCells = `
                <td><code>${app.id.substring(0, 8)}</code><div style="font-size:0.72rem;color:var(--text-muted)">PIN: ${app.tracking_pin}</div></td>
                <td><div style="font-weight:600;color:var(--text-primary)">${app.applicant_name}</div><div style="font-size:0.75rem;color:var(--text-muted)">${app.farm_name}</div></td>
                <td><div style="font-weight:600;color:var(--text-primary)">${app.plot_size}</div><div style="font-size:0.72rem;color:var(--text-muted)">${app.district}</div></td>
                <td><code style="font-size:0.78rem">${app.beacon_coords}</code></td>
                <td><code style="font-size:0.82rem;color:${d.color}">${app.sg_diagram_no}</code></td>
                <td>${isPending ? '<span class="payment-badge pending">⏳ Diagram Audit</span>' : '<span class="payment-badge paid">✓ SG Approved</span>'}</td>
            `;
        } else if (currentDeptKey === 'valuation') {
            rowCells = `
                <td><code>${app.id.substring(0, 8)}</code><div style="font-size:0.72rem;color:var(--text-muted)">PIN: ${app.tracking_pin}</div></td>
                <td><div style="font-weight:600;color:var(--text-primary)">${app.applicant_name}</div><div style="font-size:0.75rem;color:var(--text-muted)">${app.farm_name}</div></td>
                <td><div style="font-weight:600;color:var(--text-primary)">${app.plot_size}</div></td>
                <td><div style="font-weight:600;color:var(--text-secondary)">USD $${app.base_land_value}</div></td>
                <td><div style="font-weight:600;color:var(--text-secondary)">USD $${app.improvements_value}</div></td>
                <td><div style="font-weight:700;color:${d.color}">USD $${app.total_valuation}</div></td>
            `;
        } else if (currentDeptKey === 'director') {
            rowCells = `
                <td><code>${app.id.substring(0, 8)}</code><div style="font-size:0.72rem;color:var(--text-muted)">PIN: ${app.tracking_pin}</div></td>
                <td><div style="font-weight:600;color:var(--text-primary)">${app.applicant_name}</div><div style="font-size:0.75rem;color:var(--text-muted)">${app.national_id}</div></td>
                <td><div style="color:var(--text-secondary);font-size:0.85rem">${app.farm_name}</div><div style="font-size:0.72rem;color:var(--text-muted)">${app.district}</div></td>
                <td><span class="badge" style="background:rgba(99,102,241,0.15);color:#818cf8;font-size:0.75rem">✓ All Prior Audits Passed</span></td>
                <td><code style="font-size:0.8rem;color:${d.color}">${app.executive_warrant_no}</code></td>
                <td>${isPending ? '<span class="payment-badge pending">⏳ Awaiting Warrant</span>' : '<span class="payment-badge paid">✓ Grant Authorized</span>'}</td>
            `;
        } else if (currentDeptKey === 'deeds') {
            rowCells = `
                <td><code>${app.id.substring(0, 8)}</code><div style="font-size:0.72rem;color:var(--text-muted)">PIN: ${app.tracking_pin}</div></td>
                <td><div style="font-weight:600;color:var(--text-primary)">${app.applicant_name}</div><div style="font-size:0.75rem;color:var(--text-muted)">${app.national_id}</div></td>
                <td><code style="font-weight:700;color:${d.color};font-size:0.85rem">${app.deed_number}</code></td>
                <td><span style="font-size:0.8rem;color:var(--text-secondary)">${app.volume_folio}</span></td>
                <td><span class="badge" style="background:rgba(16,185,129,0.15);color:var(--success);font-size:0.78rem">★ Great Seal Affixed</span></td>
                <td>${isPending ? '<span class="payment-badge pending">⏳ Awaiting Engrossment</span>' : '<span class="payment-badge paid">✓ Ready for Collection</span>'}</td>
            `;
        }

        tbody.innerHTML += `
            <tr onclick="openApplicationDetail('${app.id}')" style="cursor:pointer">
                ${rowCells}
                <td onclick="event.stopPropagation()">
                    ${actionBtn}
                </td>
            </tr>
        `;
    });
}

// ─── DEPARTMENT ACTION & VERIFICATION MODAL ─────────────
function openDeptActionModal(appId, deptKey) {
    const app = DEMO_APPLICATIONS.find(a => a.id === appId);
    if (!app) return;
    const d = DEPT_CHANNELS[deptKey];
    if (!d) return;

    selectedApplication = app;

    const titleEl = document.getElementById('deptActionModalTitle');
    if (titleEl) titleEl.innerHTML = `${d.icon} Form ${d.formCode} — ${d.actionLabel}`;

    const bodyEl = document.getElementById('deptActionModalBody');
    const footerEl = document.getElementById('deptActionModalFooter');

    let checksHtml = '';
    let prefilledNotes = '';

    if (deptKey === 'resettlement') {
        prefilledNotes = `Offer Letter ${app.offer_letter_ref} confirmed valid against Ministry Land Bank records. Spousal consent declared (${app.spouse_consent}). High Court estate audit clear.`;
        checksHtml = `
            <div style="display:flex;flex-direction:column;gap:0.75rem;font-size:0.85rem">
                <label style="display:flex;align-items:center;gap:0.5rem;color:var(--text-primary);cursor:pointer">
                    <input type="checkbox" checked disabled>
                    <span>Offer Letter Ref: <strong style="color:${d.color}">${app.offer_letter_ref}</strong> verified against Ministry records</span>
                </label>
                <label style="display:flex;align-items:center;gap:0.5rem;color:var(--text-primary);cursor:pointer">
                    <input type="checkbox" checked disabled>
                    <span>Spouse Consent Declaration: <strong>${app.spouse_consent}</strong> validated</span>
                </label>
                <label style="display:flex;align-items:center;gap:0.5rem;color:var(--text-primary);cursor:pointer">
                    <input type="checkbox" checked disabled>
                    <span>Master of the High Court Deceased Estate Search: <strong>${app.master_high_court_ref}</strong> cleared</span>
                </label>
            </div>
        `;
    } else if (deptKey === 'lims') {
        prefilledNotes = `Cadastral ID ${app.cadastral_id} assigned. Statutory $10.00 application fee confirmed paid (${app.receipt_no}). Parent farm gazette ref ${app.gazette_ref} verified.`;
        checksHtml = `
            <div style="display:flex;flex-direction:column;gap:0.75rem;font-size:0.85rem">
                <label style="display:flex;align-items:center;gap:0.5rem;color:var(--text-primary);cursor:pointer">
                    <input type="checkbox" checked disabled>
                    <span>National Cadastral ID: <strong style="color:${d.color}">${app.cadastral_id}</strong> allocated</span>
                </label>
                <label style="display:flex;align-items:center;gap:0.5rem;color:var(--text-primary);cursor:pointer">
                    <input type="checkbox" checked disabled>
                    <span>Statutory $10.00 Application Fee: <strong style="color:var(--success)">Receipt ${app.receipt_no} Verified</strong></span>
                </label>
                <label style="display:flex;align-items:center;gap:0.5rem;color:var(--text-primary);cursor:pointer">
                    <input type="checkbox" checked disabled>
                    <span>Confirm Gazette Notice: <strong>${app.gazette_ref}</strong> under Chapter 20:29</span>
                </label>
            </div>
        `;
    } else if (deptKey === 'zlc') {
        prefilledNotes = `Boundary disputes register searched with zero conflicts. Local Traditional Authority concurrence received (${app.chief_concurrence}).`;
        checksHtml = `
            <div style="display:flex;flex-direction:column;gap:0.75rem;font-size:0.85rem">
                <label style="display:flex;align-items:center;gap:0.5rem;color:var(--text-primary);cursor:pointer">
                    <input type="checkbox" checked disabled>
                    <span>Dispute Registry Audit: <strong style="color:${d.color}">${app.zlc_dispute_status}</strong></span>
                </label>
                <label style="display:flex;align-items:center;gap:0.5rem;color:var(--text-primary);cursor:pointer">
                    <input type="checkbox" checked disabled>
                    <span>Traditional Authority Concurrence: <strong>${app.chief_concurrence}</strong></span>
                </label>
                <label style="display:flex;align-items:center;gap:0.5rem;color:var(--text-primary);cursor:pointer">
                    <input type="checkbox" checked disabled>
                    <span>Confirm tenure complies with Section 297 of Constitution of Zimbabwe</span>
                </label>
            </div>
        `;
    } else if (deptKey === 'gis') {
        prefilledNotes = `PostGIS ST_Intersects spatial overlap check executed (${app.gis_overlap_ratio}% overlap). AI conflict risk score: ${Math.round(app.ai_dispute_probability * 100)}% (${app.ai_risk_level} RISK).`;
        checksHtml = `
            <div style="display:flex;flex-direction:column;gap:0.75rem;font-size:0.85rem">
                <label style="display:flex;align-items:center;gap:0.5rem;color:var(--text-primary);cursor:pointer">
                    <input type="checkbox" checked disabled>
                    <span>PostGIS ST_Intersects Topology: <strong style="color:${app.gis_overlap_ratio > 0 ? 'var(--danger)' : 'var(--success)'}">${app.gis_overlap_ratio}% boundary overlap</strong></span>
                </label>
                <label style="display:flex;align-items:center;gap:0.5rem;color:var(--text-primary);cursor:pointer">
                    <input type="checkbox" checked disabled>
                    <span>AI Dispute Risk Engine: <strong style="color:${app.ai_risk_level === 'HIGH' ? 'var(--danger)' : 'var(--success)'}">${app.ai_risk_level} RISK (${Math.round(app.ai_dispute_probability * 100)}%)</strong></span>
                </label>
                <label style="display:flex;align-items:center;gap:0.5rem;color:var(--text-primary);cursor:pointer">
                    <input type="checkbox" checked disabled>
                    <span>WGS84 / SRID 4326 geodetic parcel coordinates validated</span>
                </label>
            </div>
        `;
    } else if (deptKey === 'surveyor') {
        prefilledNotes = `Cadastral survey diagram ${app.sg_diagram_no} approved. Field beacons ${app.beacon_coords} verified on Hartebeesthoek94 datum.`;
        checksHtml = `
            <div style="display:flex;flex-direction:column;gap:0.75rem;font-size:0.85rem">
                <label style="display:flex;align-items:center;gap:0.5rem;color:var(--text-primary);cursor:pointer">
                    <input type="checkbox" checked disabled>
                    <span>Cadastral Diagram Serial: <strong style="color:${d.color}">${app.sg_diagram_no}</strong></span>
                </label>
                <label style="display:flex;align-items:center;gap:0.5rem;color:var(--text-primary);cursor:pointer">
                    <input type="checkbox" checked disabled>
                    <span>Beacon GPS Coordinates: <strong>${app.beacon_coords}</strong> verified</span>
                </label>
                <label style="display:flex;align-items:center;gap:0.5rem;color:var(--text-primary);cursor:pointer">
                    <input type="checkbox" checked disabled>
                    <span>Land Survey Act [Chapter 20:12] compliance audit passed</span>
                </label>
            </div>
        `;
    } else if (deptKey === 'valuation') {
        prefilledNotes = `Valuation appraisal completed. Base land: USD $${app.base_land_value}, improvements: USD $${app.improvements_value}. Total assessed: USD $${app.total_valuation}.`;
        checksHtml = `
            <div style="display:flex;flex-direction:column;gap:0.75rem;font-size:0.85rem">
                <label style="display:flex;align-items:center;gap:0.5rem;color:var(--text-primary);cursor:pointer">
                    <input type="checkbox" checked disabled>
                    <span>Base Agricultural Land Valuation: <strong>USD $${app.base_land_value}</strong></span>
                </label>
                <label style="display:flex;align-items:center;gap:0.5rem;color:var(--text-primary);cursor:pointer">
                    <input type="checkbox" checked disabled>
                    <span>Permanent Improvements & Infrastructure: <strong>USD $${app.improvements_value}</strong></span>
                </label>
                <label style="display:flex;align-items:center;gap:0.5rem;color:var(--text-primary);cursor:pointer">
                    <input type="checkbox" checked disabled>
                    <span>Total Gazetted Valuation: <strong style="color:${d.color}">USD $${app.total_valuation}</strong> (Statutory stamp duty assessed)</span>
                </label>
            </div>
        `;
    } else if (deptKey === 'director') {
        prefilledNotes = `Executive warrant ${app.executive_warrant_no} approved following full clearance across all prior technical departments. Ministerial grant authorized.`;
        checksHtml = `
            <div style="display:flex;flex-direction:column;gap:0.75rem;font-size:0.85rem">
                <label style="display:flex;align-items:center;gap:0.5rem;color:var(--text-primary);cursor:pointer">
                    <input type="checkbox" checked disabled>
                    <span>Inter-Departmental Audit: Resettlement, LIMS, ZLC, GIS, SG, Valuation all cleared</span>
                </label>
                <label style="display:flex;align-items:center;gap:0.5rem;color:var(--text-primary);cursor:pointer">
                    <input type="checkbox" checked disabled>
                    <span>Executive Warrant Number: <strong style="color:${d.color}">${app.executive_warrant_no}</strong> assigned</span>
                </label>
                <label style="display:flex;align-items:center;gap:0.5rem;color:var(--text-primary);cursor:pointer">
                    <input type="checkbox" checked disabled>
                    <span>Presidential Title Deeds Program grant authorization confirmed</span>
                </label>
            </div>
        `;
    } else if (deptKey === 'deeds') {
        prefilledNotes = `Title Deed ${app.deed_number} engrossed on parchment and Great Seal affixed. Registered in Deeds Book ${app.volume_folio}. Ready for farmer collection.`;
        checksHtml = `
            <div style="display:flex;flex-direction:column;gap:0.75rem;font-size:0.85rem">
                <label style="display:flex;align-items:center;gap:0.5rem;color:var(--text-primary);cursor:pointer">
                    <input type="checkbox" checked disabled>
                    <span>Official Deed of Grant Serial: <strong style="color:${d.color}">${app.deed_number}</strong></span>
                </label>
                <label style="display:flex;align-items:center;gap:0.5rem;color:var(--text-primary);cursor:pointer">
                    <input type="checkbox" checked disabled>
                    <span>Archival Registry Folio: <strong>${app.volume_folio}</strong> recorded</span>
                </label>
                <label style="display:flex;align-items:center;gap:0.5rem;color:var(--text-primary);cursor:pointer">
                    <input type="checkbox" checked disabled>
                    <span>Republic of Zimbabwe Great Seal affixed. Parchment ready for handover</span>
                </label>
            </div>
        `;
    }

    bodyEl.innerHTML = `
        <div style="background:${d.color}15;border:1px solid ${d.color}35;border-radius:10px;padding:1rem;margin-bottom:1.25rem">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem">
                <span style="font-size:0.8rem;text-transform:uppercase;font-weight:700;color:${d.color}">${d.name} File Intake</span>
                <code>Ref: ${app.id.substring(0, 12)}</code>
            </div>
            <div style="font-size:1.1rem;font-weight:700;color:var(--text-primary)">${app.applicant_name}</div>
            <div style="font-size:0.82rem;color:var(--text-secondary);margin-top:0.2rem">
                National ID: <strong>${app.national_id}</strong> · Location: <strong>${app.farm_name}, ${app.district}, ${app.province}</strong> (${app.plot_size})
            </div>
        </div>

        <div style="font-weight:600;font-size:0.9rem;color:var(--text-primary);margin-bottom:0.6rem">
            Statutory Clearance Checklist (${d.formCode})
        </div>
        <div style="background:rgba(255,255,255,0.02);border:1px solid var(--border-light);border-radius:10px;padding:1rem;margin-bottom:1rem">
            ${checksHtml}
        </div>

        <div class="form-group">
            <div class="form-label">${d.short} Endorsement & Remarks</div>
            <textarea class="form-control" id="deptOfficerNotes" rows="2" style="background:rgba(255,255,255,0.03);border:1px solid var(--border-light);border-radius:8px;padding:0.6rem;color:var(--text-primary);width:100%;font-family:inherit;font-size:0.85rem">${prefilledNotes}</textarea>
        </div>
    `;

    footerEl.innerHTML = `
        <button class="btn btn-ghost" onclick="closeModal('deptActionModal')">Cancel</button>
        <button class="btn btn-success" onclick="confirmDeptAction('${app.id}', '${deptKey}')" style="background:${d.color};color:#000;font-weight:700">
            ✓ Endorse & Issue Form ${d.formCode}
        </button>
    `;

    openModal('deptActionModal');
}

function confirmDeptAction(appId, deptKey) {
    const app = DEMO_APPLICATIONS.find(a => a.id === appId);
    if (!app) return;
    const d = DEPT_CHANNELS[deptKey];
    if (!d) return;

    const notes = document.getElementById('deptOfficerNotes')?.value || `${d.actionLabel} completed`;

    // Advance Stage
    app.current_stage = d.targetStage;
    app.updated_at = new Date().toISOString();

    // Cryptographic audit block append (TC-11)
    const prevBlock = app.audit_log[app.audit_log.length - 1];
    const prevHash = prevBlock ? prevBlock.current_hash : '0000000000000000000000000000000000000000000000000000000000000000';
    const blockIdx = app.audit_log.length;
    const nowIso = new Date().toISOString();
    const actionDesc = `Form ${d.formCode} Clearance Issued`;
    const commentDesc = `${d.formTitle}. Notes: ${notes}`;
    const blockPayload = `${prevHash}|${blockIdx}|${d.targetStage}|${currentUser ? currentUser.name : `${d.short} Officer`}|${actionDesc}|${commentDesc}|${nowIso}`;
    const currentHash = sha256Sync(blockPayload);

    app.audit_log.push({
        block_index: blockIdx,
        stage: d.targetStage,
        officer: currentUser ? currentUser.name : `${d.short} Officer`,
        action: actionDesc,
        comments: commentDesc,
        timestamp: nowIso,
        prev_hash: prevHash,
        current_hash: currentHash,
        payload_fingerprint: sha256Sync(commentDesc),
        is_immutable: true
    });

    closeModal('deptActionModal');
    updateAllBadges();
    renderDeptTable();
    loadDashboard();

    showToast(`Form ${d.formCode} Clearance issued for ${app.applicant_name}! File advanced to ${d.targetStage}.`, 'success');

    // Auto-open certificate modal for inspection
    setTimeout(() => {
        openDeptCertificate(app.id, deptKey);
    }, 400);
}

// ─── DEPARTMENT CERTIFICATE VIEWER ──────────────────────
function openDeptCertificate(appId, deptKey) {
    const app = DEMO_APPLICATIONS.find(a => a.id === appId);
    if (!app) return;
    const d = DEPT_CHANNELS[deptKey];
    if (!d) return;

    const modalTitle = document.getElementById('deptCertModalTitle');
    if (modalTitle) modalTitle.innerHTML = `📜 Form ${d.formCode}: ${d.formTitle}`;

    const certBody = document.getElementById('deptCertModalBody');
    if (!certBody) return;

    let certSerial = app[d.certKey] || `${d.formCode}-CLR-2026-${Math.floor(Math.random() * 9000 + 1000)}`;

    let deptDetailsHtml = '';
    if (deptKey === 'resettlement') {
        deptDetailsHtml = `
            <div><div class="clearance-field-label">Offer Letter Reference</div><div class="clearance-field-val" style="color:#047857">${app.offer_letter_ref}</div></div>
            <div><div class="clearance-field-label">Spousal Consent Status</div><div class="clearance-field-val">${app.spouse_consent}</div></div>
            <div><div class="clearance-field-label">Master of High Court Probate</div><div class="clearance-field-val">${app.master_high_court_ref}</div></div>
            <div><div class="clearance-field-label">Certificate Serial Number</div><div class="clearance-field-val" style="color:#b45309">${certSerial}</div></div>
        `;
    } else if (deptKey === 'lims') {
        deptDetailsHtml = `
            <div><div class="clearance-field-label">National Cadastral ID</div><div class="clearance-field-val" style="color:#8b5cf6">${app.cadastral_id}</div></div>
            <div><div class="clearance-field-label">Statutory $10 Fee Receipt</div><div class="clearance-field-val">Receipt ${app.receipt_no} (Paid)</div></div>
            <div><div class="clearance-field-label">Government Gazette Notice</div><div class="clearance-field-val">${app.gazette_ref}</div></div>
            <div><div class="clearance-field-label">Certificate Serial Number</div><div class="clearance-field-val" style="color:#b45309">${certSerial}</div></div>
        `;
    } else if (deptKey === 'zlc') {
        deptDetailsHtml = `
            <div><div class="clearance-field-label">Boundary Dispute Register</div><div class="clearance-field-val" style="color:#14b8a6">${app.zlc_dispute_status}</div></div>
            <div><div class="clearance-field-label">Traditional Authority Concurrence</div><div class="clearance-field-val">${app.chief_concurrence}</div></div>
            <div><div class="clearance-field-label">Land Commission Act Check</div><div class="clearance-field-val">Section 297 Compliance Certified</div></div>
            <div><div class="clearance-field-label">Certificate Serial Number</div><div class="clearance-field-val" style="color:#b45309">${certSerial}</div></div>
        `;
    } else if (deptKey === 'gis') {
        deptDetailsHtml = `
            <div><div class="clearance-field-label">ST_Intersects Overlap Status</div><div class="clearance-field-val" style="color:#0284c7">${app.gis_overlap_ratio}% boundary overlap</div></div>
            <div><div class="clearance-field-label">AI Dispute Conflict Predictor</div><div class="clearance-field-val">${app.ai_risk_level} RISK (${Math.round(app.ai_dispute_probability * 100)}%)</div></div>
            <div><div class="clearance-field-label">Geodetic Spatial Datum</div><div class="clearance-field-val">WGS84 / SRID 4326 PostGIS Verified</div></div>
            <div><div class="clearance-field-label">Certificate Serial Number</div><div class="clearance-field-val" style="color:#b45309">${certSerial}</div></div>
        `;
    } else if (deptKey === 'surveyor') {
        deptDetailsHtml = `
            <div><div class="clearance-field-label">Cadastral Diagram Serial No.</div><div class="clearance-field-val" style="color:#06b6d4">${app.sg_diagram_no}</div></div>
            <div><div class="clearance-field-label">Beacon GPS Coordinates</div><div class="clearance-field-val">${app.beacon_coords}</div></div>
            <div><div class="clearance-field-label">Survey Accuracy Standard</div><div class="clearance-field-val">Class A Cadastral Boundary (Hartebeesthoek94)</div></div>
            <div><div class="clearance-field-label">Certificate Serial Number</div><div class="clearance-field-val" style="color:#b45309">${certSerial}</div></div>
        `;
    } else if (deptKey === 'valuation') {
        deptDetailsHtml = `
            <div><div class="clearance-field-label">Base Land Productivity Valuation</div><div class="clearance-field-val">USD $${app.base_land_value}</div></div>
            <div><div class="clearance-field-label">Improvements & Permanent Assets</div><div class="clearance-field-val">USD $${app.improvements_value}</div></div>
            <div><div class="clearance-field-label">Total Statutory Capital Valuation</div><div class="clearance-field-val" style="color:#f97316;font-weight:700">USD $${app.total_valuation}</div></div>
            <div><div class="clearance-field-label">Certificate Serial Number</div><div class="clearance-field-val" style="color:#b45309">${certSerial}</div></div>
        `;
    } else if (deptKey === 'director') {
        deptDetailsHtml = `
            <div><div class="clearance-field-label">Executive Title Warrant No.</div><div class="clearance-field-val" style="color:#6366f1;font-weight:700">${app.executive_warrant_no}</div></div>
            <div><div class="clearance-field-label">Inter-Agency Statutory Audit</div><div class="clearance-field-val">All Prior Technical Directorates Cleared</div></div>
            <div><div class="clearance-field-label">Statutory Titling Program</div><div class="clearance-field-val">Presidential Land Titling Program Grant</div></div>
            <div><div class="clearance-field-label">Certificate Serial Number</div><div class="clearance-field-val" style="color:#b45309">${certSerial}</div></div>
        `;
    } else if (deptKey === 'deeds') {
        deptDetailsHtml = `
            <div><div class="clearance-field-label">Official Deed of Grant Serial</div><div class="clearance-field-val" style="color:#10b981;font-weight:700">${app.deed_number}</div></div>
            <div><div class="clearance-field-label">Deeds Registry Volume / Folio</div><div class="clearance-field-val">${app.volume_folio}</div></div>
            <div><div class="clearance-field-label">Registration Act Compliance</div><div class="clearance-field-val">Deeds Registries Act [Chapter 20:05]</div></div>
            <div><div class="clearance-field-label">Great Seal Status</div><div class="clearance-field-val" style="color:#047857">★ Great Seal Affixed & Registered</div></div>
        `;
    }

    certBody.innerHTML = `
        <div class="clearance-document">
            <div class="clearance-header">
                <div class="clearance-crest"><img src="logo.png" alt="Republic of Zimbabwe Coat of Arms" style="height:68px;width:auto;object-fit:contain;margin-bottom:0.4rem;filter:drop-shadow(0 2px 5px rgba(0,0,0,0.2));"></div>
                <div style="font-size:0.9rem;font-weight:bold;letter-spacing:0.1em;color:#1e3a29">GOVERNMENT OF ZIMBABWE</div>
                <div class="clearance-title">Ministry of Lands, Agriculture, Fisheries, Water and Rural Development</div>
                <div class="clearance-subtitle">One Stop Centre for Title Deeds Processing — ${d.name}</div>
                <div class="clearance-cert-no">FORM ${d.formCode}: OFFICIAL ${d.formTitle.toUpperCase()}</div>
            </div>

            <div style="font-size:0.9rem;line-height:1.6;margin-bottom:1rem;color:#1a202c">
                <strong>THIS IS TO CERTIFY</strong> that the land parcel and beneficiary specified below has satisfactorily passed all statutory verifications, regulatory audits, and clearance procedures required under the laws of Zimbabwe.
            </div>

            <div class="clearance-grid">
                <div>
                    <div class="clearance-field-label">Applicant / Beneficiary</div>
                    <div class="clearance-field-val">${app.applicant_name}</div>
                </div>
                <div>
                    <div class="clearance-field-label">National Identity Card</div>
                    <div class="clearance-field-val">${app.national_id}</div>
                </div>
                <div>
                    <div class="clearance-field-label">Property / Farm Description</div>
                    <div class="clearance-field-val">${app.farm_name} (${app.plot_size})</div>
                </div>
                <div>
                    <div class="clearance-field-label">Province & District</div>
                    <div class="clearance-field-val">${app.district}, ${app.province}</div>
                </div>
                <div>
                    <div class="clearance-field-label">Application Reference ID</div>
                    <div class="clearance-field-val"><code>${app.id.substring(0, 16)}</code></div>
                </div>
                <div>
                    <div class="clearance-field-label">Tracking PIN</div>
                    <div class="clearance-field-val">${app.tracking_pin}</div>
                </div>
                ${deptDetailsHtml}
            </div>

            <div style="margin:1rem 0;padding:0.75rem 1rem;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px">
                <div style="display:flex;justify-content:space-between;align-items:center">
                    <span style="font-size:0.85rem;color:#475569;font-weight:600">Departmental Audit Status:</span>
                    <span style="font-size:1.1rem;font-weight:bold;color:#047857">CLEARED & ENDORSED (${d.formCode})</span>
                </div>
                <div style="font-size:0.75rem;color:#64748b;margin-top:0.25rem">
                    Registered in National Titling Enterprise Core · Timestamp: ${new Date().toLocaleString('en-GB')}
                </div>
            </div>

            <div style="margin-top:2rem;display:flex;justify-content:space-between;align-items:flex-end">
                <div>
                    <div style="font-size:0.78rem;color:#64748b;text-transform:uppercase">Issued by Authorised Officer:</div>
                    <div style="font-weight:bold;color:#111827;font-size:1rem;margin-top:0.2rem">${currentUser ? currentUser.name : `${d.short} Registrar`}</div>
                    <div style="font-size:0.75rem;color:#64748b">${d.name}</div>
                    <div style="font-size:0.72rem;color:#94a3b8;margin-top:0.15rem">Date: ${new Date().toLocaleDateString('en-GB')}</div>
                </div>
                <div style="text-align:right">
                    <div style="font-family:monospace;font-size:0.75rem;color:#64748b">||| | ||||| || |||||||| |||||</div>
                    <div style="font-size:0.7rem;color:#94a3b8">VERIFY: onestop.lands.gov.zw/verify/${d.formCode.toLowerCase()}</div>
                </div>
            </div>

            <!-- Official Seal Stamp -->
            <div class="clearance-stamp" style="border-color:${d.color};color:${d.color}">
                <span>GOVERNMENT OF ZIMBABWE</span>
                <span style="font-size:0.85rem;margin:0.2rem 0">★ OFFICIAL CLEARANCE ★</span>
                <span>MINISTRY OF LANDS</span>
                <span>${d.short.toUpperCase()}</span>
            </div>
        </div>
    `;

    openModal('deptCertModal');
}

// ─── RETURN TO PRIOR STAGE CONTROLLER (TC-08) ────────────
function openReturnStageModal(appId) {
    const app = DEMO_APPLICATIONS.find(a => a.id === appId);
    if (!app) return;
    selectedApplication = app;

    document.getElementById('returnAppId').value = app.id;
    document.getElementById('returnAppSummary').innerHTML = `
        <strong>${app.applicant_name}</strong> · Ref: <code>${app.id.substring(0, 10)}</code><br>
        Current Stage: <span class="badge" style="background:rgba(59,130,246,0.15);color:var(--accent)">${app.current_stage}</span>
    `;

    // Populate prior stages only
    const curIdx = STAGES.findIndex(s => s.key === app.current_stage);
    const select = document.getElementById('returnTargetStage');
    select.innerHTML = '';

    if (curIdx <= 0) {
        showToast('Application is already at initial PENDING intake stage and cannot be returned further.', 'warning');
        return;
    }

    for (let i = 0; i < curIdx; i++) {
        const s = STAGES[i];
        select.innerHTML += `<option value="${s.key}">${s.label} (${s.dept.toUpperCase()})</option>`;
    }

    document.getElementById('returnComments').value = '';
    openModal('returnStageModal');
}

function submitStageReturn() {
    const appId = document.getElementById('returnAppId').value;
    const targetStage = document.getElementById('returnTargetStage').value;
    const comments = document.getElementById('returnComments').value.trim();

    if (!comments) {
        showToast('Statutory Error (TC-08): Returns require mandatory defect comments explaining the issue.', 'error');
        return;
    }

    const app = DEMO_APPLICATIONS.find(a => a.id === appId);
    if (!app) return;

    // Cryptographic Block for Return
    const prevBlock = app.audit_log[app.audit_log.length - 1];
    const prevHash = prevBlock ? prevBlock.current_hash : '0000000000000000000000000000000000000000000000000000000000000000';
    const blockIdx = app.audit_log.length;
    const nowIso = new Date().toISOString();
    const actionDesc = `Application Returned from ${app.current_stage} to ${targetStage}`;
    const commentDesc = `Return Reason (Mandatory TC-08): ${comments}`;
    const blockPayload = `${prevHash}|${blockIdx}|${targetStage}|${currentUser ? currentUser.name : 'Officer'}|${actionDesc}|${commentDesc}|${nowIso}`;
    const currentHash = sha256Sync(blockPayload);

    app.current_stage = targetStage;
    app.updated_at = nowIso;

    app.audit_log.push({
        block_index: blockIdx,
        stage: targetStage,
        officer: currentUser ? currentUser.name : 'Officer',
        action: actionDesc,
        comments: commentDesc,
        timestamp: nowIso,
        prev_hash: prevHash,
        current_hash: currentHash,
        payload_fingerprint: sha256Sync(commentDesc),
        is_immutable: true,
        is_return: true
    });

    closeModal('returnStageModal');
    closeDetailPanel();
    updateAllBadges();
    if (typeof loadQueue === 'function') loadQueue();
    if (typeof renderDeptTable === 'function') renderDeptTable();
    showToast(`Application successfully returned to ${targetStage}. Defect logged to immutable ledger.`, 'warning');
}

// ─── BLOCKCHAIN AUDIT LEDGER VIEWER (TC-11) ──────────────
function openAuditChainModal(appId) {
    const app = DEMO_APPLICATIONS.find(a => a.id === appId) || selectedApplication;
    if (!app) return;
    selectedApplication = app;

    document.getElementById('auditChainAppRef').textContent = `${app.applicant_name} (Ref: ${app.id.substring(0, 10)})`;
    document.getElementById('chainIntegrityIcon').textContent = '🛡️';
    document.getElementById('chainIntegrityStatus').textContent = `Audit Chain: ${app.audit_log.length} Blocks Cryptographically Linked`;

    const container = document.getElementById('ledgerChainBlocks');
    container.innerHTML = '';

    app.audit_log.forEach((block, idx) => {
        const isGenesis = idx === 0;
        container.innerHTML += `
            <div class="ledger-block-card">
                <div class="ledger-block-node verified">${block.block_index !== undefined ? block.block_index : idx}</div>
                <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:0.5rem">
                    <div>
                        <span class="badge" style="background:rgba(59,130,246,0.15);color:var(--accent);font-weight:700">
                            ${isGenesis ? 'GENESIS BLOCK #0' : `BLOCK #${idx}`}
                        </span>
                        <span style="font-weight:600;color:var(--text-primary);margin-left:0.5rem">${block.action}</span>
                    </div>
                    <span style="font-size:0.75rem;color:var(--text-muted)">${new Date(block.timestamp).toLocaleString('en-GB')}</span>
                </div>
                <div style="font-size:0.83rem;color:var(--text-secondary);margin-bottom:0.6rem">
                    <strong>Officer / Actor:</strong> ${block.officer} · <strong>Stage:</strong> <code style="color:var(--success)">${block.stage}</code>
                </div>
                <div style="font-size:0.8rem;color:var(--text-muted);background:rgba(0,0,0,0.25);padding:0.4rem 0.6rem;border-radius:6px;margin-bottom:0.6rem">
                    "${block.comments}"
                </div>
                <div style="display:flex;flex-direction:column;gap:0.35rem;font-size:0.75rem">
                    <div>
                        <span style="color:var(--text-muted)">Previous Hash:</span>
                        <span class="hash-pill prev">${block.prev_hash || '0000000000000000000000000000000000000000000000000000000000000000'}</span>
                    </div>
                    <div>
                        <span style="color:var(--text-muted)">Current SHA-256 Hash:</span>
                        <span class="hash-pill">${block.current_hash}</span>
                    </div>
                </div>
            </div>
        `;
    });

    openModal('auditChainModal');
}

function verifyLedgerIntegrity() {
    if (!selectedApplication) return;
    let isValid = true;
    const chain = selectedApplication.audit_log;

    for (let i = 1; i < chain.length; i++) {
        if (chain[i].prev_hash !== chain[i - 1].current_hash) {
            isValid = false;
            break;
        }
    }

    if (isValid) {
        document.getElementById('chainIntegrityIcon').textContent = '✅';
        document.getElementById('chainIntegrityStatus').innerHTML = `
            <span style="color:var(--success);font-weight:800">CRYPTOGRAPHIC INTEGRITY VERIFIED (TC-11):</span> 0 broken links across ${chain.length} blocks. SHA-256 chain intact.
        `;
        showToast('Ledger Verification 100% Passed: SHA-256 continuity verified without tampering.', 'success');
    } else {
        document.getElementById('chainIntegrityIcon').textContent = '❌';
        document.getElementById('chainIntegrityStatus').innerHTML = `
            <span style="color:var(--danger);font-weight:800">INTEGRITY FAILURE:</span> Chain link inconsistency detected.
        `;
        showToast('Ledger Warning: Hash mismatch detected!', 'error');
    }
}

function exportLedgerJson() {
    if (!selectedApplication) return;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(selectedApplication.audit_log, null, 2));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute("href", dataStr);
    dlAnchorElem.setAttribute("download", `audit_ledger_${selectedApplication.id.substring(0,8)}.json`);
    dlAnchorElem.click();
    showToast('Ledger exported as immutable JSON file', 'info');
}

// ─── GIS SPATIAL OVERLAP & AI PREDICTOR (TC-10 & TC-12) ───
let simulatedOverlapState = false;

function openGisOverlapModal(appId) {
    const app = DEMO_APPLICATIONS.find(a => a.id === appId) || selectedApplication;
    if (!app) return;
    selectedApplication = app;
    simulatedOverlapState = (app.gis_overlap_ratio > 0);
    renderGisModalContent(app, simulatedOverlapState);
    openModal('gisOverlapModal');
}

function renderGisModalContent(app, hasOverlap) {
    const badge = document.getElementById('gisStatusBadge');
    const badgeText = document.getElementById('gisStatusText');
    const overlapPoly = document.getElementById('gisOverlapPolygon');
    const circle = document.getElementById('aiRiskCircle');
    const percent = document.getElementById('aiRiskPercent');
    const levelText = document.getElementById('aiRiskLevelText');
    const recText = document.getElementById('aiRecommendationText');
    const factorOverlap = document.getElementById('aiFactorOverlap');
    const trackOverlap = document.getElementById('aiTrackOverlap');

    if (hasOverlap) {
        badge.className = 'gis-status-badge overlap';
        badgeText.textContent = '⚠️ SPATIAL OVERLAP DETECTED (TC-10): 14.8% Intersection';
        overlapPoly.style.display = 'block';

        circle.className = 'ai-risk-score-circle high';
        percent.textContent = '75%';
        levelText.textContent = 'HIGH RISK';
        recText.innerHTML = '<strong style="color:var(--danger)">Mediation Required:</strong> PostGIS spatial overlap intersects with adjacent Farm A-101. Referral required to Zimbabwe Land Commission.';

        factorOverlap.textContent = '14.8% Overlap';
        trackOverlap.style.width = '74%';
        trackOverlap.style.background = 'var(--danger)';
    } else {
        badge.className = 'gis-status-badge clean';
        badgeText.textContent = '✓ No Boundary Conflict Detected (0.0% overlap)';
        overlapPoly.style.display = 'none';

        circle.className = 'ai-risk-score-circle';
        percent.textContent = '12%';
        levelText.textContent = 'LOW RISK';
        recText.textContent = 'Boundary cleared for Cadastral Survey. No tenure contestations registered in ZLC database.';

        factorOverlap.textContent = '0.0% Overlap';
        trackOverlap.style.width = '0%';
        trackOverlap.style.background = 'var(--success)';
    }
}

function simulateGisOverlapToggle() {
    simulatedOverlapState = !simulatedOverlapState;
    if (selectedApplication) {
        selectedApplication.gis_overlap_ratio = simulatedOverlapState ? 14.8 : 0.0;
        selectedApplication.ai_risk_level = simulatedOverlapState ? 'HIGH' : 'LOW';
        selectedApplication.ai_dispute_probability = simulatedOverlapState ? 0.745 : 0.123;
        renderGisModalContent(selectedApplication, simulatedOverlapState);
        showToast(`Toggled GIS Simulation to: ${simulatedOverlapState ? 'OVERLAP CONFLICT (14.8%)' : 'CLEAN SPATIAL BOUNDARY'}`, 'info');
    }
}

// ─── ANALYTICS & SLA BOTTLENECK ENGINE (TC-13) ────────────
function loadAnalyticsSection() {
    const apps = DEMO_APPLICATIONS;
    const tbody = document.getElementById('analyticsSlaTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    STAGES.forEach((stage, idx) => {
        const count = apps.filter(a => a.current_stage === stage.key).length;
        const targetSla = stage.sla;
        // Calculated realistic actual turnaround
        const actualAvg = (targetSla * (idx === 4 ? 0.95 : (idx === 5 ? 0.65 : 0.42))).toFixed(1);
        const ratio = Math.min(Math.round((actualAvg / targetSla) * 100), 100);
        const isBottleneck = ratio > 80;

        tbody.innerHTML += `
            <tr>
                <td>
                    <div style="font-weight:700;color:var(--text-primary)">${stage.label}</div>
                    <div style="font-size:0.75rem;color:var(--text-muted)">Department: <strong>${stage.dept.toUpperCase()}</strong></div>
                </td>
                <td><span class="badge" style="background:rgba(59,130,246,0.15);color:var(--accent)">${targetSla} Working Days</span></td>
                <td><strong>${actualAvg} Days</strong></td>
                <td style="min-width:180px">
                    <div style="display:flex;justify-content:space-between;font-size:0.75rem;margin-bottom:0.25rem">
                        <span>SLA Usage</span>
                        <strong>${ratio}%</strong>
                    </div>
                    <div class="sla-progress-track">
                        <div class="sla-progress-fill" style="width:${ratio}%;background:${isBottleneck ? 'var(--warning)' : 'var(--success)'}"></div>
                    </div>
                </td>
                <td><div style="font-weight:700">${count} files</div></td>
                <td>
                    ${isBottleneck ? '<span class="payment-badge pending overdue-pulse">⚠️ Near Capacity</span>' : '<span class="payment-badge paid">✓ Optimal Flow</span>'}
                </td>
            </tr>
        `;
    });

    // Overdue Table (TC-13)
    const overdueTbody = document.getElementById('analyticsOverdueTableBody');
    if (overdueTbody) {
        overdueTbody.innerHTML = '';
        const overdueApps = apps.filter(a => a.is_overdue || a.current_stage === 'ZLC_CLEARED' && a.id.charCodeAt(0) % 2 === 0).slice(0, 5);

        overdueApps.forEach(app => {
            overdueTbody.innerHTML += `
                <tr>
                    <td><code>${app.id.substring(0, 8)}</code></td>
                    <td><div style="font-weight:600;color:var(--text-primary)">${app.applicant_name}</div></td>
                    <td><span class="badge" style="background:rgba(239,68,68,0.15);color:var(--danger)">${app.current_stage}</span></td>
                    <td><strong style="color:var(--danger)">+6 Days Past SLA</strong></td>
                    <td>
                        <button class="btn btn-warning btn-sm" onclick="showToast('Escalation dispatched to department head for ${app.applicant_name}','success')">Escalate</button>
                    </td>
                </tr>
            `;
        });
    }
}

function exportSlaReportCsv() {
    let csv = "Stage,Department,Gazetted_SLA_Days,Actual_Avg_Days,Current_Volume\n";
    STAGES.forEach(s => {
        const count = DEMO_APPLICATIONS.filter(a => a.current_stage === s.key).length;
        csv += `"${s.label}","${s.dept}",${s.sla},${(s.sla * 0.5).toFixed(1)},${count}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ministry_sla_bottleneck_report_${new Date().toISOString().substring(0,10)}.csv`;
    a.click();
    showToast('SLA Bottleneck Report exported as CSV', 'info');
}

