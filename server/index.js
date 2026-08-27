require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('./db/db');
const queries = require('./db/queries');
const { RoundManager } = require('./game/RoundManager');
const provablyFair = require('./game/ProvablyFair');
const tron = require('./payments/TronService');
const depositVerifier = require('./payments/DepositVerifier');
const withdrawalProcessor = require('./payments/WithdrawalProcessor');
const houseAccount = require('./payments/HouseAccount');

const JWT_SECRET = process.env.JWT_SECRET || 'wsm-dev-secret-change-in-prod';
const BCRYPT_ROUNDS = 10;

// ─── In-memory auth store (fallback when DB is not configured) ───────────────
// email (lowercase) → { uuid, username, passwordHash, balance }
const memAuthStore = new Map();

function generateUUID() {
  return require('crypto').randomUUID();
}

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' });
}

function verifyToken(token) {
  try { return jwt.verify(token, JWT_SECRET); } catch { return null; }
}

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',')
      : true, // allow all origins when env var not explicitly set
    methods: ['GET', 'POST'],
  },
});

app.use(cors());
app.use(express.json());

// ─── Auth Endpoints ───────────────────────────────────────────────────────────

app.post('/auth/register', async (req, res) => {
  const { email, password, username } = req.body;

  if (!email || !password || !username)
    return res.status(400).json({ error: 'email, password and username are required' });

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return res.status(400).json({ error: 'Invalid email address' });

  if (password.length < 6)
    return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const cleanUsername = username.trim();
  if (cleanUsername.length < 3 || cleanUsername.length > 20)
    return res.status(400).json({ error: 'Username must be 3–20 characters' });
  if (!/^[a-zA-Z0-9_]+$/.test(cleanUsername))
    return res.status(400).json({ error: 'Username: letters, numbers and _ only' });

  const lowerEmail = email.toLowerCase();
  const lowerUser  = cleanUsername.toLowerCase();

  const RESERVED = new Set(['admin','system','house','casino','widow','spider','support','bot','mod']);
  if (RESERVED.has(lowerUser))
    return res.status(400).json({ error: `"${cleanUsername}" is a reserved name` });

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const uuid = generateUUID();

  if (db.isEnabled()) {
    // Check email uniqueness
    const emailCheck = await queries.getPlayerByEmail(lowerEmail);
    if (emailCheck?.rows?.length > 0)
      return res.status(409).json({ error: 'An account with that email already exists' });

    // Check username uniqueness
    const userCheck = await queries.getPlayerByUsername(cleanUsername);
    if (userCheck?.rows?.length > 0)
      return res.status(409).json({ error: `"${cleanUsername}" is already taken` });

    const result = await queries.createAuthPlayer(uuid, lowerEmail, passwordHash, cleanUsername);
    if (!result?.rows?.[0])
      return res.status(500).json({ error: 'Failed to create account' });

    const player = result.rows[0];
    // Register in username registry for socket use
    usernameRegistry.set(lowerUser, uuid);
    uuidUsernameMap.set(uuid, cleanUsername);

    const token = signToken({ uuid: player.uuid, username: player.username, playerId: player.id });
    return res.json({ token, username: player.username });
  } else {
    // In-memory mode
    if (memAuthStore.has(lowerEmail))
      return res.status(409).json({ error: 'An account with that email already exists' });
    if (usernameRegistry.has(lowerUser))
      return res.status(409).json({ error: `"${cleanUsername}" is already taken` });

    memAuthStore.set(lowerEmail, { uuid, username: cleanUsername, passwordHash, balance: 1000 });
    usernameRegistry.set(lowerUser, uuid);
    uuidUsernameMap.set(uuid, cleanUsername);

    const token = signToken({ uuid, username: cleanUsername });
    return res.json({ token, username: cleanUsername });
  }
});

