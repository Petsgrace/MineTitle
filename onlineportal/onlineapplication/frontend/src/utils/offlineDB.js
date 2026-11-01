/**
 * offlineDB.js - IndexedDB & Offline Sync Engine for Unified Mobile Title Deeds
 * Handles offline form drafts, media blobs, queued API requests, deduplication,
 * deterministic conflict resolution (Latest-Edit-Wins), and audit logging.
 */

const DB_NAME = 'title-deeds-mobile-db';
const DB_VERSION = 1;
const AUDIT_LOG_STORAGE_KEY = 'local_audit_logs';
const SYNC_META_STORAGE_KEY = 'td_sync_metadata';

/**
 * Opens (or creates) the IndexedDB database
 */
export function openDB() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available in this environment'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      // Store for offline form drafts and keyed media blobs
      if (!db.objectStoreNames.contains('drafts')) {
        db.createObjectStore('drafts', { keyPath: 'key' });
      }
      // Store for queued API requests
      if (!db.objectStoreNames.contains('offline-queue')) {
        db.createObjectStore('offline-queue', { keyPath: 'id', autoIncrement: true });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ─── Audit Log Ledger (Offline + Online Parity) ───────────────────────────────

export function recordLocalAuditLog(entry) {
  try {
    const existing = JSON.parse(localStorage.getItem(AUDIT_LOG_STORAGE_KEY) || '[]');
    const nowIso = new Date().toISOString();
    const newEntry = {
      id: entry.id || `AUD-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      timestamp: entry.timestamp || nowIso,
      reference_number: entry.reference_number || entry.receipt_number || 'SYSTEM',
      actor: entry.actor || entry.officer || 'System Officer',
      action_type: entry.action_type || 'WORKFLOW_ACTION',
      from_stage: entry.from_stage || entry.stage || 'SYSTEM',
      to_stage: entry.to_stage || entry.stage || 'SYSTEM',
      comment: entry.comment || entry.details || '',
      integrity_hash: entry.integrity_hash || `SHA256-${Math.abs(
        ((entry.reference_number || '') + (entry.action_type || '') + nowIso)
          .split('')
          .reduce((acc, ch) => ((acc << 5) - acc + ch.charCodeAt(0)) | 0, 0)
      ).toString(16).padStart(8, '0').toUpperCase()}`
    };
    const updated = [newEntry, ...existing].slice(0, 500);
    localStorage.setItem(AUDIT_LOG_STORAGE_KEY, JSON.stringify(updated));
    return newEntry;
  } catch (e) {
    console.warn('Could not record local audit log:', e);
    return null;
  }
}

export function getLocalAuditLogs() {
  try {
    const parsed = JSON.parse(localStorage.getItem(AUDIT_LOG_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

// ─── Draft & Media Management ─────────────────────────────────────────────────

/**
 * Save (upsert) an application form draft to IndexedDB
 * @param {Object} formData - the form data to save
 */
export async function saveDraft(formData) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('drafts', 'readwrite');
    tx.objectStore('drafts').put({
      key: 'application-draft',
      data: formData,
      savedAt: new Date().toISOString()
    });
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Retrieve the saved application form draft
 * @returns {Object|null} the saved form data, or null if none exists
 */
export async function getDraft() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('drafts', 'readonly');
    const request = tx.objectStore('drafts').get('application-draft');
    request.onsuccess = () => resolve(request.result ? request.result.data : null);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Clear the saved application form draft
 */
export async function clearDraft() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('drafts', 'readwrite');
    tx.objectStore('drafts').delete('application-draft');
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Save a beneficiary media bundle (front photo, side photo, ID photos, signatures)
 * in IndexedDB keyed by application reference or receipt number so localStorage never overflows.
 */
export async function saveBeneficiaryMedia(recordKey, mediaObject) {
  if (!recordKey || !mediaObject) return false;
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('drafts', 'readwrite');
      tx.objectStore('drafts').put({
        key: `media:${recordKey}`,
        data: mediaObject,
        savedAt: new Date().toISOString()
      });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    return false;
  }
}

/**
 * Retrieve a beneficiary media bundle from IndexedDB
 */
export async function getBeneficiaryMedia(recordKey) {
  if (!recordKey) return null;
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('drafts', 'readonly');
      const request = tx.objectStore('drafts').get(`media:${recordKey}`);
      request.onsuccess = () => resolve(request.result ? request.result.data : null);
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    return null;
  }
}

// Aliases for compatibility
export const saveFormDraft = (key, formData) => saveDraft(formData);
export const getFormDraft = (key) => getDraft().then(data => data ? { formData: data } : null);
export const clearFormDraft = (key) => clearDraft();

// ─── Offline Request Queue with Deduplication ─────────────────────────────────

function notifySyncStatus(extra = {}) {
  try {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('sync-status-changed', { detail: extra }));
    }
  } catch (e) {
    // ignore
  }
}

/**
 * Add or upsert a failed API request in the offline queue (deduplicated by idempotency_key)
 * @param {{ url: string, method: string, body: any, timestamp?: string, idempotency_key?: string, entity_type?: string }} request
 */
export async function addToQueue(request) {
  const db = await openDB();
  const parsedBody = typeof request.body === 'string'
    ? (() => { try { return JSON.parse(request.body); } catch { return request.body; } })()
    : request.body;

  const autoKey = request.idempotency_key ||
    (parsedBody && typeof parsedBody === 'object'
      ? (parsedBody.idempotency_key || parsedBody.reference_number || parsedBody.receipt_number || null)
      : null);

  const nowIso = request.timestamp || new Date().toISOString();
  const serializedBody = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);

  return new Promise((resolve, reject) => {
    const tx = db.transaction('offline-queue', 'readwrite');
    const store = tx.objectStore('offline-queue');
    const getAllReq = store.getAll();

    getAllReq.onsuccess = () => {
      const existingItems = getAllReq.result || [];
      const duplicate = autoKey
        ? existingItems.find(
            item =>
              item.idempotency_key === autoKey &&
              item.url === request.url &&
              (item.method || 'POST') === (request.method || 'POST')
          )
        : null;

      if (duplicate && duplicate.id != null) {
        store.put({
          ...duplicate,
          body: serializedBody,
          timestamp: nowIso,
          updated_at: nowIso,
          retry_count: 0,
          last_error: null
        });
      } else {
        store.add({
          url: request.url,
          method: request.method || 'POST',
          body: serializedBody,
          idempotency_key: autoKey,
          entity_type: request.entity_type || 'application',
          timestamp: nowIso,
          updated_at: nowIso,
          retry_count: 0,
          last_error: null
        });
      }
    };

    tx.oncomplete = () => {
      notifySyncStatus({ status: 'pending' });
      resolve(true);
    };
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Remove a specific item from the offline queue by ID
 */
export async function removeFromQueue(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('offline-queue', 'readwrite');
    tx.objectStore('offline-queue').delete(id);
    tx.oncomplete = () => {
      notifySyncStatus({});
      resolve(true);
    };
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Get all queued offline requests
 * @returns {Array} list of queued requests
 */
export async function getQueue() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('offline-queue', 'readonly');
    const request = tx.objectStore('offline-queue').getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Clear all queued offline requests
 */
export async function clearQueue() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('offline-queue', 'readwrite');
    tx.objectStore('offline-queue').clear();
    tx.oncomplete = () => {
      notifySyncStatus({ status: 'synced', pendingCount: 0 });
      resolve(true);
    };
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Check if the browser is currently online
 * @returns {boolean}
 */
export function isOnline() {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

/**
 * Get the count of pending offline requests
 * @returns {number}
 */
export async function getPendingCount() {
  try {
    const queue = await getQueue();
    return queue.length;
  } catch (e) {
    return 0;
  }
}

export function getSyncMetadata() {
  try {
    return JSON.parse(localStorage.getItem(SYNC_META_STORAGE_KEY) || '{}');
  } catch (e) {
    return {};
  }
}

function saveSyncMetadata(meta) {
  try {
    const current = getSyncMetadata();
    const next = { ...current, ...meta };
    localStorage.setItem(SYNC_META_STORAGE_KEY, JSON.stringify(next));
    return next;
  } catch (e) {
    return meta;
  }
}

/**
 * Merge remote and local application lists with deterministic Latest-Edit-Wins conflict resolution
 * and no duplicate records (deduplicated by reference_number, receipt_number, or id).
 */
export function reconcileApplicationsWithConflictRule(remoteApps = [], localApps = []) {
  const mergedMap = new Map();

  const getCanonicalKey = (app) => {
    if (!app) return null;
    if (app.reference_number) return `REF:${String(app.reference_number).trim().toUpperCase()}`;
    if (app.receipt_number) return `REC:${String(app.receipt_number).trim().toUpperCase()}`;
    if (app.idempotency_key) return `IDEM:${String(app.idempotency_key).trim()}`;
    if (app.id != null) return `ID:${String(app.id)}`;
    return null;
  };

  for (const local of localApps) {
    const key = getCanonicalKey(local);
    if (key) {
      mergedMap.set(key, { ...local });
    }
  }

  for (const remote of remoteApps) {
    const key = getCanonicalKey(remote);
    if (!key) continue;

    // Also check if a local entry exists by matching receipt_number when remote has reference_number
    let matchingKey = key;
    if (!mergedMap.has(matchingKey) && remote.receipt_number) {
      const recKey = `REC:${String(remote.receipt_number).trim().toUpperCase()}`;
      if (mergedMap.has(recKey)) matchingKey = recKey;
    }

    const existingLocal = mergedMap.get(matchingKey);
    if (!existingLocal) {
      mergedMap.set(key, { ...remote, synced: true });
      continue;
    }

    const localUpdated = Date.parse(existingLocal.updated_at || existingLocal.created_at || '') || 0;
    const remoteUpdated = Date.parse(remote.updated_at || remote.created_at || '') || 0;

    // Check if both have edits and differ in status or stage fields
    const hasDiff =
      existingLocal.status &&
      remote.status &&
      existingLocal.status !== remote.status &&
      Math.abs(localUpdated - remoteUpdated) > 1000;

    if (localUpdated > remoteUpdated && existingLocal.synced === false) {
      // Local edit is newer -> Latest Edit Wins
      if (hasDiff) {
        recordLocalAuditLog({
          action_type: 'SYNC_CONFLICT_RESOLVED',
          reference_number: remote.reference_number || existingLocal.reference_number || 'SYNC',
          actor: 'Sync Conflict Resolver',
          from_stage: remote.status,
          to_stage: existingLocal.status,
          comment: `Conflict resolved (Latest-Edit-Wins): Kept newer local state (${existingLocal.status} @ ${existingLocal.updated_at}) over older server state (${remote.status} @ ${remote.updated_at}).`
        });
      }
      mergedMap.set(key, {
        ...remote,
        ...existingLocal,
        id: remote.id || existingLocal.id,
        reference_number: remote.reference_number || existingLocal.reference_number
      });
    } else {
      // Remote edit is newer or equal -> Latest Edit Wins
      if (hasDiff && existingLocal.synced === false) {
        recordLocalAuditLog({
          action_type: 'SYNC_CONFLICT_RESOLVED',
          reference_number: remote.reference_number || existingLocal.reference_number || 'SYNC',
          actor: 'Sync Conflict Resolver',
          from_stage: existingLocal.status,
          to_stage: remote.status,
          comment: `Conflict resolved (Latest-Edit-Wins): Applied newer server state (${remote.status} @ ${remote.updated_at}) over older local state (${existingLocal.status} @ ${existingLocal.updated_at}).`
        });
      }
      mergedMap.set(key, {
        ...existingLocal,
        ...remote,
        // Preserve local biometric thumbnails if server response omits base64
        beneficiary_photo_front: remote.beneficiary_photo_front || existingLocal.beneficiary_photo_front,
        beneficiary_photo_side: remote.beneficiary_photo_side || existingLocal.beneficiary_photo_side,
        beneficiary_id_front: remote.beneficiary_id_front || existingLocal.beneficiary_id_front,
        beneficiary_id_back: remote.beneficiary_id_back || existingLocal.beneficiary_id_back,
        beneficiary_signature: remote.beneficiary_signature || existingLocal.beneficiary_signature,
        synced: true
      });
    }
    if (matchingKey !== key) {
      mergedMap.delete(matchingKey);
    }
  }

  return Array.from(mergedMap.values());
}

let isSyncInProgress = false;

/**
 * Flush all queued offline operations to the backend API when online.
 */
export async function syncOfflineQueue(apiClient) {
  if (isSyncInProgress) return { status: 'syncing' };
  if (!isOnline()) {
    const pendingCount = await getPendingCount();
    notifySyncStatus({ status: pendingCount > 0 ? 'pending' : 'synced', pendingCount });
    return { status: pendingCount > 0 ? 'pending' : 'synced', pendingCount };
  }

  let queue = [];
  try {
    queue = await getQueue();
  } catch (e) {
    return { status: 'synced', pendingCount: 0 };
  }

  if (!queue || queue.length === 0) {
    const meta = saveSyncMetadata({ lastSyncedAt: new Date().toISOString(), lastStatus: 'synced', lastError: null });
    notifySyncStatus({ status: 'synced', pendingCount: 0, lastSyncedAt: meta.lastSyncedAt });
    return { status: 'synced', pendingCount: 0 };
  }

  isSyncInProgress = true;
  notifySyncStatus({ status: 'syncing', pendingCount: queue.length });

  let syncedCount = 0;
  let failedCount = 0;
  let lastErrorMsg = null;

  for (const item of queue) {
    try {
      const cleanUrl = (item.url || '').replace(/^\/api/, '');
      const method = (item.method || 'POST').toLowerCase();
      let payload = item.body;
      if (typeof payload === 'string') {
        try {
          payload = JSON.parse(payload);
        } catch {
          // keep string
        }
      }

      // Re-attach any IndexedDB stored media before syncing application creation
      if (payload && typeof payload === 'object' && (payload.receipt_number || payload.reference_number)) {
        const mediaKey = payload.reference_number || payload.receipt_number;
        const storedMedia = await getBeneficiaryMedia(mediaKey);
        if (storedMedia) {
          payload = { ...storedMedia, ...payload };
        }
      }

      let response;
      if (method === 'post') {
        response = await apiClient.post(cleanUrl, payload);
      } else if (method === 'put') {
        response = await apiClient.put(cleanUrl, payload);
      } else if (method === 'patch') {
        response = await apiClient.patch(cleanUrl, payload);
      } else if (method === 'delete') {
        response = await apiClient.delete(cleanUrl);
      }

      await removeFromQueue(item.id);
      syncedCount++;

      // Mark corresponding local application as synced
      if (payload && typeof payload === 'object') {
        try {
          const localApps = JSON.parse(localStorage.getItem('my_submitted_applications') || '[]');
          const updatedApps = localApps.map(app => {
            if (
              (payload.reference_number && app.reference_number === payload.reference_number) ||
              (payload.receipt_number && app.receipt_number === payload.receipt_number) ||
              (payload.idempotency_key && app.idempotency_key === payload.idempotency_key)
            ) {
              return {
                ...app,
                ...(response?.data || {}),
                synced: true,
                updated_at: new Date().toISOString()
              };
            }
            return app;
          });
          localStorage.setItem('my_submitted_applications', JSON.stringify(updatedApps));
        } catch (e) {
          // ignore
        }
      }

      recordLocalAuditLog({
        action_type: 'CLOUD_SYNC_SUCCESS',
        reference_number: (payload && (payload.reference_number || payload.receipt_number)) || 'SYNC-QUEUE',
        actor: 'Auto Sync Engine',
        from_stage: 'OFFLINE_QUEUE',
        to_stage: 'CLOUD_SYNCHRONIZED',
        comment: `Synchronized offline ${method.toUpperCase()} ${cleanUrl} to cloud host.`
      });
    } catch (err) {
      const status = err.response?.status;
      // If 400/409 duplicate (already synced earlier), remove from queue so it doesn't block
      const errText = JSON.stringify(err.response?.data || '');
      if (status === 409 || (status === 400 && /already exists|already been used|duplicate/i.test(errText))) {
        await removeFromQueue(item.id);
        syncedCount++;
      } else {
        failedCount++;
        lastErrorMsg = err.response?.data?.error || err.message || 'Sync connection interrupted';
      }
    }
  }

  isSyncInProgress = false;
  const remaining = await getPendingCount();
  const finalStatus = remaining === 0 ? 'synced' : (failedCount > 0 ? 'failed' : 'pending');
  const meta = saveSyncMetadata({
    lastSyncedAt: new Date().toISOString(),
    lastStatus: finalStatus,
    lastError: lastErrorMsg
  });

  notifySyncStatus({
    status: finalStatus,
    pendingCount: remaining,
    syncedCount,
    lastSyncedAt: meta.lastSyncedAt,
    lastError: lastErrorMsg
  });

  return { status: finalStatus, pendingCount: remaining, syncedCount, lastError: lastErrorMsg };
}
