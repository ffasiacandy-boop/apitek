# Universal Virtual Try-On SaaS (MVP)

Hosted SDK + license server + admin and client dashboards. Try-on runs **entirely in the customer's browser**
(MediaPipe Pose + canvas); no camera frame is ever sent to a server. No payment gateway: you enable/disable/extend licenses by hand.

```
server/   Express API, SQLite (better-sqlite3), license + auth, serves everything below
sdk/      Browser SDK source -> dist/vto.js, dist/vto.min.js (esbuild)
admin/    Admin dashboard   (/admin/)
client/   Merchant dashboard (/client/)
demo/     Demo store        (/demo/)
docs/     integration.md
```

## Run it
Requires Node 18+.
```bash
cp .env.example .env          # edit ADMIN_EMAIL / ADMIN_PASSWORD / JWT_SECRET
npm run setup                 # installs server + sdk deps, builds the SDK
npm start
```
* Admin: http://localhost:4000/admin/  (credentials from `.env`)
* Client: http://localhost:4000/client/ (register, then an admin creates the license)
* Demo: http://localhost:4000/demo/ (seeded license `VT-DEMO-0001`, domain `localhost`; dev only)

## How licensing works
1. SDK `init()` + every modal open -> `POST /api/license/validate {license, domain: location.hostname}`.
2. Backend checks: license exists -> domain is **verified** for that client -> status -> expiry (expiry is computed on the server clock; `EXPIRED` is derived from the date).
3. The browser `Origin` header, when present, must match the claimed domain (page JS cannot forge it).
4. Only ACTIVE passes. The SDK shows the specified message otherwise and never starts the camera.
5. Offline grace: the SDK always asks the backend first, so disabling takes effect on the next open. Only if the backend is unreachable does it honor a previous success for 24h (server-provided), then requires validation again.

Admin controls: create client/license, plan, start/expiry, enable / disable / suspend / reactivate, +30 / +90 / +365 days, add/remove/verify domains.
Clients can edit products and *request* domains (pending until you verify) but have no endpoint that changes license state.

## Security notes
* Passwords: bcrypt (bcryptjs, cost 12). Sessions: HTTP-only, SameSite=Strict cookie holding a JWT whose session id is stored server-side (logout/password change revoke it). Mutating dashboard calls also require an `X-Requested-With` header.
* Rate limits: login (10 failures/15 min), register, license validate (120/min/IP). Helmet headers; strict CSP on the dashboards (all JS external, DOM built with `textContent`).
* CORS is open only on `/api/license/validate`; every other API sends no CORS headers.
* All SQL is parameterized; all inputs validated server-side.
* The public license ID and SDK are visible to anyone. Domain binding + backend validation + minification raise the bar for casual copying, but JavaScript running in a browser can never be fully protected: a determined user can patch the SDK locally. The server only guarantees that *your* license state is enforced for honest embeds and that unlicensed domains cannot validate.
* Production: set `NODE_ENV=production`, a 32+ char `JWT_SECRET`, strong admin password, serve over HTTPS (cookies become `Secure`), set `TRUST_PROXY` behind a proxy, back up `data/`.

## Adding a garment category
1. `sdk/src/adapters/<name>.js` extending `GarmentAdapter` (implement `fit(pose)`).
2. Register it in `sdk/src/adapters/index.js`.
3. Add the key to `SUPPORTED_CATEGORIES` in `server/src/utils/catalog.js`.
Only `tshirt` is implemented; the others are intentionally not stubbed with fake behavior.

## Notes / limits
* MediaPipe's JS and the pose model are fetched from jsDelivr / Google Storage at runtime (override with the `assets` option to self-host). Only library files are downloaded, nothing is uploaded.
* SQLite -> PostgreSQL: schema is plain portable SQL; swap `server/src/db/index.js` and replace `?` placeholders / `lastInsertRowid`.
* Controllers are folded into `routes/` and DB logic into `services/` to keep the MVP small.

## Garment categories in the browser-side MVP

The SDK includes pose-anchored 2D overlay adapters for `tshirt`, `shirt`, `pant` (also accepts `pants`), `saree`, `dress`, `kurti`, and `chudidar` (uses the kurti fit). Select a category in the local demo at `/demo/`.

**Important:** these are transparent garment-image overlays anchored to MediaPipe pose landmarks. They are not photorealistic 3D cloth simulation; garment fit and alignment depend on the transparent image asset and its calibration. Use front-facing transparent garment images with clean cut-outs for best results. Camera frames are processed in the browser; the application does not send camera frames to its backend.

To register a category, add an adapter in `sdk/src/adapters/`, register it in `sdk/src/adapters/index.js`, and include the category in `server/src/utils/catalog.js` so the client product API accepts it.
