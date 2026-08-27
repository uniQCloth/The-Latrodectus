const provablyFair = require('./ProvablyFair');
const MultiplierEngine = require('./MultiplierEngine');
const db = require('../db/db');
const queries = require('../db/queries');
const houseAccount = require('../payments/HouseAccount');

const STATES = { BETTING: 'betting', PLAYING: 'playing', RESULT: 'result' };
const BETTING_DURATION = 10000; // 10s lobby
const RESULT_DURATION  = 3000;  // 3s result display
const TICK_INTERVAL    = 100;   // ms between multiplier broadcasts

class RoundManager {
  constructor(io, hooks = {}) {
    this.io = io;
    this._hooks = hooks; // { onCrash, onRoundStart }
    this.state = STATES.BETTING;
    this.engine = new MultiplierEngine();
    this.currentRound = null;
    this.bets = new Map();     // socketId → { amount, autoCashout, cashedOut, cashoutAt, betId, playerId }
    this.players = new Map();  // socketId → { balance, username, playerId, uuid }
    this.tickInterval = null;
    this.stateTimer = null;
    this.bettingCountdown = BETTING_DURATION;

    this.startBettingPhase();
  }

  // ─── Player Management ────────────────────────────────────────────────────

  async addPlayer(socketId, username, uuid = null) {
    const playerData = { username: username || null, balance: 1000.00, playerId: null, uuid };
    this.players.set(socketId, playerData);

    // Restore balance from DB for returning players
    if (db.isEnabled() && uuid && username) {
      const res = await queries.upsertPlayer(uuid, username);
      if (res?.rows?.[0]) {
        playerData.playerId = res.rows[0].id;
        playerData.balance  = parseFloat(res.rows[0].balance);
      }
    }
  }

  removePlayer(socketId) {
    this.players.delete(socketId);
    this.bets.delete(socketId);
  }

  getPlayer(socketId) {
    return this.players.get(socketId);
  }

  // ─── Bet Handling ─────────────────────────────────────────────────────────

  placeBet(socketId, amount, autoCashout = null) {
    if (this.state !== STATES.BETTING) {
      return { ok: false, error: 'Round already in progress' };
    }

    const player = this.players.get(socketId);
    if (!player) return { ok: false, error: 'Player not found' };

    amount = parseFloat(amount);
    if (isNaN(amount) || amount < 0.5 || amount > 1000) {
      return { ok: false, error: 'Bet must be $0.50–$1000 USDT' };
    }
    if (amount > player.balance) {
      return { ok: false, error: 'Insufficient balance' };
    }
    if (this.bets.has(socketId)) {
      return { ok: false, error: 'Bet already placed this round' };
    }

    player.balance = parseFloat((player.balance - amount).toFixed(2));
    const bet = {
      amount,
      autoCashout: autoCashout ? parseFloat(autoCashout) : null,
      cashedOut: false,
      cashoutAt: null,
      betId: null,
      playerId: player.playerId,
    };
    this.bets.set(socketId, bet);

    // Persist bet to DB
    if (db.isEnabled() && player.playerId && this.currentRound) {
      queries.insertBet({
        roundId: this.currentRound.roundId,
        playerId: player.playerId,
        amount,
        autoCashout: autoCashout || null,
      }).then(res => { if (res?.rows?.[0]) bet.betId = res.rows[0].id; });
    }

    return { ok: true, balance: player.balance, amount };
  }

  cancelBet(socketId) {
    if (this.state !== STATES.BETTING) return { ok: false, error: 'Cannot cancel — round started' };
    const bet = this.bets.get(socketId);
    if (!bet) return { ok: false, error: 'No bet to cancel' };

    const player = this.players.get(socketId);
    player.balance = parseFloat((player.balance + bet.amount).toFixed(2));
    this.bets.delete(socketId);
    return { ok: true, balance: player.balance };
  }

  cashOut(socketId) {
    if (this.state !== STATES.PLAYING) return { ok: false, error: 'Not in play' };
    const bet = this.bets.get(socketId);
    if (!bet || bet.cashedOut) return { ok: false, error: 'No active bet' };

    const multiplier = this.engine.currentMultiplier;
    return this._settleCashout(socketId, bet, multiplier);
  }

  _settleCashout(socketId, bet, multiplier) {
    bet.cashedOut = true;
    bet.cashoutAt = multiplier;

    const payout = parseFloat((bet.amount * multiplier).toFixed(2));
    const player = this.players.get(socketId);
    if (player) player.balance = parseFloat((player.balance + payout).toFixed(2));

    this.io.to(socketId).emit('cashout:confirmed', {
      multiplier,
      payout,
      balance: player?.balance,
    });

    this._hooks.onCashout?.({ socketId, username: player?.username, multiplier, payout, betAmount: bet.amount });

    // Persist cashout to DB
    if (db.isEnabled() && bet.betId && player?.playerId) {
      queries.settleBet({ betId: bet.betId, cashedOut: true, cashoutAt: multiplier, payout });
      queries.updateBalance(player.playerId, player.balance, 0, payout);
    }

    return { ok: true, multiplier, payout };
  }

  // ─── Round State Machine ───────────────────────────────────────────────────

