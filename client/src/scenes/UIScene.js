import { multiplierColor } from '../systems/Multiplier';
import { startIdleWatch, stopIdleWatch } from '../systems/IdleManager';
import socket from '../systems/SocketManager';
import WalletPanel from '../ui/WalletPanel';
import ChatPanel from '../ui/ChatPanel';
import { sound } from '../systems/SoundManager';

const STATES = { BETTING: 'betting', PLAYING: 'playing', RESULT: 'result' };

export default class UIScene extends Phaser.Scene {
  constructor() {
    super({ key: 'UIScene' });
  }

  create() {
    const { width, height } = this.scale;

    this.state = STATES.BETTING;
    this.betPlaced = false;
    this.cashedOut = false;
    this.betAmount = 0.50;
    this.autoCashoutVal = null;
    this.balance = 1000.00;
    this.currentMultiplier = 1.00;
    this.roundId = null;
    this._betInputEl = null;
    this._acInputEl = null;
    this.autoBetEnabled = false;
    this.autoBetRoundsLeft = 0;
    this._localHistory = [];
    this._topScores = [];
    this._playerCount = 0;

    // ── Background panels ──────────────────────────────────────────────────

    // Top HUD bar — taller to hold history chips below multiplier
    this.add.rectangle(width / 2, 48, width, 96, 0x000000, 0.8).setScrollFactor(0).setDepth(10);

    // Bottom panel
    this.add.rectangle(width / 2, height - 60, width, 116, 0x0d0d0d, 0.95).setScrollFactor(0).setDepth(10);
    this.add.rectangle(width / 2, height - 60, width, 116, 0x000000, 0)
      .setStrokeStyle(1, 0x00ff88, 0.25).setScrollFactor(0).setDepth(10);

    // ── Top HUD ────────────────────────────────────────────────────────────

    this.multText = this.add.text(width / 2, 26, '1.00×', {
      fontSize: '36px', fontFamily: 'Arial Black, sans-serif',
      color: '#ffffff', stroke: '#000000', strokeThickness: 6,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(11);

    this.tileText = this.add.text(14, 62, 'Tile 0 / 5000', {
      fontSize: '11px', color: '#888888',
    }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(11);

    this.wormText = this.add.text(width - 10, 8, '🐛 0/3', {
      fontSize: '14px', color: '#00ff88',
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(11);

    this.roundInfo = this.add.text(width / 2, 90, 'Round #—', {
      fontSize: '8px', color: '#333333',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(11);

    // Connection dot
    this.connDot = this.add.circle(width - 10, height - 112, 5, 0xff0000)
      .setScrollFactor(0).setDepth(11);
    this.connLabel = this.add.text(width - 18, height - 119, 'OFFLINE', {
      fontSize: '9px', color: '#ff4444',
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(11);

    // ── Balance — depth 13 so it always renders above boxes below it ────────

    this.balanceText = this.add.text(14, height - 112, '💰 $1000.00', {
      fontSize: '13px', color: '#ffd700', fontFamily: 'Arial Black, sans-serif',
    }).setScrollFactor(0).setDepth(13);

    // ── Bet amount field (clickable → opens number input) ──────────────────

    const FIELD_X = 14;
    const FIELD_Y = height - 82;   // top edge ≈ height-93, sits just below balance
    const FIELD_W = 190;
    const FIELD_H = 26;

    // Background pill
    this.betFieldBg = this.add.rectangle(
      FIELD_X + FIELD_W / 2, FIELD_Y, FIELD_W, FIELD_H, 0x0d1a0d, 1
    ).setStrokeStyle(1.5, 0x00ff88, 0.6)
      .setScrollFactor(0).setDepth(11)
      .setInteractive({ useHandCursor: true });

    // Amount text — tap/click to edit
    this.betAmountText = this.add.text(
      FIELD_X + FIELD_W / 2, FIELD_Y, '0.50 USDT', {
        fontSize: '15px', fontFamily: 'Arial Black, sans-serif',
        color: '#00ff88',
      }
    ).setOrigin(0.5).setScrollFactor(0).setDepth(12)
      .setInteractive({ useHandCursor: true });

    // Pen icon hint
    this.add.text(FIELD_X + FIELD_W - 8, FIELD_Y, '✏', {
      fontSize: '10px', color: '#224422',
    }).setOrigin(1, 0.5).setScrollFactor(0).setDepth(12);

    this.betFieldBg.on('pointerdown', () => this._openBetInput());
    this.betAmountText.on('pointerdown', () => this._openBetInput());
    this.betFieldBg.on('pointerover', () => this.betFieldBg.setStrokeStyle(2, 0x00ff88, 1));
    this.betFieldBg.on('pointerout', () => this.betFieldBg.setStrokeStyle(1.5, 0x00ff88, 0.6));

    // ── Auto-cashout field ─────────────────────────────────────────────────

    const AC_X = 14;
    const AC_Y = height - 52;
    const AC_W = 190;
    const AC_H = 22;

    this.acFieldBg = this.add.rectangle(
      AC_X + AC_W / 2, AC_Y, AC_W, AC_H, 0x0d0d1a, 1
    ).setStrokeStyle(1, 0x4444aa, 0.5)
      .setScrollFactor(0).setDepth(11)
      .setInteractive({ useHandCursor: true });

    // Label inside left edge
    this.add.text(AC_X + 8, AC_Y, 'AUTO OUT:', {
      fontSize: '8px', color: '#444466',
    }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(12);

    this.acText = this.add.text(AC_X + AC_W / 2 + 20, AC_Y, 'OFF', {
      fontSize: '12px', fontFamily: 'Arial Black, sans-serif', color: '#333366',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(12)
      .setInteractive({ useHandCursor: true });

    this.acFieldBg.on('pointerdown', () => this._openAutoCashoutInput());
    this.acText.on('pointerdown', () => this._openAutoCashoutInput());
    this.acFieldBg.on('pointerover', () => this.acFieldBg.setStrokeStyle(1.5, 0x6666cc, 0.8));
    this.acFieldBg.on('pointerout', () => this.acFieldBg.setStrokeStyle(1, 0x4444aa, 0.5));

    // ── BET / ACTION button ────────────────────────────────────────────────

    this.actionBtn = this.add.text(width - 14, height - 75, 'BET', {
      fontSize: '24px', fontFamily: 'Arial Black, sans-serif',
      color: '#000000', backgroundColor: '#00ff88',
      padding: { x: 18, y: 8 },
    }).setOrigin(1, 0.5).setScrollFactor(0).setDepth(11)
      .setInteractive({ useHandCursor: true });

    this.actionBtn.on('pointerdown', () => this.handleActionBtn());
    this.actionBtn.on('pointerover', () => this.actionBtn.setStyle({ backgroundColor: '#00cc66' }));
    this.actionBtn.on('pointerout', () => this.onActionBtnOut());

    // ── Auto-bet toggle ────────────────────────────────────────────────────

    const TGL_W = 52; const TGL_H = 20;
    const TGL_X = width - 14 - TGL_W;
    const TGL_Y = height - 44;

    this._autoBetGfx = this.add.graphics().setScrollFactor(0).setDepth(12);

    this.add.text(TGL_X - 5, TGL_Y, 'AUTO', {
      fontSize: '9px', color: '#555555',
    }).setOrigin(1, 0.5).setScrollFactor(0).setDepth(12);

    this._autoBetCountText = this.add.text(TGL_X + TGL_W / 2, TGL_Y - TGL_H / 2 - 1, '', {
      fontSize: '8px', color: '#00ff88',
    }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(12);

    const tglZone = this.add.zone(TGL_X, TGL_Y, TGL_W, TGL_H)
      .setOrigin(0, 0.5).setInteractive({ useHandCursor: true });
    tglZone.on('pointerdown', () => this._toggleAutoBet());

    this._drawAutoBetToggle = () => {
      const g = this._autoBetGfx;
      g.clear();
      const on = this.autoBetEnabled;
      g.fillStyle(on ? 0x008833 : 0x2a2a2a, 1);
      g.fillRoundedRect(TGL_X, TGL_Y - TGL_H / 2, TGL_W, TGL_H, TGL_H / 2);
      g.lineStyle(1, on ? 0x00ff88 : 0x444444, 0.7);
      g.strokeRoundedRect(TGL_X, TGL_Y - TGL_H / 2, TGL_W, TGL_H, TGL_H / 2);
      const circleX = on ? TGL_X + TGL_W - TGL_H / 2 : TGL_X + TGL_H / 2;
      g.fillStyle(0xffffff, 1);
      g.fillCircle(circleX, TGL_Y, TGL_H / 2 - 3);
      // ON / OFF text inside pill
      g.fillStyle(on ? 0x00ff88 : 0x555555, 0);
      const labelX = on ? TGL_X + 8 : TGL_X + TGL_W - 8;
      const pillLabel = on ? (this.autoBetRoundsLeft > 0 ? `${this.autoBetRoundsLeft}` : 'ON') : 'OFF';
      // Re-use a cached text object to avoid creating per-draw
      if (!this._tglPillText) {
        this._tglPillText = this.add.text(labelX, TGL_Y, pillLabel, {
          fontSize: '8px', color: on ? '#00ff88' : '#555555',
        }).setOrigin(on ? 0 : 1, 0.5).setScrollFactor(0).setDepth(13);
      } else {
        this._tglPillText.setText(pillLabel)
          .setColor(on ? '#00ff88' : '#555555')
          .setX(labelX)
          .setOrigin(on ? 0 : 1, 0.5);
      }
      // Rounds remaining counter
      if (on && this.autoBetRoundsLeft > 0) {
        this._autoBetCountText.setText(`${this.autoBetRoundsLeft}rds`);
      } else {
        this._autoBetCountText.setText('');
      }
    };
    this._drawAutoBetToggle();

    // ── Round state overlays ───────────────────────────────────────────────

    this.countdownBanner = this.add.text(width / 2, height * 0.42, '', {
      fontSize: '22px', fontFamily: 'Arial Black, sans-serif',
      color: '#00ff88', stroke: '#000000', strokeThickness: 4, align: 'center',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(12).setAlpha(0);

    // cashout sits high, crash sits low — they never overlap
    this.crashOverlay = this.add.text(width / 2, height * 0.46, '', {
      fontSize: '44px', fontFamily: 'Arial Black, sans-serif',
      color: '#ff2200', stroke: '#000000', strokeThickness: 7, align: 'center',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(12).setAlpha(0);

    this.cashoutOverlay = this.add.text(width / 2, height * 0.28, '', {
      fontSize: '28px', fontFamily: 'Arial Black, sans-serif',
      color: '#00ff88', stroke: '#000000', strokeThickness: 5, align: 'center',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(12).setAlpha(0);

    // ── History bar (last 8 rounds) ────────────────────────────────────────

    // ── History bar — top HUD, right-aligned under multiplier ────────────────
    this.historySlots = [];
    for (let i = 0; i < 8; i++) {
      const slot = this.add.text(width - 8 - i * 42, 79, '', {
        fontSize: '10px', color: '#ffffff',
        backgroundColor: '#1a1a1a',
        padding: { x: 4, y: 2 },
      }).setOrigin(1, 1).setScrollFactor(0).setDepth(11);
      this.historySlots.push(slot);
    }

    // ── Wallet button ──────────────────────────────────────────────────────

    const walletBtn = this.add.text(10, 10, '💰 WALLET', {
      fontSize: '12px', color: '#ffd700', backgroundColor: '#1a1a1a',
      padding: { x: 8, y: 4 },
    }).setScrollFactor(0).setDepth(11).setInteractive({ useHandCursor: true });

    walletBtn.on('pointerover', () => walletBtn.setStyle({ backgroundColor: '#333333' }));
    walletBtn.on('pointerout', () => walletBtn.setStyle({ backgroundColor: '#1a1a1a' }));
    walletBtn.on('pointerdown', () => { if (this.walletPanel) this.walletPanel.toggle(); });

    // ── Chat button ────────────────────────────────────────────────────────

    this.chatPanel = new ChatPanel(this);
    this.chatBtn = this.add.text(10, 38, '💬 CHAT', {
      fontSize: '12px', color: '#888888', backgroundColor: '#1a1a1a',
      padding: { x: 8, y: 4 },
    }).setScrollFactor(0).setDepth(11).setInteractive({ useHandCursor: true });

    this.chatBtn.on('pointerover', () => this.chatBtn.setStyle({ backgroundColor: '#333333' }));
    this.chatBtn.on('pointerout', () => {
      if (this.chatPanel.unread === 0) this.chatBtn.setStyle({ backgroundColor: '#1a1a1a' });
    });
    this.chatBtn.on('pointerdown', () => {
      this.chatPanel.toggle();
      this.chatPanel.setBadgeEl(this.chatBtn);
    });
    this.chatPanel.setBadgeEl(this.chatBtn);

    // ── Mute button ────────────────────────────────────────────────────────

    this.muteBtn = this.add.text(width - 10, 32, '🔊', {
      fontSize: '18px',
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(11).setInteractive({ useHandCursor: true });
    this.muteBtn.on('pointerdown', () => {
      const muted = sound.toggleMute();
      this.muteBtn.setText(muted ? '🔇' : '🔊');
      sound.setBgMusicMute(muted);
    });

    // ── Top-5 HUD ─────────────────────────────────────────────────────────
    const hudX = width - 8;
    const hudStartY = 56;
    const hudW = 148;

    this._top5Bg = this.add.rectangle(hudX - hudW / 2, hudStartY + 54, hudW, 108, 0x000000, 0.52)
      .setScrollFactor(0).setDepth(10);
    this.add.text(hudX - 4, hudStartY, '🏆 TOP 5', {
      fontSize: '8px', color: '#ffd700', fontFamily: 'Arial Black, sans-serif',
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(11);

    this._top5Rows = [];
    for (let i = 0; i < 5; i++) {
      this._top5Rows.push(
        this.add.text(hudX - 4, hudStartY + 12 + i * 19, '', {
          fontSize: '9px', color: '#aaaaaa',
          stroke: '#000000', strokeThickness: 2,
        }).setOrigin(1, 0).setScrollFactor(0).setDepth(11)
      );
    }

    this._playerCountText = this.add.text(hudX - 4, hudStartY + 107, '👥 — live', {
      fontSize: '9px', color: '#444444',
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(11);

    // ── How to Play icon ──────────────────────────────────────────────────

    this.helpBtn = this.add.text(10, 66, '❓ HOW', {
      fontSize: '12px', color: '#555555', backgroundColor: '#1a1a1a',
      padding: { x: 8, y: 4 },
    }).setScrollFactor(0).setDepth(11).setInteractive({ useHandCursor: true });

    this.helpBtn.on('pointerover', () => this.helpBtn.setStyle({ backgroundColor: '#333333' }));
    this.helpBtn.on('pointerout', () => this.helpBtn.setStyle({ backgroundColor: '#1a1a1a' }));
    this.helpBtn.on('pointerdown', () => this._showHowToPlayOverlay());

    // ── Wire socket events ─────────────────────────────────────────────────
    this.bindSocketEvents();

    // ── Wire game events from GameScene ───────────────────────────────────
    this.events.on('game:update', this.onGameUpdate, this);
    this.events.on('game:over', this.onGameOver, this);
    this.events.on('game:win', this.onGameWin, this);

    startIdleWatch(this.game);
  }

  // ─── Bet input (DOM overlay) ───────────────────────────────────────────────

  _openBetInput() {
    if (this._betInputEl) return;

    const canvas = this.game.canvas;
    const rect = canvas.getBoundingClientRect();
    const { width, height } = this.scale;
    const scaleX = rect.width / width;
    const scaleY = rect.height / height;

    // Match the bet field rectangle position
    const fieldW = 190;
    const fieldH = 26;
    const fieldCX = 14 + fieldW / 2;
    const fieldCY = height - 82;

    const screenLeft = rect.left + (fieldCX - fieldW / 2) * scaleX;
    const screenTop = rect.top + (fieldCY - fieldH / 2) * scaleY;

    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0.5';
    input.max = '1000';
    input.step = '0.5';
    input.value = this.betAmount.toFixed(2);

    Object.assign(input.style, {
      position: 'fixed',
      left: `${screenLeft}px`,
      top: `${screenTop}px`,
      width: `${fieldW * scaleX}px`,
      height: `${fieldH * scaleY}px`,
      fontSize: `${Math.floor(20 * Math.min(scaleX, scaleY))}px`,
      fontFamily: 'Arial Black, sans-serif',
      fontWeight: 'bold',
      color: '#00ff88',
      background: '#0d1a0d',
      border: '2px solid #00ff88',
      borderRadius: '6px',
      textAlign: 'center',
      outline: 'none',
      zIndex: '500',
      boxSizing: 'border-box',
      WebkitAppearance: 'none',
      MozAppearance: 'textfield',
    });

    document.body.appendChild(input);
    this._betInputEl = input;

    requestAnimationFrame(() => { input.focus(); input.select(); });

    const commit = () => {
      const val = parseFloat(input.value);
      if (!isNaN(val) && val > 0) {
        this.betAmount = parseFloat(Math.max(0.5, Math.min(1000, val)).toFixed(2));
      }
      this.refreshBetDisplay();
      if (input.parentNode) input.remove();
      this._betInputEl = null;
    };

    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { input.blur(); }
      if (e.key === 'Escape') { input.remove(); this._betInputEl = null; }
      e.stopPropagation();
    });
  }

  // ─── Auto-cashout input ───────────────────────────────────────────────────

  _openAutoCashoutInput() {
    if (this._acInputEl) return;

    const canvas = this.game.canvas;
    const rect = canvas.getBoundingClientRect();
    const { width, height } = this.scale;
    const scaleX = rect.width / width;
    const scaleY = rect.height / height;

    const AC_W = 190; const AC_H = 22;
    const AC_CX = 14 + AC_W / 2;
    const AC_CY = height - 52;

    const screenLeft = rect.left + (AC_CX - AC_W / 2) * scaleX;
    const screenTop  = rect.top  + (AC_CY - AC_H / 2) * scaleY;

    const input = document.createElement('input');
    input.type = 'number';
    input.min = '1.01';
    input.max = '1000';
    input.step = '0.01';
    input.placeholder = 'e.g. 2.50';
    if (this.autoCashoutVal) input.value = this.autoCashoutVal.toFixed(2);

    Object.assign(input.style, {
      position: 'fixed',
      left: `${screenLeft}px`,
      top: `${screenTop}px`,
      width: `${AC_W * scaleX}px`,
      height: `${AC_H * scaleY}px`,
      fontSize: `${Math.floor(14 * Math.min(scaleX, scaleY))}px`,
      fontFamily: 'Arial Black, sans-serif',
      fontWeight: 'bold',
      color: '#8888ff',
      background: '#0d0d1a',
      border: '1.5px solid #6666cc',
      borderRadius: '4px',
      textAlign: 'center',
      outline: 'none',
      zIndex: '500',
      boxSizing: 'border-box',
      WebkitAppearance: 'none',
      MozAppearance: 'textfield',
    });

    document.body.appendChild(input);
    this._acInputEl = input;
    requestAnimationFrame(() => { input.focus(); input.select(); });

    const commit = () => {
      const val = parseFloat(input.value);
      if (!isNaN(val) && val > 1.00) {
        this.autoCashoutVal = parseFloat(Math.min(1000, val).toFixed(2));
      } else {
        this.autoCashoutVal = null;
      }
      this._refreshAcDisplay();
      if (input.parentNode) input.remove();
      this._acInputEl = null;
    };

    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { input.blur(); }
      if (e.key === 'Escape') {
        this.autoCashoutVal = null;
        this._refreshAcDisplay();
        input.remove();
        this._acInputEl = null;
      }
      e.stopPropagation();
    });
  }

  _refreshAcDisplay() {
    if (!this.acText) return;
    if (this.autoCashoutVal) {
      this.acText.setText(`${this.autoCashoutVal.toFixed(2)}×`).setColor('#8888ff');
      this.acFieldBg.setStrokeStyle(1.5, 0x6666cc, 0.9);
    } else {
      this.acText.setText('OFF').setColor('#333366');
      this.acFieldBg.setStrokeStyle(1, 0x4444aa, 0.5);
    }
  }

  // ─── Auto-bet toggle ──────────────────────────────────────────────────────

  _toggleAutoBet() {
    this.autoBetEnabled = !this.autoBetEnabled;
    if (this.autoBetEnabled) {
      this.autoBetRoundsLeft = 50;
      this.showToast('Auto-bet ON — 50 rounds', '#00ff88');
    } else {
      this.autoBetRoundsLeft = 0;
      this.showToast('Auto-bet OFF', '#888888');
    }
    this._drawAutoBetToggle();
  }

  // ─── Socket Event Handlers ────────────────────────────────────────────────

  bindSocketEvents() {
    socket.on('connected', ({ id }) => {
      this.connDot.setFillStyle(0x00ff88);
      this.connLabel.setText('LIVE').setColor('#00ff88');
      this.walletPanel = new WalletPanel(this, id, (newBalance) => {
        this.balance = newBalance;
        this.refreshBalance();
      });
    });

    socket.on('disconnected', () => {
      this.connDot.setFillStyle(0xff2200);
      this.connLabel.setText('OFFLINE').setColor('#ff4444');
    });

    socket.on('game:state', (state) => {
      this.state = state.state;
      this.roundId = state.roundId;
      if (state.state === STATES.BETTING) this.enterBettingUI(state.bettingRemaining);
      if (state.state === STATES.PLAYING) this.enterPlayingUI();
    });

    socket.on('round:betting', ({ roundId, publicHash, duration }) => {
      if (!this._bgMusicStarted) {
        this._bgMusicStarted = true;
        sound.startBgMusic();
      }
      this.roundId = roundId;
      this.state = STATES.BETTING;
      this.betPlaced = false;
      this.cashedOut = false;
      this.currentMultiplier = 1.00;
      this.crashOverlay.setAlpha(0);
      this.cashoutOverlay.setAlpha(0);
      this.multText.setText('1.00×').setColor('#ffffff').setScale(1);
      this.wormText.setText('🐛 0/3');
      this.enterBettingUI(duration);
      this.roundInfo.setText(`Round #${roundId}  Hash: ${publicHash.slice(0, 12)}…`);

      // Auto-bet
      if (this.autoBetEnabled && this.autoBetRoundsLeft > 0) {
        this.time.delayedCall(400, () => {
          if (this.state === STATES.BETTING && !this.betPlaced) {
            socket.placeBet(this.betAmount, this.autoCashoutVal);
            this.autoBetRoundsLeft--;
            if (this.autoBetRoundsLeft <= 0) {
              this.autoBetEnabled = false;
              this.showToast('Auto-bet finished (50 rounds)', '#888888');
            }
            this._drawAutoBetToggle();
          }
        });
      }
    });

    socket.on('betting:countdown', ({ remaining }) => {
      // Sync client-side interpolated timer to server value
      this._bettingMs = remaining;
      this._bettingLastSync = Date.now();
    });

    socket.on('round:start', () => {
      this.state = STATES.PLAYING;
      this.enterPlayingUI();
    });

    socket.on('round:tick', ({ multiplier, tiles, crashed }) => {
      if (crashed) return;
      this.currentMultiplier = multiplier;
      this.updateMultiplierDisplay(multiplier, tiles);
      this.updatePayoutPreview();
      this.scene.get('GameScene')?.events.emit('server:tick', { multiplier, tiles });

      // Auto-cashout
      if (this.betPlaced && !this.cashedOut && this.autoCashoutVal && multiplier >= this.autoCashoutVal) {
        socket.cashOut();
      }
    });

    socket.on('round:crashed', ({ crashPoint, secretSeed, roundId }) => {
      this.state = STATES.RESULT;
      this.enterResultUI(crashPoint, secretSeed, roundId);
      // Update history bar immediately — don't wait for server history:update
      this._localHistory.unshift({ crashPoint });
      if (this._localHistory.length > 8) this._localHistory.pop();
      this.updateHistoryBar(this._localHistory);
      // Sound handled by triggerServerFlood() via playJumpScareCrash()
    });

    socket.on('cashout:confirmed', ({ multiplier, payout, balance }) => {
      this.cashedOut = true;
      this.balance = balance;
      this.refreshBalance();
      this.showCashoutSuccess(multiplier, payout);
      this.updateActionBtn();
      sound.playCashout();
    });

    socket.on('cashout:error', ({ error }) => {
      this.showToast(error, '#ff4444');
    });

    socket.on('bet:result', ({ ok, error, balance }) => {
      if (ok) {
        this.betPlaced = true;
        this.balance = balance;
        this.refreshBalance();
        this.updateActionBtn();
        this.showToast('✓ Bet placed!', '#00ff88');
        sound.playBetPlace();
      } else {
        this.showToast(error, '#ff4444');
      }
    });

    socket.on('wallet:balance', ({ balance }) => {
      this.balance = balance;
      this.refreshBalance();
    });

    socket.on('history:update', (history) => {
      this.updateHistoryBar(history);
    });

    socket.on('topscores:update', (scores) => {
      this._topScores = scores || [];
      this._updateTop5HUD();
    });

    socket.on('players:count', ({ count }) => {
      this._playerCount = count;
      this._playerCountText?.setText(`👥 ${count} live`);
    });

    socket.on('wallet:deposit:confirmed', ({ amount, mock }) => {
      this.showToast(`✓ Deposited $${amount} USDT${mock ? ' (mock)' : ''}`, '#00ff88');
    });

    socket.on('wallet:withdraw:confirmed', ({ status, mock }) => {
      const msg = status === 'queued'
        ? '⏳ Withdrawal queued for review'
        : `✓ Withdrawal sent${mock ? ' (mock)' : ''}`;
      this.showToast(msg, '#ff8800');
    });
  }

  // ─── UI State Transitions ─────────────────────────────────────────────────

  enterBettingUI(remainingMs) {
    this.betPlaced = false;
    this.cashedOut = false;
    this.updateMultiplierDisplay(1.00, 0);
    this.updateActionBtn();

    // Seed client-side interpolated countdown
    this._bettingMs       = typeof remainingMs === 'number' ? remainingMs : 10000;
    this._bettingLastSync = Date.now();

    this.countdownBanner
      .setText(`⏱ BET NOW — ${Math.ceil(this._bettingMs / 1000)}s`)
      .setColor('#00ff88')
      .setAlpha(1);

    this.scene.get('GameScene')?.events.emit('server:betting');
  }

  enterPlayingUI() {
    this._bettingMs = 0; // stop countdown interpolation
    this.updateActionBtn();

    if (!this.betPlaced) {
      this.countdownBanner
        .setText('🕷 ROUND IN PROGRESS\nBet opens next round…')
        .setColor('#666666')
        .setAlpha(1);
    } else {
      this.countdownBanner.setAlpha(0);
    }

    this.scene.get('GameScene')?.events.emit('server:playing');
  }

  // Smooth client-side countdown between server ticks
  update(time, delta) {
    if (this.state !== STATES.BETTING || !this._bettingMs || this._bettingMs <= 0) return;
    const elapsed = Date.now() - (this._bettingLastSync || Date.now());
    const remaining = Math.max(0, this._bettingMs - elapsed);
    const secs = Math.ceil(remaining / 1000);
    if (this.countdownBanner.alpha > 0) {
      this.countdownBanner.setText(`⏱ BET NOW — ${secs}s`).setColor('#00ff88');
    }
  }

  enterResultUI(crashPoint, secretSeed, roundId) {
    const color = crashPoint <= 1.5 ? '#ff2200' : crashPoint <= 5 ? '#ff8800' : '#ffd700';
    // If player cashed out, drop crash text lower so cashout text stays readable above it
    const crashY = this.cashedOut ? this.scale.height * 0.52 : this.scale.height * 0.46;
    this.crashOverlay
      .setText(`CRASHED!\n${crashPoint.toFixed(2)}×`)
      .setColor(color)
      .setY(crashY)
      .setAlpha(1);

    this.tweens.add({
      targets: this.crashOverlay,
      scaleX: { from: 1.3, to: 1 },
      scaleY: { from: 1.3, to: 1 },
      duration: 300, ease: 'Back.out',
    });

    this._bettingMs = 0; // stop countdown
    this.countdownBanner.setAlpha(0);
    this.roundInfo.setText(
      `Round #${roundId} CRASHED ${crashPoint.toFixed(2)}× | Seed: ${secretSeed.slice(0, 10)}…`
    );

    this.scene.get('GameScene')?.events.emit('server:crashed', { crashPoint });

    this.time.delayedCall(2500, () => {
      this.tweens.add({ targets: this.crashOverlay, alpha: 0, duration: 400 });
    });
  }

  // ─── Display Helpers ──────────────────────────────────────────────────────

  updateMultiplierDisplay(multiplier, tiles) {
    this.multText.setText(`${multiplier.toFixed(2)}×`);
    this.multText.setColor(multiplierColor(multiplier));
    this.tileText.setText(`Tile ${tiles.toLocaleString()} / 5000`);

    if (this._multPulseTween) this._multPulseTween.stop();
    this._multPulseTween = this.tweens.add({
      targets: this.multText,
      scaleX: { from: 1.06, to: 1 },
      scaleY: { from: 1.06, to: 1 },
      duration: 120, ease: 'Power2',
    });

  }

  updatePayoutPreview() {
    if (!this.betPlaced || this.cashedOut) return;
    const potential = (this.betAmount * this.currentMultiplier).toFixed(2);
    // Show potential payout inside the bet field while round runs
    if (this.betAmountText) {
      this.betAmountText.setText(`→ $${potential}`).setColor('#ffffff');
    }
  }

  refreshBalance() {
    this.balanceText.setText(`💰 $${this.balance.toFixed(2)}`);
  }

  refreshBetDisplay() {
    if (this.betAmountText) {
      this.betAmountText.setText(`${this.betAmount.toFixed(2)} USDT`).setColor('#00ff88');
    }
  }

  updateHistoryBar(history) {
    history.slice(0, 8).forEach((round, i) => {
      const slot = this.historySlots[i];
      if (!slot) return;
      const cp = round.crashPoint;
      const color = cp < 2 ? '#ff4444' : cp < 5 ? '#ff9900' : '#00ff88';
      slot.setText(`${cp.toFixed(2)}×`).setStyle({ color, backgroundColor: '#1a1a1a' });
    });
  }

  showCashoutSuccess(multiplier, payout) {
    this.cashoutOverlay
      .setText(`CASHED OUT!\n${multiplier.toFixed(2)}× = $${payout.toFixed(2)}`)
      .setY(this.scale.height * 0.31)
      .setAlpha(1);

    this.tweens.add({
      targets: this.cashoutOverlay,
      y: { from: this.scale.height * 0.31, to: this.scale.height * 0.26 },
      duration: 500, ease: 'Power2',
    });
  }

  showToast(message, color = '#ffffff') {
    const { width, height } = this.scale;
    if (!this._toastStack) this._toastStack = [];

    const baseY = height - 150 - this._toastStack.length * 36;
    const toast = this.add.text(width + 200, baseY, message, {
      fontSize: '14px', color,
      backgroundColor: '#111111',
      padding: { x: 12, y: 7 },
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(1, 0.5).setScrollFactor(0).setDepth(20).setAlpha(0.95);

    this._toastStack.push(toast);

    this.tweens.add({ targets: toast, x: width - 8, duration: 200, ease: 'Power2' });

    this.time.delayedCall(2000, () => {
      this.tweens.add({
        targets: toast, alpha: 0, x: width + 100, duration: 300,
        onComplete: () => {
          toast.destroy();
          this._toastStack = this._toastStack.filter(t => t !== toast);
        },
      });
    });
  }

  // ─── Action Button Logic ──────────────────────────────────────────────────

  handleActionBtn() {
    if (!socket.connected) {
      this.showToast('Connecting to server…', '#ff8800');
      return;
    }
    if (this.state === STATES.PLAYING && this.betPlaced && !this.cashedOut) {
      socket.cashOut();
    } else if (this.state === STATES.BETTING && !this.betPlaced) {
      socket.placeBet(this.betAmount, this.autoCashoutVal);
    }
  }

  updateActionBtn() {
    if (this.state === STATES.PLAYING && this.betPlaced && !this.cashedOut) {
      this.actionBtn.setText('CASH OUT')
        .setStyle({ backgroundColor: '#ff2200', color: '#ffffff', fontSize: '22px' })
        .setInteractive({ useHandCursor: true });
    } else if (this.state === STATES.BETTING && !this.betPlaced) {
      this.actionBtn.setText('BET')
        .setStyle({ backgroundColor: '#00ff88', color: '#000000', fontSize: '26px' })
        .setInteractive({ useHandCursor: true });
      // Restore bet amount display
      this.refreshBetDisplay();
    } else if (this.betPlaced && !this.cashedOut) {
      this.actionBtn.setText('IN PLAY')
        .setStyle({ backgroundColor: '#555555', color: '#999999', fontSize: '18px' });
      this.actionBtn.disableInteractive();
    } else if (this.cashedOut) {
      this.actionBtn.setText('✓ CASHED')
        .setStyle({ backgroundColor: '#006633', color: '#00ff88', fontSize: '18px' });
      this.actionBtn.disableInteractive();
    } else {
      this.actionBtn.setText('NEXT\nROUND')
        .setStyle({ backgroundColor: '#1a1a1a', color: '#444444', fontSize: '16px' });
      this.actionBtn.disableInteractive();
    }
  }

  onActionBtnOut() {
    if (this.state === STATES.PLAYING && this.betPlaced && !this.cashedOut) {
      this.actionBtn.setStyle({ backgroundColor: '#ff2200' });
    } else if (this.state === STATES.BETTING && !this.betPlaced) {
      this.actionBtn.setStyle({ backgroundColor: '#00ff88' });
    }
    // disabled states: leave colour alone
  }

  // ─── Game Events (from GameScene) ─────────────────────────────────────────

  onGameUpdate({ tiles, multiplier, glowWorms }) {
    if (!socket.connected) {
      this.updateMultiplierDisplay(multiplier, tiles);
      this.wormText.setText(`🐛 ${glowWorms}/3`);
    }
  }

  onGameOver(cause) {
    if (!socket.connected) {
      this.actionBtn.setText('BUST!')
        .setStyle({ backgroundColor: '#ff2200', color: '#ffffff' });
    }
  }

  onGameWin(multiplier) {
    if (!socket.connected) {
      const payout = (this.betAmount * multiplier).toFixed(2);
      this.showCashoutSuccess(multiplier, payout);
    }
  }

  _updateTop5HUD() {
    const trophies = ['🥇', '🥈', '🥉', '#4', '#5'];
    const colors   = ['#ffd700', '#c0c0c0', '#cd7f32', '#888888', '#666666'];
    for (let i = 0; i < 5; i++) {
      const row = this._top5Rows?.[i];
      if (!row) continue;
      const s = this._topScores[i];
      if (s) {
        const name = s.username.length > 9 ? s.username.slice(0, 8) + '…' : s.username;
        row.setText(`${trophies[i]} ${name}  ${s.multiplier.toFixed(2)}×`).setColor(colors[i]);
      } else {
        row.setText('');
      }
    }
  }

  // ─── How to Play overlay ──────────────────────────────────────────────────

  _showHowToPlayOverlay() {
    if (this._htpOverlay) return;
    const { width, height } = this.scale;

    const SLIDES = [
      {
        title: 'STEP 1 — PLACE YOUR BET',
        caption: 'Set your bet amount and tap BET before the countdown runs out.',
      },
      {
        title: 'STEP 2 — CASH OUT IN TIME',
        caption: 'Tap CASH OUT before the rising water reaches the spider to lock in your win.',
      },
      {
        title: 'STEP 3 — DON\'T GET FLOODED',
        caption: 'Wait too long and the pipe bursts — the flood takes your entire bet.',
      },
    ];

    const ICONS = ['💰', '💸', '⚠️'];
    const BG_COLORS = [0x003311, 0x001133, 0x1a0000];
    let slideIdx = 0;

    // Semi-transparent backdrop
    const backdrop = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.82)
      .setScrollFactor(0).setDepth(80).setInteractive();

    // Card
    const cardH = height * 0.58;
    const cardY = height / 2;
    const card = this.add.rectangle(width / 2, cardY, width - 40, cardH, BG_COLORS[0], 1)
      .setStrokeStyle(2, 0x00ff88, 0.7).setScrollFactor(0).setDepth(81);

    const iconText = this.add.text(width / 2, cardY - cardH / 2 + 30, ICONS[0], {
      fontSize: '36px',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(82);

    const titleText = this.add.text(width / 2, cardY - cardH / 2 + 74, SLIDES[0].title, {
      fontSize: '13px', fontFamily: 'Arial Black, sans-serif',
      color: '#00ff88', align: 'center',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(82);

    const captionText = this.add.text(width / 2, cardY - cardH / 2 + 104, SLIDES[0].caption, {
      fontSize: '13px', color: '#cccccc',
      wordWrap: { width: width - 90 }, align: 'center', lineSpacing: 5,
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(82);

    // Page dots
    const dotsGfx = this.add.graphics().setScrollFactor(0).setDepth(82);
    const drawDots = (active) => {
      dotsGfx.clear();
      const dotY = cardY + cardH / 2 - 44;
      const spacing = 22;
      const startX = width / 2 - spacing;
      for (let i = 0; i < 3; i++) {
        const dx = startX + i * spacing;
        if (i === active) {
          dotsGfx.fillStyle(0x00ff88, 1); dotsGfx.fillCircle(dx, dotY, 5);
        } else {
          dotsGfx.fillStyle(0x333344, 1); dotsGfx.fillCircle(dx, dotY, 4);
        }
      }
    };
    drawDots(0);

    // Nav arrows
    const backBtn = this.add.text(width / 2 - 80, cardY + cardH / 2 - 20, '‹', {
      fontSize: '38px', color: '#222233',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(82).setInteractive({ useHandCursor: true });

    const nextBtn = this.add.text(width / 2 + 80, cardY + cardH / 2 - 20, '›', {
      fontSize: '38px', color: '#00ff88',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(82).setInteractive({ useHandCursor: true });

    // Close X button
    const closeBtn = this.add.text(width / 2 + (width - 40) / 2 - 6, cardY - cardH / 2 + 6, '✕', {
      fontSize: '14px', color: '#555566',
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(83).setInteractive({ useHandCursor: true });

    const allObjs = [backdrop, card, iconText, titleText, captionText, dotsGfx, backBtn, nextBtn, closeBtn];
    this._htpOverlay = allObjs;

    const showSlide = (idx) => {
      slideIdx = idx;
      iconText.setText(ICONS[idx]);
      titleText.setText(SLIDES[idx].title);
      captionText.setText(SLIDES[idx].caption);
      card.setFillStyle(BG_COLORS[idx]);
      backBtn.setColor(idx > 0 ? '#555566' : '#222233');
      nextBtn.setColor(idx < 2 ? '#00ff88' : '#666666');
      drawDots(idx);
    };

    const closeOverlay = () => {
      allObjs.forEach(o => { try { o.destroy(); } catch (_) {} });
      this._htpOverlay = null;
    };

    backBtn.on('pointerdown', () => { if (slideIdx > 0) showSlide(slideIdx - 1); });
    nextBtn.on('pointerdown', () => { if (slideIdx < 2) showSlide(slideIdx + 1); });
    closeBtn.on('pointerdown', closeOverlay);
    backdrop.on('pointerdown', closeOverlay);
  }

  shutdown() {
    socket.clearListeners();
    sound.stopBgMusic();
    stopIdleWatch();
  }

  // ─── Button factory ───────────────────────────────────────────────────────

  createBtn(x, y, label, cb) {
    const btn = this.add.text(x, y, label, {
      fontSize: '22px', fontFamily: 'Arial Black, sans-serif',
      color: '#ffffff', backgroundColor: '#333333',
      padding: { x: 10, y: 5 },
    }).setOrigin(0.5).setScrollFactor(0).setDepth(11).setInteractive({ useHandCursor: true });
    btn.on('pointerdown', cb);
    btn.on('pointerover', () => btn.setStyle({ backgroundColor: '#555555' }));
    btn.on('pointerout', () => btn.setStyle({ backgroundColor: '#333333' }));
    return btn;
  }
}
