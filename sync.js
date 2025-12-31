// Sync engine: replays offline actions to a simulated server, builds timeline, resolves conflicts
import { openDB, getAll, putEncrypted, del, clear } from './db.js';
import { decryptJSON, encryptJSON } from './crypto.js';

let cryptoKey;
export function setCryptoKey(key) { cryptoKey = key; }

// Simulated remote store (in-memory for demo)
const remoteState = new Map(); // id -> {title, content, version}

function newVersion(ver) { return (ver || 0) + 1; }

export async function getQueueSizeEstimate() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction('actions').objectStore('actions').count();
    req.onsuccess = () => resolve(req.result || 0);
    req.onerror = () => reject(req.error);
  });
}

async function appendTimeline(entry) {
  const encrypted = await encryptJSON(cryptoKey, { ts: Date.now(), ...entry });
  await putEncrypted('timeline', { id: Date.now() + Math.random(), ...encrypted });
}

function conflictNeeded(localItem, remoteItem) {
  if (!remoteItem) return false;
  return (localItem.version || 0) < (remoteItem.version || 0) && (localItem.title !== remoteItem.title || localItem.content !== remoteItem.content);
}

export async function startSync({ onConflict }) {
  const actionsEncrypted = await getAll('actions');
  const actions = [];
  for (const rec of actionsEncrypted) {
    const a = await decryptJSON(cryptoKey, rec);
    actions.push(a);
  }
  actions.sort((a, b) => a.ts - b.ts);

  for (const action of actions) {
    const { type, payload } = action;
    if (type === 'item:add') {
      const remote = remoteState.get(payload.id);
      if (remote) {
        await appendTimeline({ type, status: 'error', message: 'Duplicate ID on server' });
        continue;
      }
      remoteState.set(payload.id, { title: payload.title, content: payload.content, version: 1 });
      await del('actions', action.id);
      await appendTimeline({ type, status: 'ok', id: payload.id });
    } else if (type === 'item:update') {
      const remote = remoteState.get(payload.id);
      if (conflictNeeded(payload, remote)) {
        const resolution = await onConflict(payload, remote);
        let finalItem = resolution;
        finalItem.version = newVersion(remote?.version);
        remoteState.set(payload.id, finalItem);
        await appendTimeline({ type, status: 'merged', id: payload.id });
        await del('actions', action.id);
      } else {
        const ver = newVersion(remote?.version);
        remoteState.set(payload.id, { title: payload.title, content: payload.content, version: ver });
        await appendTimeline({ type, status: 'ok', id: payload.id });
        await del('actions', action.id);
      }
    } else if (type === 'item:delete') {
      remoteState.delete(payload.id);
      await appendTimeline({ type, status: 'ok', id: payload.id });
      await del('actions', action.id);
    } else {
      await appendTimeline({ type, status: 'skip', message: 'Unknown action' });
    }
  }
}

export function getRemoteSnapshot() {
  const out = [];
  for (const [id, v] of remoteState.entries()) out.push({ id, ...v });
  return out;
}

export async function clearTimeline() { await clear('timeline'); }
