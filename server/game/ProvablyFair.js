const crypto = require('crypto');

class ProvablyFair {
  constructor() {
    this.roundId = 1;
    this.history = []; // last 100 rounds for audit
  }

  // Generate a new round seed pair
  generateRound() {
    const secretSeed = crypto.randomBytes(32).toString('hex');
    const publicHash = crypto.createHash('sha256').update(secretSeed).digest('hex');
    return { secretSeed, publicHash, roundId: this.roundId++ };
  }

  // Deterministic crash point from seed + roundId
  // Returns a multiplier >= 1.00
  getCrashPoint(secretSeed, roundId) {
    const hmac = crypto
      .createHmac('sha256', secretSeed)
      .update(roundId.toString())
      .digest('hex');

    // Use first 8 hex chars (32 bits)
    const decimal = parseInt(hmac.slice(0, 8), 16);
    const MAX = 0xffffffff;

    // 1% house edge: ~1 in 101 rounds bust at exactly 1.00x
    if (decimal % 101 === 0) return 1.00;

    // Exponential crash distribution: most rounds 1-3x, rare 1000x+
    const u = decimal / (MAX + 1); // uniform [0, 1)
    const crashPoint = parseFloat((0.99 / (1 - u)).toFixed(2));

    return Math.max(1.00, Math.min(crashPoint, 50000));
  }

  // Store round result for public audit
  recordRound({ roundId, publicHash, secretSeed, crashPoint, players }) {
    this.history.unshift({ roundId, publicHash, secretSeed, crashPoint, players, ts: Date.now() });
    if (this.history.length > 100) this.history.pop();
  }

  // Client calls this to independently verify any past round
  verify(secretSeed, roundId, claimedHash) {
    const actualHash = crypto.createHash('sha256').update(secretSeed).digest('hex');
    const hashMatches = actualHash === claimedHash;
    const crashPoint = this.getCrashPoint(secretSeed, roundId);
    return { hashMatches, crashPoint };
  }

  getHistory(limit = 20) {
    return this.history.slice(0, limit).map(r => ({
      roundId: r.roundId,
      crashPoint: r.crashPoint,
      publicHash: r.publicHash,
      secretSeed: r.secretSeed, // revealed after round
      ts: r.ts,
    }));
  }
}

module.exports = new ProvablyFair();
