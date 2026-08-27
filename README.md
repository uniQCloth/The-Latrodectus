# 🕷️ The Latrodectus

> **© 2026 uniQCloth — All Rights Reserved. Proprietary Software.**
> See [LICENSE](./LICENSE) for permitted uses. This code may not be copied, forked, or distributed.

---

**The Latrodectus** is an original multiplayer crash-style game where a black widow spider climbs a sewage drain pipe while a live multiplier grows. Cash out before the pipe bursts — or lose your bet to the flood.

Built from scratch with **Phaser 3**, **Socket.io**, **Node.js**, and **PostgreSQL**. Every sound is procedurally generated with the WebAudio API — no audio files.

---

## 🎮 Play & Test

> **Beta is open. We want your feedback.**

The game is in active development and we are looking for players to:
- Find bugs and report them (see [How to Submit Feedback](#-how-to-submit-feedback))
- Suggest features, game feel improvements, or ideas
- Report anything that feels unfair, confusing, or broken
- Try it on different devices and screen sizes

**To play:** use the link provided by the developer. Create an account, place a bet, and cash out before the flood hits.

---

## 🐛 How to Submit Feedback

Open a **[GitHub Issue](https://github.com/uniQCloth/the-latrodectus/issues/new/choose)** and pick a template:

| Template | Use for |
|---|---|
| 🐛 Bug Report | Something is broken or behaving wrong |
| 💡 Feature Idea | Something you want added |
| 🎮 Game Feel | Physics, timing, difficulty, visuals |
| 💬 General Feedback | Anything else |

**What makes a good report:**
- What you were doing when it happened
- What device / browser you were using
- A screenshot or screen recording if possible
- How bad it was (minor annoyance vs. game-breaking)

All feedback is read personally by the developer. Good ideas get credited.

---

## ✨ Features

| Feature | Detail |
|---|---|
| **Cinematic intro** | Original spider-descends-on-silk animation plays before the main menu |
| **Procedural spider** | Animated legs, silk thread, pendulum body swing, milestone color forms |
| **Live multiplier** | Grows every tick — provably fair crash point using server seed hashing |
| **Rising water** | Water climbs the pipe all round, tightening with the multiplier |
| **Pipe burst crash** | Camera shake + "PIPE BURST!" banner + water surge — clearly a game event |
| **Platform types** | Normal, slippery, bounce, fire, shock, disappearing, exploding |
| **Hazards** | Shock pads, fire tiles, crawlers — all affect the spider differently |
| **Magic glow worm** | Rare bonus collectible that multiplies your cashout |
| **Milestone skins** | Spider changes color/aura at 100x (gold), 500x (inferno), 1000x (void) |
| **Theme music** | Original "Climbing Spider" digital beat — ascending/descending A minor loop |
| **Pipe ambience** | Hollow drip, drone rumble, and water rush — all synthesized |
| **Chat** | Live in-game chat during rounds |
| **Leaderboard** | Real-time top scores |
| **USDT payments** | Tron TRC-20 wallet — deposit, play, withdraw |
| **Multiplayer** | All players in the same round via Socket.io |

---

## 💼 Investors & Partnership

The Latrodectus is seeking:

- **Investment** to scale infrastructure, marketing, and game development
- **Casino / iGaming platform partners** to license and integrate the game
- **White-label operators** who want a unique crash game for their player base

The game is fully functional with real-money wallet integration (USDT/TRC-20), provably fair round generation, and a complete backend. It is ready for real-money deployment pending licensing and regulatory review.

**If you are interested in partnering, investing, or licensing:**

📧 **seven0seven90@gmail.com**
🐙 **github.com/uniQCloth**

Include: who you are, your platform/fund, and what you are looking for.

---

## 🏗️ Project Structure

```
the-latrodectus/
├── client/                    # Phaser 3 frontend (Webpack 5)
│   └── src/
│       ├── main.js            # Game bootstrap + scene registry
│       ├── scenes/
│       │   ├── CinematicScene.js  # Intro animation
│       │   ├── UsernameScene.js   # Auth (login / register)
│       │   ├── IntroScene.js      # Main menu
│       │   ├── GameScene.js       # Game world + physics
│       │   └── UIScene.js         # HUD overlay
│       └── systems/
│           ├── Spider.js          # Player character + physics
│           ├── SoundManager.js    # All audio (WebAudio, no files)
│           ├── SocketManager.js   # Socket.io client singleton
│           ├── Platform.js        # Platform types + behavior
│           ├── HazardManager.js   # Hazard spawning + effects
│           └── FloodScheduler.js  # Offline flood timing
├── server/                    # Node.js + Socket.io backend
│   ├── game/
│   │   ├── RoundManager.js    # Round state machine
│   │   ├── MultiplierEngine.js
│   │   └── ProvablyFair.js
│   ├── db/
│   │   ├── db.js
│   │   └── schema.sql
│   └── payments/
│       └── TronService.js     # USDT TRC-20 wallet
└── deploy/
    ├── ecosystem.config.js    # PM2 process config
    ├── nginx.conf             # Reverse proxy + SSL
    └── setup.sh               # VPS bootstrap
```

---

## 🚀 Run Locally (Dev)

### Requirements
- Node.js 18+
- PostgreSQL 14+ (optional — falls back to in-memory mode without it)

### Steps

```bash
# 1. Clone
git clone https://github.com/uniQCloth/the-latrodectus.git
cd the-latrodectus

# 2. Install
cd client && npm install
cd ../server && npm install

# 3. Configure server (copy example, edit if needed)
cd server && cp .env.example .env

# 4. Start server
npm run dev          # runs on :3001

# 5. Start client (new terminal)
cd client && npm start   # runs on :8181
```

Open `http://localhost:8181` — register an account and play.

---

## 🌐 Production Deploy (VPS)

```bash
# Build client
cd client && npm run build

# PM2
pm2 start deploy/ecosystem.config.js --env production
pm2 save && pm2 startup

# Nginx + SSL
sudo cp deploy/nginx.conf /etc/nginx/sites-available/widow-spider
sudo certbot --nginx -d yourdomain.com
sudo nginx -t && sudo systemctl reload nginx
```

---

## ⚙️ Environment Variables

| Variable | Required | Description |
|---|---|---|
| `PORT` | No | Server port (default 3001) |
| `DATABASE_URL` | No | PostgreSQL URL — omit for memory mode |
| `ALLOWED_ORIGINS` | No | CORS origins for production |
| `TRON_PRIVATE_KEY` | No | House wallet key — omit for mock payments |
| `TRON_HOUSE_ADDRESS` | No | House TRX wallet address |
| `TRON_NETWORK` | No | `mainnet` or `testnet` |

---

## 📋 Recent Changelog

See [CHANGELOG.md](./CHANGELOG.md) for full history.

**Latest updates:**
- Cinematic intro: spider descends on silk, water rises, PIPE BURST sequence
- Replaced jarring blue-screen crash with rising-water surge + shake + banner
- Spider pendulum swing mechanic (purely visual, left/right movement)
- Grey pipe interior, brightened walls
- Original "Climbing Spider" theme music (digital A-minor beat)
- Hollow pipe drip ambience (procedural WebAudio)
- Persistent rising water that tracks multiplier speed
- Always-require-login (no auto session skip)

---

## ⚖️ Legal

**© 2026 uniQCloth. All Rights Reserved.**

This is proprietary software. Viewing this repository is permitted for the purpose of beta testing and providing feedback only. Copying, forking, distributing, or using any portion of this code in another project is strictly prohibited without written permission from the author.

See [LICENSE](./LICENSE) for full terms.
