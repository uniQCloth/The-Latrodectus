# The Latrodectus — Full Build Plan

## Overview
A browser-based vertical climbing crash game. A black widow spider uses a hula hoop to climb progressively disappearing platforms. Players bet 1–100 USDT and cash out before falling. Multiplier grows with height climbed (max 5000x at tile 5000).

---

## Tech Stack

| Layer | Technology | Reason |
|---|---|---|
| Game Engine | Phaser.js 3 | Best-in-class 2D browser game framework, handles physics, sprites, tilemaps |
| Frontend Framework | Vanilla JS + Webpack | Lightweight, no React overhead needed for a game |
| Backend | Node.js + Express | WebSocket support, fast, widely used for crash games |
| WebSockets | Socket.io | Real-time multiplier sync between server and client |
| RNG / Provably Fair | Server-side seeded hash chain (SHA-256) | Industry standard for crash games — auditable |
| Database | PostgreSQL | Bet history, user sessions, round results |
| Payment / USDT | TronLink / USDT-TRC20 integration OR mock wallet for dev | USDT on TRON has lowest fees |
| Hosting | VPS (Ubuntu) + Nginx reverse proxy | Full control, WebSocket compatible |

---

## Project Structure

```
Widow Spider Multiplier/
├── BUILD_PLAN.md               ← this file
├── client/                     ← Phaser.js game
│   ├── index.html
│   ├── src/
│   │   ├── main.js             ← Phaser game init
│   │   ├── scenes/
│   │   │   ├── IntroScene.js   ← animated cartoon intro + countdown
│   │   │   ├── GameScene.js    ← core game loop
│   │   │   └── UIScene.js      ← bet panel, multiplier display, cashout button
│   │   ├── systems/
│   │   │   ├── Spider.js       ← player controller
│   │   │   ├── HulaHoop.js     ← hoop physics + momentum
│   │   │   ├── Platform.js     ← platform generation + disappear logic
│   │   │   ├── Hazards.js      ← flood, fire, shocks, explosions
│   │   │   ├── GlowWorm.js     ← collectible + 3x boost logic
│   │   │   └── Multiplier.js   ← height-to-multiplier curve
│   │   └── ui/
│   │       ├── BetPanel.js
│   │       ├── CashoutButton.js
│   │       └── MultiplierDisplay.js
│   └── assets/
│       ├── sprites/            ← spider, hoop, platforms, hazards, worms
│       ├── backgrounds/
│       └── audio/
├── server/                     ← Node.js backend
│   ├── index.js                ← Express + Socket.io server
│   ├── game/
│   │   ├── RoundManager.js     ← game state machine (betting → playing → result)
│   │   ├── ProvablyFair.js     ← SHA-256 seed chain for crash point
│   │   ├── MultiplierEngine.js ← server-authoritative multiplier calculation
│   │   └── FloodScheduler.js   ← random flood event timing
│   ├── db/
│   │   ├── schema.sql          ← PostgreSQL tables
│   │   └── queries.js
│   └── routes/
│       ├── auth.js
│       └── bets.js
└── package.json
```

---

## Phase Breakdown

### Phase 1 — Core Game Loop (Week 1)
**Goal:** Spider climbs, platforms exist, game can be won or lost.

- [ ] Phaser 3 project scaffolded with Webpack
- [ ] `IntroScene`: animated cartoon spider intro, "1-2-3 Begin" countdown overlay, skip button
- [ ] `GameScene`: vertical scrolling world, camera follows spider upward
- [ ] `Spider.js`: keyboard/touch controls — climb ladders, jump between platforms, fall detection
- [ ] `HulaHoop.js`: spinning hoop visual attached to spider, momentum physics affecting jump arc
- [ ] `Platform.js`: procedural platform generation as height increases, disappear timer (stand too long → platform crumbles)
- [ ] Win condition: reach tile 5000 → trigger massive payout animation
- [ ] Loss condition: fall below screen → game over

### Phase 2 — Hazards & Risk Systems (Week 2)
**Goal:** Make the climb dangerous.

- [ ] `Hazards.js`:
  - Exploding platforms (flash warning → boom → fall)
  - Fire trap platforms (damage on contact)
  - Slippery platforms (reduced friction, spider slides)
  - Shocking platforms (stun → brief loss of control)
- [ ] `FloodScheduler.js`: random water wall rises from bottom — if it catches spider, instant death
- [ ] Ceiling Cap mechanic: climb too fast without proper hoop timing → hoop slips → fall
- [ ] `GlowWorm.js`: rare spawns (max 3 active), collect → 3x score multiplier stacked

### Phase 3 — Multiplier Engine & Bet System (Week 2-3)
**Goal:** The game is now a real crash-style gambling loop.

