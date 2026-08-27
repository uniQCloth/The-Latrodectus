const tron = require('./TronService');
const db = require('../db/db');

const WITHDRAWAL_FEE    = 5;     // USDT flat fee deducted from every withdrawal
const MIN_WITHDRAWAL    = 10;    // USDT — minimum requested before fee (player gets 5)
const MAX_DAILY         = 2000;  // USDT — maximum total per player per calendar day
const MAX_AUTO          = 1000;  // above this → manual review queue
const COOLDOWN_MS       = 10 * 60 * 1000; // 10 min between requests per player

class WithdrawalProcessor {
  constructor() {
    this.lastWithdrawal = new Map(); // playerId → timestamp
    this.dailyTotals    = new Map(); // playerId → { date: 'YYYY-MM-DD', total: number }
    this.queue          = [];        // manual review queue
  }

  // Returns today's date string in UTC — used as the daily-limit window key
  _todayUTC() {
    return new Date().toISOString().slice(0, 10);
  }

  // How much the player has already withdrawn today (in-memory)
  _dailyUsed(playerId) {
    const entry = this.dailyTotals.get(playerId);
    if (!entry || entry.date !== this._todayUTC()) return 0;
    return entry.total;
  }

  // Record a withdrawal against the daily cap
  _recordDaily(playerId, amount) {
    const today = this._todayUTC();
    const prev  = this.dailyTotals.get(playerId);
    if (!prev || prev.date !== today) {
      this.dailyTotals.set(playerId, { date: today, total: amount });
    } else {
      prev.total += amount;
    }
  }

  async process({ playerId, playerBalance, toAddress, amount }) {
    amount = parseFloat(amount);

    // ── Validation ────────────────────────────────────────────────────────────
    if (isNaN(amount) || amount < MIN_WITHDRAWAL) {
      return {
        ok: false,
        error: `Minimum withdrawal is $${MIN_WITHDRAWAL} USDT (you receive $${MIN_WITHDRAWAL - WITHDRAWAL_FEE} after the $${WITHDRAWAL_FEE} transaction fee)`,
      };
    }
    if (amount > MAX_DAILY) {
      return {
        ok: false,
        error: `Maximum withdrawal is $${MAX_DAILY} USDT per day`,
      };
    }

    // Daily cap check
    const usedToday = this._dailyUsed(playerId);
    if (usedToday + amount > MAX_DAILY) {
      const remaining = MAX_DAILY - usedToday;
      return {
        ok: false,
        error: `Daily withdrawal limit reached. You can withdraw up to $${remaining.toFixed(2)} USDT more today.`,
      };
    }

    if (amount > playerBalance) {
      return {
        ok: false,
        error: `Insufficient balance ($${playerBalance.toFixed(2)} USDT available)`,
      };
    }

    if (!tron.isValidAddress(toAddress)) {
      return { ok: false, error: 'Invalid TRC-20 address (must start with T, 34 characters)' };
    }

    // ── Cooldown ──────────────────────────────────────────────────────────────
    const lastTime = this.lastWithdrawal.get(playerId) || 0;
    const elapsed  = Date.now() - lastTime;
    if (elapsed < COOLDOWN_MS) {
      const waitSec = Math.ceil((COOLDOWN_MS - elapsed) / 1000);
      return { ok: false, error: `Withdrawal cooldown — wait ${waitSec}s before requesting again` };
    }

    // ── Apply fee — player requested `amount`, they receive `amount - fee` ────
    const netAmount  = parseFloat((amount - WITHDRAWAL_FEE).toFixed(2));
    const newBalance = parseFloat((playerBalance - amount).toFixed(2));

    this.lastWithdrawal.set(playerId, Date.now());
    this._recordDaily(playerId, amount);

    console.log(`[Withdrawal] ${playerId}: requested $${amount}, fee $${WITHDRAWAL_FEE}, net $${netAmount} → ${toAddress}`);

    // ── Large amounts → manual review queue ───────────────────────────────────
    if (amount > MAX_AUTO) {
      this.queue.push({ playerId, toAddress, amount, netAmount, newBalance, ts: Date.now() });

      if (db.isEnabled() && playerId) {
        await db.query(
          `INSERT INTO transactions (player_id, type, amount, destination_address, status)
           VALUES ($1, 'withdrawal', $2, $3, 'pending_review')`,
          [playerId, amount, toAddress]
        );
        await db.query('UPDATE players SET balance = $2 WHERE id = $1', [playerId, newBalance]);
      }

      return {
        ok: true,
        status: 'queued',
        newBalance,
        fee: WITHDRAWAL_FEE,
        netAmount,
        message: `Withdrawal of $${amount} USDT is pending manual review. You will receive $${netAmount} USDT after the $${WITHDRAWAL_FEE} transaction fee.`,
      };
    }

    // ── Auto-process — send net amount to player ──────────────────────────────
    const sendResult = await tron.sendUSDT(toAddress, netAmount);

    if (!sendResult.ok) {
      // Refund daily counter and cooldown if send fails
      this._recordDaily(playerId, -amount);
      this.lastWithdrawal.delete(playerId);
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

    console.log(`[Withdrawal] Sent $${netAmount} USDT (of $${amount} requested) → ${toAddress} | txid: ${sendResult.txid}`);
    return {
      ok: true,
      status: 'sent',
      txid: sendResult.txid,
      newBalance,
      fee: WITHDRAWAL_FEE,
      netAmount,
      mock: sendResult.mock || false,
    };
  }

  getQueue() { return this.queue; }

  // Admin: approve a queued withdrawal (sends netAmount, not full amount)
  async approveQueued(index) {
    const item = this.queue[index];
    if (!item) return { ok: false, error: 'Not found in queue' };
    this.queue.splice(index, 1);

    const result = await tron.sendUSDT(item.toAddress, item.netAmount);

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
