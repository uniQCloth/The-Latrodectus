import Phaser from 'phaser';

const SLIDES = [
  {
    title: 'HOW TO MOVE THE SPIDER',
    caption: 'Mobile: tap the left or right side of the screen to move. Desktop: use the ← → arrow keys or A / D. Tap center or press ↑ / W to jump.',
    draw: '_drawControlsSlide',
  },
  {
    title: 'STEP 1 — PLACE YOUR BET',
    caption: 'Set your bet amount and tap BET before the countdown runs out.\n\n💡 Swing the spider into the pipe walls to collect glow worms — each worm boosts your multiplier!',
    draw: '_drawBetSlide',
  },
  {
    title: 'STEP 2 — CASH OUT IN TIME',
    caption: 'Tap CASH OUT before the rising water reaches the spider to lock in your win.',
    draw: '_drawClimbSlide',
  },
  {
    title: 'STEP 3 — DON\'T GET FLOODED',
    caption: 'Wait too long and the pipe bursts — the flood takes your entire bet.',
    draw: '_drawCrashSlide',
  },
];

export default class TutorialScene extends Phaser.Scene {
  constructor() {
    super({ key: 'TutorialScene' });
  }

  create() {
    const { width, height } = this.scale;
    this._slideIndex = 0;
    this._slideObjects = [];

    // Background
    this.add.rectangle(width / 2, height / 2, width, height, 0x060612);

    // Header
    this.add.text(width / 2, 22, 'HOW TO PLAY', {
      fontSize: '15px',
      fontFamily: 'Arial Black, sans-serif',
      color: '#ff2200',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5);

    // Skip (top right — for returning players)
    const skip = this.add.text(width - 10, 10, 'skip', {
      fontSize: '11px', color: '#333333',
    }).setOrigin(1, 0).setInteractive({ useHandCursor: true });
    skip.on('pointerover', () => skip.setColor('#666666'));
    skip.on('pointerout', () => skip.setColor('#333333'));
    skip.on('pointerdown', () => this._launchGame());

    // Slide title
    this._titleText = this.add.text(width / 2, 46, '', {
      fontSize: '12px',
      fontFamily: 'Arial Black, sans-serif',
      color: '#aaaaaa',
    }).setOrigin(0.5);

    // Illustration region constants
    this._ILL = {
      x: 10,
      y: 60,
      w: width - 20,
      h: Math.floor(height * 0.54),
    };

    // Panel background
    this.add.rectangle(
      width / 2,
      this._ILL.y + this._ILL.h / 2,
      this._ILL.w,
      this._ILL.h,
      0x0d0d1a
    ).setStrokeStyle(1, 0x1a1a33, 1);

    // Illustration graphics (persistent — just cleared per slide)
    this._illGfx = this.add.graphics();

    // Caption text (below illustration)
    const capY = this._ILL.y + this._ILL.h + 20;
    this._captionText = this.add.text(width / 2, capY, '', {
      fontSize: '14px',
      color: '#bbbbbb',
      wordWrap: { width: width - 48 },
      align: 'center',
      lineSpacing: 4,
    }).setOrigin(0.5, 0);

    // Left carousel arrow
    const arrowCY = this._ILL.y + this._ILL.h / 2;
    this._backBtn = this.add.text(8, arrowCY, '‹', {
      fontSize: '44px', color: '#222233',
    }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true });
    this._backBtn.on('pointerover', () => {
      if (this._slideIndex > 0) this._backBtn.setColor('#888888');
    });
    this._backBtn.on('pointerout', () => {
      this._backBtn.setColor(this._slideIndex > 0 ? '#555566' : '#222233');
    });
    this._backBtn.on('pointerdown', () => {
      if (this._slideIndex > 0) {
        this._slideIndex--;
        this._showSlide(this._slideIndex);
      }
    });

    // Right carousel arrow / PLAY button
    this._nextBtn = this.add.text(width - 8, arrowCY, '›', {
      fontSize: '44px', color: '#00ff88',
    }).setOrigin(1, 0.5).setInteractive({ useHandCursor: true });
    this._nextBtn.on('pointerover', () => this._nextBtn.setColor('#ffffff'));
    this._nextBtn.on('pointerout', () => this._nextBtn.setColor('#00ff88'));
    this._nextBtn.on('pointerdown', () => this._advance());

    // Page dots
    this._dotsGfx = this.add.graphics();

    // Bottom PLAY button (appears only on last slide)
    const playBtnY = height - 44;
    this._playBtn = this.add.text(width / 2, playBtnY, '▶  PLAY NOW', {
      fontSize: '20px',
      fontFamily: 'Arial Black, sans-serif',
      color: '#000000',
      backgroundColor: '#00ff88',
      padding: { x: 28, y: 12 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true }).setAlpha(0);
    this._playBtn.on('pointerover', () => this._playBtn.setStyle({ backgroundColor: '#00cc66' }));
    this._playBtn.on('pointerout', () => this._playBtn.setStyle({ backgroundColor: '#00ff88' }));
    this._playBtn.on('pointerdown', () => this._launchGame());

    this._showSlide(0);
  }

  _showSlide(idx) {
    // Destroy previous text objects added inside draw functions
    this._slideObjects.forEach(o => { try { o.destroy(); } catch (_) {} });
    this._slideObjects = [];

    const slide = SLIDES[idx];

    // Fade title in
    this._titleText.setText(slide.title).setAlpha(0);
    this.tweens.add({ targets: this._titleText, alpha: 1, duration: 220 });

    // Redraw illustration
    this._illGfx.clear();
    this[slide.draw](this._illGfx);

    // Fade caption in
    this._captionText.setText(slide.caption).setAlpha(0);
    this.tweens.add({ targets: this._captionText, alpha: 1, duration: 220, delay: 80 });

    // Back button visibility
    const showBack = idx > 0;
    this._backBtn.setAlpha(showBack ? 1 : 0);
    this._backBtn.setColor(showBack ? '#555566' : '#222233');

    // On last slide: shrink next arrow, show PLAY button
    if (idx === SLIDES.length - 1) {
      this._nextBtn.setText('›').setColor('#00ff88').setAlpha(0.35);
      this.tweens.add({ targets: this._playBtn, alpha: 1, duration: 300, delay: 200 });
    } else {
      this._nextBtn.setText('›').setColor('#00ff88').setAlpha(1);
      this._playBtn.setAlpha(0);
    }

    this._updateDots(idx);
  }

  _updateDots(active) {
    const { width, height } = this.scale;
    const g = this._dotsGfx;
    g.clear();
    const dotY = height - 16;
    const spacing = 22;
    const startX = width / 2 - spacing * (SLIDES.length - 1) / 2;
    for (let i = 0; i < SLIDES.length; i++) {
      const dx = startX + i * spacing;
      if (i === active) {
        g.fillStyle(0x00ff88, 1);
        g.fillCircle(dx, dotY, 5);
      } else {
        g.fillStyle(0x333344, 1);
        g.fillCircle(dx, dotY, 4);
      }
    }
  }

  _advance() {
    if (this._slideIndex < SLIDES.length - 1) {
      this._slideIndex++;
      this._showSlide(this._slideIndex);
    } else {
      this._launchGame();
    }
  }

  _launchGame() {
    this.cameras.main.fade(350, 0, 0, 0);
    this.time.delayedCall(350, () => {
      this.scene.start('GameScene');
      this.scene.launch('UIScene');
    });
  }

  // ── SLIDE 0: Controls ──────────────────────────────────────────────────────

  _drawControlsSlide(g) {
    const { x, y, w, h } = this._ILL;
    const cx = x + w / 2;

    // Pipe background
    g.fillStyle(0x0a0a18, 1);
    g.fillRect(x, y, w, h);
    g.fillStyle(0x787878, 1);
    g.fillRect(x, y, 18, h);
    g.fillRect(x + w - 18, y, 18, h);
    g.fillStyle(0xaaaaaa, 0.2);
    g.fillRect(x + 18, y, 3, h);
    g.fillRect(x + w - 21, y, 3, h);

    // ── Touch zone labels (mobile) ──────────────────────────────────────────
    const zoneY = y + h * 0.18;
    const zoneH = h * 0.44;

    // Left zone
    g.fillStyle(0xff2200, 0.10);
    g.fillRect(x + 18, zoneY, w * 0.38 - 18, zoneH);
    g.lineStyle(1.5, 0xff2200, 0.35);
    g.strokeRect(x + 18, zoneY, w * 0.38 - 18, zoneH);

    // Center zone
    g.fillStyle(0xffaa00, 0.10);
    g.fillRect(x + w * 0.38, zoneY, w * 0.24, zoneH);
    g.lineStyle(1.5, 0xffaa00, 0.35);
    g.strokeRect(x + w * 0.38, zoneY, w * 0.24, zoneH);

    // Right zone
    g.fillStyle(0xff2200, 0.10);
    g.fillRect(x + w * 0.62, zoneY, w * 0.38 - 18, zoneH);
    g.lineStyle(1.5, 0xff2200, 0.35);
    g.strokeRect(x + w * 0.62, zoneY, w * 0.38 - 18, zoneH);

    // Zone icons
    const leftZoneLabel = this.add.text(x + w * 0.19, zoneY + zoneH / 2 - 14, '👈', { fontSize: '26px' }).setOrigin(0.5);
    const leftArrow     = this.add.text(x + w * 0.19, zoneY + zoneH / 2 + 16, '←', { fontSize: '22px', color: '#ff4444', fontFamily: 'Arial Black, sans-serif' }).setOrigin(0.5);
    const jumpLabel     = this.add.text(cx,            zoneY + zoneH / 2 - 14, '👆', { fontSize: '26px' }).setOrigin(0.5);
    const jumpText      = this.add.text(cx,            zoneY + zoneH / 2 + 16, 'JUMP', { fontSize: '13px', color: '#ffaa00', fontFamily: 'Arial Black, sans-serif' }).setOrigin(0.5);
    const rightZoneLabel= this.add.text(x + w * 0.81, zoneY + zoneH / 2 - 14, '👉', { fontSize: '26px' }).setOrigin(0.5);
    const rightArrow    = this.add.text(x + w * 0.81, zoneY + zoneH / 2 + 16, '→', { fontSize: '22px', color: '#ff4444', fontFamily: 'Arial Black, sans-serif' }).setOrigin(0.5);
    this._slideObjects.push(leftZoneLabel, leftArrow, jumpLabel, jumpText, rightZoneLabel, rightArrow);

    // Mobile label
    const mobileLabel = this.add.text(cx, zoneY - 14, '📱  MOBILE — TAP ZONES', {
      fontSize: '10px', color: '#888888', fontFamily: 'Arial Black, sans-serif',
    }).setOrigin(0.5);
    this._slideObjects.push(mobileLabel);

    // Spider silhouette in centre
    const sy = zoneY + zoneH + 30;
    g.fillStyle(0x1a0a2e, 0.7);
    g.fillEllipse(cx, sy, 34, 26);
    g.fillEllipse(cx, sy - 18, 22, 18);
    g.fillStyle(0xff2200, 0.9);
    g.fillCircle(cx - 4, sy - 19, 3);
    g.fillCircle(cx + 4, sy - 19, 3);
    g.lineStyle(1.5, 0x8800aa, 0.8);
    [[-14, -5, -32, -18], [-14, 2, -34, 2], [14, -5, 32, -18], [14, 2, 34, 2]].forEach(([ax, ay, bx, by]) => {
      g.beginPath(); g.moveTo(cx + ax, sy + ay); g.lineTo(cx + bx, sy + by); g.strokePath();
    });

    // ── Keyboard layout (desktop) ───────────────────────────────────────────
    const kbY = sy + 28;
    const desktopLabel = this.add.text(cx, kbY, '🖥  DESKTOP — KEYBOARD', {
      fontSize: '10px', color: '#888888', fontFamily: 'Arial Black, sans-serif',
    }).setOrigin(0.5);
    this._slideObjects.push(desktopLabel);

    // Draw 4 keys: ← ↑ → and W A D
    const keySize = 32;
    const keyGap  = 5;
    const kRow1Y  = kbY + 18;
    const kRow2Y  = kRow1Y + keySize + keyGap;
    const keyCX   = cx - 2;

    const drawKey = (kx, ky, label, color = '#cccccc') => {
      g.fillStyle(0x1a1a2e, 1);
      g.fillRoundedRect(kx - keySize / 2, ky, keySize, keySize, 5);
      g.lineStyle(1.5, 0x444466, 1);
      g.strokeRoundedRect(kx - keySize / 2, ky, keySize, keySize, 5);
      const kt = this.add.text(kx, ky + keySize / 2, label, {
        fontSize: label.length > 1 ? '10px' : '14px',
        fontFamily: 'Arial Black, sans-serif',
        color,
      }).setOrigin(0.5);
      this._slideObjects.push(kt);
    };

    // Arrow keys row 1: ↑ centred above ← ↓ →
    drawKey(keyCX, kRow1Y, '↑', '#00ff88');
    // Arrow keys row 2
    drawKey(keyCX - keySize - keyGap, kRow2Y, '←', '#ff4444');
    drawKey(keyCX,                    kRow2Y, '↓', '#555555');
    drawKey(keyCX + keySize + keyGap, kRow2Y, '→', '#ff4444');

    // WASD block to the left
    const wasdCX = keyCX - (keySize + keyGap) * 3.2;
    drawKey(wasdCX, kRow1Y, 'W', '#00ff88');
    drawKey(wasdCX - keySize - keyGap, kRow2Y, 'A', '#ff4444');
    drawKey(wasdCX,                    kRow2Y, 'S', '#555555');
    drawKey(wasdCX + keySize + keyGap, kRow2Y, 'D', '#ff4444');

    // "or" between WASD and arrows
    const orT = this.add.text(keyCX - (keySize + keyGap) * 1.5, kRow2Y + keySize / 2, 'or', {
      fontSize: '11px', color: '#444455',
    }).setOrigin(0.5);
    this._slideObjects.push(orT);
  }

  // ── SLIDE 1: Betting ────────────────────────────────────────────────────────

  _drawBetSlide(g) {
    const { x, y, w, h } = this._ILL;
    const cx = x + w / 2;

    // Pipe interior background
    g.fillStyle(0x0a0a18, 1);
    g.fillRect(x, y, w, h);

    // Pipe walls
    g.fillStyle(0x787878, 1);
    g.fillRect(x, y, 18, h);
    g.fillRect(x + w - 18, y, 18, h);
    g.fillStyle(0xaaaaaa, 0.25);
    g.fillRect(x + 18, y, 3, h);
    g.fillRect(x + w - 21, y, 3, h);

    // Countdown timer bar at top
    const barX = x + 24;
    const barY = y + 14;
    const barW = w - 48;
    g.fillStyle(0x0d1a0d, 1);
    g.fillRect(barX, barY, barW, 11);
    g.fillStyle(0x00bb55, 1);
    g.fillRect(barX, barY, barW * 0.55, 11);
    g.lineStyle(1, 0x00ff88, 0.5);
    g.strokeRect(barX, barY, barW, 11);

    const timerT = this.add.text(cx, barY + 5, '⏱  5 seconds to bet', {
      fontSize: '9px', color: '#00ff88',
    }).setOrigin(0.5);
    this._slideObjects.push(timerT);

    // Coin stack (3 coins)
    [-48, 0, 48].forEach((off) => {
      g.fillStyle(0xffd700, 1);
      g.fillCircle(cx + off, y + h * 0.27, 20);
      g.fillStyle(0xaa8800, 1);
      g.fillCircle(cx + off, y + h * 0.27, 15);
      const ct = this.add.text(cx + off, y + h * 0.27, '$', {
        fontSize: '13px', fontFamily: 'Arial Black, sans-serif', color: '#ffd700',
      }).setOrigin(0.5);
      this._slideObjects.push(ct);
    });

    // Bet amount field
    const fieldY = y + h * 0.49;
    g.fillStyle(0x091509, 1);
    g.fillRoundedRect(x + 30, fieldY, w - 60, 32, 8);
    g.lineStyle(2, 0x00ff88, 0.8);
    g.strokeRoundedRect(x + 30, fieldY, w - 60, 32, 8);
    const betT = this.add.text(cx, fieldY + 16, '💰  0.50 USDT', {
      fontSize: '15px', fontFamily: 'Arial Black, sans-serif', color: '#00ff88',
    }).setOrigin(0.5);
    this._slideObjects.push(betT);

    // BET button
    const btnY = y + h * 0.68;
    g.fillStyle(0x00ff88, 1);
    g.fillRoundedRect(x + 30, btnY, w - 60, 46, 12);

    const betBtn = this.add.text(cx, btnY + 23, 'BET', {
      fontSize: '26px', fontFamily: 'Arial Black, sans-serif', color: '#000000',
    }).setOrigin(0.5);
    this._slideObjects.push(betBtn);

    // Animated arrow pointing at BET button
    const tapArrow = this.add.text(x + 26, btnY + 23, '→', {
      fontSize: '22px', color: '#ffff00',
    }).setOrigin(1, 0.5);
    this._slideObjects.push(tapArrow);
    this.tweens.add({
      targets: tapArrow,
      x: '-=7',
      duration: 450,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  // ── SLIDE 2: Climbing + cash out ────────────────────────────────────────────

  _drawClimbSlide(g) {
    const { x, y, w, h } = this._ILL;
    const cx = x + w / 2;

    // Pipe interior
    g.fillStyle(0x0a0a18, 1);
    g.fillRect(x, y, w, h);

    // Pipe walls
    g.fillStyle(0x787878, 1);
    g.fillRect(x, y, 18, h);
    g.fillRect(x + w - 18, y, 18, h);
    g.fillStyle(0xaaaaaa, 0.2);
    g.fillRect(x + 18, y, 3, h);
    g.fillRect(x + w - 21, y, 3, h);

    // Rising water at bottom
    const waterH = h * 0.28;
    g.fillStyle(0x0d3a8a, 0.85);
    g.fillRect(x + 18, y + h - waterH, w - 36, waterH);
    g.fillStyle(0x1a55bb, 0.5);
    g.fillRect(x + 18, y + h - waterH - 4, w - 36, 7);
    g.fillStyle(0x3377cc, 0.25);
    g.fillRect(x + 18, y + h - waterH - 2, (w - 36) * 0.65, 4);

    // Spider — upper portion of pipe
    const sy = y + h * 0.28;

    // Silk thread
    g.lineStyle(1.5, 0xaaaaaa, 0.65);
    g.beginPath();
    g.moveTo(cx, y + 2);
    g.lineTo(cx, sy - 20);
    g.strokePath();

    // Body
    g.fillStyle(0x1a0a2e, 1);
    g.fillEllipse(cx, sy, 36, 28);
    g.lineStyle(2, 0x880088, 1);
    g.strokeEllipse(cx, sy, 36, 28);

    // Head
    g.fillStyle(0x1a0a2e, 1);
    g.fillCircle(cx, sy - 19, 11);
    g.lineStyle(1.5, 0x880088, 1);
    g.strokeCircle(cx, sy - 19, 11);

    // Eyes
    g.fillStyle(0xff0000, 1);
    g.fillCircle(cx - 4, sy - 20, 3);
    g.fillCircle(cx + 4, sy - 20, 3);

    // Legs
    g.lineStyle(2, 0x550055, 1);
    [
      [-18, -6, -38, -20], [-18, 0, -40, 2], [-18, 7, -37, 18],
      [18, -6, 38, -20], [18, 0, 40, 2], [18, 7, 37, 18],
    ].forEach(([x1, y1, x2, y2]) => {
      g.beginPath();
      g.moveTo(cx + x1, sy + y1);
      g.lineTo(cx + x2, sy + y2);
      g.strokePath();
    });

    // Multiplier display
    const multT = this.add.text(cx, y + h * 0.54, '5.24×', {
      fontSize: '44px',
      fontFamily: 'Arial Black, sans-serif',
      color: '#ff9900',
      stroke: '#000000',
      strokeThickness: 6,
    }).setOrigin(0.5);
    this._slideObjects.push(multT);

    // Rising arrow next to multiplier
    const upArr = this.add.text(cx + 74, y + h * 0.54, '▲', {
      fontSize: '22px', color: '#00ff88',
    }).setOrigin(0.5);
    this._slideObjects.push(upArr);
    this.tweens.add({
      targets: upArr,
      y: '-=10',
      alpha: { from: 1, to: 0.15 },
      duration: 650,
      yoyo: true,
      repeat: -1,
    });

    // CASH OUT button
    const coY = y + h - 54;
    g.fillStyle(0xcc1f00, 1);
    g.fillRoundedRect(x + 30, coY, w - 60, 42, 11);
    g.lineStyle(3, 0xff6600, 0.65);
    g.strokeRoundedRect(x + 26, coY - 4, w - 52, 50, 14);

    const coT = this.add.text(cx - 14, coY + 21, '💸  CASH OUT', {
      fontSize: '19px', fontFamily: 'Arial Black, sans-serif', color: '#ffffff',
    }).setOrigin(0.5);
    this._slideObjects.push(coT);

    // Tap indicator
    const tapT = this.add.text(x + w - 38, coY + 21, '👆', {
      fontSize: '18px',
    }).setOrigin(0.5);
    this._slideObjects.push(tapT);
    this.tweens.add({
      targets: tapT,
      y: '-=5',
      duration: 380,
      yoyo: true,
      repeat: -1,
    });
  }

  // ── SLIDE 3: Crash / flood ──────────────────────────────────────────────────

  _drawCrashSlide(g) {
    const { x, y, w, h } = this._ILL;
    const cx = x + w / 2;

    // Dark reddish background
    g.fillStyle(0x110308, 1);
    g.fillRect(x, y, w, h);

    // Flood water — fills pipe interior
    g.fillStyle(0x0b2f88, 0.9);
    g.fillRect(x + 18, y, w - 36, h);

    // Water shimmer top
    g.fillStyle(0x1a55cc, 0.35);
    g.fillRect(x + 18, y, w - 36, h * 0.09);

    // Bubbles
    g.fillStyle(0x3388ee, 0.2);
    [[52, 0.22], [130, 0.48], [250, 0.31], [360, 0.62], [420, 0.17], [88, 0.72]].forEach(([bx, by]) => {
      const bxOffset = bx % (w - 36);
      g.fillCircle(x + 18 + bxOffset, y + h * by, 5 + (bx % 5));
    });

    // Cracked pipe walls
    g.fillStyle(0x888888, 1);
    g.fillRect(x, y, 18, h);
    g.fillRect(x + w - 18, y, 18, h);

    // Crack lines
    g.lineStyle(2, 0x444444, 1);
    [
      [x + 9, y + h * 0.24, x + 3, y + h * 0.38],
      [x + 12, y + h * 0.58, x + 4, y + h * 0.71],
      [x + w - 8, y + h * 0.31, x + w - 2, y + h * 0.45],
    ].forEach(([ax, ay, bx, by]) => {
      g.beginPath();
      g.moveTo(ax, ay);
      g.lineTo(bx, by);
      g.strokePath();
    });

    // Spider — submerged, ghosted
    const sy = y + h * 0.35;
    g.fillStyle(0x200830, 0.5);
    g.fillEllipse(cx, sy, 36, 28);
    g.fillCircle(cx, sy - 19, 11);

    // X over spider
    g.lineStyle(3.5, 0xff1100, 0.85);
    g.beginPath();
    g.moveTo(cx - 28, sy - 34);
    g.lineTo(cx + 28, sy + 14);
    g.strokePath();
    g.beginPath();
    g.moveTo(cx + 28, sy - 34);
    g.lineTo(cx - 28, sy + 14);
    g.strokePath();

    // Burst rays from top center
    g.lineStyle(2, 0xff5500, 0.45);
    for (let i = 0; i < 7; i++) {
      const angle = (i / 7) * Math.PI + Math.PI * 0.08;
      g.beginPath();
      g.moveTo(cx, y + h * 0.06);
      g.lineTo(
        cx + Math.cos(angle) * 70,
        y + h * 0.06 + Math.sin(angle) * 70
      );
      g.strokePath();
    }

    // PIPE BURST text
    const burstT = this.add.text(cx, y + h * 0.65, '⚠  PIPE BURST!  ⚠', {
      fontSize: '21px',
      fontFamily: 'Arial Black, sans-serif',
      color: '#ff2200',
      stroke: '#000000',
      strokeThickness: 5,
    }).setOrigin(0.5);
    this._slideObjects.push(burstT);
    this.tweens.add({
      targets: burstT,
      alpha: { from: 1, to: 0.4 },
      duration: 550,
      yoyo: true,
      repeat: -1,
    });

    const lostT = this.add.text(cx, y + h * 0.79, 'BET LOST — cash out earlier next time', {
      fontSize: '12px', color: '#ff8800',
    }).setOrigin(0.5);
    this._slideObjects.push(lostT);
  }

  // ────────────────────────────────────────────────────────────────────────────

  shutdown() {
    this._slideObjects.forEach(o => { try { o.destroy(); } catch (_) {} });
    this._slideObjects = [];
  }
}