- [ ] `Multiplier.js` (client display): smooth animated counter tied to height
  - Curve: 1x at tile 0, exponential growth to 5000x at tile 5000
  - Glow Worm 3x modifier stacks multiplicatively
- [ ] `MultiplierEngine.js` (server-authoritative): server tracks true multiplier, client only displays
- [ ] `ProvablyFair.js`: SHA-256 hash chain determines crash point each round
- [ ] `BetPanel.js`: USDT bet input (1–100), auto-cashout threshold input
- [ ] `CashoutButton.js`: manual cashout locks in current multiplier × bet
- [ ] Auto-cashout: server enforces if set threshold is reached
- [ ] Round states: BETTING (10s lobby) → PLAYING → RESULT → BETTING

### Phase 4 — Backend & Real-Time Sync (Week 3)
**Goal:** Server owns game state, client just renders.

- [ ] Node.js + Express server
- [ ] Socket.io events:
  - `round:start` — new round begins, seed hash published
  - `multiplier:tick` — server broadcasts current multiplier every 100ms
  - `player:cashout` — client sends cashout, server validates and locks
  - `round:end` — crash point revealed, winners/losers settled
- [ ] PostgreSQL: rounds table, bets table, users table
- [ ] REST endpoints: `/bet`, `/cashout`, `/history`, `/verify` (provably fair audit)

### Phase 5 — Payment Integration (Week 4)
**Goal:** Real USDT in/out.

- [ ] USDT-TRC20 wallet integration (TronLink or custodial wallet)
- [ ] Deposit: user sends USDT to house wallet → balance credited
- [ ] Withdrawal: user requests → server signs transaction → USDT sent
- [ ] Dev mode: mock wallet with fake USDT for testing

### Phase 6 — Polish & Launch (Week 4-5)
**Goal:** Ship-ready product.

- [ ] Full sprite art pass (spider, hoop animations, platform types, hazard animations)
- [ ] Sound design (climbing sounds, hoop spin, crash sound, win fanfare, flood warning)
- [ ] Mobile touch controls (swipe to jump, tap to cashout)
- [ ] Performance optimization (object pooling for platforms, culling off-screen objects)
- [ ] Bet history UI panel
- [ ] Provably fair verification page

---

## Multiplier Curve Design

```
Tile 0      →   1x
Tile 100    →   1.5x
Tile 500    →   5x
Tile 1000   →   25x
Tile 2000   →   100x
Tile 3500   →   500x
Tile 4500   →   2000x
Tile 5000   →   5000x (guaranteed win)

Formula: multiplier = 0.99 * e^(tile / 1200)
(server-side crash point cuts this curve short on losing rounds)
```

Glow Worm modifier: collect 1 = ×3, collect 2 = ×9, collect 3 = ×27 on top of height multiplier.

---

## Provably Fair System

```
1. Server generates secret seed before round
2. Publishes SHA-256(secret_seed) to client BEFORE round starts
3. Round plays out
4. At round end: server reveals secret_seed
5. Client can verify: SHA-256(secret_seed) matches published hash
6. Crash point derived from: HMAC-SHA-256(secret_seed, round_id)
```

This is the same system used by Stake, BC.Game, and other major crash games.

---

## Key Risks & Decisions

| Risk | Decision |
|---|---|
| Client cheating multiplier display | Server is authoritative — client only renders what server sends |
| Flood timing unfair | Flood seed committed provably fair same as crash point |
| House edge | Crash point formula includes 1% house edge (0.99 multiplier) |
| Mobile performance | Phaser 3 WebGL renderer, object pooling, 60fps target |
| Payment security | Withdrawal requires 2FA, rate limited, manual review above threshold |

---

## Estimated Timeline

| Phase | Duration |
|---|---|
| Phase 1 — Core loop | 5-7 days |
| Phase 2 — Hazards | 4-5 days |
| Phase 3 — Bet system | 4-5 days |
| Phase 4 — Backend | 4-5 days |
| Phase 5 — Payments | 3-4 days |
| Phase 6 — Polish | 5-7 days |
| **Total** | **~5 weeks** |

---

## Confirmed Decisions

1. **Art**: Full scratch build — placeholder sprites during dev, commission real art after core loop works
2. **Payment**: Mock USDT wallet for development, real TRC20 integration in Phase 5
3. **Hosting**: VPS setup included in Phase 4 (Nginx + Node.js + PostgreSQL on Ubuntu)
4. **Platform**: Mobile-first — touch controls primary, swipe/tap UX, responsive canvas. Desktop works but is secondary.
5. **Round type**: Multiplayer shared rounds (Aviator-style) — all active players bet on the same spider climb simultaneously. One authoritative server round affects everyone.
