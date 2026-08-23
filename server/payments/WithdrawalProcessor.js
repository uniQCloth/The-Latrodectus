const tron = require('./TronService');
const db = require('../db/db');

const MIN_WITHDRAWAL = 5;    // USDT
const MAX_AUTO_WITHDRAWAL = 500; // above this = manual review queue
const COOLDOWN_MS = 10 * 60 * 1000; // 10 min between withdrawals per player

class WithdrawalProcessor {
  constructor() {
    this.lastWithdrawal = new Map(); // playerId → timestamp (in-memory cooldown)
    this.queue = [];                 // manual review queue (large amounts)
  }

  async process({ playerId, playerBalance, toAddress, amount }) {
    amount = parseFloat(amount);

    // ── Validation ──────────────────────────────────────────────────────────
    if (isNaN(amount) || amount < MIN_WITHDRAWAL) {
      return { ok: false, error: `Minimum withdrawal is ${MIN_WITHDRAWAL} USDT` };
    }
    if (amount > playerBalance) {
      return { ok: false, error: `Insufficient balance ($${playerBalance.toFixed(2)} available)` };
    }
    if (!tron.isValidAddress(toAddress)) {
      return { ok: false, error: 'Invalid TRC20 address (must start with T, 34 chars)' };
    }

    // ── Cooldown check ──────────────────────────────────────────────────────
    const lastTime = this.lastWithdrawal.get(playerId) || 0;
    const elapsed = Date.now() - lastTime;
    if (elapsed < COOLDOWN_MS) {
      const waitSec = Math.ceil((COOLDOWN_MS - elapsed) / 1000);
      return { ok: false, error: `Withdrawal cooldown — wait ${waitSec}s` };
    }

    // ── Deduct balance immediately (reserve funds) ──────────────────────────
    const newBalance = parseFloat((playerBalance - amount).toFixed(2));
    this.lastWithdrawal.set(playerId, Date.now());

    // ── Large amounts go to manual queue ───────────────────────────────────
    if (amount > MAX_AUTO_WITHDRAWAL) {
      this.queue.push({ playerId, toAddress, amount, newBalance, ts: Date.now() });
      console.log(`[Withdrawal] QUEUED for review: ${amount} USDT → ${toAddress} (player ${playerId})`);

      if (db.isEnabled() && playerId) {
        await db.query(
          `INSERT INTO transactions (player_id, type, amount, destination_address, status)
           VALUES ($1, 'withdrawal', $2, $3, 'pending_review')`,
          [playerId, amount, toAddress]
        );
        await db.query('UPDATE players SET balance = $2 WHERE id = $1', [playerId, newBalance]);
      }

      return { ok: true, status: 'queued', newBalance, message: `$${amount} USDT pending manual review (>$${MAX_AUTO_WITHDRAWAL})` };
    }

    // ── Auto-process small withdrawals ──────────────────────────────────────
    const sendResult = await tron.sendUSDT(toAddress, amount);

    if (!sendResult.ok) {
      // Failed — refund balance
      return { ok: false, error: sendResult.error };
    }

    if (db.isEnabled() && playerId) {
      await db.query(
        `INSERT INTO transactions (player_id, type, amount, destination_address, txid, status, confirmed_at)
         VALUES ($1, 'withdrawal', $2, $3, $4, 'confirmed', NOW())`,
        [playerId, amount, toAddress, sendResult.txid]
      );
      await db.query('UPDATE players SET balance = $2 WHERE id = $1', [playerId, newBalance]);
    }

    console.log(`[Withdrawal] Sent ${amount} USDT → ${toAddress} | txid: ${sendResult.txid}`);
    return {
      ok: true,
      status: 'sent',
      txid: sendResult.txid,
      newBalance,
      mock: sendResult.mock || false,
    };
  }

  getQueue() {
    return this.queue;
  }

  // Admin: approve a queued withdrawal
  async approveQueued(index) {
    const item = this.queue[index];
    if (!item) return { ok: false, error: 'Not found' };
    this.queue.splice(index, 1);

    const result = await tron.sendUSDT(item.toAddress, item.amount);

    if (db.isEnabled() && item.playerId && result.ok) {
      await db.query(
        `UPDATE transactions SET status = 'confirmed', txid = $2, confirmed_at = NOW()
         WHERE player_id = $1 AND status = 'pending_review' AND amount = $3`,
        [item.playerId, result.txid, item.amount]
      );
    }

    return result;
  }
}

module.exports = new WithdrawalProcessor();
