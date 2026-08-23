require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const db = require('./db/db');
const queries = require('./db/queries');
const { RoundManager } = require('./game/RoundManager');
const provablyFair = require('./game/ProvablyFair');
const tron = require('./payments/TronService');
const depositVerifier = require('./payments/DepositVerifier');
const withdrawalProcessor = require('./payments/WithdrawalProcessor');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',')
      : ['http://localhost:8181', 'http://127.0.0.1:8181', 'http://localhost:8080'],
    methods: ['GET', 'POST'],
  },
});

app.use(cors());
app.use(express.json());

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

// ── Payment REST Endpoints ─────────────────────────────────────────────────

// Get deposit info (house address + mock mode status)
app.get('/payment/deposit-info', (req, res) => {
  res.json({
    houseAddress: tron.getHouseAddress(),
    network: process.env.TRON_NETWORK || 'testnet',
    token: 'USDT-TRC20',
    minDeposit: 1,
    maxDeposit: 5000,
    mock: tron.isMockMode(),
    mockNote: tron.isMockMode()
      ? 'MOCK MODE: Submit any 64-char hex as txid — balance will be credited instantly'
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

// Admin: manual review queue (protect with auth in production)
app.get('/admin/withdrawal-queue', (req, res) => {
  res.json(withdrawalProcessor.getQueue());
});

app.post('/admin/withdrawal-queue/:index/approve', async (req, res) => {
  const result = await withdrawalProcessor.approveQueued(parseInt(req.params.index));
  res.json(result);
});

// ─── Chat State ──────────────────────────────────────────────────────────────

const chatHistory = [];          // last 60 messages in memory
const chatRateLimits = new Map(); // socketId → last message timestamp

function pushChat(msg) {
  chatHistory.push(msg);
  if (chatHistory.length > 60) chatHistory.shift();
}

function systemChat(text) {
  const msg = { type: 'system', text, ts: Date.now() };
  pushChat(msg);
  io.emit('chat:message', msg);
}

// ─── Socket.io ───────────────────────────────────────────────────────────────

const roundManager = new RoundManager(io, { onCrash: systemChat, onRoundStart: systemChat });

io.on('connection', async (socket) => {
  console.log(`[+] ${socket.id} connected`);

  const username = socket.handshake.query.username || null;
  await roundManager.addPlayer(socket.id, username);

  socket.emit('game:state', roundManager.getState());

  const player = roundManager.getPlayer(socket.id);
  socket.emit('wallet:balance', { balance: player?.balance ?? 1000 });

  const history = await roundManager.getHistory(10);
  socket.emit('history:update', history);

  // Send chat history to new connection
  socket.emit('chat:history', chatHistory);

  // Announce join
  const joinName = player?.username || socket.id.slice(0, 6);
  systemChat(`🕷 ${joinName} joined the game`);

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
    if (!result.ok) socket.emit('cashout:error', { error: result.error });
  });

  socket.on('disconnect', () => {
    console.log(`[-] ${socket.id} disconnected`);
    const leaveName = roundManager.getPlayer(socket.id)?.username || socket.id.slice(0, 6);
    roundManager.removePlayer(socket.id);
    chatRateLimits.delete(socket.id);
    systemChat(`👋 ${leaveName} left`);
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────

db.init(); // no-op if DATABASE_URL not set

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`\n🕷  Widow Spider Multiplier — port ${PORT}`);
  console.log(`   Health:      http://localhost:${PORT}/health`);
  console.log(`   History:     http://localhost:${PORT}/history`);
  console.log(`   Leaderboard: http://localhost:${PORT}/leaderboard`);
  console.log(`   DB mode:     ${db.isEnabled() ? 'PostgreSQL' : 'in-memory'}\n`);
});
