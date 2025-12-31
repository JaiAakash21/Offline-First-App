// Offline notifications: schedule locally and show via Service Worker
import { encryptJSON, decryptJSON } from './crypto.js';
import { putEncrypted, getAll } from './db.js';

let cryptoKey;
export function setCryptoKey(key) { cryptoKey = key; }

export async function requestPermission() {
  const perm = await Notification.requestPermission();
  return perm === 'granted';
}

export async function scheduleNotification(title, whenTs) {
  const rec = { id: 'n-' + whenTs + '-' + Math.random(), title, whenTs, createdAt: Date.now() };
  const enc = await encryptJSON(cryptoKey, rec);
  await putEncrypted('notifications', { id: rec.id, ...enc });

  const delay = Math.max(0, whenTs - Date.now());
  setTimeout(async () => {
    if (navigator.serviceWorker?.controller) {
      const reg = await navigator.serviceWorker.getRegistration();
      reg?.showNotification(title, { body: 'Scheduled offline alert', tag: rec.id });
    }
  }, delay);
}

export async function listNotificationLog() {
  const encs = await getAll('notifications');
  const out = [];
  for (const r of encs) out.push(await decryptJSON(cryptoKey, r));
  out.sort((a, b) => b.whenTs - a.whenTs);
  return out;
}
