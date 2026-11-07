# Offline-First Web App 

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE) [![Live demo](https://img.shields.io/badge/Live%20demo-online-brightgreen?style=flat-square)](https://offline-first-app-seven.vercel.app) ![PWA](https://img.shields.io/badge/PWA-5A0FC8?style=flat-square&logo=pwa&logoColor=white) ![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=white) ![IndexedDB](https://img.shields.io/badge/IndexedDB-blue?style=flat-square)

This app showcases a comprehensive offline-first strategy:

- Offline Activity Replay (record, queue, replay)
- Sync Timeline UI (visible, step-by-step status)
- Smart Conflict Resolver (visual diff slider; Keep Mine/Remote/Merge)
- Offline Intelligence Mode (network-aware; auto-disable online-only actions)
- Local-Only Encrypted Storage (Web Crypto AES-GCM; no plaintext persisted)
- Offline Search Engine (full-text with frequency/recency/interaction ranking)
- Offline Notifications (schedule offline; sync logs online)
- Sync Simulator Panel (toggle offline; simulate slow network; view queue)
- Data Weight Indicator (storage usage + limit warnings)
- Offline Undo History (undo/redo persists via local records)

## Tech Stack
- Frontend: HTML, CSS, JavaScript
- Storage: IndexedDB (encrypted blobs)
- Offline handling: Service Worker (precaching, fetch fallback)
- Encryption: Web Crypto API (AES-GCM; PBKDF2 key derivation)
- Sync strategy: Background Sync API (tag `sync-actions`)

## How Offline Works
- All user actions (add/update/delete) are recorded into an encrypted `actions` queue in IndexedDB.
- UI reads/writes only to local encrypted stores; no plaintext persisted.
- Service Worker precaches static assets for instant offline.
- When the network is available (or Background Sync fires), actions are replayed sequentially to a simulated server (in-memory for demo) via the sync engine.

## Conflict Handling
- Each item is versioned; if the remote version is newer than the local base, a conflict is detected.
- The **Conflict Resolver** UI displays Mine vs Remote snapshots with a visual slider.
- Options: **Keep Mine**, **Keep Remote**, or **Merge** (simple best-effort heuristic).
- Resolutions are applied and recorded in the **Sync Timeline**.

## Encryption Strategy (Local-Only)
- A passphrase is required to unlock local data; keys are derived via PBKDF2 using a stored salt.
- Data is encrypted with AES-GCM before writing to IndexedDB; only encrypted blobs are stored.
- Decryption happens solely in the browser memory; no plaintext is persisted.
- For demo convenience, the passphrase field defaults to `demo-pass` — change it to your own.

## Offline Intelligence Mode
- The app monitors `navigator.onLine` and `navigator.connection`.
- Under poor or absent connectivity, online-only actions (like Sync) are disabled.
- The mode indicator reflects current status and constraints.

## Offline Search Engine
- Searches are computed client-side from local encrypted data once unlocked.
- Ranking combines term frequency, recency weighting, and interaction count.

## Notifications
- Request permission, then schedule notifications offline.
- The Service Worker displays notifications at the scheduled time.
- A local log shows scheduled alerts.

## Sync Simulator (Developer Mode)
- Toggle **Force Offline** and set **Slow Internet delay**.
- The Service Worker honors these overrides for fetch behavior.
- The queue panel shows the number of pending actions.

## Data Weight Indicator
- Uses `navigator.storage.estimate()` to show usage/quota.
- Warns at >= 80% of quota, helping avoid browser limits.

## Undo/Redo History
- Actions are mirrored into a history stack (undo/redo) and re-applied to local stores.
- This history remains effective after reload once you unlock the data.

## Running Locally
Use any static server to host this folder (Service Workers require http/https origins). Examples:

### Python (if installed)
```bash
python -m http.server 5500
```
Open: http://localhost:5500/offline-first-app/

### Node (serve)
```bash
npx serve .
```
Open: http://localhost:3000/offline-first-app/

## Why This App Is Unique
- It integrates a full suite of offline-first features end-to-end, suitable for demos and interviews.
- Security-first storage: encrypted by default, no plaintext at rest.
- Practical conflict resolution UX with visibility via Sync Timeline.
- Developer-focused tools to simulate network conditions and visualize sync queues.

## Notes
- Background Sync may be unavailable on some browsers; manual Sync works regardless.
- The server is simulated in-memory for demo; replace `sync.js` with your real API calls.

## LINK :
- https://offline-first-app-jk.vercel.app/

## License

Distributed under the MIT License. See [LICENSE](LICENSE) for details.

## Author

Built by [Jai Aakash S](https://github.com/JaiAakash21) · [Portfolio](https://jaiaakash.xyz) · [LinkedIn](https://www.linkedin.com/in/jaiaakash21)
