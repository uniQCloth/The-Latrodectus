# Changelog

All notable changes to The Latrodectus.

---

## [v0.10] — 2026-08-28 / Visual & Performance Overhaul

### Fixed — Graphics & Rendering
- **Enabled WebGL antialiasing** (`antialias: true`) — text and graphics are now crisp instead of fuzzy
- **Disabled pixel rounding** (`roundPixels: false`) — eliminates blur when canvas is FIT-scaled
- **Added `pixelArt: false`** — smooth bilinear scaling instead of nearest-neighbor
- **Replaced massive off-screen graphics** — all `fillRect`/`drawPipeSeams` ranges reduced from -60000/70000px to viewport-bounded `height * 3`, eliminating wasteful GPU overdraw
- **Increased small HUD font sizes** — tile counter, round info, connection label, balance text all bumped up with added stroke for readability

### Fixed — Smoothness & Camera
- **Added camera follow lerp** — camera now smoothly interpolates to spider position with configurable lag (`camFollowLerp = 0.08`), replacing jarring snaps
- **Smoothed auto-climb camera** — server mode camera now lerps to target instead of snapping
- **Improved climb lerp factor** — 0.07 → 0.09 for tighter spider follow
- **Increased offline camera lerp** — 0.12 → 0.14 for smoother free-climb feel

### Changed
- `main.js`: `antialias: false` → `antialias: true`, `roundPixels: true` → `roundPixels: false`, added `pixelArt: false`
- `GameScene.js`: viewport-bounded graphics rendering, camera smoothing, all `-60000`/`70000` constants removed
- `UIScene.js`: font size bumps + stroke on tile/round/connection text

## [Unreleased] — 2026-08-22 / 2026-08-23

### Added

#### Authentication System (full login/register flow)
- **`client/src/scenes/UsernameScene.js`** — completely new scene that gates the game behind auth
  - Two tabs: LOGIN and REGISTER
  - Register fields: username (unique, 3–20 chars, letters/numbers/_ only), email, password (6+ chars)
  - Login fields: email + password
  - Age gate checkbox: player must confirm they are 21 or older before registering
  - Token validation on create: decodes JWT client-side, checks expiry before auto-skipping to game (prevents stale-token lock-out)
  - On success: stores `wsm_token` and `wsm_username` in localStorage, fades into IntroScene
  - DOM input overlays with correct canvas-scale-aware positioning

- **`server/index.js`** — new auth endpoints and supporting infrastructure
  - `POST /auth/register` — validates email/password/username, bcrypt-hashes password, issues 30-day JWT
  - `POST /auth/login` — verifies credentials, issues JWT
  - In-memory auth store (`memAuthStore`) as fallback when PostgreSQL is not configured
  - Username uniqueness registry (`usernameRegistry` Map) — seeded from DB on startup, enforced on every registration
  - UUID→username map (`uuidUsernameMap`) for fast socket-session lookups
  - Reserved names list: admin, system, house, casino, widow, spider, support, bot, mod
  - JWT sign/verify helpers (`signToken`, `verifyToken`) using `JWT_SECRET` env var
  - Socket connections now read JWT from handshake query, verify it, and attach player identity

- **`server/db/queries.js`**
  - `createAuthPlayer(uuid, email, passwordHash, username)` — inserts with `age_verified = TRUE`
  - `getPlayerByEmail(email)` — case-insensitive lookup
  - `getPlayerByUsername(username)` — case-insensitive lookup

- **`server/db/schema.sql`**
  - `email VARCHAR(255) UNIQUE` column on `players`
  - `password_hash VARCHAR(255)` column on `players`
  - `age_verified BOOLEAN NOT NULL DEFAULT FALSE` column on `players`
  - Safe `DO $$ BEGIN … END $$` migration block — can be re-run on existing databases

#### Chat — Cashout Announcements
- **`server/index.js`** — broadcasts a system chat message whenever any player cashes out:
  `💸 PlayerName cashed out at 3.21× (+160.50)`

