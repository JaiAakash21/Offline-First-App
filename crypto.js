// Web Crypto helpers for local-only AES-GCM encryption
// Enforces: No plaintext persisted. Decrypt only in-browser with passphrase-derived key.

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export async function deriveKey(passphrase, saltBytes) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: saltBytes, iterations: 250000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export function getOrCreateSalt() {
  const key = 'offlineFirst.salt';
  let existing = localStorage.getItem(key);
  if (existing) return Uint8Array.from(atob(existing), c => c.charCodeAt(0));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  localStorage.setItem(key, btoa(String.fromCharCode(...salt)));
  return salt;
}

export async function encryptJSON(cryptoKey, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = textEncoder.encode(JSON.stringify(obj));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, data);
  return { iv: Array.from(iv), blob: Array.from(new Uint8Array(cipher)) };
}

export async function decryptJSON(cryptoKey, record) {
  const iv = new Uint8Array(record.iv);
  const buf = new Uint8Array(record.blob);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, buf);
  const json = textDecoder.decode(plain);
  return JSON.parse(json);
}

export function estimateSizeBytes(record) {
  // Rough client-side estimate for storage budgeting
  const ivBytes = record.iv?.length || 0;
  const blobBytes = record.blob?.length || 0;
  return ivBytes + blobBytes;
}
