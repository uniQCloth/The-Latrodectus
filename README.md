# Widow Spider Multiplier

An Aviator-style multiplayer crash gambling game. A black widow spider climbs a drain pipe while a live multiplier grows. Cash out before the flood hits — or lose everything.

Built with **Phaser 3**, **Socket.io**, **Node.js**, and **PostgreSQL**. No audio files — all sounds are procedurally generated via the WebAudio API.

---

## Features

- Real-time multiplayer via Socket.io
- Provably fair crash point using server-side seed hashing
- Spider character with animated legs, silk thread, and hula hoop mechanic
- Industrial drain pipe environment with ambient objects (flies, gum, hair, quarters, toothbrush tips, teeth)
- Bathroom drain iris-wipe reveal events
- Flash flood fake-out warnings + surprise jump-scare crash
- Procedural WebAudio sounds (no audio files required)
- USDT-TRC20 payment integration (Tron network)
- PostgreSQL wallet/round persistence
- Nginx + PM2 production deploy config

---

## Project Structure

```
widow-spider-multiplier/
├── client/                  # Phaser 3 frontend
│   ├── src/
│   │   ├── main.js          # Phaser game bootstrap
│   │   ├── scenes/
│   │   │   ├── IntroScene.js
│   │   │   ├── GameScene.js  # Main game world
│   │   │   └── UIScene.js    # HUD overlay (betting, multiplier, chat)
│   │   ├── systems/
│   │   │   ├── Spider.js
│   │   │   ├── HulaHoop.js
│   │   │   ├── Platform.js
│   │   │   ├── Hazards.js
│   │   │   ├── SoundManager.js
│   │   │   ├── SocketManager.js
│   │   │   ├── Multiplier.js
│   │   │   ├── MultiplierEngine.client.js
│   │   │   ├── FloodScheduler.js
│   │   │   └── GlowWorm.js
│   │   └── ui/
│   │       ├── ChatPanel.js
│   │       └── WalletPanel.js
│   ├── index.html
│   ├── verify.html
│   ├── webpack.config.js
│   └── package.json
├── server/                  # Node.js + Socket.io backend
│   ├── index.js             # Express + Socket.io entry point
│   ├── game/
│   │   ├── RoundManager.js  # Round state machine (betting → playing → result)
│   │   ├── MultiplierEngine.js
│   │   └── ProvablyFair.js
│   ├── db/
│   │   ├── db.js
│   │   ├── queries.js
│   │   └── schema.sql       # PostgreSQL schema
│   ├── payments/
│   │   ├── TronService.js
│   │   ├── DepositVerifier.js
│   │   └── WithdrawalProcessor.js
│   ├── .env.example
│   └── package.json
└── deploy/
    ├── ecosystem.config.js  # PM2 config
    ├── nginx.conf           # Nginx reverse proxy + SSL
    └── setup.sh             # Server bootstrap script
```

---

## Quick Start (Local Dev)

### Prerequisites
- Node.js 18+
- PostgreSQL 14+ (optional — runs without DB in memory mode)

### 1. Install dependencies

```bash
cd client && npm install
cd ../server && npm install
```

### 2. Configure the server

```bash
cd server
cp .env.example .env
# Edit .env — set DATABASE_URL if using PostgreSQL
# Leave TRON_PRIVATE_KEY blank to run in mock payment mode
```

### 3. Run the database schema (if using PostgreSQL)

```bash
psql -U postgres -c "CREATE DATABASE widow_spider;"
psql -U postgres -d widow_spider -f server/db/schema.sql
```

### 4. Start the server

```bash
cd server && npm run dev
# Runs on http://localhost:3001
```

### 5. Start the client dev server

```bash
cd client && npm start
# Opens http://localhost:8181
```

---

## Production Deploy

### Prerequisites
- Ubuntu 20.04+ VPS
- Nginx
- PM2 (`npm install -g pm2`)
- Certbot for SSL

### Steps

```bash
# Clone repo
git clone https://github.com/YOUR_USERNAME/widow-spider-multiplier.git /var/www/widow-spider
cd /var/www/widow-spider

# Install and build client
cd client && npm install && npm run build
cd ..

# Install server deps
cd server && npm install

# Configure environment
cp server/.env.example server/.env
nano server/.env   # fill in DATABASE_URL, TRON_PRIVATE_KEY, etc.

# Start with PM2
pm2 start deploy/ecosystem.config.js --env production
pm2 save && pm2 startup

# Configure Nginx
sudo cp deploy/nginx.conf /etc/nginx/sites-available/widow-spider
# Edit YOUR_DOMAIN_HERE in the nginx config
sudo ln -s /etc/nginx/sites-available/widow-spider /etc/nginx/sites-enabled/
sudo certbot --nginx -d yourdomain.com
sudo nginx -t && sudo systemctl reload nginx
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `PORT` | No | Server port (default: 3001) |
| `DATABASE_URL` | No | PostgreSQL connection string. Omit to run without persistence. |
| `ALLOWED_ORIGINS` | No | Comma-separated CORS origins for production |
| `TRON_PRIVATE_KEY` | No | House wallet private key (64-char hex). Omit for mock mode. |
| `TRON_HOUSE_ADDRESS` | No | House wallet TRX address |
| `TRON_NETWORK` | No | `mainnet` or `testnet` (default: testnet) |
| `TRONGRID_API_KEY` | No | TronGrid API key for higher rate limits |

---

## Game Mechanics

| Mechanic | Detail |
|---|---|
| **Betting phase** | 10 seconds — place your bet before the round starts |
| **Playing phase** | Multiplier climbs until server-determined crash point |
| **Crash point** | Provably fair — hash of server seed + round ID |
| **Cashout** | Click "CASH OUT" anytime during playing phase |
| **Flood warnings** | Fake-out tension events — actual crash is always a surprise |
| **Hula hoop** | Collectible that boosts jump height |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Game engine | Phaser 3 |
| Real-time | Socket.io 4 |
| Backend | Node.js + Express |
| Database | PostgreSQL |
| Payments | Tron TRC-20 (USDT) via TronWeb |
| Bundler | Webpack 5 |
| Process mgr | PM2 |
| Web server | Nginx |

---

## License

MIT
