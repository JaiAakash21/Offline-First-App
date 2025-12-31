// App bootstrap: encryption, IDB, SW, UI wiring, actions, undo/redo, intel mode, storage
import { deriveKey, getOrCreateSalt, encryptJSON, decryptJSON, estimateSizeBytes } from './crypto.js';
import { openDB, putEncrypted, getAll, del, clear } from './db.js';
import { setCryptoKey as setSyncKey, startSync, getRemoteSnapshot, clearTimeline, getQueueSizeEstimate } from './sync.js';
import { setCryptoKey as setSearchKey, search } from './search.js';
import { setCryptoKey as setNotifyKey, requestPermission, scheduleNotification, listNotificationLog } from './notifications.js';
import { setSimulator } from './simulator.js';

let cryptoKey;
let unlocked = false;

// SW registration
(async function registerSW() {
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.register('./service-worker.js', { scope: './' });
      console.log('SW registered', reg);
    } catch (e) {
      console.warn('SW registration failed', e);
    }
  }
})();

// Background sync trigger helper
async function triggerBackgroundSync() {
  const reg = await navigator.serviceWorker.getRegistration();
  try { await reg?.sync?.register('sync-actions'); } catch (e) { console.warn('Background Sync unavailable', e); }
}

// Unlock encryption
async function unlock(passphrase) {
  const key = await deriveKey(passphrase, getOrCreateSalt());
  cryptoKey = key;
  unlocked = true;
  setSyncKey(cryptoKey);
  setSearchKey(cryptoKey);
  setNotifyKey(cryptoKey);
  await refreshAll();
}

// UI elements
const els = {
  themeToggle: document.getElementById('theme-toggle'),
  loadSamplesBtn: document.getElementById('load-samples-btn'),
  passphrase: document.getElementById('passphrase'),
  unlockBtn: document.getElementById('unlock-btn'),
  itemForm: document.getElementById('item-form'),
  itemTitle: document.getElementById('item-title'),
  itemContent: document.getElementById('item-content'),
  itemsList: document.getElementById('items-list'),
  undoBtn: document.getElementById('undo-btn'),
  redoBtn: document.getElementById('redo-btn'),
  searchInput: document.getElementById('search-input'),
  searchResults: document.getElementById('search-results'),
  timeline: document.getElementById('timeline'),
  syncNowBtn: document.getElementById('sync-now-btn'),
  clearTimelineBtn: document.getElementById('clear-timeline-btn'),
  overviewItems: document.getElementById('overview-items'),
  overviewQueued: document.getElementById('overview-queued'),
  overviewRemote: document.getElementById('overview-remote'),
  remoteList: document.getElementById('remote-list'),
  spinner: document.getElementById('spinner'),
  snackbar: document.getElementById('snackbar'),
};
// Theme toggle
function applyTheme(theme) {
  document.body.dataset.theme = theme;
}
function initTheme() {
  const saved = localStorage.getItem('offlineFirst.theme') || 'light';
  applyTheme(saved);
  els.themeToggle.textContent = saved === 'dark' ? '☀️ Theme' : '🌙 Theme';
}
els.themeToggle?.addEventListener('click', () => {
  const cur = document.body.dataset.theme || 'light';
  const next = cur === 'dark' ? 'light' : 'dark';
  localStorage.setItem('offlineFirst.theme', next);
  applyTheme(next);
  els.themeToggle.textContent = next === 'dark' ? '☀️ Theme' : '🌙 Theme';
});

// Network + offline intelligence
function updateNetworkStatus() {
  const online = navigator.onLine;
  const conn = navigator.connection || {};
  const type = conn.effectiveType || 'unknown';
  const down = conn.downlink || 0;
  if (els.syncNowBtn) {
    if (!online || type.includes('2g') || down < 0.5) {
      els.syncNowBtn.disabled = !online;
    } else {
      els.syncNowBtn.disabled = false;
    }
  }
}
window.addEventListener('online', updateNetworkStatus);
window.addEventListener('offline', updateNetworkStatus);
if (navigator.connection) navigator.connection.addEventListener('change', updateNetworkStatus);

// Items CRUD and action recording
async function listItems() {
  if (!unlocked) return;
  const encs = await getAll('items');
  const items = [];
  for (const r of encs) items.push(await decryptJSON(cryptoKey, r));
  items.sort((a, b) => b.updatedAt - a.updatedAt);
  if (els.overviewItems) els.overviewItems.textContent = items.length;
  els.itemsList.innerHTML = '';
  for (const it of items) {
    const li = document.createElement('li');
    li.innerHTML = `<strong>${it.title}</strong><br/><small>${new Date(it.updatedAt).toLocaleString()}</small><p>${it.content}</p>`;
    const row = document.createElement('div');
    row.className = 'row';
    const editBtn = document.createElement('button'); editBtn.textContent = 'Edit';
    const delBtn = document.createElement('button'); delBtn.textContent = 'Delete';
    row.appendChild(editBtn); row.appendChild(delBtn);
    li.appendChild(row);
    editBtn.onclick = async () => {
      const title = prompt('New title', it.title) ?? it.title;
      const content = prompt('New content', it.content) ?? it.content;
      const updated = { ...it, title, content, updatedAt: Date.now(), interactions: (it.interactions || 0) + 1, version: (it.version || 0) + 1 };
      await recordAction('item:update', updated);
      await putItem(updated);
      await listItems();
      await updateSearchResults();
    };
    delBtn.onclick = async () => {
      await recordAction('item:delete', { id: it.id });
      await del('items', it.id);
      await listItems();
      await updateSearchResults();
    };
    els.itemsList.appendChild(li);
  }
}

