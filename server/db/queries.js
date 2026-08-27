const db = require('./db');

// ── Players ───────────────────────────────────────────────────────────────────

async function upsertPlayer(uuid, username) {
  return db.query(
    `INSERT INTO players (uuid, username)
     VALUES ($1, $2)
     ON CONFLICT (uuid) DO UPDATE
       SET username = EXCLUDED.username, last_seen = NOW()
     RETURNING *`,
    [uuid, username]
  );
}

async function getPlayer(uuid) {
  return db.query('SELECT * FROM players WHERE uuid = $1', [uuid]);
}

async function updateBalance(playerId, newBalance, wagered = 0, won = 0) {
  return db.query(
    `UPDATE players
     SET balance = $2,
         total_wagered = total_wagered + $3,
         total_won = total_won + $4,
         rounds_played = rounds_played + 1
     WHERE id = $1`,
    [playerId, newBalance, wagered, won]
  );
}

// ── Rounds ────────────────────────────────────────────────────────────────────

async function insertRound({ roundId, secretSeed, publicHash }) {
  return db.query(
    `INSERT INTO rounds (round_id, secret_seed, public_hash, crash_point, started_at)
     VALUES ($1, $2, $3, 0, NOW())
     ON CONFLICT (round_id) DO NOTHING
     RETURNING *`,
    [roundId, secretSeed, publicHash]
  );
}

async function closeRound({ roundId, crashPoint, betCount, totalWagered, totalPaid }) {
  return db.query(
    `UPDATE rounds
     SET crash_point = $2,
         bet_count = $3,
         total_wagered = $4,
         total_paid = $5,
         ended_at = NOW()
     WHERE round_id = $1`,
    [roundId, crashPoint, betCount, totalWagered, totalPaid]
  );
}

async function getRecentRounds(limit = 20) {
  return db.query(
    `SELECT round_id, crash_point, bet_count, total_wagered, total_paid,
            public_hash, secret_seed, ended_at
     FROM rounds
     WHERE ended_at IS NOT NULL
     ORDER BY round_id DESC
     LIMIT $1`,
    [limit]
  );
}

// ── Bets ──────────────────────────────────────────────────────────────────────

async function insertBet({ roundId, playerId, amount, autoCashout }) {
  return db.query(
    `INSERT INTO bets (round_id, player_id, amount, auto_cashout)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [roundId, playerId, amount, autoCashout || null]
  );
}

async function settleBet({ betId, cashedOut, cashoutAt, payout }) {
  return db.query(
    `UPDATE bets
     SET cashed_out = $2, cashout_at = $3, payout = $4
     WHERE id = $1`,
    [betId, cashedOut, cashoutAt || null, payout]
  );
}

async function getPlayerBetHistory(playerId, limit = 50) {
  return db.query(
    `SELECT b.amount, b.cashed_out, b.cashout_at, b.payout,
            r.crash_point, r.round_id, b.created_at
     FROM bets b
     JOIN rounds r ON r.round_id = b.round_id
     WHERE b.player_id = $1
     ORDER BY b.created_at DESC
     LIMIT $2`,
    [playerId, limit]
  );
}

async function getLeaderboard() {
  return db.query('SELECT * FROM leaderboard LIMIT 20');
}

// ── Auth ──────────────────────────────────────────────────────────────────────

async function createAuthPlayer(uuid, email, passwordHash, username) {
  return db.query(
    `INSERT INTO players (uuid, email, password_hash, username, age_verified)
     VALUES ($1, $2, $3, $4, TRUE)
     RETURNING id, uuid, username, balance`,
    [uuid, email.toLowerCase(), passwordHash, username]
  );
}

async function getPlayerByEmail(email) {
  return db.query(
    'SELECT * FROM players WHERE email = $1',
    [email.toLowerCase()]
  );
}

async function getPlayerByUsername(username) {
  return db.query(
    'SELECT * FROM players WHERE LOWER(username) = LOWER($1)',
    [username]
  );
}

module.exports = {
  upsertPlayer, getPlayer, updateBalance,
  insertRound, closeRound, getRecentRounds,
  insertBet, settleBet, getPlayerBetHistory, getLeaderboard,
  createAuthPlayer, getPlayerByEmail, getPlayerByUsername,
};