app.post('/auth/login', async (req, res) => {
  const { email: identifier, password } = req.body;
  if (!identifier || !password)
    return res.status(400).json({ error: 'Email/username and password are required' });

  const isEmail = identifier.includes('@');
  const lowerIdentifier = identifier.toLowerCase();

  if (db.isEnabled()) {
    const result = isEmail
      ? await queries.getPlayerByEmail(lowerIdentifier)
      : await queries.getPlayerByUsername(lowerIdentifier);
    const player = result?.rows?.[0];
    if (!player) return res.status(401).json({ error: isEmail ? 'No account found with that email' : 'No account found with that username' });
    if (!player.password_hash) return res.status(401).json({ error: 'Account has no password set — contact support' });

    const match = await bcrypt.compare(password, player.password_hash);
    if (!match) return res.status(401).json({ error: 'Incorrect password' });

    if (!uuidUsernameMap.has(player.uuid)) {
      uuidUsernameMap.set(player.uuid, player.username);
      usernameRegistry.set(player.username.toLowerCase(), player.uuid);
    }

    const isAdmin = player.is_admin || false;
    const token = signToken({ uuid: player.uuid, username: player.username, playerId: player.id, isAdmin });
    return res.json({ token, username: player.username, isAdmin });
  } else {
    // In-memory: look up by email or scan by username
    let user = isEmail
      ? memAuthStore.get(lowerIdentifier)
      : [...memAuthStore.values()].find(u => u.username.toLowerCase() === lowerIdentifier);
    if (!user) return res.status(401).json({ error: isEmail ? 'No account found with that email' : 'No account found with that username' });

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) return res.status(401).json({ error: 'Incorrect password' });

    const token = signToken({ uuid: user.uuid, username: user.username, isAdmin: user.isAdmin || false });
    return res.json({ token, username: user.username, isAdmin: user.isAdmin || false });
  }
});

// ─── REST Endpoints ──────────────────────────────────────────────────────────

// Provably fair verification
app.post('/verify', (req, res) => {
  const { secretSeed, roundId, publicHash } = req.body;
  if (!secretSeed || !roundId || !publicHash)
    return res.status(400).json({ error: 'secretSeed, roundId, publicHash required' });
  res.json(provablyFair.verify(secretSeed, parseInt(roundId), publicHash));
});

// Round history
app.get('/history', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  res.json(await roundManager.getHistory(limit));
});

// Leaderboard
app.get('/leaderboard', async (req, res) => {
  if (!db.isEnabled()) return res.json([]);
  const result = await queries.getLeaderboard();
  res.json(result?.rows || []);
});

// Player bet history
app.get('/player/:uuid/bets', async (req, res) => {
  if (!db.isEnabled()) return res.json([]);
  const player = await queries.getPlayer(req.params.uuid);
  if (!player?.rows?.[0]) return res.status(404).json({ error: 'Player not found' });
  const bets = await queries.getPlayerBetHistory(player.rows[0].id);
  res.json(bets?.rows || []);
});

// Server health
app.get('/health', (req, res) => {
  res.json({
    ok: true,
    uptime: Math.floor(process.uptime()),
    dbConnected: db.isEnabled(),
    mockPayments: tron.isMockMode(),
    network: process.env.TRON_NETWORK || 'testnet',
    state: roundManager.getState(),
  });
});

// ── Admin Endpoints ────────────────────────────────────────────────────────

function requireAdmin(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  const user = verifyToken(auth.slice(7));
  if (!user?.isAdmin) return res.status(403).json({ error: 'Admin access required' });
  req.adminUser = user;
  next();
}

// Serve admin dashboard HTML
app.use('/admin', express.static(require('path').join(__dirname, 'admin')));

// Admin: view accumulated house profit balance
app.get('/admin/balance', requireAdmin, async (req, res) => {
  const balance = await houseAccount.getBalance();
  res.json({ balance, currency: 'USDT' });
});

// Admin: today's round stats
app.get('/admin/stats', requireAdmin, async (req, res) => {
  if (!db.isEnabled()) return res.json({ todayWagered: 0, todayPaid: 0, todayProfit: 0, todayRounds: 0 });
  try {
    const result = await db.query(`
      SELECT
        COALESCE(SUM(total_wagered),0) AS wagered,
        COALESCE(SUM(total_paid),0)    AS paid,
        COUNT(*)                       AS rounds
      FROM rounds
      WHERE created_at >= CURRENT_DATE
    `);
    const row = result?.rows?.[0] || {};
    const wagered = parseFloat(row.wagered || 0);
    const paid    = parseFloat(row.paid    || 0);
    res.json({
      todayWagered: wagered,
      todayPaid:    paid,
      todayProfit:  parseFloat((wagered - paid).toFixed(2)),
      todayRounds:  parseInt(row.rounds || 0),
    });
  } catch (err) {
    res.json({ todayWagered: 0, todayPaid: 0, todayProfit: 0, todayRounds: 0 });
  }
});