async function putItem(item) {
  const enc = await encryptJSON(cryptoKey, item);
  await putEncrypted('items', { id: item.id, ...enc });
}

async function updateOverviewQueued() {
  const size = await getQueueSizeEstimate();
  if (els.overviewQueued) els.overviewQueued.textContent = size;
}

async function recordAction(type, payload) {
  const action = { id: 'a-' + Date.now() + '-' + Math.random(), type, payload, ts: Date.now() };
  const enc = await encryptJSON(cryptoKey, action);
  await putEncrypted('actions', { id: action.id, ...enc });
  await updateOverviewQueued();
  toast(`${type} queued`);
}

// Undo/Redo persisted
let undoStack = [];
let redoStack = [];
async function pushHistory(entry) {
  undoStack.push(entry);
  redoStack = [];
}
async function undo() {
  const entry = undoStack.pop(); if (!entry) return;
  redoStack.push(entry);
  if (entry.type === 'add') {
    await del('items', entry.item.id);
    await recordAction('item:delete', { id: entry.item.id });
  } else if (entry.type === 'update') {
    await putItem(entry.prev);
    await recordAction('item:update', entry.prev);
  } else if (entry.type === 'delete') {
    await putItem(entry.item);
    await recordAction('item:add', entry.item);
  }
  await listItems();
}
async function redo() {
  const entry = redoStack.pop(); if (!entry) return;
  undoStack.push(entry);
  if (entry.type === 'add') {
    await putItem(entry.item);
    await recordAction('item:add', entry.item);
  } else if (entry.type === 'update') {
    await putItem(entry.next);
    await recordAction('item:update', entry.next);
  } else if (entry.type === 'delete') {
    await del('items', entry.item.id);
    await recordAction('item:delete', { id: entry.item.id });
  }
  await listItems();
}

els.undoBtn.onclick = () => undo();
els.redoBtn.onclick = () => redo();

// Add item
els.itemForm.addEventListener('submit', async (e) => {
  e.preventDefault(); if (!unlocked) return alert('Unlock first');
  const item = { id: 'i-' + Date.now() + '-' + Math.random(), title: els.itemTitle.value.trim(), content: els.itemContent.value.trim(), ts: Date.now(), updatedAt: Date.now(), version: 1, interactions: 1 };
  await putItem(item);
  await recordAction('item:add', item);
  await pushHistory({ type: 'add', item });
  e.target.reset();
  await listItems();
  await updateSearchResults();
});

// Search
async function updateSearchResults() {
  const q = els.searchInput.value.trim();
  if (!q) { els.searchResults.innerHTML = ''; return; }
  const results = await search(q);
  els.searchResults.innerHTML = results.map(r => `<li><strong>${r.title}</strong> <small>(score ${r.score.toFixed(2)})</small><p>${r.content}</p></li>`).join('');
}
els.searchInput.addEventListener('input', updateSearchResults);

// Timeline
async function renderTimeline() {
  if (!unlocked) return;
  const encs = await getAll('timeline');
  const rows = [];
  for (const r of encs) rows.push(await decryptJSON(cryptoKey, r));
  rows.sort((a, b) => a.ts - b.ts);
  els.timeline.innerHTML = rows.map(r => {
    const cls = `status status-${r.status}`;
    return `<li><span class="${cls}">${r.status}</span><span>[${new Date(r.ts).toLocaleTimeString()}]</span> <span>${r.type}</span> <span>${r.id ? '(' + r.id + ')' : ''}</span> ${r.message ? '<em>' + r.message + '</em>' : ''}</li>`;
  }).join('');
}

els.clearTimelineBtn.addEventListener('click', async () => { await clearTimeline(); await renderTimeline(); });

// Auto-merge conflicts (keep local version)
async function onConflict(localItem, remoteItem) {
  toast(`Auto-merged conflict for: ${localItem.id}`);
  return localItem; // Keep local changes
}

// Sync
els.syncNowBtn.addEventListener('click', async () => {
  showSpinner(true);
  await startSync({ onConflict });
  await renderTimeline();
  await renderRemote();
  showSpinner(false);
  toast('Sync complete');
});

