// Server-authoritative multiplier engine.
// Time-based exponential curve: multiplier = 0.99 * e^(elapsed / 8000)
// At 8000ms ≈ 2.7x, 20000ms ≈ 10x, 40000ms ≈ 100x, 60000ms ≈ 990x

class MultiplierEngine {
  constructor() {
    this.startTime = null;
    this.currentMultiplier = 1.00;
    this.crashPoint = null;
    this.crashed = false;
  }

  start(crashPoint) {
    this.startTime = Date.now();
    this.crashPoint = crashPoint;
    this.currentMultiplier = 1.00;
    this.crashed = false;
  }

  tick() {
    if (this.crashed || !this.startTime) return { multiplier: this.currentMultiplier, crashed: false };

    const elapsed = Date.now() - this.startTime;
    const raw = 0.99 * Math.exp(elapsed / 8000);
    this.currentMultiplier = parseFloat(Math.max(1.00, raw).toFixed(2));

    if (this.currentMultiplier >= this.crashPoint) {
      this.currentMultiplier = this.crashPoint;
      this.crashed = true;
      return { multiplier: this.currentMultiplier, crashed: true };
    }

    return { multiplier: this.currentMultiplier, crashed: false };
  }

  // Convert server multiplier to tile display for the client spider
  // Inverse of: multiplier = 0.99 * e^(tile / 1200)
  static multiplierToTiles(multiplier) {
    return Math.max(0, Math.round(Math.log(multiplier / 0.99) * 1200));
  }

  // Convert tile height to display multiplier (client-side only)
  static tilesToMultiplier(tiles) {
    return parseFloat((0.99 * Math.exp(tiles / 1200)).toFixed(2));
  }

  getElapsed() {
    return this.startTime ? Date.now() - this.startTime : 0;
  }

  reset() {
    this.startTime = null;
    this.currentMultiplier = 1.00;
    this.crashPoint = null;
    this.crashed = false;
  }
}

module.exports = MultiplierEngine;
