const tron = require('./TronService');
const db = require('../db/db');
const queries = require('../db/queries');

const MIN_DEPOSIT = 1;    // USDT
const MAX_DEPOSIT = 5000; // USDT

class DepositVerifier {
  constructor() {
    // In-memory txid ledger (prevents double-spend when DB is off)
    this.usedTxids = new Set();
  }

  async verify({ playerId, playerBalance, txid, claimedAmount }) {
    claimedAmount = parseFloat(claimedAmount);

    // ── Basic validation ────────────────────────────────────────────────────
    if (!txid || typeof txid !== 'string' || txid.length < 8) {
      return { ok: false, error: 'Invalid transaction ID' };
    }
    if (isNaN(claimedAmount) || claimedAmount < MIN_DEPOSIT || claimedAmount > MAX_DEPOSIT) {
      return { ok: false, error: `Deposit must be ${MIN_DEPOSIT}–${MAX_DEPOSIT} USDT` };
    }

    // ── Duplicate check ─────────────────────────────────────────────────────
    const txidClean = txid.trim().toUpperCase();

    if (this.usedTxids.has(txidClean)) {
      return { ok: false, error: 'This transaction has already been used' };
    }

    if (db.isEnabled()) {
      const existing = await db.query(
        'SELECT id FROM transactions WHERE txid = $1',
        [txidClean]
      );
      if (existing?.rows?.length) {
        return { ok: false, error: 'This transaction has already been credited' };
      }
    }

    // ── On-chain verification ───────────────────────────────────────────────
    const result = await tron.verifyDeposit(txidClean, claimedAmount);
    if (!result.ok) return result;

    // ── Credit balance ──────────────────────────────────────────────────────
    const newBalance = parseFloat((playerBalance + result.amountUSDT).toFixed(2));
    this.usedTxids.add(txidClean);

    if (db.isEnabled() && playerId) {
      await db.query(
        `INSERT INTO transactions (player_id, type, amount, txid, status, confirmed_at)
         VALUES ($1, 'deposit', $2, $3, 'confirmed', NOW())`,
        [playerId, result.amountUSDT, txidClean]
      );
      await db.query(
        'UPDATE players SET balance = $2 WHERE id = $1',
        [playerId, newBalance]
      );
    }

    console.log(`[Deposit] Player ${playerId} deposited ${result.amountUSDT} USDT (txid: ${txidClean})`);
    return { ok: true, amountUSDT: result.amountUSDT, newBalance, mock: result.mock || false };
  }
}

module.exports = new DepositVerifier();
