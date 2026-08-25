import Spider from '../systems/Spider';
import PlatformManager, { PLATFORM_TYPES } from '../systems/Platform';
import GlowWormManager from '../systems/GlowWorm';
import HazardManager from '../systems/Hazards';
import FloodScheduler from '../systems/FloodScheduler';
import { tileToMultiplier, MAX_TILES } from '../systems/Multiplier';
import socket from '../systems/SocketManager';
import { sound } from '../systems/SoundManager';

const PIPE_WALL = 68;

export default class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
  }

  create() {
    const { width, height } = this.scale;

    this.gameOver    = false;
    this.glowWorms   = 0;
    this.serverMode  = socket.connected;
    this.serverTiles = 0;
    this.groundY     = height - 100;
    this._animTimer  = 0;
    this._bathroomTimer  = Phaser.Math.Between(15000, 30000); // bathroom openings
    this._floodWarnTimer = Phaser.Math.Between(12000, 22000); // fake flood warnings
    this._floodWarnActive = false;
    this._floodGen       = 0;         // generation counter — invalidates stale callbacks
    this._slipTimer      = Phaser.Math.Between(6000, 14000);
    this._slipping       = false;
    this._slipTween      = null;
    this._magicWormTimer = Phaser.Math.Between(120000, 360000);
    this._magicWormActive = false;
    this._magicTileBonus  = 0;
    this._pipeFlashPending     = false;
    this._serverMultiplier     = 1;
    this._spiderMilestoneLevel = 0;
    this._waterSurfaceY        = null;  // screen-Y of water surface; null = off
    this._waterSurging         = false; // true only during post-crash drain animation
    this._crashSurge           = false; // true while water is rushing up after a crash

    // ── Pipe geometry ─────────────────────────────────────────────────────
    this.drawWorldBackground();
    this.drawPipeSeams();        // world space — scroll past spider
    this.drawPipeWalls();        // screen space — always visible

    // ── Persistent rising water graphics (depth 6-7, behind spider at 10) ─
    this._waterBg = this.add.graphics().setScrollFactor(0).setDepth(6);
    this._waterFg = this.add.graphics().setScrollFactor(0).setDepth(7);

    // ── Persistent wall crawlers (always visible) ─────────────────────────
    this._spawnPersistentCrawlers();

    // ── Platforms ─────────────────────────────────────────────────────────
    this.platformManager = new PlatformManager(this);
    this.platformManager.spawnInitialPlatforms();

    // ── Glow worms ────────────────────────────────────────────────────────
    this.glowWormManager = new GlowWormManager(this);

    // ── Spider ────────────────────────────────────────────────────────────
    this.spider = new Spider(this, width / 2, this.groundY);
    this.spider.getBody().body.setAllowGravity(false);

    // ── Hazards ───────────────────────────────────────────────────────────
    this.hazardManager = new HazardManager(this, this.spider);

    // ── Offline flood scheduler ────────────────────────────────────────────
    if (!this.serverMode) {
      this.floodScheduler = new FloodScheduler(this, this.spider);
    }

    // ── Camera — directly controlled each frame ────────────────────────────
    this.cameras.main.scrollY = this.groundY - height / 2;

    // ── Colliders ─────────────────────────────────────────────────────────
    this.physics.add.collider(
      this.spider.getBody(), this.platformManager.getGroup(),
      this.handlePlatformLand.bind(this)
    );
    this.physics.add.overlap(
      this.spider.getBody(), this.glowWormManager.getGroup(),
      this.handleWormCollect.bind(this)
    );

    // ── Events ────────────────────────────────────────────────────────────
    this.events.on('spider:died',         this.handleDeath,       this);
    this.events.on('glowworm:collected',  (n) => { this.glowWorms = n; });
    this.events.on('server:tick', ({ multiplier, tiles }) => {
      this.serverTiles = tiles;
      this._serverMultiplier = multiplier;
      this.serverMode  = true;
    });
    this.events.on('server:betting', () => this.resetSpiderToGround());
    this.events.on('server:playing',  () => { this.gameOver = false; this.serverMode = true; });
    this.events.on('server:crashed',  () => { if (this.spider.isAlive) this.triggerServerFlood(); });

    // Connect socket — no-op if already connected; passes JWT for server auth
    const savedToken = localStorage.getItem('wsm_token') || null;
    const savedName  = localStorage.getItem('wsm_username') || 'Player';
    socket.connect(savedName, null, savedToken);
  }

  // ── World background — GREY pipe interior ──────────────────────────────

  drawWorldBackground() {
    const { width } = this.scale;
    const bg = this.add.graphics().setDepth(0);
    // Outer wall backing — dark so pipe walls stand out
    bg.fillStyle(0x3a3a3a, 1);
    bg.fillRect(0, -60000, width, 70000);
    // Inner pipe channel — bright concrete grey
    bg.fillStyle(0x888888, 1);
    bg.fillRect(PIPE_WALL, -60000, width - PIPE_WALL * 2, 70000);
    // Subtle centre-line shadow for depth
    bg.fillStyle(0x606060, 0.25);
    bg.fillRect(width / 2 - 18, -60000, 36, 70000);
  }

  // ── Pipe seams — WORLD SPACE ────────────────────────────────────────────

  drawPipeSeams() {
    const { width } = this.scale;
    const innerL = PIPE_WALL;
    const innerR = width - PIPE_WALL;
    const g = this.add.graphics().setDepth(3);

    // Water-stain / rust streaks on inner walls
    for (let i = 0; i < 130; i++) {
      const left = i % 2 === 0;
      const sx = left
        ? Phaser.Math.Between(innerL, innerL + 24)
        : Phaser.Math.Between(innerR - 24, innerR);
      const sy  = Phaser.Math.Between(-60000, this.groundY);
      const len = Phaser.Math.Between(8, 55);
      const col = Phaser.Utils.Array.GetRandom([0x666666, 0x5a5a5a, 0x7a5030, 0x505050]);
      g.lineStyle(Phaser.Math.Between(1, 2), col, 0.20 + Math.random() * 0.30);
      g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + Phaser.Math.Between(-3, 3), sy + len); g.strokePath();
    }

    // Horizontal seams every 180 px — create sense of climbing
    for (let y = this.groundY; y > -60000; y -= 180) {
      // Dark seam band
      g.fillStyle(0x444444, 1);
      g.fillRect(innerL, y - 3, innerR - innerL, 6);
      // Metal rivets
      [innerL + 6, innerR - 6].forEach(rx => {
        g.fillStyle(0x777777, 1); g.fillCircle(rx, y, 4);
        g.fillStyle(0xbbbbbb, 0.5); g.fillCircle(rx - 1, y - 1, 1.5);
      });
    }

    // Centre groove
    g.lineStyle(1, 0x505050, 0.35);
    g.beginPath(); g.moveTo(width / 2, this.groundY); g.lineTo(width / 2, -60000); g.strokePath();

    // ── Static debris stuck to pipe walls ──────────────────────────────
    // O-rings / rubber seals at seam points
    for (let y = this.groundY - 90; y > -60000; y -= Phaser.Math.Between(360, 900)) {
      const side = Math.random() < 0.5 ? innerL + 12 : innerR - 12;
      g.lineStyle(4, 0x333333, 0.9); g.strokeCircle(side, y, 9);
      g.lineStyle(2, 0x555555, 0.5); g.strokeCircle(side, y, 7);
    }

    // Gum blobs stuck to pipe walls
    for (let i = 0; i < 40; i++) {
      const side = Math.random() < 0.5;
      const gx = side
        ? Phaser.Math.Between(innerL + 4, innerL + 20)
        : Phaser.Math.Between(innerR - 20, innerR - 4);
      const gy = Phaser.Math.Between(-60000, this.groundY);
      const col = Phaser.Utils.Array.GetRandom([0xdd88aa, 0xccaaaa, 0xaa9988, 0xbbbbaa]);
      g.fillStyle(col, 0.8);
      g.fillEllipse(gx, gy, Phaser.Math.Between(8, 18), Phaser.Math.Between(6, 12));
    }

    // Hair strands draped from seams
    for (let i = 0; i < 25; i++) {
      const hx = Phaser.Math.Between(innerL + 2, innerR - 2);
      const hy = Phaser.Math.Between(-60000, this.groundY);
      const len = Phaser.Math.Between(20, 80);
      const sway = Phaser.Math.Between(-15, 15);
      g.lineStyle(1, 0x221a10, 0.55);
      g.beginPath();
      g.moveTo(hx, hy);
      g.lineTo(hx + sway * 0.3, hy + len * 0.4);
      g.lineTo(hx + sway, hy + len);
      g.strokePath();
    }
  }

  // ── Pipe walls — SCREEN SPACE — grey concrete ────────────────────────────

  drawPipeWalls() {
    const { width, height } = this.scale;

    const wL = this.add.graphics().setScrollFactor(0).setDepth(8);
    wL.fillStyle(0x686868, 1); wL.fillRect(0, 0, PIPE_WALL, height);
    // Inner edge — lighter ridge where wall meets pipe interior
    wL.fillStyle(0x909090, 0.9); wL.fillRect(PIPE_WALL - 12, 0, 12, height);
    wL.fillStyle(0xa8a8a8, 0.4); wL.fillRect(PIPE_WALL - 4, 0, 4, height);
    // Subtle rust tint at seam
    wL.fillStyle(0x6a3010, 0.10); wL.fillRect(PIPE_WALL - 8, 0, 8, height);

    const wR = this.add.graphics().setScrollFactor(0).setDepth(8);
    wR.fillStyle(0x686868, 1); wR.fillRect(width - PIPE_WALL, 0, PIPE_WALL, height);
    wR.fillStyle(0x909090, 0.9); wR.fillRect(width - PIPE_WALL, 0, 12, height);
    wR.fillStyle(0xa8a8a8, 0.4); wR.fillRect(width - PIPE_WALL, 0, 4, height);
    wR.fillStyle(0x6a3010, 0.10); wR.fillRect(width - PIPE_WALL, 0, 8, height);

    this.pipeInnerLeft  = PIPE_WALL;
    this.pipeInnerRight = width - PIPE_WALL;
  }

  // ── Persistent wall crawlers — always on screen ──────────────────────────

  _spawnPersistentCrawlers() {
    const { height } = this.scale;
    this._spawnPersistentRoach(true);           // left wall roach
    this._spawnPersistentCentipede(false);      // right wall centipede
    this._spawnPersistentFly(this.scale.width / 2 + Phaser.Math.Between(-40, 40));
  }

  _spawnPersistentRoach(onLeft) {
    const { height } = this.scale;
    const wallX = onLeft ? this.pipeInnerLeft + 9 : this.pipeInnerRight - 9;
    const gfx = this.add.graphics().setScrollFactor(0).setDepth(5);
    gfx.x = wallX;
    gfx.y = Phaser.Math.Between(120, height - 120);
    let rLeg = 0;
    let dir  = 1;

    const draw = () => {
      gfx.clear();
      gfx.fillStyle(0x3a2200, 1); gfx.fillEllipse(0, 0, 14, 8);
      gfx.fillStyle(0x2a1800, 1); gfx.fillCircle(0, -5, 4);
      gfx.fillStyle(0xff4400, 0.8); gfx.fillCircle(-2, -6, 1.2); gfx.fillCircle(2, -6, 1.2);
      gfx.lineStyle(0.8, 0x5a3200, 0.9);
      gfx.beginPath(); gfx.moveTo(-2, -8); gfx.lineTo(-6 + Math.sin(rLeg) * 3, -16); gfx.strokePath();
      gfx.beginPath(); gfx.moveTo(2, -8); gfx.lineTo(8 + Math.sin(rLeg + 1) * 3, -16); gfx.strokePath();
      gfx.lineStyle(1, 0x4a2800, 0.85);
      [-3, 0, 3].forEach((ly, ri) => {
        gfx.beginPath(); gfx.moveTo(-6, ly); gfx.lineTo(-6 - (Math.sin(rLeg + ri) > 0 ? 8 : 6), ly + 3); gfx.strokePath();
        gfx.beginPath(); gfx.moveTo(6, ly);  gfx.lineTo(6 + (Math.sin(rLeg + ri) > 0 ? 8 : 6), ly + 3);  gfx.strokePath();
      });
    };

    const step = () => {
      if (!gfx.active) return;
      if ((gfx.y < 30 && dir < 0) || (gfx.y > height - 30 && dir > 0)) dir *= -1;
      const dist = Phaser.Math.Between(20, 55) * dir;
      this.tweens.add({
        targets: gfx, y: gfx.y + dist,
        duration: Phaser.Math.Between(180, 360), ease: 'Linear',
        onUpdate: () => { rLeg += 0.25; draw(); },
        onComplete: () => {
          this.time.delayedCall(Phaser.Math.Between(80, 400), () => { draw(); if (gfx.active) step(); });
        },
      });
    };
    draw(); step();
  }

  _spawnPersistentCentipede(onLeft) {
    const { height } = this.scale;
    const wallX = onLeft ? this.pipeInnerLeft + 11 : this.pipeInnerRight - 11;
    const gfx = this.add.graphics().setScrollFactor(0).setDepth(5);
    gfx.x = wallX;
    gfx.y = Phaser.Math.Between(120, height - 120);
    const segs = Phaser.Math.Between(9, 13);
    let tick = 0;
    let dir  = 1;

    const draw = () => {
      gfx.clear();
      for (let ci = 0; ci < segs; ci++) {
        const sy   = ci * 5;
        const wave = Math.sin(tick + ci * 0.5) * 3;
        gfx.fillStyle(ci === 0 ? 0x442200 : 0x663300, 1); gfx.fillCircle(wave, sy, 4);
        gfx.lineStyle(0.5, 0x885522, 0.5); gfx.strokeCircle(wave, sy, 4);
        gfx.lineStyle(0.8, 0x885522, 0.75);
        gfx.beginPath(); gfx.moveTo(wave - 4, sy); gfx.lineTo(wave - 9, sy + Math.sin(tick + ci * 0.7) * 3); gfx.strokePath();
        gfx.beginPath(); gfx.moveTo(wave + 4, sy); gfx.lineTo(wave + 9, sy + Math.sin(tick + ci * 0.7 + Math.PI) * 3); gfx.strokePath();
      }
      gfx.fillStyle(0xff3300, 0.8);
      gfx.fillCircle(Math.sin(tick) * 3, 0, 1.5); gfx.fillCircle(-Math.sin(tick) * 3, -1, 1.5);
      gfx.lineStyle(0.8, 0x884411, 0.8);
      gfx.beginPath(); gfx.moveTo(0, -4); gfx.lineTo(-5 + Math.sin(tick) * 3, -12); gfx.strokePath();
      gfx.beginPath(); gfx.moveTo(0, -4); gfx.lineTo(5 + Math.sin(tick + 1) * 3, -12); gfx.strokePath();
    };

    const step = () => {
      if (!gfx.active) return;
      if ((gfx.y < 40 && dir < 0) || (gfx.y > height - 40 && dir > 0)) dir *= -1;
      const dist = Phaser.Math.Between(30, 70) * dir;
      this.tweens.add({
        targets: gfx, y: gfx.y + dist,
        duration: Phaser.Math.Between(250, 500), ease: 'Linear',
        onUpdate: () => { tick += 0.2; draw(); },
        onComplete: () => {
          this.time.delayedCall(Phaser.Math.Between(80, 320), () => { draw(); if (gfx.active) step(); });
        },
      });
    };
    draw(); step();
  }

  _spawnPersistentFly(startX) {
    const { width, height } = this.scale;
    const innerL = this.pipeInnerLeft + 12;
    const innerR = this.pipeInnerRight - 12;
    const gfx = this.add.graphics().setScrollFactor(0).setDepth(5);
    gfx.x = Phaser.Math.Clamp(startX, innerL, innerR);
    gfx.y = Phaser.Math.Between(80, height - 80);
    let fTick = 0;
    const flapRate = Phaser.Math.FloatBetween(0.35, 0.55);

    const draw = () => {
      gfx.clear();
      gfx.fillStyle(0x111111, 1); gfx.fillEllipse(0, 0, 10, 6);
      gfx.fillStyle(0x222222, 1); gfx.fillCircle(0, -4, 3);
      gfx.fillStyle(0xcc1100, 0.9); gfx.fillCircle(-2, -4, 1.5); gfx.fillCircle(2, -4, 1.5);
      const flapY = Math.abs(Math.sin(fTick * flapRate * Math.PI * 2));
      gfx.fillStyle(0xaaddee, 0.3 + flapY * 0.15);
      gfx.fillEllipse(-7, -2 - flapY * 3, 12, 5 + flapY * 4);
      gfx.fillEllipse(7, -2 - flapY * 3, 12, 5 + flapY * 4);
      gfx.lineStyle(0.8, 0x333333, 0.6);
      for (let li = -1; li <= 1; li++) {
        gfx.beginPath(); gfx.moveTo(li * 3, 2); gfx.lineTo(li * 3 - 5, 6 + Math.sin(fTick + li) * 2); gfx.strokePath();
        gfx.beginPath(); gfx.moveTo(li * 3, 2); gfx.lineTo(li * 3 + 5, 6 + Math.sin(fTick + li + 1) * 2); gfx.strokePath();
      }
    };

    const step = () => {
      if (!gfx.active) return;
      // Flies buzz around in a random direction, bounce off pipe walls and edges
      const dx = Phaser.Math.Between(-60, 60);
      const dy = Phaser.Math.Between(-80, 80);
      const nx = Phaser.Math.Clamp(gfx.x + dx, innerL, innerR);
      const ny = Phaser.Math.Clamp(gfx.y + dy, 40, height - 40);
      const dur = Phaser.Math.Between(400, 900);
      this.tweens.add({
        targets: gfx, x: nx, y: ny, duration: dur, ease: 'Sine.easeInOut',
        onUpdate: () => { fTick += 0.18; draw(); },
        onComplete: () => {
          this.time.delayedCall(Phaser.Math.Between(100, 500), () => { draw(); if (gfx.active) step(); });
        },
      });
    };
    draw(); step();
  }

  // ── Magic glow worm — boosts climb speed visually ─────────────────────────

  _spawnMagicGlowWorm() {
    if (!this.serverMode || !this.spider?.isAlive || this.gameOver) return;
    const { width, height } = this.scale;
    const innerL = this.pipeInnerLeft + 14;
    const innerR = this.pipeInnerRight - 14;
    const fromLeft = Math.random() < 0.5;
    const startX = fromLeft ? innerL : innerR;
    const endX   = fromLeft ? innerR : innerL;
    const wormY  = Phaser.Math.Between(height * 0.3, height * 0.65);
    const duration = Phaser.Math.Between(14000, 20000);

    sound.playMagicWorm();
    this._magicWormActive = true;

    // Glow worm graphic
    const worm = this.add.graphics().setScrollFactor(0).setDepth(12);
    worm.x = startX; worm.y = wormY;
    const bodyLen = 6;
    let mTick = 0;
    const rainbowColors = [0xffdd00, 0x00ffcc, 0xff44cc, 0x44ddff, 0xaaffaa, 0xff8844];

    const drawMagicWorm = () => {
      worm.clear();
      // Glow aura
      const glowCol = rainbowColors[Math.floor(mTick * 0.8) % rainbowColors.length];
      worm.fillStyle(glowCol, 0.08 + Math.sin(mTick) * 0.04);
      worm.fillCircle(0, 0, 28);
      worm.fillStyle(glowCol, 0.18 + Math.sin(mTick * 1.3) * 0.08);
      worm.fillCircle(0, 0, 18);
      // Body segments
      for (let si = 0; si < bodyLen; si++) {
        const ox = (si - bodyLen / 2) * 9 * (fromLeft ? -1 : 1);
        const oy = Math.sin(mTick + si * 0.5) * 5;
        const segCol = rainbowColors[(Math.floor(mTick * 0.5) + si) % rainbowColors.length];
        worm.fillStyle(segCol, 0.9); worm.fillCircle(ox, oy, 7);
        worm.fillStyle(0xffffff, 0.35); worm.fillCircle(ox - 2, oy - 2, 2.5);
      }
      // Eyes (leading segment)
      const headOX = (bodyLen / 2) * 9 * (fromLeft ? 1 : -1);
      worm.fillStyle(0xffffff, 1); worm.fillCircle(headOX - 3, -3, 3); worm.fillCircle(headOX + 3, -3, 3);
      worm.fillStyle(0x111111, 1); worm.fillCircle(headOX - 2, -3, 1.5); worm.fillCircle(headOX + 2, -3, 1.5);
      // Sparkle trail
      for (let sp = 0; sp < 5; sp++) {
        const spCol = rainbowColors[(sp + Math.floor(mTick)) % rainbowColors.length];
        const spX = (fromLeft ? 1 : -1) * (sp * 12 + Math.sin(mTick + sp) * 6);
        worm.fillStyle(spCol, 0.6 - sp * 0.1);
        worm.fillCircle(spX, Math.sin(mTick * 2 + sp) * 4, 3 - sp * 0.4);
      }
    };

    // Animate worm crawling across pipe
    this.tweens.add({
      targets: worm, x: endX, duration, ease: 'Sine.easeInOut',
      onUpdate: () => { mTick += 0.08; drawMagicWorm(); },
      onComplete: () => {
        this._magicWormActive = false;
        this.tweens.add({
          targets: worm, alpha: 0, duration: 500,
          onComplete: () => worm.destroy(),
        });
      },
    });

    // Screen golden tint while worm is present
    const tint = this.add.graphics().setScrollFactor(0).setDepth(11);
    tint.fillStyle(0xffdd44, 0.06); tint.fillRect(PIPE_WALL, 0, width - PIPE_WALL * 2, height);
    this.tweens.add({ targets: tint, alpha: 0, duration: 500, delay: duration - 500,
      onComplete: () => tint.destroy() });

    // "✨ MAGIC BOOST" banner
    const banner = this.add.text(width / 2, height * 0.18,
      '✨  MAGIC WORM  ✨', {
        fontSize: '19px', fontFamily: 'Arial Black, sans-serif',
        color: '#ffee22', stroke: '#000000', strokeThickness: 5,
        backgroundColor: '#00000088', padding: { x: 12, y: 5 },
      }).setOrigin(0.5).setScrollFactor(0).setDepth(13).setAlpha(0);
    this.tweens.add({ targets: banner, alpha: 1, duration: 400,
      onComplete: () => {
        this.time.delayedCall(duration - 900, () => {
          this.tweens.add({ targets: banner, alpha: 0, duration: 400,
            onComplete: () => banner.destroy() });
        });
      },
    });
  }

  // ── Ambient debris — drain pipe objects ────────────────────────────────

  spawnAmbientAnim() {
    const { width, height } = this.scale;
    const camera = this.cameras.main;
    const innerL = this.pipeInnerLeft  + 6;
    const innerR = this.pipeInnerRight - 6;

    // Weighted type selection (roll 0-119)
    const roll = Phaser.Math.Between(0, 129);
    const type = roll < 16  ? 0   // water drop
               : roll < 28  ? 1   // bubble
               : roll < 38  ? 2   // web thread
               : roll < 48  ? 3   // rust flake
               : roll < 55  ? 4   // coin (3D flip)
               : roll < 62  ? 5   // chewing gum
               : roll < 70  ? 6   // fly
               : roll < 76  ? 7   // toilet paper wad
               : roll < 82  ? 8   // toothbrush tip (ricochet)
               : roll < 87  ? 9   // hair strand (wriggles)
               : roll < 92  ? 10  // tooth (bounces)
               : roll < 97  ? 11  // cockroach (wall crawler)
               : roll < 101 ? 12  // soap bubble (iridescent)
               : roll < 105 ? 13  // shampoo blob
               : roll < 108 ? 14  // band-aid
               : roll < 111 ? 15  // earring
               : roll < 114 ? 16  // centipede (wall crawler)
               : roll < 116 ? 17  // contact lens
               : roll < 118 ? 18  // cigarette butt
               : roll < 124 ? 19  // matchstick
               : 20;              // mushroom cap (rare)

    const x = Phaser.Math.Between(innerL, innerR);

    if (type === 0) {
      // ── Water drop — wobbles sideways mid-fall, splats on landing ──
      const startY = -Phaser.Math.Between(10, 60);
      const drip = this.add.graphics().setScrollFactor(0).setDepth(4);
      drip.x = x; drip.y = startY;
      const fallDur = Phaser.Math.Between(800, 2000);
      const targetY = height +20;
      const baseX = x;
      this.tweens.add({
        targets: drip,
        y: targetY,
        duration: fallDur,
        ease: 'Power1',
        onUpdate: (tween) => {
          const p = tween.progress;
          const wobble = Math.sin(p * Math.PI * 6) * 4 * (1 - p);
          drip.x = baseX + wobble;
          drip.clear();
          const stretch = 1 + (1 - p) * 0.5;
          drip.fillStyle(0x4499bb, 0.75);
          drip.fillEllipse(0, 0, 5, 11 * stretch);
          drip.fillStyle(0x88ccee, 0.4);
          drip.fillCircle(0, -3, 2);
        },
        onComplete: () => {
          drip.x = baseX; drip.y = targetY;
          drip.clear();
          drip.fillStyle(0x4499bb, 0.3);
          drip.fillEllipse(0, 0, 18, 5);
          this.tweens.add({ targets: drip, scaleX: 2.2, scaleY: 0, alpha: 0, duration: 220,
            onComplete: () => drip.destroy() });
        },
      });

    } else if (type === 1) {
      // ── Bubble — iridescent wobble shape, rises, glint highlight ──
      const startY = height +Phaser.Math.Between(0, 50);
      const r = Phaser.Math.Between(4, 11);
      const bub = this.add.graphics().setScrollFactor(0).setDepth(4);
      bub.x = x; bub.y = startY;
      const iColors = [0x77aacc, 0xaa77cc, 0x77ccaa, 0xccaa77];
      let bTick = 0;
      const baseX = x;
      const driftAmp = Phaser.Math.Between(10, 22);
      this.tweens.add({
        targets: bub,
        y: -60,
        duration: Phaser.Math.Between(2200, 4200),
        ease: 'Sine.easeIn',
        onUpdate: () => {
          bTick += 0.07;
          bub.x = baseX + Math.sin(bTick) * driftAmp;
          const col = iColors[Math.floor(bTick * 0.8) % iColors.length];
          bub.clear();
          const wr = r + Math.sin(bTick * 2.1) * 1.5;
          const hr = r + Math.cos(bTick * 1.7) * 1.5;
          bub.lineStyle(1.5, col, 0.55);
          bub.fillStyle(col, 0.07);
          bub.fillEllipse(0, 0, wr * 2, hr * 2);
          bub.strokeEllipse(0, 0, wr * 2, hr * 2);
          bub.fillStyle(0xffffff, 0.6);
          bub.fillCircle(-r * 0.3, -r * 0.35, r * 0.2);
        },
        onComplete: () => bub.destroy(),
      });

    } else if (type === 2) {
      // ── Web thread — oscillating pendulum sine drift ──
      const startY = -Phaser.Math.Between(10, 80);
      const len = Phaser.Math.Between(20, 55);
      const web = this.add.graphics().setScrollFactor(0).setDepth(4);
      web.x = x; web.y = startY;
      const baseX = x;
      let wTick = 0;
      const amp = Phaser.Math.FloatBetween(8, 20);
      this.tweens.add({
        targets: web,
        y: height +70,
        duration: Phaser.Math.Between(3000, 5500),
        ease: 'Linear',
        onUpdate: () => {
          wTick += 0.04;
          web.x = baseX + Math.sin(wTick) * amp;
          web.clear();
          web.lineStyle(1, 0x999999, 0.35);
          web.beginPath();
          web.moveTo(0, 0);
          web.lineTo(Math.sin(wTick * 1.3) * 6, len * 0.33);
          web.lineTo(Math.sin(wTick * 0.9 + 1) * 8, len * 0.66);
          web.lineTo(Math.sin(wTick * 1.1 + 2) * 4, len);
          web.strokePath();
          web.fillStyle(0xaaaaaa, 0.4);
          web.fillCircle(0, 0, 1.5);
        },
        onComplete: () => web.destroy(),
      });

    } else if (type === 3) {
      // ── Rust flake — triangle shape, tumbles ──
      const startY = -Phaser.Math.Between(5, 50);
      const sz = Phaser.Math.FloatBetween(2, 6);
      const col = Phaser.Utils.Array.GetRandom([0x996633, 0x774422, 0x886644, 0xaa8855, 0x665533]);
      const flake = this.add.graphics().setScrollFactor(0).setDepth(4);
      flake.x = x; flake.y = startY;
      let fTick = 0;
      const drift = Phaser.Math.Between(-40, 40);
      const baseX = x;
      this.tweens.add({
        targets: flake,
        y: height +60,
        duration: Phaser.Math.Between(1600, 3400),
        ease: 'Power1',
        onUpdate: (tween) => {
          fTick += 0.12;
          flake.x = baseX + drift * tween.progress;
          flake.clear();
          flake.fillStyle(col, 0.7);
          const s = sz * (1 + Math.sin(fTick * 0.5) * 0.1);
          flake.fillTriangle(-s, s, s, s, Math.sin(fTick) * s * 0.3, -s);
          flake.lineStyle(0.5, 0xccaa88, 0.4);
          flake.strokeTriangle(-s, s, s, s, Math.sin(fTick) * s * 0.3, -s);
        },
        onComplete: () => flake.destroy(),
      });

    } else if (type === 4) {
      // ── Coin — realistic 3D flip (scaleX cosine oscillation) ──
      const startY = -Phaser.Math.Between(20, 80);
      const coin = this.add.graphics().setScrollFactor(0).setDepth(4);
      coin.x = x; coin.y = startY;
      let cTick = 0;
      const baseX = x;
      const drift = Phaser.Math.Between(-30, 30);
      const spinRate = Phaser.Math.FloatBetween(0.15, 0.28);
      this.tweens.add({
        targets: coin,
        y: height +70,
        duration: Phaser.Math.Between(1400, 3000),
        ease: 'Power1',
        onUpdate: (tween) => {
          cTick += spinRate;
          coin.x = baseX + drift * tween.progress;
          const flipX = Math.cos(cTick);
          const absFlip = Math.abs(flipX);
          coin.clear();
          if (flipX >= 0) {
            coin.fillStyle(0xc0c0c0, 1);
            coin.fillEllipse(0, 0, 22 * absFlip, 22);
            if (absFlip > 0.3) {
              coin.fillStyle(0xe0e0e0, 1);
              coin.fillEllipse(0, 0, 14 * absFlip, 14);
              coin.lineStyle(1, 0x888888, 0.6);
              coin.strokeEllipse(0, 0, 22 * absFlip, 22);
            }
          } else {
            coin.fillStyle(0xaaaaaa, 1);
            coin.fillEllipse(0, 0, 22 * absFlip, 22);
            if (absFlip > 0.3) {
              coin.lineStyle(1, 0x777777, 0.6);
              coin.strokeEllipse(0, 0, 22 * absFlip, 22);
            }
          }
          if (absFlip > 0.15) {
            coin.fillStyle(0xffffff, 0.35 * absFlip);
            coin.fillEllipse(-3 * flipX, -5, 5 * absFlip, 4);
          }
        },
        onComplete: () => coin.destroy(),
      });

    } else if (type === 5) {
      // ── Chewing gum — stretchy wobble with dangling thread ──
      const startY = -Phaser.Math.Between(10, 60);
      const gum = this.add.graphics().setScrollFactor(0).setDepth(4);
      gum.x = x; gum.y = startY;
      const col = Phaser.Utils.Array.GetRandom([0xdd88aa, 0xcc7799, 0xccaacc, 0xddaa88]);
      let gTick = 0;
      const baseX = x;
      this.tweens.add({
        targets: gum,
        y: height +50,
        duration: Phaser.Math.Between(2800, 5000),
        ease: 'Linear',
        onUpdate: () => {
          gTick += 0.08;
          gum.x = baseX + Math.sin(gTick * 0.7) * 6;
          gum.clear();
          const sqX = 1 + Math.sin(gTick) * 0.15;
          const sqY = 1 - Math.sin(gTick) * 0.08;
          gum.fillStyle(col, 0.88);
          gum.fillEllipse(-3, 0, 16 * sqX, 10 * sqY);
          gum.fillEllipse(4, -4, 12 * sqX, 9 * sqY);
          gum.fillEllipse(-1, 4, 10 * sqX, 8 * sqY);
          const threadLen = 14 + Math.sin(gTick * 1.3) * 4;
          gum.lineStyle(1.5, col, 0.65);
          gum.beginPath();
          gum.moveTo(2, 8);
          gum.lineTo(2 + Math.sin(gTick * 2) * 4, 8 + threadLen);
          gum.strokePath();
        },
        onComplete: () => gum.destroy(),
      });

    } else if (type === 6) {
      // ── Fly — multi-frequency X drift + wing flap animation ──
      const startY = Phaser.Math.Between(50, height - 60);
      const fly = this.add.graphics().setScrollFactor(0).setDepth(5);
      fly.x = x; fly.y = startY;
      const baseX = x;
      let flyTick = 0;
      const flapRate = Phaser.Math.FloatBetween(0.35, 0.55);
      const drift1 = Phaser.Math.FloatBetween(20, 38);
      const drift2 = Phaser.Math.FloatBetween(8, 16);
      const phase2 = Phaser.Math.FloatBetween(0, Math.PI);
      this.tweens.add({
        targets: fly,
        y: -50,
        duration: Phaser.Math.Between(3000, 5500),
        ease: 'Linear',
        onUpdate: () => {
          flyTick += 0.18;
          fly.x = baseX + Math.sin(flyTick) * drift1 + Math.sin(flyTick * 2.3 + phase2) * drift2;
          fly.clear();
          fly.fillStyle(0x111111, 1);
          fly.fillEllipse(0, 0, 10, 6);
          fly.fillStyle(0x222222, 1);
          fly.fillCircle(0, -4, 3);
          fly.fillStyle(0xcc1100, 0.9);
          fly.fillCircle(-2, -4, 1.5);
          fly.fillCircle(2, -4, 1.5);
          const flapY = Math.abs(Math.sin(flyTick * flapRate * Math.PI * 2));
          fly.fillStyle(0xaaddee, 0.3 + flapY * 0.15);
          fly.fillEllipse(-7, -2 - flapY * 3, 12, 5 + flapY * 4);
          fly.fillEllipse(7, -2 - flapY * 3, 12, 5 + flapY * 4);
          fly.lineStyle(0.8, 0x333333, 0.6);
          for (let li = -1; li <= 1; li += 1) {
            fly.beginPath(); fly.moveTo(li * 3, 2); fly.lineTo(li * 3 - 5, 6 + Math.sin(flyTick + li) * 2); fly.strokePath();
            fly.beginPath(); fly.moveTo(li * 3, 2); fly.lineTo(li * 3 + 5, 6 + Math.sin(flyTick + li + 1) * 2); fly.strokePath();
          }
        },
        onComplete: () => fly.destroy(),
      });

    } else if (type === 7) {
      // ── Toilet paper wad — unraveling strip grows over time ──
      const startY = -Phaser.Math.Between(20, 80);
      const tp = this.add.graphics().setScrollFactor(0).setDepth(4);
      tp.x = x; tp.y = startY;
      let tpTick = 0;
      const baseX = x;
      const drift = Phaser.Math.Between(-15, 15);
      this.tweens.add({
        targets: tp,
        y: height +60,
        duration: Phaser.Math.Between(3500, 6000),
        ease: 'Linear',
        onUpdate: (tween) => {
          tpTick += 0.06;
          tp.x = baseX + drift * tween.progress;
          tp.clear();
          tp.fillStyle(0xf0ece0, 0.92);
          tp.fillEllipse(0, 0, 22, 16);
          tp.fillStyle(0xe8e4d8, 0.88);
          tp.fillEllipse(-6, 4, 16, 12);
          const stripLen = tween.progress * 50;
          if (stripLen > 2) {
            tp.lineStyle(5, 0xf4f0e4, 0.85);
            tp.beginPath();
            tp.moveTo(5, 6);
            for (let si = 0; si <= 20; si++) {
              const st = si / 20;
              const py = 6 + st * stripLen;
              const px = 5 + Math.sin(st * 3 * Math.PI * 2 + tpTick) * 5;
              tp.lineTo(px, py);
            }
            tp.strokePath();
          }
          tp.lineStyle(0.5, 0xccccbb, 0.35);
          tp.beginPath(); tp.moveTo(-8, 0); tp.lineTo(8, 2); tp.strokePath();
        },
        onComplete: () => tp.destroy(),
      });

    } else if (type === 8) {
      // ── Toothbrush tip — chain tween: ricochets off pipe wall mid-fall ──
      const startY = -Phaser.Math.Between(10, 50);
      const tb = this.add.graphics().setScrollFactor(0).setDepth(4);
      tb.x = x; tb.y = startY;
      const hcol = Phaser.Utils.Array.GetRandom([0x4488cc, 0xcc4488, 0x44cc88, 0xcc8844]);
      const drawTB = () => {
        tb.clear();
        tb.fillStyle(hcol, 0.9); tb.fillRect(-4, -2, 8, 22);
        tb.fillStyle(0xeeeeee, 1); tb.fillRect(-5, -14, 10, 14);
        tb.lineStyle(1, 0xdddddd, 0.7);
        for (let bx = -4; bx <= 4; bx += 2) {
          tb.beginPath(); tb.moveTo(bx, -14); tb.lineTo(bx, -20); tb.strokePath();
        }
      };
      drawTB();
      const midY = startY + Phaser.Math.Between(80, 160);
      const bounceX = x < (innerL + innerR) / 2 ? innerR - 10 : innerL + 10;
      this.tweens.chain({
        targets: tb,
        tweens: [
          { x: bounceX, y: midY, duration: Phaser.Math.Between(300, 600), ease: 'Power1',
            angle: Phaser.Math.Between(-30, 30), onUpdate: drawTB },
          { x: x + Phaser.Math.Between(-25, 25), y: height +60,
            duration: Phaser.Math.Between(400, 800), ease: 'Power2',
            angle: Phaser.Math.Between(60, 120), alpha: 0,
            onUpdate: drawTB, onComplete: () => tb.destroy() },
        ],
      });

    } else if (type === 9) {
      // ── Hair strand — wriggles with sine waves at different phases ──
      const startY = -Phaser.Math.Between(20, 80);
      const len = Phaser.Math.Between(50, 120);
      const hair = this.add.graphics().setScrollFactor(0).setDepth(4);
      hair.x = x; hair.y = startY;
      const hairCol = Phaser.Utils.Array.GetRandom([0x221a10, 0x443322, 0x888880, 0xeeeecc, 0x1a1a1a]);
      const baseX = x;
      let hTick = 0;
      const drift = Phaser.Math.FloatBetween(-20, 20);
      this.tweens.add({
        targets: hair,
        y: height +70,
        duration: Phaser.Math.Between(4000, 7000),
        ease: 'Linear',
        onUpdate: (tween) => {
          hTick += 0.05;
          hair.x = baseX + drift * tween.progress;
          hair.clear();
          hair.lineStyle(1, hairCol, 0.72);
          const segs = 8;
          hair.beginPath();
          for (let hi = 0; hi <= segs; hi++) {
            const py = (hi / segs) * len;
            const px = Math.sin(hTick * 1.2 + hi * 0.9) * 9 + Math.sin(hTick * 0.7 + hi * 1.5) * 5;
            if (hi === 0) hair.moveTo(px, py); else hair.lineTo(px, py);
          }
          hair.strokePath();
        },
        onComplete: () => hair.destroy(),
      });

    } else if (type === 10) {
      // ── Tooth — chain tween: bounces off pipe wall ──
      const startY = -Phaser.Math.Between(10, 60);
      const tooth = this.add.graphics().setScrollFactor(0).setDepth(4);
      tooth.x = x; tooth.y = startY;
      const drawTooth = () => {
        tooth.clear();
        tooth.fillStyle(0xf5f0e0, 1); tooth.fillEllipse(0, -4, 12, 14);
        tooth.fillStyle(0xe8e0cc, 1); tooth.fillTriangle(-4, 2, 4, 2, 1, 14);
        tooth.lineStyle(0.5, 0xddddcc, 0.6);
        tooth.beginPath(); tooth.moveTo(-3, -6); tooth.lineTo(-3, 4); tooth.strokePath();
        tooth.beginPath(); tooth.moveTo(3, -6); tooth.lineTo(3, 4); tooth.strokePath();
      };
      drawTooth();
      const midY = startY + Phaser.Math.Between(60, 140);
      const bounceX = x < (innerL + innerR) / 2 ? innerR - 15 : innerL + 15;
      this.tweens.chain({
        targets: tooth,
        tweens: [
          { x: bounceX, y: midY, angle: Phaser.Math.Between(-40, 40),
            duration: Phaser.Math.Between(280, 500), ease: 'Power1', onUpdate: drawTooth },
          { x: x + Phaser.Math.Between(-30, 30), y: height +60,
            angle: Phaser.Math.Between(-120, 120), alpha: 0,
            duration: Phaser.Math.Between(350, 700), ease: 'Power2',
            onUpdate: drawTooth, onComplete: () => tooth.destroy() },
        ],
      });

    } else if (type === 11) {
      // ── Cockroach — wall crawler, stop-start scurry (screen-space) ──
      const onLeft = Phaser.Math.Between(0, 1) === 0;
      const wallX = onLeft ? this.pipeInnerLeft + 8 : this.pipeInnerRight - 8;
      const startY = Phaser.Math.Between(80, height - 80);
      const roach = this.add.graphics().setScrollFactor(0).setDepth(5);
      roach.x = wallX;
      roach.y = startY;
      let rLeg = 0;
      const drawRoach = () => {
        roach.clear();
        roach.fillStyle(0x3a2200, 1);
        roach.fillEllipse(0, 0, 14, 8);
        roach.fillStyle(0x2a1800, 1);
        roach.fillCircle(0, -5, 4);
        roach.fillStyle(0xff4400, 0.8);
        roach.fillCircle(-2, -6, 1.2);
        roach.fillCircle(2, -6, 1.2);
        roach.lineStyle(0.8, 0x5a3200, 0.9);
        roach.beginPath(); roach.moveTo(-2, -8); roach.lineTo(-6 + Math.sin(rLeg) * 3, -16); roach.strokePath();
        roach.beginPath(); roach.moveTo(2, -8); roach.lineTo(8 + Math.sin(rLeg + 1) * 3, -16); roach.strokePath();
        roach.lineStyle(1, 0x4a2800, 0.85);
        [-3, 0, 3].forEach((ly, ri) => {
          roach.beginPath(); roach.moveTo(-6, ly); roach.lineTo(-6 - (Math.sin(rLeg + ri) > 0 ? 8 : 6), ly + 3); roach.strokePath();
          roach.beginPath(); roach.moveTo(6, ly); roach.lineTo(6 + (Math.sin(rLeg + ri) > 0 ? 8 : 6), ly + 3); roach.strokePath();
        });
      };
      let rAlive = true;
      const roachStep = () => {
        if (!roach.active || !rAlive) return;
        const dist = Phaser.Math.Between(20, 55);
        const dur  = Phaser.Math.Between(180, 380);
        const pause = Phaser.Math.Between(100, 400);
        this.tweens.add({
          targets: roach,
          y: roach.y + dist * (Phaser.Math.Between(0, 1) ? 1 : -1),
          duration: dur, ease: 'Linear',
          onUpdate: () => { rLeg += 0.25; drawRoach(); },
          onComplete: () => {
            this.time.delayedCall(pause, () => {
              rLeg += 0.3; drawRoach();
              if (rAlive && roach.active) roachStep();
            });
          },
        });
      };
      drawRoach();
      roachStep();
      this.time.delayedCall(Phaser.Math.Between(5000, 9000), () => {
        rAlive = false;
        this.tweens.add({ targets: roach, alpha: 0, duration: 300, onComplete: () => roach.destroy() });
      });

    } else if (type === 12) {
      // ── Soap bubble — iridescent multi-color shimmer, rises, pops with ring flash ──
      const startY = height +Phaser.Math.Between(0, 50);
      const r = Phaser.Math.Between(7, 16);
      const sb = this.add.graphics().setScrollFactor(0).setDepth(4);
      sb.x = x; sb.y = startY;
      const baseX = x;
      let sbTick = 0;
      const sbColors = [0xff88aa, 0x88aaff, 0x88ffcc, 0xffcc88, 0xcc88ff];
      this.tweens.add({
        targets: sb,
        y: -80,
        duration: Phaser.Math.Between(3000, 5500),
        ease: 'Sine.easeIn',
        onUpdate: () => {
          sbTick += 0.06;
          sb.x = baseX + Math.sin(sbTick * 0.8) * 18 + Math.sin(sbTick * 1.9) * 8;
          const col1 = sbColors[Math.floor(sbTick * 0.5) % sbColors.length];
          const col2 = sbColors[(Math.floor(sbTick * 0.5) + 2) % sbColors.length];
          sb.clear();
          sb.fillStyle(col1, 0.06); sb.fillCircle(0, 0, r);
          sb.lineStyle(2, col1, 0.5); sb.strokeCircle(0, 0, r);
          sb.lineStyle(1, col2, 0.35); sb.strokeCircle(0, 0, r - 1.5);
          sb.fillStyle(col2, 0.12); sb.fillEllipse(r * 0.2, -r * 0.3, r * 0.8, r * 0.5);
          sb.fillStyle(0xffffff, 0.75); sb.fillCircle(-r * 0.28, -r * 0.3, r * 0.18);
          sb.fillStyle(0xffffff, 0.4); sb.fillCircle(r * 0.2, r * 0.25, r * 0.1);
        },
        onComplete: () => {
          sb.clear();
          sb.lineStyle(2, 0xffffff, 0.8); sb.strokeCircle(0, 0, r * 1.4);
          this.tweens.add({ targets: sb, scaleX: 2, scaleY: 2, alpha: 0, duration: 180,
            onComplete: () => sb.destroy() });
        },
      });

    } else if (type === 13) {
      // ── Shampoo blob — squish wobble, translucent colored teardrop ──
      const startY = -Phaser.Math.Between(10, 60);
      const col = Phaser.Utils.Array.GetRandom([0xeedd44, 0x44eecc, 0xff88cc, 0x88ccff, 0xaaff88]);
      const shamp = this.add.graphics().setScrollFactor(0).setDepth(4);
      shamp.x = x; shamp.y = startY;
      let shTick = 0;
      const baseX = x;
      this.tweens.add({
        targets: shamp,
        y: height +50,
        duration: Phaser.Math.Between(2000, 4000),
        ease: 'Power1',
        onUpdate: () => {
          shTick += 0.09;
          shamp.x = baseX + Math.sin(shTick * 0.6) * 7;
          shamp.clear();
          const sqX = 1 + Math.sin(shTick) * 0.12;
          const sqY = 1 - Math.sin(shTick) * 0.08;
          shamp.fillStyle(col, 0.55);
          shamp.fillEllipse(0, 0, 18 * sqX, 24 * sqY);
          shamp.fillStyle(0xffffff, 0.3); shamp.fillEllipse(-3, -5, 6, 9);
          shamp.fillStyle(col, 0.4); shamp.fillTriangle(-5, 8, 5, 8, 0, 18);
        },
        onComplete: () => shamp.destroy(),
      });

    } else if (type === 14) {
      // ── Band-aid — flutter rotation as it falls ──
      const startY = -Phaser.Math.Between(10, 60);
      const ba = this.add.graphics().setScrollFactor(0).setDepth(4);
      ba.x = x; ba.y = startY;
      let baTick = 0;
      const baseX = x;
      const drift = Phaser.Math.Between(-30, 30);
      this.tweens.add({
        targets: ba,
        y: height +60,
        duration: Phaser.Math.Between(2500, 4500),
        ease: 'Linear',
        onUpdate: (tween) => {
          baTick += 0.1;
          ba.x = baseX + drift * tween.progress;
          ba.clear();
          const flutter = Math.cos(baTick * 1.8);
          const af = Math.abs(flutter);
          ba.fillStyle(0xe8c9a0, 0.9); ba.fillRect(-18 * af, -5, 36 * af, 10);
          if (af > 0.4) { ba.fillStyle(0xfff8ee, 0.95); ba.fillRect(-6 * af, -4, 12 * af, 8); }
          ba.fillStyle(0xddbbaa, 0.6);
          for (let px = -15; px <= 15; px += 5) { ba.fillCircle(px * af, 0, 0.8); }
        },
        onComplete: () => ba.destroy(),
      });

    } else if (type === 15) {
      // ── Earring — sparkle dots pulse, hook + gem shape ──
      const startY = -Phaser.Math.Between(10, 60);
      const gemCol = Phaser.Utils.Array.GetRandom([0xff4488, 0x4488ff, 0x44ffcc, 0xffcc44, 0xcc44ff]);
      const ear = this.add.graphics().setScrollFactor(0).setDepth(4);
      ear.x = x; ear.y = startY;
      let eTick = 0;
      const baseX = x;
      const drift = Phaser.Math.Between(-20, 20);
      this.tweens.add({
        targets: ear,
        y: height +60,
        duration: Phaser.Math.Between(2000, 4000),
        ease: 'Linear',
        onUpdate: (tween) => {
          eTick += 0.1;
          ear.x = baseX + drift * tween.progress;
          ear.clear();
          ear.lineStyle(2, 0xdddddd, 0.9);
          ear.beginPath(); ear.moveTo(0, -10); ear.lineTo(0, -2);
          ear.arc(4, -2, 4, Math.PI, 0, false); ear.strokePath();
          ear.fillStyle(gemCol, 0.9); ear.fillEllipse(0, 6, 10, 14);
          ear.lineStyle(0.8, 0xffffff, 0.5);
          ear.beginPath(); ear.moveTo(0, 0); ear.lineTo(-4, 8); ear.strokePath();
          ear.beginPath(); ear.moveTo(0, 0); ear.lineTo(4, 8); ear.strokePath();
          const sparkR = 3 + Math.sin(eTick * 3) * 2;
          ear.fillStyle(0xffffff, 0.4 + Math.sin(eTick * 2.5) * 0.3);
          ear.fillCircle(-8, -4, sparkR * 0.4); ear.fillCircle(9, 2, sparkR * 0.5); ear.fillCircle(3, -8, sparkR * 0.35);
          ear.lineStyle(1, 0xffffff, 0.6 * Math.max(0, Math.sin(eTick * 2)));
          ear.beginPath(); ear.moveTo(-9, -5); ear.lineTo(-7, -3); ear.strokePath();
          ear.beginPath(); ear.moveTo(-9, -3); ear.lineTo(-7, -5); ear.strokePath();
        },
        onComplete: () => ear.destroy(),
      });

    } else if (type === 16) {
      // ── Centipede — wall crawler with body segments + legs (screen-space) ──
      const onLeft = Phaser.Math.Between(0, 1) === 0;
      const wallX = onLeft ? this.pipeInnerLeft + 10 : this.pipeInnerRight - 10;
      const startY = Phaser.Math.Between(60, height - 60);
      const cent = this.add.graphics().setScrollFactor(0).setDepth(5);
      cent.x = wallX; cent.y = startY;
      const segCount = Phaser.Math.Between(8, 14);
      let ceTick = 0;
      const drawCent = () => {
        cent.clear();
        for (let ci = 0; ci < segCount; ci++) {
          const sy = ci * 5;
          const wave = Math.sin(ceTick + ci * 0.5) * 3;
          cent.fillStyle(ci === 0 ? 0x442200 : 0x663300, 1); cent.fillCircle(wave, sy, 4);
          cent.lineStyle(0.5, 0x885522, 0.5); cent.strokeCircle(wave, sy, 4);
          cent.lineStyle(0.8, 0x885522, 0.75);
          cent.beginPath(); cent.moveTo(wave - 4, sy); cent.lineTo(wave - 9, sy + Math.sin(ceTick + ci * 0.7) * 3); cent.strokePath();
          cent.beginPath(); cent.moveTo(wave + 4, sy); cent.lineTo(wave + 9, sy + Math.sin(ceTick + ci * 0.7 + Math.PI) * 3); cent.strokePath();
        }
        cent.fillStyle(0xff3300, 0.8); cent.fillCircle(Math.sin(ceTick) * 3, 0, 1.5); cent.fillCircle(-Math.sin(ceTick) * 3, -1, 1.5);
        cent.lineStyle(0.8, 0x884411, 0.8);
        cent.beginPath(); cent.moveTo(0, -4); cent.lineTo(-5 + Math.sin(ceTick) * 3, -12); cent.strokePath();
        cent.beginPath(); cent.moveTo(0, -4); cent.lineTo(5 + Math.sin(ceTick + 1) * 3, -12); cent.strokePath();
      };
      let ceAlive = true;
      const centStep = () => {
        if (!cent.active || !ceAlive) return;
        const dist = Phaser.Math.Between(30, 70);
        const dur  = Phaser.Math.Between(250, 500);
        const pause = Phaser.Math.Between(80, 300);
        this.tweens.add({
          targets: cent,
          y: cent.y + dist * (Phaser.Math.Between(0, 1) ? 1 : -1),
          duration: dur, ease: 'Linear',
          onUpdate: () => { ceTick += 0.2; drawCent(); },
          onComplete: () => {
            this.time.delayedCall(pause, () => {
              ceTick += 0.1; drawCent();
              if (ceAlive && cent.active) centStep();
            });
          },
        });
      };
      drawCent(); centStep();
      this.time.delayedCall(Phaser.Math.Between(5000, 8000), () => {
        ceAlive = false;
        this.tweens.add({ targets: cent, alpha: 0, duration: 300, onComplete: () => cent.destroy() });
      });

    } else if (type === 17) {
      // ── Contact lens — translucent disc drifts slowly ──
      const startY = -Phaser.Math.Between(20, 60);
      const cl = this.add.graphics().setScrollFactor(0).setDepth(4);
      cl.x = x; cl.y = startY;
      let clTick = 0;
      const baseX = x;
      const drift = Phaser.Math.Between(-25, 25);
      this.tweens.add({
        targets: cl,
        y: height +60,
        duration: Phaser.Math.Between(4000, 7000),
        ease: 'Sine.easeIn',
        onUpdate: (tween) => {
          clTick += 0.05;
          cl.x = baseX + drift * tween.progress + Math.sin(clTick * 0.8) * 8;
          cl.clear();
          const rX = 9 + Math.sin(clTick * 1.5) * 1.5;
          const rY = 9 + Math.cos(clTick * 1.2) * 1.5;
          cl.fillStyle(0x88ccee, 0.15); cl.fillEllipse(0, 0, rX * 2, rY * 2);
          cl.lineStyle(1.5, 0x88ccee, 0.55); cl.strokeEllipse(0, 0, rX * 2, rY * 2);
          cl.lineStyle(0.8, 0x66aacc, 0.35); cl.strokeEllipse(0, 0, rX * 1.4, rY * 1.4);
          cl.fillStyle(0xffffff, 0.5); cl.fillCircle(-3, -3, 2);
        },
        onComplete: () => cl.destroy(),
      });

    } else if (type === 18) {
      // ── Cigarette butt — glowing orange tip, fast tumble ──
      const startY = -Phaser.Math.Between(5, 40);
      const cig = this.add.graphics().setScrollFactor(0).setDepth(4);
      cig.x = x; cig.y = startY;
      let cigTick = 0;
      const baseX = x;
      const drift = Phaser.Math.Between(-35, 35);
      this.tweens.add({
        targets: cig,
        y: height +60,
        duration: Phaser.Math.Between(700, 1600),
        ease: 'Power2',
        onUpdate: (tween) => {
          cigTick += 0.22;
          cig.x = baseX + drift * tween.progress;
          cig.clear();
          cig.fillStyle(0xeeeecc, 1); cig.fillRect(-2, -10, 4, 18);
          cig.fillStyle(0xcc8844, 1); cig.fillRect(-2, 8, 4, 5);
          cig.fillStyle(0x888888, 0.9); cig.fillRect(-2, -12, 4, 4);
          const glow = 0.6 + Math.sin(cigTick * 3) * 0.4;
          cig.fillStyle(0xff6600, glow); cig.fillCircle(0, -11, 3);
          cig.fillStyle(0xff9900, glow * 0.6); cig.fillCircle(0, -11, 5);
        },
        onComplete: () => cig.destroy(),
      });

    } else if (type === 19) {
      // ── Matchstick — spent head, tumbles ──
      const startY = -Phaser.Math.Between(5, 40);
      const match = this.add.graphics().setScrollFactor(0).setDepth(4);
      match.x = x; match.y = startY;
      let mTick = 0;
      const baseX = x;
      const drift = Phaser.Math.Between(-35, 35);
      this.tweens.add({
        targets: match,
        y: height +60,
        duration: Phaser.Math.Between(900, 2000),
        ease: 'Power1',
        onUpdate: (tween) => {
          mTick += 0.16;
          match.x = baseX + drift * tween.progress;
          match.clear();
          match.fillStyle(0xddcc99, 1); match.fillRect(-1.5, -16, 3, 22);
          match.fillStyle(0x221100, 1); match.fillCircle(0, -16, 4);
          match.fillStyle(0x441100, 0.7); match.fillCircle(0, -16, 2.5);
          const flicker = Math.sin(mTick * 4) * 0.3;
          if (flicker > 0) { match.fillStyle(0xff4400, flicker); match.fillCircle(0, -18, 3); }
        },
        onComplete: () => match.destroy(),
      });

    } else {
      // ── Mushroom cap — colorful, tumbles down the pipe ──
      const startY = -Phaser.Math.Between(5, 45);
      const mush = this.add.graphics().setScrollFactor(0).setDepth(4);
      mush.x = x; mush.y = startY;
      const capCol = Phaser.Utils.Array.GetRandom([0xcc3300, 0xdd8800, 0x993322, 0x556622, 0xaa2255, 0x885533, 0xff5500]);
      const capW  = Phaser.Math.Between(14, 26);
      const stemH = Phaser.Math.Between(7, 14);
      const baseX = x;
      const drift = Phaser.Math.Between(-30, 30);

      const drawMush = () => {
        mush.clear();
        // Stem
        mush.fillStyle(0xddd0aa, 0.9);
        mush.fillRect(-3, 0, 7, stemH);
        mush.fillStyle(0xf0e8cc, 0.5);
        mush.fillRect(-2, 1, 3, stemH - 2);
        // Gills under cap
        mush.lineStyle(0.5, 0xbbaa88, 0.45);
        for (let gi = -2; gi <= 2; gi++) {
          mush.beginPath(); mush.moveTo(gi * 2.2, 0); mush.lineTo(gi * 2.5 - 0.5, stemH * 0.45); mush.strokePath();
        }
        // Cap dome
        mush.fillStyle(capCol, 0.95);
        mush.fillEllipse(0, -stemH * 0.45, capW, stemH * 0.85);
        mush.fillEllipse(0, -stemH * 0.9, capW * 1.08, stemH * 0.72);
        // White spots
        mush.fillStyle(0xffffff, 0.82);
        mush.fillCircle(-capW * 0.22, -stemH * 0.72, capW * 0.11);
        mush.fillCircle(capW * 0.2, -stemH * 0.58, capW * 0.09);
        mush.fillCircle(capW * 0.04, -stemH * 1.08, capW * 0.08);
        // Cap sheen
        mush.fillStyle(0xffffff, 0.18);
        mush.fillEllipse(-capW * 0.15, -stemH * 1.0, capW * 0.5, stemH * 0.25);
      };

      drawMush();
      this.tweens.add({
        targets: mush,
        y: height + 65,
        angle: Phaser.Math.Between(-100, 100),
        duration: Phaser.Math.Between(1700, 3400),
        ease: 'Power2',
        onUpdate: (tween) => { mush.x = baseX + drift * tween.progress; drawMush(); },
        onComplete: () => mush.destroy(),
      });
    }
  }

  // ── Looking UP through the drain into the bathroom above ────────────────

  spawnBathroomOpening() {
    if (!this.spider?.isAlive || this.gameOver) return;
    const { width, height } = this.scale;
    const cx   = width / 2;
    const cy   = height * 0.40;
    const maxR = Math.min(width, height) * 0.30;

    const viewGfx = this.add.graphics().setScrollFactor(0).setDepth(22);
    const maskGfx = this.make.graphics({ add: false });
    const mask    = maskGfx.createGeometryMask();
    viewGfx.setMask(mask);

    const proxy = { r: 0, dropY: 0 };

    const drawView = (r) => {
      maskGfx.clear();
      maskGfx.fillStyle(0xffffff, 1);
      maskGfx.fillCircle(cx, cy, r);

      viewGfx.clear();
      if (r < 2) return;

      // Background — bathroom ceiling (looking straight up)
      viewGfx.fillStyle(0xf0ece4, 1);
      viewGfx.fillCircle(cx, cy, r);

      // Ceiling tiles — from below looking up, grid pattern
      const tSz = 28;
      viewGfx.lineStyle(0.8, 0xd4cfc6, 0.5);
      for (let tx = cx - r; tx < cx + r + tSz; tx += tSz) {
        viewGfx.beginPath(); viewGfx.moveTo(tx, cy - r); viewGfx.lineTo(tx, cy + r * 0.2); viewGfx.strokePath();
      }
      for (let ty = cy - r; ty < cy + r * 0.2; ty += tSz) {
        viewGfx.beginPath(); viewGfx.moveTo(cx - r, ty); viewGfx.lineTo(cx + r, ty); viewGfx.strokePath();
      }

      // Overhead light fixture — centre ceiling
      const lightY = cy - r * 0.62;
      viewGfx.fillStyle(0xfff8e0, 0.55);
      viewGfx.fillEllipse(cx, lightY, r * 0.88, r * 0.32);
      viewGfx.fillStyle(0xfffde8, 0.88);
      viewGfx.fillEllipse(cx, lightY, r * 0.52, r * 0.16);
      // Light bulb centre
      viewGfx.fillStyle(0xffffff, 1);
      viewGfx.fillCircle(cx, lightY, r * 0.06);
      // Light rays streaming down toward us
      for (let i = 0; i < 7; i++) {
        const a  = (Math.PI * 0.35) + (i / 6) * Math.PI * 0.3;
        const x1 = cx + Math.cos(a) * r * 0.15;
        const y1 = lightY + r * 0.08;
        const x2 = cx + Math.cos(a) * r * 0.75;
        const y2 = cy + r * 0.1;
        viewGfx.lineStyle(2.5, 0xfffde0, 0.06 + Math.random() * 0.08);
        viewGfx.beginPath(); viewGfx.moveTo(x1, y1); viewGfx.lineTo(x2, y2); viewGfx.strokePath();
      }

      // Sink basin underside — white porcelain bowl we're looking up into
      viewGfx.fillStyle(0xe6e2d8, 1);
      viewGfx.fillEllipse(cx, cy + r * 0.72, r * 2.4, r * 0.65);
      // Porcelain sheen
      viewGfx.fillStyle(0xfafaf4, 0.45);
      viewGfx.fillEllipse(cx - r * 0.15, cy + r * 0.6, r * 0.9, r * 0.2);

      // Faucet hanging down from above
      const fax = cx + r * 0.12;
      const fatop = cy - r * 0.38;
      viewGfx.fillStyle(0xbbbbbb, 1);
      viewGfx.fillRect(fax - 4, fatop, 8, r * 0.28);
      // Faucet head curve (pipe curves down toward drain)
      viewGfx.fillStyle(0xaaaaaa, 1);
      viewGfx.fillRect(fax - 4, fatop + r * 0.28, 22, 7);
      viewGfx.fillRect(fax + 14, fatop + r * 0.24, 6, 12);
      // Faucet shine
      viewGfx.fillStyle(0xdddddd, 0.6);
      viewGfx.fillRect(fax - 2, fatop + 2, 3, r * 0.2);

      // Dripping water — animated via proxy.dropY
      if (r > maxR * 0.5) {
        viewGfx.fillStyle(0x88bbdd, 0.88);
        viewGfx.fillEllipse(fax + 17, fatop + r * 0.36 + proxy.dropY, 7, 11);
        // Drip trail
        viewGfx.fillStyle(0x88bbdd, 0.3);
        viewGfx.fillRect(fax + 19, fatop + r * 0.3, 2, proxy.dropY);
      }

      // Drain grate — looking UP from below, so grate is a circle with cross bars
      const grateY  = cy + r * 0.18;
      const grateR  = r * 0.20;
      // Dark grate opening
      viewGfx.fillStyle(0x111111, 0.92);
      viewGfx.fillCircle(cx, grateY, grateR);
      // Grate bars from below (cross + diagonals)
      viewGfx.lineStyle(3.5, 0x0a0a0a, 1);
      viewGfx.beginPath(); viewGfx.moveTo(cx - grateR, grateY); viewGfx.lineTo(cx + grateR, grateY); viewGfx.strokePath();
      viewGfx.beginPath(); viewGfx.moveTo(cx, grateY - grateR); viewGfx.lineTo(cx, grateY + grateR); viewGfx.strokePath();
      viewGfx.lineStyle(1.8, 0x1a1a1a, 0.8);
      const d45 = grateR * 0.7;
      viewGfx.beginPath(); viewGfx.moveTo(cx - d45, grateY - d45); viewGfx.lineTo(cx + d45, grateY + d45); viewGfx.strokePath();
      viewGfx.beginPath(); viewGfx.moveTo(cx + d45, grateY - d45); viewGfx.lineTo(cx - d45, grateY + d45); viewGfx.strokePath();
      // Grate rings
      viewGfx.lineStyle(2, 0x2a2a2a, 0.9); viewGfx.strokeCircle(cx, grateY, grateR);
      viewGfx.lineStyle(1, 0x2a2a2a, 0.5); viewGfx.strokeCircle(cx, grateY, grateR * 0.55);
      // Lime scale / soap crust on grate edges
      viewGfx.fillStyle(0xeeeecc, 0.3);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        viewGfx.fillEllipse(cx + Math.cos(a) * grateR, grateY + Math.sin(a) * grateR, 5, 3);
      }

      // Pipe interior wall visible around the drain opening (rusty metal)
      viewGfx.lineStyle(11, 0x3a2510, 0.95); viewGfx.strokeCircle(cx, cy, r);
      viewGfx.lineStyle(5,  0x5a3818, 0.6);  viewGfx.strokeCircle(cx, cy, r - 6);
      viewGfx.lineStyle(2,  0x7a5530, 0.3);  viewGfx.strokeCircle(cx, cy, r - 14);
      // Mineral deposits on inside rim
      viewGfx.fillStyle(0xeeeebb, 0.22);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        viewGfx.fillEllipse(cx + Math.cos(a) * (r - 5), cy + Math.sin(a) * (r - 5), Phaser.Math.Between(3, 10), Phaser.Math.Between(2, 5));
      }
    };

    // Animate drip inside the bathroom view
    let dropT = 0;
    const dropUpdate = this.time.addEvent({
      delay: 16,
      loop: true,
      callback: () => {
        dropT += 0.04;
        proxy.dropY = (Math.sin(dropT) * 0.5 + 0.5) * 22;
        if (proxy.r > 0) drawView(proxy.r);
      },
    });

    // Iris-wipe open
    this.tweens.add({
      targets: proxy, r: maxR, duration: 950, ease: 'Back.easeOut',
      onUpdate: () => drawView(proxy.r),
      onComplete: () => {
        const holdMs = Phaser.Math.Between(6000, 10000);
        this.time.delayedCall(holdMs, () => {
          if (!viewGfx.scene) return;
          dropUpdate.remove();
          this.tweens.add({
            targets: proxy, r: 0, duration: 650, ease: 'Power2',
            onUpdate: () => drawView(proxy.r),
            onComplete: () => { viewGfx.destroy(); maskGfx.destroy(); },
          });
        });
      },
    });
  }

  // ── Fake-out flash flood warning ─────────────────────────────────────────

  triggerFloodWarning() {
    if (this.gameOver || !this.spider?.isAlive) return;
    this._floodWarnActive = true;
    const { width, height } = this.scale;

    sound.playFloodWarning();
    this.cameras.main.shake(350, 0.01);

    // Red danger tint overlay
    const tint = this.add.graphics().setScrollFactor(0).setDepth(18);
    tint.fillStyle(0xff2200, 0.2); tint.fillRect(0, 0, width, height);
    tint.setAlpha(0);

    // Warning banner text
    const banner = this.add.text(width / 2, height * 0.27,
      '⚠  FLASH FLOOD WARNING  ⚠', {
        fontSize: '21px', fontFamily: 'Arial Black, sans-serif',
        color: '#ff3300', stroke: '#000000', strokeThickness: 5,
        backgroundColor: '#00000099', padding: { x: 14, y: 6 },
      }).setOrigin(0.5).setScrollFactor(0).setDepth(19).setAlpha(0);

    const sub = this.add.text(width / 2, height * 0.36,
      'Rising water detected in pipe…', {
        fontSize: '13px', fontFamily: 'Arial, sans-serif',
        color: '#ffbb44', stroke: '#000000', strokeThickness: 3,
      }).setOrigin(0.5).setScrollFactor(0).setDepth(19).setAlpha(0);

    // Appear
    this.tweens.add({
      targets: [tint, banner, sub], alpha: 1, duration: 240, ease: 'Power2',
      onComplete: () => {
        // Blink warning
        this.tweens.add({
          targets: banner, alpha: { from: 1, to: 0.35 }, duration: 320,
          yoyo: true, repeat: 3,
          onComplete: () => {
            // Fake-out relief — fade everything
            this.tweens.add({
              targets: [tint, banner, sub], alpha: 0, duration: 700,
              onComplete: () => {
                tint.destroy(); banner.destroy(); sub.destroy();
                this._floodWarnActive = false;
              },
            });
          },
        });
      },
    });

    // Water drips from walls during warning
    for (let i = 0; i < 4; i++) {
      this.time.delayedCall(280 + i * 380, () => {
        if (!this.spider?.isAlive || this.gameOver) return;
        const side = Phaser.Math.Between(0, 1);
        const dx   = side ? PIPE_WALL - 4 : width - PIPE_WALL + 4;
        const dy   = Phaser.Math.Between(20, height - 100);
        const d = this.add.graphics().setScrollFactor(0).setDepth(18);
        d.fillStyle(0x4488bb, 0.85); d.fillEllipse(dx, dy, 9, 22);
        this.tweens.add({
          targets: d, y: `+=${Phaser.Math.Between(80, 200)}`, alpha: 0, duration: 650,
          onComplete: () => d.destroy(),
        });
      });
    }
  }

  // ── Spider silk slip — occasional loss-of-grip slide ─────────────────────

  _triggerSilkSlip() {
    if (!this.spider?.isAlive || this._slipping || this.gameOver || !this.serverMode) return;
    this._slipping = true;
    const slipDist = Phaser.Math.Between(55, 140);
    sound.playSlip();
    this.cameras.main.shake(120, 0.004);
    this._slipTween = this.tweens.add({
      targets: this.spider,
      visualSlipY: slipDist,
      duration: 220 + Phaser.Math.Between(0, 120),
      ease: 'Power2',
      onComplete: () => {
        if (!this.spider?.isAlive) {
          this.spider.visualSlipY = 0;
          this._slipping = false;
          return;
        }
        // Brief hang before scrambling back up
        this.time.delayedCall(160, () => {
          if (!this.spider?.isAlive) {
            this.spider.visualSlipY = 0;
            this._slipping = false;
            return;
          }
          this._slipTween = this.tweens.add({
            targets: this.spider,
            visualSlipY: 0,
            duration: 400,
            ease: 'Back.easeOut',
            onComplete: () => {
              this._slipping = false;
              this._slipTween = null;
            },
          });
        });
      },
    });
  }

  // ── Post-flood white flash — visually clears blue water from pipe ─────────

  _flashPipeWhite() {
    if (this._pipeFlashPending) return;
    this._pipeFlashPending = true;
    const { width, height } = this.scale;
    const innerW = width - PIPE_WALL * 2;
    const pf = this.add.graphics().setScrollFactor(0).setDepth(22);
    pf.fillStyle(0xffffff, 1);
    pf.fillRect(PIPE_WALL, 0, innerW, height);
    this.tweens.add({ targets: pf, alpha: 0, duration: 550, ease: 'Power2',
      onComplete: () => { pf.destroy(); this._pipeFlashPending = false; } });
  }

  // ── Persistent water — drawn every frame during live rounds ─────────────

  _waterColorForMultiplier(mult) {
    // Deep blue (safe) → teal (5×) → yellow-green (15×) → orange (30×) → red (50×+)
    if (mult < 5)   return { bg: 0x000c22, fg: 0x0d3d99 };
    if (mult < 15)  return { bg: 0x001a1a, fg: 0x0a6655 };
    if (mult < 30)  return { bg: 0x1a1500, fg: 0x887700 };
    if (mult < 50)  return { bg: 0x1a0800, fg: 0xaa4400 };
    return               { bg: 0x1a0000, fg: 0xcc1100 };
  }

  _drawPersistentWater(surfaceY) {
    const { width, height } = this.scale;
    const innerW = width - PIPE_WALL * 2;
    const t = this.time.now * 0.003;
    const mult = this._serverMultiplier ?? 1;
    const { bg, fg } = this._waterColorForMultiplier(mult);

    this._waterBg.clear();
    this._waterBg.fillStyle(bg, 0.90);
    this._waterBg.fillRect(PIPE_WALL, surfaceY, innerW, height - surfaceY + 4);

    this._waterFg.clear();
    if (surfaceY >= height) return;
    this._waterFg.fillStyle(fg, 0.78);
    this._waterFg.beginPath();
    let first = true;
    for (let xi = 0; xi <= 26; xi++) {
      const wx = PIPE_WALL + (innerW / 26) * xi;
      const wy = surfaceY - 10 + Math.sin(t + xi * 0.42) * 7 + Math.cos(t * 0.75 + xi * 0.28) * 4;
      if (first) { this._waterFg.moveTo(wx, wy); first = false; }
      else this._waterFg.lineTo(wx, wy);
    }
    this._waterFg.lineTo(PIPE_WALL + innerW, height + 4);
    this._waterFg.lineTo(PIPE_WALL, height + 4);
    this._waterFg.closePath(); this._waterFg.fillPath();
    this._waterFg.fillStyle(0xffffff, 0.07);
    this._waterFg.fillRect(PIPE_WALL, surfaceY - 4, innerW, 7);
  }

  // ── Crash surge — water rushes up and fills the pipe ─────────────────────

  _surgeWaterCrash(floodGen) {
    const { width, height } = this.scale;
    const innerW = width - PIPE_WALL * 2;
    this._waterSurging = true;

    // Raise water to front depth for crash so it covers the spider
    this._waterBg.setDepth(19);
    this._waterFg.setDepth(20);

    const startY = this._waterSurfaceY ?? height * 0.82;
    const proxy  = { y: startY };
    const draw   = () => { this._waterSurfaceY = proxy.y; this._drawPersistentWater(proxy.y); };

    // Phase 1 — surge to spider level (fast, Power4)
    this.tweens.add({
      targets: proxy, y: height / 2 - 12, duration: 380, ease: 'Power4',
      onUpdate: draw,
      onComplete: () => {
        if (this._floodGen !== floodGen) return;
        this.cameras.main.flash(200, 180, 220, 255);
        if (this.spider?.isAlive) this.spider.die('flood');

        // Foam burst at impact
        for (let i = 0; i < 22; i++) {
          const imp = this.add.graphics().setScrollFactor(0).setDepth(25);
          imp.fillStyle(0xffffff, 0.9);
          imp.fillCircle(0, 0, 3 + Math.random() * 12);
          imp.x = PIPE_WALL + Math.random() * innerW;
          imp.y = height / 2 + Math.random() * 30;
          this.tweens.add({ targets: imp,
            y: `+=${Phaser.Math.Between(-20, 90)}`, x: `+=${Phaser.Math.Between(-48, 48)}`,
            alpha: 0, duration: 200 + Math.random() * 200, ease: 'Power2',
            onComplete: () => imp.destroy() });
        }

        // Phase 2 — fill rest of pipe above spider
        this.tweens.add({
          targets: proxy, y: -80, duration: 550, ease: 'Power3',
          onUpdate: draw,
          onComplete: () => {
            if (this._floodGen !== floodGen) return;
            // Churning bubbles in filled water column
            for (let i = 0; i < 28; i++) {
              this.time.delayedCall(i * 55, () => {
                if (this._floodGen !== floodGen) return;
                const bub = this.add.graphics().setScrollFactor(0).setDepth(24);
                const br  = 4 + Math.random() * 15;
                bub.lineStyle(1.5, 0xaaddff, 0.6); bub.strokeCircle(0, 0, br);
                bub.fillStyle(0x88bbff, 0.05); bub.fillCircle(0, 0, br);
                bub.x = PIPE_WALL + Math.random() * innerW;
                bub.y = height * 0.1 + Math.random() * height * 0.85;
                this.tweens.add({ targets: bub,
                  y: bub.y - Phaser.Math.Between(80, 300),
                  x: bub.x + Phaser.Math.Between(-20, 20),
                  alpha: 0, duration: Phaser.Math.Between(600, 2000), ease: 'Sine.easeIn',
                  onComplete: () => bub.destroy() });
              });
            }
            // Phase 3 — drain after hold
            this.time.delayedCall(2200, () => {
              if (this._floodGen !== floodGen) return;
              this.tweens.add({
                targets: proxy, y: height + 110, duration: 900, ease: 'Power2',
                onUpdate: draw,
                onComplete: () => {
                  this._waterBg.clear().setDepth(6);
                  this._waterFg.clear().setDepth(7);
                  this._waterSurfaceY = null;
                  this._waterSurging  = false;
                  this._flashPipeWhite();
                },
              });
            });
          },
        });
      },
    });
  }

  // ── Server crash — wave rushes DOWN the pipe and hits the spider ─────────

  _startCrashDrain() {
    const { height } = this.scale;
    this._waterSurging = true;  // block update loop from clearing water mid-drain
    const floodGen = ++this._floodGen;

    this.time.delayedCall(1400, () => {
      if (this._floodGen !== floodGen) return;
      const proxy = { y: this._waterSurfaceY ?? height * 0.5 };
      this.tweens.add({
        targets: proxy, y: height + 120, duration: 1100, ease: 'Power2',
        onUpdate: () => {
          if (this._floodGen !== floodGen) return;
          this._waterSurfaceY = proxy.y;
          this._drawPersistentWater(proxy.y);
        },
        onComplete: () => {
          if (this._floodGen !== floodGen) return;
          this._waterBg?.clear().setDepth(6);
          this._waterFg?.clear().setDepth(7);
          this._waterSurfaceY = null;
          this._waterSurging  = false;
        },
      });
    });
  }

  triggerServerFlood() {
    if (!this.spider?.isAlive) return;
    const { width, height } = this.scale;
    this._floodWarnActive = false;
    this._floodGen++;           // invalidate any old surge callbacks
    this._waterSurging = false; // let the update loop take over
    this._crashSurge   = true;  // signal: water rushes up fast

    sound.playJumpScareCrash();

    // Camera shake — unmistakably a game event, not a glitch
    this.cameras.main.shake(550, 0.016);

    // Red pulse on the pipe interior
    const redFlash = this.add.graphics().setScrollFactor(0).setDepth(22);
    redFlash.fillStyle(0xff2200, 0.30);
    redFlash.fillRect(PIPE_WALL, 0, width - PIPE_WALL * 2, height);
    this.tweens.add({ targets: redFlash, alpha: 0, duration: 600, ease: 'Power2',
      onComplete: () => redFlash.destroy() });

    // "PIPE BURST!" banner — players instantly know it's the game, not a glitch
    const banner = this.add.text(width / 2, height * 0.42, '⚠  PIPE BURST!  ⚠', {
      fontSize: '30px', fontFamily: 'Arial Black, sans-serif',
      color: '#ff4400', stroke: '#000000', strokeThickness: 5,
      shadow: { offsetX: 0, offsetY: 0, color: '#ff0000', blur: 18, fill: true },
    }).setOrigin(0.5).setScrollFactor(0).setDepth(29).setAlpha(0);

    this.tweens.add({
      targets: banner, alpha: 1, y: height * 0.40, duration: 120,
      onComplete: () => {
        this.tweens.add({ targets: banner, alpha: 0, duration: 350, delay: 750,
          onComplete: () => banner.destroy() });
      },
    });
  }

  // ── Platform / worm handlers ─────────────────────────────────────────────

  handlePlatformLand(spiderBody, platform) {
    if (!platform.active) return;
    if (spiderBody.body.touching.down && platform.body.touching.up) {
      this.spider.setOnGround(platform);
      const danger = [PLATFORM_TYPES.EXPLODING, PLATFORM_TYPES.FIRE, PLATFORM_TYPES.SHOCKING];
      if (danger.includes(platform.platformType)) {
        this.hazardManager.handlePlatformContact(platform);
      } else {
        this.platformManager.startDisappearTimer(platform);
      }
      this.glowWormManager.trySpawn(platform.x, platform.y);
    }
  }

  handleWormCollect(spiderBody, worm) {
    this.glowWormManager.collect(worm);
  }

  // ── Death ────────────────────────────────────────────────────────────────

  handleDeath(cause) {
    if (this.gameOver) return;
    this.gameOver = true;
    this._deathOverlays = [];

    // Server mode: UIScene handles crash display, no extra overlay
    if (this.serverMode) return;

    // ── Offline mode only ────────────────────────────────────────────────
    const { width, height } = this.scale;

    const messages = {
      fall:      { text: 'SWEPT AWAY!\nBust!',    color: '#44aaff' },
      explosion: { text: 'BLOWN UP!\nBust!',       color: '#ff6600' },
      fire:      { text: 'BURNED!\nBust!',         color: '#ff4400' },
      flood:     { text: 'SWEPT AWAY!\nBust!',    color: '#44aaff' },
      hoop_slip: { text: 'HOOP SLIPPED!\nBust!', color: '#ff8800' },
    };
    const msg = messages[cause] || messages.flood;
    this.cameras.main.shake(400, 0.02);

    this.time.delayedCall(600, () => {
      const loseText = this.add.text(width / 2, height / 2, msg.text, {
        fontSize: '48px', fontFamily: 'Arial Black, sans-serif',
        color: msg.color, stroke: '#000000', strokeThickness: 8, align: 'center',
      }).setOrigin(0.5).setAlpha(0).setScrollFactor(0).setDepth(15);
      this._deathOverlays.push(loseText);
      this.tweens.add({ targets: loseText, alpha: 1, y: loseText.y - 20, duration: 500 });

      this.time.delayedCall(2000, () => {
        const btn = this.add.text(width / 2, height * 0.65, '[ PLAY AGAIN ]', {
          fontSize: '24px', fontFamily: 'Arial Black, sans-serif',
          color: '#ffffff', stroke: '#000000', strokeThickness: 4,
        }).setOrigin(0.5).setScrollFactor(0).setDepth(15).setInteractive({ useHandCursor: true });
        this._deathOverlays.push(btn);
        this.tweens.add({ targets: btn, alpha: { from: 0.4, to: 1 }, duration: 600, yoyo: true, repeat: -1 });
        btn.on('pointerdown', () => {
          if (this.floodScheduler) this.floodScheduler.destroy();
          this.hazardManager.destroy();
          this.scene.stop('UIScene');
          this.scene.start('IntroScene');
        });
      });
    });
  }

  // ── Win ──────────────────────────────────────────────────────────────────

  triggerWin() {
    const { width, height } = this.scale;
    this.cameras.main.flash(500, 255, 215, 0);
    this.cameras.main.shake(300, 0.02);
    this.time.delayedCall(600, () => {
      const multiplier = tileToMultiplier(MAX_TILES, this.glowWorms);
      this.scene.get('UIScene')?.events.emit('game:win', multiplier);
      const winText = this.add.text(width / 2, height / 2, `MAX PAYOUT!\n${multiplier}x`, {
        fontSize: '52px', fontFamily: 'Arial Black, sans-serif',
        color: '#ffd700', stroke: '#000000', strokeThickness: 8, align: 'center',
      }).setOrigin(0.5).setScrollFactor(0).setDepth(15);
      this.tweens.add({ targets: winText, scaleX: { from: 0.5, to: 1.2 }, scaleY: { from: 0.5, to: 1.2 }, duration: 600, ease: 'Back.out',
        onComplete: () => {
          this.time.delayedCall(2000, () => {
            this.tweens.add({ targets: winText, alpha: 0, y: winText.y - 30, duration: 600,
              onComplete: () => winText.destroy() });
          });
        },
      });
    });
  }

  // ── Reset for next server round ──────────────────────────────────────────

  resetSpiderToGround() {
    if (!this.spider) return;
    const { width, height } = this.scale;

    // Invalidate any in-flight flood animation so its callbacks never fire
    this._pipeFlashPending = false;
    this._floodGen++;

    // Stop any in-progress water surge and wipe the persistent water graphics
    const wasFloodSurging = this._waterSurging;
    this._waterBg?.clear();
    this._waterFg?.clear();
    this._waterBg?.setDepth(6);
    this._waterFg?.setDepth(7);
    this._waterSurfaceY = null;
    this._waterSurging  = false;
    this._crashSurge    = false;

    // Flash white inside pipe if crash flood was mid-animation (pipe was full of blue)
    if (wasFloodSurging) this._flashPipeWhite();

    if (this._deathOverlays) {
      this._deathOverlays.forEach(o => o?.destroy());
      this._deathOverlays = [];
    }

    this.tweens.killTweensOf(this.spider.getBody());
    this.tweens.killTweensOf(this.spider.gfx);
    this.tweens.killTweensOf(this.spider.silkGfx);

    this.spider.getBody().setAlpha(1).setAngle(0);
    this.spider.gfx.setAlpha(1);
    this.spider.gfx.y = 0;          // reset flood-death downward sweep offset
    this.spider.silkGfx.setAlpha(1);
    this.spider.silkGfx.y = 0;

    this.spider.isAlive         = true;
    this.spider.onGround        = false;
    this.spider.currentPlatform = null;
    this.spider.externalStunned = false;

    this.spider.getBody().setPosition(width / 2, this.groundY);
    this.spider.getBody().setVelocity(0, 0);
    this.spider.getBody().body.setAllowGravity(false);

    // Snap camera to spider — no lerp lag
    this.cameras.main.scrollY = this.groundY - height / 2;

    this.gameOver    = false;
    this.serverTiles = 0;
    this.glowWorms   = 0;

    // Reset warning timer for the new round
    this._floodWarnActive = false;
    this._floodWarnTimer  = Phaser.Math.Between(14000, 28000);
    this._bathroomTimer   = Phaser.Math.Between(12000, 26000);

    // Reset silk slip state
    this.tweens.killTweensOf(this.spider);
    this.spider.visualSlipY = 0;
    this._slipping  = false;
    this._slipTween = null;
    this._slipTimer = Phaser.Math.Between(6000, 14000);

    // Reset magic worm state
    this._magicWormActive = false;
    this._magicTileBonus  = 0;
    this._magicWormTimer  = Phaser.Math.Between(120000, 360000);

    // Reset milestone state
    this._serverMultiplier = 1;
    this._spiderMilestoneLevel = 0;
    this.spider?.setMilestoneLevel(0);
  }

  // ── Auto climb (server mode) ─────────────────────────────────────────────

  autoClimbStep() {
    if (!this.serverMode || !this.spider.isAlive) return;
    const body = this.spider.getBody();
    const { width, height } = this.scale;
    const targetY = this.groundY - (this.serverTiles + Math.floor(this._magicTileBonus)) * 10;
    const newY = Phaser.Math.Linear(body.y, targetY, 0.3);
    body.setPosition(width / 2, newY);
    body.setVelocity(0, 0);
    this.cameras.main.scrollY = body.y - height / 2;
  }

  // ── Main update ──────────────────────────────────────────────────────────

  update(time, delta) {
    // Ambient debris runs regardless of game state (between rounds too)
    this._animTimer += delta;
    if (this._animTimer > 850) {
      this._animTimer = 0;
      this.spawnAmbientAnim();
      this.spawnAmbientAnim();
    }
    this._bathroomTimer -= delta;
    if (this._bathroomTimer <= 0) {
      this._bathroomTimer = Phaser.Math.Between(14000, 28000);
      this.spawnBathroomOpening();
    }

    if (this.gameOver) return;

    const { height } = this.scale;
    const camera = this.cameras.main;
    const tiles  = this.serverMode ? this.serverTiles : this.spider.getTileHeight();

    // World management
    this.platformManager.extendWorld(camera.scrollY);
    this.platformManager.cullDistantPlatforms(camera.scrollY);

    // Movement + camera
    if (this.serverMode) {
      this.autoClimbStep();
    } else {
      this.spider.setAirborne();
      if (this.spider?.isAlive) {
        const targetScrollY = this.spider.getBody().y - height / 2;
        this.cameras.main.scrollY = Phaser.Math.Linear(this.cameras.main.scrollY, targetScrollY, 0.1);
      }
    }

    if (this.floodScheduler) this.floodScheduler.update(delta);


    // Flash flood fake-out warnings (server/playing mode only)
    if (this.serverMode && this.spider?.isAlive) {
      this._floodWarnTimer -= delta;
      if (this._floodWarnTimer <= 0 && !this._floodWarnActive) {
        this._floodWarnTimer = Phaser.Math.Between(16000, 35000);
        this.triggerFloodWarning();
      }

      // Silk slip — spider occasionally loses grip and slides
      this._slipTimer -= delta;
      if (this._slipTimer <= 0) {
        this._slipTimer = Phaser.Math.Between(6000, 14000);
        this._triggerSilkSlip();
      }

      // Magic worm spawn timer
      this._magicWormTimer -= delta;
      if (this._magicWormTimer <= 0) {
        // Reset window; only 25% chance it actually appears this cycle
        this._magicWormTimer = Phaser.Math.Between(120000, 360000);
        if (Math.random() < 0.25) this._spawnMagicGlowWorm();
      }

      // Spider milestone color changes (100x / 500x / 1000x)
      if (this._serverMultiplier > 1) {
        const ml = this._serverMultiplier >= 1000 ? 3
                 : this._serverMultiplier >= 500  ? 2
                 : this._serverMultiplier >= 100  ? 1 : 0;
        if (ml !== this._spiderMilestoneLevel) {
          this._spiderMilestoneLevel = ml;
          this.spider?.setMilestoneLevel(ml);
        }
      }
    }

    // Persistent water — always rising; surges on crash
    if (this.serverMode && this.spider?.isAlive && !this.gameOver && !this._waterSurging) {
      const mult = this._serverMultiplier || 1;

      if (this._waterSurfaceY === null) this._waterSurfaceY = height * 0.88;

      let riseRate, floorY;
      if (this._crashSurge) {
        // Pipe burst: water rushes up at full speed — no safety gap
        riseRate = 600;
        floorY   = -200;
      } else {
        // Normal: slow crawl that tightens with multiplier
        // 1x → ~3px/s   10x → ~8px/s   50x → ~16px/s   100x → ~22px/s
        riseRate = 2 + Math.pow(Math.min(mult, 150), 0.65) * 0.9;
        // Safety gap keeps water just below spider until crash event
        const safeGap = Math.max(18, 65 - Math.min(mult, 47));
        floorY = height / 2 + safeGap;
      }

      this._waterSurfaceY = Math.max(floorY, this._waterSurfaceY - riseRate * delta / 1000);
      this._drawPersistentWater(this._waterSurfaceY);

      // Crash surge: kill spider the moment water reaches it
      if (this._crashSurge && this.spider?.isAlive) {
        const spiderScreenY = this.spider.sprite.y - this.cameras.main.scrollY;
        if (this._waterSurfaceY <= spiderScreenY + 24) {
          this._crashSurge = false;
          this.spider.die('flood');
          this._startCrashDrain();
        }
      }
    } else if (!this._waterSurging) {
      this._waterBg?.clear();
      this._waterFg?.clear();
    }

    // Magic tile bonus ramp: grow while worm is active, drain when it leaves
    if (this._magicWormActive) {
      this._magicTileBonus = Math.min(this._magicTileBonus + (4 * delta / 1000), 90);
    } else if (this._magicTileBonus > 0) {
      this._magicTileBonus = Math.max(0, this._magicTileBonus - (10 * delta / 1000));
    }

    // Win check
    if (tiles >= MAX_TILES) {
      this.gameOver = true;
      this.triggerWin();
      return;
    }

    // UI (offline only)
    if (!this.serverMode) {
      const multiplier = tileToMultiplier(tiles, this.glowWorms);
      this.scene.get('UIScene')?.events.emit('game:update', { tiles, multiplier, glowWorms: this.glowWorms });
    }
  }
}