// Admin: all player withdrawals with username
app.get('/admin/player-withdrawals', requireAdmin, async (req, res) => {
  if (!db.isEnabled()) return res.json([]);
  try {
    const result = await db.query(`
      SELECT p.username, t.amount, t.txid, t.status, t.destination_address, t.created_at, t.player_id
      FROM transactions t
      LEFT JOIN players p ON p.id = t.player_id
      WHERE t.type = 'withdrawal'
        AND (p.is_admin IS NULL OR p.is_admin = FALSE)
      ORDER BY t.created_at DESC
      LIMIT 200
    `);
    res.json(result?.rows || []);
  } catch {
    res.json([]);
  }
});

// Admin: withdraw house profit to personal wallet — no $5 fee, higher limits
app.post('/admin/withdraw', requireAdmin, async (req, res) => {
  const { toAddress, amount } = req.body;
  const amt = parseFloat(amount);

  if (!toAddress) return res.status(400).json({ error: 'toAddress required' });
  if (!tron.isValidAddress(toAddress)) return res.status(400).json({ error: 'Invalid Ethereum address' });
  if (isNaN(amt) || amt <= 0) return res.status(400).json({ error: 'Amount must be greater than 0' });

  const currentBalance = await houseAccount.getBalance();
  if (amt > currentBalance) {
    return res.status(400).json({ error: `Insufficient house balance ($${currentBalance.toFixed(2)} USDT available)` });
  }

  await houseAccount.deductBalance(amt);

  if (db.isEnabled()) {
    await db.query(
      `INSERT INTO transactions (player_id, type, amount, destination_address, status)
       SELECT id, 'withdrawal', $1, $2, 'pending' FROM players WHERE is_admin = TRUE LIMIT 1`,
      [amt, toAddress]
    ).catch(() => {}); // non-fatal
  }

  const sendResult = await tron.sendUSDT(toAddress, amt);

  if (!sendResult.ok) {
    // Refund balance on failure
    await houseAccount.addProfit(amt);
    return res.status(500).json({ error: sendResult.error });
  }

  console.log(`[Admin Withdrawal] $${amt} USDT → ${toAddress} | txHash: ${sendResult.txid}`);
  res.json({ ok: true, txid: sendResult.txid, amount: amt, newBalance: currentBalance - amt, mock: sendResult.mock });
});

// ── Payment REST Endpoints ─────────────────────────────────────────────────

// Get deposit info — returns house address players send USDT-ERC20 to
app.get('/payment/deposit-info', (req, res) => {
  res.json({
    houseAddress: tron.getHouseAddress(),
    network: process.env.ETH_NETWORK || 'mainnet',
    token: 'USDT-ERC20',
    chain: 'Ethereum',
    minDeposit: 1,
    maxDeposit: 5000,
    mock: tron.isMockMode(),
    mockNote: tron.isMockMode()
      ? 'MOCK MODE: Submit any txHash — balance will be credited instantly for testing'
      : null,
  });
});

// Verify deposit txid and credit balance
app.post('/payment/deposit', async (req, res) => {
  const { socketId, txid, amount } = req.body;
  if (!socketId || !txid || !amount) {
    return res.status(400).json({ error: 'socketId, txid, amount required' });
  }

  const player = roundManager.getPlayer(socketId);
  if (!player) return res.status(404).json({ error: 'Player session not found' });

  const result = await depositVerifier.verify({
    playerId: player.playerId,
    playerBalance: player.balance,
    txid,
    claimedAmount: parseFloat(amount),
  });

  if (result.ok) {
    player.balance = result.newBalance;
    // Push updated balance to client via socket
    io.to(socketId).emit('wallet:balance', { balance: result.newBalance });
    io.to(socketId).emit('wallet:deposit:confirmed', {
      amount: result.amountUSDT,
      newBalance: result.newBalance,
      txid: result.txid,
      mock: result.mock,
    });
  }

  res.json(result);
});