#### History Bar — Live Update Every Round
- **`client/src/scenes/UIScene.js`**
  - Added `_localHistory` array — updated immediately on every `round:crashed` event
  - History bar now refreshes every round without waiting for a `history:update` server event

---

### Fixed

#### Spider Race Condition — Dead Spider on Round Start
- **`client/src/scenes/GameScene.js`**
  - Added `_floodGen` generation counter — incremented on every `resetSpiderToGround()` call
  - `triggerServerFlood()` checks the generation at each async tween `onComplete`; if the gen changed (round ended), `die()` is skipped entirely
  - This prevents the flood wave's delayed `die()` callback from killing a spider that was already revived for the next round

#### Flood Wave Graphics Lingering Into Next Round
- **`client/src/scenes/GameScene.js`**
  - Added `_activeFloodGfx` — stores references to all 5 wave layer graphics
  - `resetSpiderToGround()` immediately destroys all active flood graphics and clears the reference
  - Wave layers can no longer cover the spider or betting UI during the next round's countdown

#### Ambient Animations Disappearing During Climbing
- **`client/src/scenes/GameScene.js`**
  - All 18 animated debris/particle graphics in `spawnAmbientAnim()` now use `.setScrollFactor(0)` — screen-space rendering
  - Removed all `camera.scrollY` offset additions from Y position calculations
  - Animations remain fully visible at a consistent density throughout the entire climb, not just at ground level

#### "MAX PAYOUT" Text Permanently Stuck On Screen
- **`client/src/scenes/GameScene.js`**
  - `triggerWin()` win text now fades out and destroys itself after 2 seconds
  - `onComplete` → `delayedCall(2000)` → fade-alpha tween → `destroy()`

#### Stale Token Causing Registration Screen to Never Appear
- **`client/src/scenes/UsernameScene.js`**
  - Previously, any value in `localStorage.wsm_token` (including leftover test tokens) caused `create()` to immediately skip to IntroScene
  - Now decodes the JWT locally and checks the `exp` claim before skipping
  - Expired or malformed tokens are cleared from localStorage and the auth screen is shown normally

---

### Changed

#### `client/src/main.js`
- Added `UsernameScene` as the first scene in the scene array so it loads before `IntroScene`

#### `client/src/systems/SocketManager.js`
- `connect(username, uuid, token)` — added `token` parameter, passed as socket handshake query
- Added double-connect guard: `if (this.socket) return` prevents duplicate connections when scenes restart
- Added auth-related socket events to the forwarded list: `username:claimed`, `username:taken`, `username:needed`, `username:restored`

#### `client/src/scenes/GameScene.js`
- Socket `connect()` call now reads `wsm_token` and `wsm_username` from localStorage before connecting

#### `server/game/RoundManager.js`
- `addPlayer()` no longer generates a random username for unauthenticated guests
- Removed per-cashout chat announcement from `_settleCashout()` (moved to `server/index.js` so it broadcasts for all players, not just socket-level)

---

### Dependencies Added (server)
- `bcrypt` — password hashing (10 rounds)
- `jsonwebtoken` — JWT sign/verify

---

### Files Modified Summary

| File | Change Type |
|---|---|
| `client/src/scenes/UsernameScene.js` | Complete rewrite — full auth UI |
| `client/src/scenes/GameScene.js` | Bug fixes: race condition, flood graphics, animations, win text |
| `client/src/scenes/UIScene.js` | Feature: live history bar |
| `client/src/main.js` | Added UsernameScene |
| `client/src/systems/SocketManager.js` | Token support, double-connect guard |
| `server/index.js` | Auth endpoints, username registry, cashout chat |
| `server/game/RoundManager.js` | Removed random username, moved cashout chat |
| `server/db/queries.js` | Auth queries |
| `server/db/schema.sql` | Auth columns, migration block |