// Receive SW messages
navigator.serviceWorker?.addEventListener('message', async (event) => {
  const { type } = event.data || {};
  if (type === 'RUN_SYNC') {
    await startSync({ onConflict });
    await renderTimeline();
  }
});

// Storage usage indicator
async function updateStorageUsage() {
  const est = await navigator.storage?.estimate?.();
  const usedMB = est?.usage ? (est.usage / (1024 * 1024)).toFixed(2) : 'n/a';
  const quotaMB = est?.quota ? (est.quota / (1024 * 1024)).toFixed(2) : 'n/a';
  // Header badges removed; only show warning via snackbar
  if (est?.usage && est?.quota && est.usage / est.quota > 0.8) {
    toast('Warning: storage near browser limit');
  }
}

// Remote snapshot
async function renderRemote() {
  const rows = getRemoteSnapshot();
  if (els.overviewRemote) els.overviewRemote.textContent = rows.length;
  if (els.remoteList) els.remoteList.innerHTML = rows.map(r => `<li><strong>${r.title}</strong> <small>(v${r.version})</small><p>${r.content}</p></li>`).join('');
}

// Spinner + Snackbar
function showSpinner(flag) { if (els.spinner) els.spinner.hidden = !flag; }
function toast(msg) {
  if (!els.snackbar) return;
  els.snackbar.textContent = msg;
  els.snackbar.hidden = false;
  setTimeout(() => { els.snackbar.hidden = true; }, 2000);
}

// Refresh all UI after unlock
async function refreshAll() {
  await listItems();
  await renderTimeline();
  await updateStorageUsage();
  await renderRemote();
  toast('Unlocked successfully!');
}

// Initial wiring
initTheme();
updateNetworkStatus();
if (els.unlockBtn) els.unlockBtn.addEventListener('click', async () => {
  const pw = els.passphrase.value.trim();
  if (!pw) return alert('Enter passphrase');
  await unlock(pw);
});

// Demo convenience: prefill a passphrase to try quickly
if (els.passphrase) els.passphrase.value = 'demo-pass';

// Kick off storage usage loop
setInterval(updateStorageUsage, 5000);

// Try background sync if online
window.addEventListener('online', triggerBackgroundSync);

// Sample data loader
async function loadSamples() {
  if (!unlocked) return alert('Unlock first');
  const now = Date.now();
  const samples = [
    { id: 'i-s-1', title: '📦 Project Planning', content: 'Define scope, milestones, and deliverables for Q1 2025 offline-first initiative.', ts: now, updatedAt: now, version: 1, interactions: 5 },
    { id: 'i-s-2', title: '📝 Meeting Notes', content: 'Discussed IndexedDB strategies and encryption patterns. Action: Implement background sync.', ts: now + 1000, updatedAt: now + 1000, version: 1, interactions: 3 },
    { id: 'i-s-3', title: '💡 Feature Ideas', content: 'Add conflict resolver UI. Consider diff visualization. Test with large datasets offline.', ts: now + 2000, updatedAt: now + 2000, version: 1, interactions: 7 },
    { id: 'i-s-4', title: '✅ Tasks', content: 'Complete encryption module. Write unit tests. Deploy service worker to staging.', ts: now + 3000, updatedAt: now + 3000, version: 1, interactions: 2 },
    { id: 'i-s-5', title: '🔍 Research', content: 'Web Crypto API best practices. PBKDF2 iterations benchmark. AES-GCM vs ChaCha20.', ts: now + 4000, updatedAt: now + 4000, version: 1, interactions: 4 },
    { id: 'i-s-6', title: '📊 Analytics Data', content: 'Track offline usage patterns. Monitor sync queue depth. Measure encryption overhead.', ts: now + 5000, updatedAt: now + 5000, version: 1, interactions: 6 },
  ];
  
  for (const it of samples) {
    await putItem(it);
    await recordAction('item:add', it);
    await pushHistory({ type: 'add', item: it });
  }

  // First sync to establish remote baseline
  showSpinner(true);
  await startSync({ onConflict });
  await renderTimeline();
  await renderRemote();
  showSpinner(false);

  // Create local edits for demo (edit items 2 and 3)
  const edit1 = { ...samples[1], title: '📝 Meeting Notes (updated)', content: 'Updated: Also discussed service worker caching strategies and offline UX patterns.', updatedAt: now + 6000, version: 1, interactions: 4 };
  await putItem(edit1);
  await recordAction('item:update', edit1);
  
  const edit2 = { ...samples[2], title: '💡 Feature Ideas (expanded)', content: 'Added: Consider progressive sync, batch operations, and optimistic UI updates for better UX.', updatedAt: now + 7000, version: 1, interactions: 8 };
  await putItem(edit2);
  await recordAction('item:update', edit2);

  await listItems();
  toast('✅ Sample data loaded! Try editing items and syncing.');
}

els.loadSamplesBtn?.addEventListener('click', loadSamples);