  startBettingPhase() {
    this.state = STATES.BETTING;
    this.bets.clear();
    this.bettingCountdown = BETTING_DURATION;

    // Generate next round seed — publish hash to clients NOW (before round)
    this.currentRound = provablyFair.generateRound();

    this.io.emit('round:betting', {
      roundId: this.currentRound.roundId,
      publicHash: this.currentRound.publicHash,
      duration: BETTING_DURATION,
      playerCount: this.players.size,
    });

    // Countdown ticker (every 1s)
    const countdownTick = setInterval(() => {
      this.bettingCountdown -= 1000;
      this.io.emit('betting:countdown', { remaining: Math.max(0, this.bettingCountdown) });
    }, 1000);

    this.stateTimer = setTimeout(() => {
      clearInterval(countdownTick);
      this.startPlayingPhase();
    }, BETTING_DURATION);
  }

  startPlayingPhase() {
    this.state = STATES.PLAYING;

    const crashPoint = provablyFair.getCrashPoint(
      this.currentRound.secretSeed,
      this.currentRound.roundId
    );
    this.engine.start(crashPoint);

    // Persist round open to DB
    if (db.isEnabled()) {
      queries.insertRound({
        roundId: this.currentRound.roundId,
        secretSeed: this.currentRound.secretSeed,
        publicHash: this.currentRound.publicHash,
      });
    }

    this.io.emit('round:start', {
      roundId: this.currentRound.roundId,
      publicHash: this.currentRound.publicHash,
      betCount: this.bets.size,
    });

    this._hooks.onRoundStart?.(`🚀 Round #${this.currentRound.roundId} started — ${this.bets.size} bet${this.bets.size !== 1 ? 's' : ''}`);

    // Tick loop — broadcast multiplier every 100ms
    this.tickInterval = setInterval(() => {
      const { multiplier, crashed } = this.engine.tick();
      const tiles = MultiplierEngine.multiplierToTiles(multiplier);

      // Check auto-cashouts
      this.bets.forEach((bet, socketId) => {
        if (!bet.cashedOut && bet.autoCashout && multiplier >= bet.autoCashout) {
          this._settleCashout(socketId, bet, multiplier);
        }
      });

      if (crashed) {
        clearInterval(this.tickInterval);
        this.io.emit('round:tick', { multiplier, tiles, crashed: true });
        this.endRound(multiplier);
      } else {
        this.io.emit('round:tick', { multiplier, tiles, crashed: false });
      }
    }, TICK_INTERVAL);
  }

  endRound(crashPoint) {
    this.state = STATES.RESULT;

    // Bust everyone who didn't cash out
    const results = [];
    let totalWagered = 0;
    let totalPaid = 0;

    this.bets.forEach((bet, socketId) => {
      const player = this.players.get(socketId);
      const payout = bet.cashedOut ? parseFloat((bet.amount * bet.cashoutAt).toFixed(2)) : 0;
      totalWagered += bet.amount;
      totalPaid += payout;

      results.push({
        socketId,
        username: player?.username,
        bet: bet.amount,
        cashedOut: bet.cashedOut,
        cashoutAt: bet.cashoutAt,
        payout,
      });

      // Settle busted bets + update player stats in DB
      if (db.isEnabled()) {
        if (!bet.cashedOut && bet.betId) {
          queries.settleBet({ betId: bet.betId, cashedOut: false, cashoutAt: null, payout: 0 });
        }
        if (player?.playerId) {
          queries.updateBalance(player.playerId, player.balance, bet.amount, payout);
        }
      }
    });

    // Credit house profit — lost bets accumulate in admin wallet, no on-chain tx per round
    const houseProfit = parseFloat((totalWagered - totalPaid).toFixed(2));
    if (houseProfit > 0) houseAccount.addProfit(houseProfit);

    // Close round in DB
    if (db.isEnabled()) {
      queries.closeRound({
        roundId: this.currentRound.roundId,
        crashPoint,
        betCount: results.length,
        totalWagered: parseFloat(totalWagered.toFixed(2)),
        totalPaid: parseFloat(totalPaid.toFixed(2)),
      });
    }

    // Record for provably fair audit
    provablyFair.recordRound({
      roundId: this.currentRound.roundId,
      publicHash: this.currentRound.publicHash,
      secretSeed: this.currentRound.secretSeed,
      crashPoint,
      players: results.length,
    });

    this.io.emit('round:crashed', {
      roundId: this.currentRound.roundId,
      crashPoint,
      secretSeed: this.currentRound.secretSeed, // reveal seed so clients can verify
      results: results.map(r => ({
        username: r.username,
        bet: r.bet,
        cashedOut: r.cashedOut,
        cashoutAt: r.cashoutAt,
        payout: r.payout,
      })),
    });

    // System chat announcement
    const emoji = crashPoint <= 1.5 ? '💀' : crashPoint <= 5 ? '🔥' : '🚀';
    const winners = results.filter(r => r.cashedOut).length;
    this._hooks.onCrash?.(`${emoji} CRASHED at ${crashPoint.toFixed(2)}× — ${winners}/${results.length} cashed out`);

    // Start next betting phase after result display
    this.stateTimer = setTimeout(() => this.startBettingPhase(), RESULT_DURATION);
  }

  // ─── Public Getters ────────────────────────────────────────────────────────

  getState() {
    return {
      state: this.state,
      roundId: this.currentRound?.roundId,
      publicHash: this.currentRound?.publicHash,
      multiplier: this.engine.currentMultiplier,
      tiles: MultiplierEngine.multiplierToTiles(this.engine.currentMultiplier),
      bettingRemaining: this.bettingCountdown,
      playerCount: this.players.size,
    };
  }

  async getHistory(limit = 20) {
    if (db.isEnabled()) {
      const res = await queries.getRecentRounds(limit);
      if (res?.rows?.length) return res.rows;
    }
    return provablyFair.getHistory(limit);
  }
}

module.exports = { RoundManager, STATES };