// Request withdrawal
app.post('/payment/withdraw', async (req, res) => {
  const { socketId, toAddress, amount } = req.body;
  if (!socketId || !toAddress || !amount) {
    return res.status(400).json({ error: 'socketId, toAddress, amount required' });
  }

  const player = roundManager.getPlayer(socketId);
  if (!player) return res.status(404).json({ error: 'Player session not found' });

  // Block withdrawals during active round bet
  const activeBet = roundManager.bets.get(socketId);
  if (activeBet && !activeBet.cashedOut) {
    return res.status(400).json({ error: 'Cannot withdraw with an active bet in play' });
  }

  const result = await withdrawalProcessor.process({
    playerId: player.playerId,
    playerBalance: player.balance,
    toAddress,
    amount: parseFloat(amount),
  });

  if (result.ok) {
    player.balance = result.newBalance;
    io.to(socketId).emit('wallet:balance', { balance: result.newBalance });
    io.to(socketId).emit('wallet:withdraw:confirmed', result);
  }

  res.json(result);
});

// Player transaction history
app.get('/payment/history/:socketId', async (req, res) => {
  if (!db.isEnabled()) return res.json([]);
  const player = roundManager.getPlayer(req.params.socketId);
  if (!player?.playerId) return res.json([]);
  const result = await db.query(
    `SELECT type, amount, status, txid, destination_address, created_at, confirmed_at
     FROM transactions WHERE player_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [player.playerId]
  );
  res.json(result?.rows || []);
});

// Admin: manual review queue — pending withdrawals awaiting approval
app.get('/admin/withdrawal-queue', requireAdmin, (req, res) => {
  res.json(withdrawalProcessor.getQueue());
});

app.post('/admin/withdrawal-queue/:index/approve', requireAdmin, async (req, res) => {
  const result = await withdrawalProcessor.approveQueued(parseInt(req.params.index));
  res.json(result);
});

app.post('/admin/withdrawal-queue/:index/reject', requireAdmin, (req, res) => {
  const idx   = parseInt(req.params.index);
  const queue = withdrawalProcessor.getQueue();
  if (!queue[idx]) return res.status(404).json({ ok: false, error: 'Not found' });
  queue.splice(idx, 1);
  res.json({ ok: true });
});

// ─── Chat State ──────────────────────────────────────────────────────────────

const chatHistory = [];          // last 60 messages in memory
const chatRateLimits = new Map(); // socketId → last message timestamp

// ─── Top Scores (rolling 10-minute window by cashout multiplier) ─────────────
const recentCashouts = []; // entries: { username, multiplier, betAmount, payout, ts }

function pruneOldScores() {
  const cutoff = Date.now() - 10 * 60 * 1000;
  while (recentCashouts.length && recentCashouts[0].ts < cutoff) recentCashouts.shift();
}

function getTopTen() {
  pruneOldScores();
  const byPlayer = new Map();
  recentCashouts.forEach(e => {
    const cur = byPlayer.get(e.username);
    if (!cur || e.multiplier > cur.multiplier) byPlayer.set(e.username, e);
  });
  return [...byPlayer.values()].sort((a, b) => b.multiplier - a.multiplier).slice(0, 10);
}

function broadcastTopScores() {
  io.emit('topscores:update', getTopTen());
}

function broadcastPlayerCount() {
  io.emit('players:count', { count: roundManager.players.size });
}

// Every 10 minutes — prune window and rebroadcast (this resets the leaderboard)
setInterval(broadcastTopScores, 10 * 60 * 1000);

function pushChat(msg) {
  chatHistory.push(msg);
  if (chatHistory.length > 60) chatHistory.shift();
}

function systemChat(text) {
  const msg = { type: 'system', text, ts: Date.now() };
  pushChat(msg);
  io.emit('chat:message', msg);
}

// ─── Username Registry ────────────────────────────────────────────────────────

const usernameRegistry = new Map(); // lowercase_username → uuid (uniqueness guard)
const uuidUsernameMap  = new Map(); // uuid → original-case username (returning player lookup)

const RESERVED_NAMES = new Set(['admin','system','house','casino','widow','spider','support','bot','moderator','mod']);

async function seedUsernameRegistry() {
  if (!db.isEnabled()) return;
  try {
    const res = await db.query('SELECT uuid, username FROM players WHERE username IS NOT NULL AND uuid IS NOT NULL');
    if (res?.rows) {
      res.rows.forEach(({ uuid, username }) => {
        if (uuid && username) {
          usernameRegistry.set(username.toLowerCase(), uuid);
          uuidUsernameMap.set(uuid, username);
        }
      });
      console.log(`[Username] Seeded ${res.rows.length} usernames from DB`);
    }
  } catch (err) {
    console.error('[Username] Seed failed:', err.message);
  }
}

// ─── Socket.io ───────────────────────────────────────────────────────────────

const roundManager = new RoundManager(io, {
  onCrash: systemChat,
  onRoundStart: systemChat,
  onCashout: ({ username, multiplier, payout, betAmount }) => {
    if (!username) return;
    recentCashouts.push({ username, multiplier, betAmount: betAmount || 0, payout: payout || 0, ts: Date.now() });
    broadcastTopScores();
    systemChat(`💸 ${username} cashed out at ${multiplier.toFixed(2)}× (+$${payout.toFixed(2)})`);
  },
});

io.on('connection', async (socket) => {
  // Verify JWT from handshake
  const rawToken = socket.handshake.query.token || null;
  let tokenPayload = rawToken ? verifyToken(rawToken) : null;

  // Fallback: legacy uuid query param
  const rawUuid = tokenPayload?.uuid || socket.handshake.query.uuid || null;
  let resolvedUsername = tokenPayload?.username || (rawUuid ? uuidUsernameMap.get(rawUuid) : null);

  console.log(`[+] ${socket.id} connected${resolvedUsername ? ` as ${resolvedUsername}` : ' (unauthenticated)'}`);
  await roundManager.addPlayer(socket.id, resolvedUsername, rawUuid);

  socket.emit('game:state', roundManager.getState());

  const player = roundManager.getPlayer(socket.id);
  socket.emit('wallet:balance', { balance: player?.balance ?? 1000 });

  const history = await roundManager.getHistory(10);
  socket.emit('history:update', history);

  // Send chat history to new connection
  socket.emit('chat:history', chatHistory);

  // Send current top scores and player count to new connection
  socket.emit('topscores:update', getTopTen());
  broadcastPlayerCount();

  // Announce join (only if they have a username — new players see this after claiming)
  if (resolvedUsername) {
    systemChat(`🕷 ${resolvedUsername} joined the game`);
  }

  // Chat message handler
  socket.on('chat:send', ({ text }) => {
    if (typeof text !== 'string') return;
    const clean = text.trim().slice(0, 160); // cap length
    if (!clean) return;

    // Rate limit: 1 message per 2 seconds
    const now = Date.now();
    const last = chatRateLimits.get(socket.id) || 0;
    if (now - last < 2000) {
      socket.emit('chat:error', { error: 'Slow down! 1 message per 2 seconds.' });
      return;
    }
    chatRateLimits.set(socket.id, now);

    const senderName = roundManager.getPlayer(socket.id)?.username || socket.id.slice(0, 6);
    const msg = { type: 'user', from: senderName, text: clean, ts: now };
    pushChat(msg);
    io.emit('chat:message', msg);
  });

  socket.on('bet:place', ({ amount, autoCashout }) => {
    const result = roundManager.placeBet(socket.id, amount, autoCashout);
    socket.emit('bet:result', result);
    if (result.ok) {
      socket.emit('wallet:balance', { balance: result.balance });
      io.emit('bets:update', { count: roundManager.bets.size });
    }
  });

  socket.on('bet:cancel', () => {
    const result = roundManager.cancelBet(socket.id);
    socket.emit('bet:cancel:result', result);
    if (result.ok) socket.emit('wallet:balance', { balance: result.balance });
  });

  socket.on('cashout', () => {
    const result = roundManager.cashOut(socket.id);
    if (!result.ok) {
      socket.emit('cashout:error', { error: result.error });
    }
    // cashout announcement + score tracking handled by onCashout hook in RoundManager
  });

  // ── Username claim ────────────────────────────────────────────────────────
  socket.on('username:claim', async ({ uuid, username }) => {
    if (typeof username !== 'string') {
      return socket.emit('username:taken', { error: 'Invalid username' });
    }
    const clean = username.trim();
    if (clean.length < 3 || clean.length > 20) {
      return socket.emit('username:taken', { error: 'Username must be 3–20 characters' });
    }
    if (!/^[a-zA-Z0-9_]+$/.test(clean)) {
      return socket.emit('username:taken', { error: 'Letters, numbers and _ only' });
    }
    const lower = clean.toLowerCase();
    if (RESERVED_NAMES.has(lower)) {
      return socket.emit('username:taken', { error: `"${clean}" is a reserved name` });
    }
    if (usernameRegistry.has(lower)) {
      return socket.emit('username:taken', { error: `"${clean}" is already taken — try another` });
    }

    // Register the username permanently
    const claimUuid = uuid || socket.id;
    usernameRegistry.set(lower, claimUuid);
    uuidUsernameMap.set(claimUuid, clean);

    // Update the live player record
    const claimPlayer = roundManager.getPlayer(socket.id);
    if (claimPlayer) claimPlayer.username = clean;

    // Persist to DB
    if (db.isEnabled() && uuid) {
      queries.upsertPlayer(uuid, clean).catch(() => {});
    }

    socket.emit('username:claimed', { username: clean });
    systemChat(`🕷 ${clean} joined for the first time — welcome!`);
    console.log(`[Username] Claimed: "${clean}" by uuid=${claimUuid}`);
  });

  socket.on('disconnect', () => {
    console.log(`[-] ${socket.id} disconnected`);
    const leaveName = roundManager.getPlayer(socket.id)?.username || socket.id.slice(0, 6);
    roundManager.removePlayer(socket.id);
    chatRateLimits.delete(socket.id);
    broadcastPlayerCount();
    systemChat(`👋 ${leaveName} left`);
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;

// Seed admin account on startup — uses ADMIN_EMAIL / ADMIN_PASSWORD from env
async function seedAdminAccount() {
  const adminEmail    = (process.env.ADMIN_EMAIL    || 'admin@latrodectus.internal').toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD  || '0515Bf$';
  const adminUsername = process.env.ADMIN_USERNAME  || 'UniqCloth';

  if (db.isEnabled()) {
    const existing = await db.query('SELECT id FROM players WHERE is_admin = TRUE LIMIT 1');
    if (!existing?.rows?.length) {
      const hash = await bcrypt.hash(adminPassword, BCRYPT_ROUNDS);
      await db.query(
        `INSERT INTO players (email, password_hash, username, balance, is_admin)
         VALUES ($1, $2, $3, 0, TRUE) ON CONFLICT (email) DO NOTHING`,
        [adminEmail, hash, adminUsername]
      );
      houseAccount.invalidateCache();
      console.log(`[Admin] Account seeded — email: ${adminEmail}`);
    }
  } else {
    // In-memory fallback
    if (!memAuthStore.has(adminEmail)) {
      const hash = await bcrypt.hash(adminPassword, BCRYPT_ROUNDS);
      memAuthStore.set(adminEmail, {
        uuid: generateUUID(), username: adminUsername,
        passwordHash: hash, balance: 0, isAdmin: true,
      });
      console.log(`[Admin] In-memory account seeded — email: ${adminEmail}`);
    }
  }
}

(async () => {
  await db.init(); // waits for schema to apply before accepting traffic
  if (db.isEnabled()) seedUsernameRegistry();
  await seedAdminAccount();

  server.listen(PORT, () => {
    console.log(`\n🕷  The Latrodectus — port ${PORT}`);
    console.log(`   Health:      http://localhost:${PORT}/health`);
    console.log(`   History:     http://localhost:${PORT}/history`);
    console.log(`   Leaderboard: http://localhost:${PORT}/leaderboard`);
    console.log(`   DB mode:     ${db.isEnabled() ? 'PostgreSQL' : 'in-memory'}\n`);
  });
})();
