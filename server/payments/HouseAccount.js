// HouseAccount — tracks the house's accumulated profit from every lost bet.
// Lost bets stay in the DB as admin player balance. Admin logs in and
// withdraws periodically to their personal crypto wallet — no on-chain tx
// per round, no gas cost every crash.

const db = require('../db/db');

let _memBalance = 0;       // fallback when DB is not enabled
let _adminPlayerId = null; // cached after first lookup

async function _getAdminPlayerId() {
  if (_adminPlayerId) return _adminPlayerId;
  if (!db.isEnabled()) return null;
  const res = await db.query('SELECT id FROM players WHERE is_admin = TRUE LIMIT 1');
  if (res?.rows?.[0]) _adminPlayerId = res.rows[0].id;
  return _adminPlayerId;
}

// Called from RoundManager.endRound() — credits lost-bet profit to house
async function addProfit(amount) {
  if (!amount || amount <= 0) return;
  const rounded = parseFloat(amount.toFixed(2));
  if (!db.isEnabled()) {
    _memBalance = parseFloat((_memBalance + rounded).toFixed(2));
    return;
  }
  const pid = await _getAdminPlayerId();
  if (pid) {
    await db.query('UPDATE players SET balance = balance + $1 WHERE id = $2', [rounded, pid]);
  } else {
    _memBalance = parseFloat((_memBalance + rounded).toFixed(2));
  }
}

// Returns current house balance
async function getBalance() {
  if (!db.isEnabled()) return _memBalance;
  const pid = await _getAdminPlayerId();
  if (!pid) return _memBalance;
  const res = await db.query('SELECT balance FROM players WHERE id = $1', [pid]);
  return parseFloat(res?.rows?.[0]?.balance ?? 0);
}

// Called when admin requests a withdrawal — deducts from house balance
async function deductBalance(amount) {
  const rounded = parseFloat(amount.toFixed(2));
  if (!db.isEnabled()) {
    _memBalance = parseFloat((_memBalance - rounded).toFixed(2));
    return;
  }
  const pid = await _getAdminPlayerId();
  if (pid) {
    await db.query('UPDATE players SET balance = balance - $1 WHERE id = $2', [rounded, pid]);
  } else {
    _memBalance = parseFloat((_memBalance - rounded).toFixed(2));
  }
}

// Invalidate cached ID (used after admin account is seeded)
function invalidateCache() {
  _adminPlayerId = null;
}

module.exports = { addProfit, getBalance, deductBalance, invalidateCache };
