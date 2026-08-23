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

    // ── Pipe geometry ─────────────────────────────────────────────────────
    this.drawWorldBackground();
    this.drawPipeSeams();        // world space — scroll past spider
    this.drawPipeWalls();        // screen space — always visible

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
      this.serverMode  = true;
    });
    this.events.on('server:betting', () => this.resetSpiderToGround());
    this.events.on('server:playing',  () => { this.gameOver = false; this.serverMode = true; });
    this.events.on('server:crashed',  () => { if (this.spider.isAlive) this.triggerServerFlood(); });

    socket.connect('Player');
  }

  // ── World background — GREY pipe interior ──────────────────────────────

  drawWorldBackground() {
    const { width } = this.scale;
    const bg = this.add.graphics().setDepth(0);
    bg.fillStyle(0x111111, 1);
    bg.fillRect(0, -60000, width, 70000);
    // Slightly lighter interior channel
    bg.fillStyle(0x1c1c1c, 1);
    bg.fillRect(PIPE_WALL, -60000, width - PIPE_WALL * 2, 70000);
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
      const col = Phaser.Utils.Array.GetRandom([0x555555, 0x444444, 0x6a4020, 0x333333]);
      g.lineStyle(Phaser.Math.Between(1, 2), col, 0.15 + Math.random() * 0.25);
      g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + Phaser.Math.Between(-3, 3), sy + len); g.strokePath();
    }

    // Horizontal seams every 180 px — create sense of climbing
    for (let y = this.groundY; y > -60000; y -= 180) {
      // Dark seam band
      g.fillStyle(0x0a0a0a, 1);
      g.fillRect(innerL, y - 3, innerR - innerL, 6);
      // Metal rivets
      [innerL + 6, innerR - 6].forEach(rx => {
        g.fillStyle(0x555555, 1); g.fillCircle(rx, y, 4);
        g.fillStyle(0x999999, 0.5); g.fillCircle(rx - 1, y - 1, 1.5);
      });
    }

    // Centre groove
    g.lineStyle(1, 0x0f0f0f, 0.3);
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
    wL.fillStyle(0x2e2e2e, 1); wL.fillRect(0, 0, PIPE_WALL, height);
    // Inner edge — slightly lighter, worn metal
    wL.fillStyle(0x3a3a3a, 0.9); wL.fillRect(PIPE_WALL - 12, 0, 12, height);
    wL.fillStyle(0x4a4a4a, 0.4); wL.fillRect(PIPE_WALL - 4, 0, 4, height);
    // Rust stains down edge
    wL.fillStyle(0x6a3010, 0.15); wL.fillRect(PIPE_WALL - 8, 0, 8, height);

    const wR = this.add.graphics().setScrollFactor(0).setDepth(8);
    wR.fillStyle(0x2e2e2e, 1); wR.fillRect(width - PIPE_WALL, 0, PIPE_WALL, height);
    wR.fillStyle(0x3a3a3a, 0.9); wR.fillRect(width - PIPE_WALL, 0, 12, height);
    wR.fillStyle(0x4a4a4a, 0.4); wR.fillRect(width - PIPE_WALL, 0, 4, height);
    wR.fillStyle(0x6a3010, 0.15); wR.fillRect(width - PIPE_WALL, 0, 8, height);

    this.pipeInnerLeft  = PIPE_WALL;
    this.pipeInnerRight = width - PIPE_WALL;
  }

  // ── Ambient debris — drain pipe objects ────────────────────────────────

  spawnAmbientAnim() {
    if (!this.spider?.isAlive) return;
    const { width, height } = this.scale;
    const camera = this.cameras.main;
    const innerL = this.pipeInnerLeft  + 6;
    const innerR = this.pipeInnerRight - 6;

    // Weighted type selection
    const roll = Phaser.Math.Between(0, 99);
    const type = roll < 22 ? 0    // water drop
               : roll < 38 ? 1    // bubble
               : roll < 50 ? 2    // web fragment
               : roll < 62 ? 3    // rust/grey flake
               : roll < 70 ? 4    // quarter
               : roll < 77 ? 5    // chewed gum (falling piece)
               : roll < 84 ? 6    // fly
               : roll < 89 ? 7    // toilet paper
               : roll < 93 ? 8    // toothbrush tip
               : roll < 96 ? 9    // hair strand
               : 10;              // tooth

    const x = Phaser.Math.Between(innerL, innerR);

    if (type === 0) {
      // ── Water drop ──────────────────────────────────────────────────────
      const y = camera.scrollY - Phaser.Math.Between(10, 60);
      const drip = this.add.graphics().setDepth(4);
      drip.x = x; drip.y = y;
      drip.fillStyle(0x4488aa, 0.7); drip.fillEllipse(0, 0, 5, 11);
      this.tweens.add({
        targets: drip, y: camera.scrollY + height + 40,
        duration: Phaser.Math.Between(700, 1800), ease: 'Power1',
        onComplete: () => {
          drip.clear(); drip.fillStyle(0x4488aa, 0.25); drip.fillEllipse(0, 0, 16, 5);
          this.tweens.add({ targets: drip, scaleX: 2, scaleY: 0, alpha: 0, duration: 200, onComplete: () => drip.destroy() });
        },
      });

    } else if (type === 1) {
      // ── Bubble ──────────────────────────────────────────────────────────
      const y = camera.scrollY + height + Phaser.Math.Between(0, 40);
      const r = Phaser.Math.Between(3, 9);
      const bub = this.add.graphics().setDepth(4);
      bub.x = x; bub.y = y;
      bub.lineStyle(1, 0x77aacc, 0.45); bub.strokeCircle(0, 0, r);
      bub.fillStyle(0x77aacc, 0.08); bub.fillCircle(0, 0, r);
      this.tweens.add({
        targets: bub, y: camera.scrollY - 60, x: x + Phaser.Math.Between(-18, 18), alpha: 0,
        duration: Phaser.Math.Between(1800, 3800), ease: 'Sine.easeIn',
        onComplete: () => bub.destroy(),
      });

    } else if (type === 2) {
      // ── Web thread fragment ──────────────────────────────────────────────
      const y  = camera.scrollY - Phaser.Math.Between(10, 80);
      const dx = Phaser.Math.Between(-30, 30);
      const len = Phaser.Math.Between(18, 45);
      const web = this.add.graphics().setDepth(4);
      web.x = x; web.y = y;
      web.lineStyle(1, 0x888888, 0.3);
      web.beginPath(); web.moveTo(0, 0); web.lineTo(dx * 0.4, len * 0.5); web.lineTo(dx, len); web.strokePath();
      this.tweens.add({
        targets: web, y: camera.scrollY + height + 60, x: x + Phaser.Math.Between(-40, 40), alpha: 0,
        duration: Phaser.Math.Between(2200, 4500), ease: 'Linear',
        onComplete: () => web.destroy(),
      });

    } else if (type === 3) {
      // ── Rust/concrete flake ──────────────────────────────────────────────
      const y  = camera.scrollY - Phaser.Math.Between(5, 50);
      const sz = Phaser.Math.FloatBetween(1.5, 5);
      const col = Phaser.Utils.Array.GetRandom([0x666666, 0x555555, 0x886644, 0x777777]);
      const flake = this.add.graphics().setDepth(4);
      flake.x = x; flake.y = y;
      flake.fillStyle(col, 0.65); flake.fillRect(-sz / 2, -sz / 2, sz, sz);
      this.tweens.add({
        targets: flake, y: camera.scrollY + height + 50,
        x: x + Phaser.Math.Between(-35, 35), angle: Phaser.Math.Between(-180, 180), alpha: 0,
        duration: Phaser.Math.Between(1400, 3200), ease: 'Power1',
        onComplete: () => flake.destroy(),
      });

    } else if (type === 4) {
      // ── Quarter (coin) ───────────────────────────────────────────────────
      const y = camera.scrollY - Phaser.Math.Between(20, 80);
      const coin = this.add.graphics().setDepth(4);
      coin.x = x; coin.y = y;
      coin.fillStyle(0xb8b8b8, 1); coin.fillEllipse(0, 0, 22, 22);
      coin.fillStyle(0xd0d0d0, 1); coin.fillEllipse(-2, -2, 16, 16);
      coin.lineStyle(1, 0x888888, 0.7); coin.strokeCircle(0, 0, 11);
      coin.fillStyle(0xaaaaaa, 0.5); coin.fillEllipse(-1, 1, 8, 10);
      coin.fillStyle(0xffffff, 0.5); coin.fillEllipse(-4, -4, 4, 3);
      this.tweens.add({
        targets: coin, y: camera.scrollY + height + 60, x: x + Phaser.Math.Between(-25, 25),
        angle: Phaser.Math.Between(360, 720), alpha: 0,
        duration: Phaser.Math.Between(1200, 2800), ease: 'Power1',
        onComplete: () => coin.destroy(),
      });

    } else if (type === 5) {
      // ── Chewed gum (falling piece) ───────────────────────────────────────
      const y = camera.scrollY - Phaser.Math.Between(10, 60);
      const gum = this.add.graphics().setDepth(4);
      gum.x = x; gum.y = y;
      const c = Phaser.Utils.Array.GetRandom([0xdd88aa, 0xcc7799, 0xbbaa88, 0xaaaa99]);
      gum.fillStyle(c, 0.85);
      gum.fillEllipse(-4, 2, 16, 10); gum.fillEllipse(3, -3, 12, 8); gum.fillEllipse(-2, -2, 10, 12);
      gum.lineStyle(1.5, c, 0.6); gum.beginPath(); gum.moveTo(0, 8); gum.lineTo(3, 18); gum.strokePath();
      this.tweens.add({
        targets: gum, y: camera.scrollY + height + 40, x: x + Phaser.Math.Between(-8, 8), alpha: 0,
        duration: Phaser.Math.Between(2500, 4500), ease: 'Linear',
        onComplete: () => gum.destroy(),
      });

    } else if (type === 6) {
      // ── Fly ─────────────────────────────────────────────────────────────
      const startY = camera.scrollY + Phaser.Math.Between(50, height - 50);
      const fly = this.add.graphics().setDepth(5);
      fly.x = x; fly.y = startY;
      const drawFly = () => {
        fly.clear();
        fly.fillStyle(0x111111, 1); fly.fillEllipse(0, 0, 10, 6);
        fly.fillStyle(0xaaddee, 0.28); fly.fillEllipse(-6, -3, 10, 6);
        fly.fillStyle(0xaaddee, 0.28); fly.fillEllipse(6, -3, 10, 6);
        fly.fillStyle(0xcc1100, 0.9); fly.fillCircle(-2, -2, 2); fly.fillCircle(2, -2, 2);
      };
      drawFly();
      const baseX = x;
      let t = 0;
      this.tweens.add({
        targets: fly, y: camera.scrollY - 40,
        duration: Phaser.Math.Between(2800, 5000), ease: 'Linear',
        onUpdate: () => { t += 0.18; fly.x = baseX + Math.sin(t) * 28 + Math.sin(t * 2.3) * 12; drawFly(); },
        onComplete: () => fly.destroy(),
      });

    } else if (type === 7) {
      // ── Toilet paper wad ─────────────────────────────────────────────────
      const y = camera.scrollY - Phaser.Math.Between(20, 80);
      const tp = this.add.graphics().setDepth(4);
      tp.x = x; tp.y = y;
      tp.fillStyle(0xf0ece0, 0.9); tp.fillEllipse(0, 0, 22, 16);
      tp.fillStyle(0xe8e4d8, 0.85); tp.fillEllipse(-6, 4, 16, 12);
      tp.fillStyle(0xf4f0e4, 0.9); tp.fillEllipse(6, -3, 14, 11);
      tp.lineStyle(0.5, 0xccccbb, 0.4);
      tp.beginPath(); tp.moveTo(-8, 0); tp.lineTo(8, 2); tp.strokePath();
      tp.beginPath(); tp.moveTo(-5, 5); tp.lineTo(7, 4); tp.strokePath();
      this.tweens.add({
        targets: tp, y: camera.scrollY + height + 50, x: x + Phaser.Math.Between(-12, 12),
        angle: Phaser.Math.Between(-30, 30), alpha: 0,
        duration: Phaser.Math.Between(3000, 5500), ease: 'Linear',
        onComplete: () => tp.destroy(),
      });

    } else if (type === 8) {
      // ── Toothbrush tip ───────────────────────────────────────────────────
      const y = camera.scrollY - Phaser.Math.Between(10, 50);
      const tb = this.add.graphics().setDepth(4);
      tb.x = x; tb.y = y;
      const hcol = Phaser.Utils.Array.GetRandom([0x4488cc, 0xcc4488, 0x44cc88, 0xcc8844]);
      tb.fillStyle(hcol, 0.9); tb.fillRect(-4, -2, 8, 20);
      tb.fillStyle(0xeeeeee, 1); tb.fillRect(-5, -10, 10, 12);
      tb.lineStyle(1, 0xdddddd, 0.7);
      for (let bx = -4; bx <= 4; bx += 2) {
        tb.beginPath(); tb.moveTo(bx, -10); tb.lineTo(bx, -16); tb.strokePath();
      }
      this.tweens.add({
        targets: tb, y: camera.scrollY + height + 50, x: x + Phaser.Math.Between(-20, 20),
        angle: Phaser.Math.Between(-45, 45), alpha: 0,
        duration: Phaser.Math.Between(900, 2200), ease: 'Power2',
        onComplete: () => tb.destroy(),
      });

    } else if (type === 9) {
      // ── Hair strand ──────────────────────────────────────────────────────
      const y  = camera.scrollY - Phaser.Math.Between(20, 80);
      const len = Phaser.Math.Between(40, 110);
      const hair = this.add.graphics().setDepth(4);
      hair.x = x; hair.y = y;
      const hairCol = Phaser.Utils.Array.GetRandom([0x221a10, 0x443322, 0x888880, 0xeeeecc]);
      hair.lineStyle(1, hairCol, 0.7);
      // Wavy strand
      hair.beginPath(); hair.moveTo(0, 0);
      hair.lineTo(Phaser.Math.Between(-8, 8), len * 0.25);
      hair.lineTo(Phaser.Math.Between(-8, 8), len * 0.5);
      hair.lineTo(Phaser.Math.Between(-8, 8), len * 0.75);
      hair.lineTo(Phaser.Math.Between(-6, 6), len);
      hair.strokePath();
      this.tweens.add({
        targets: hair, y: camera.scrollY + height + 60, x: x + Phaser.Math.Between(-20, 20), alpha: 0,
        duration: Phaser.Math.Between(3500, 6000), ease: 'Linear',
        onComplete: () => hair.destroy(),
      });

    } else {
      // ── Tooth ────────────────────────────────────────────────────────────
      const y = camera.scrollY - Phaser.Math.Between(10, 60);
      const tooth = this.add.graphics().setDepth(4);
      tooth.x = x; tooth.y = y;
      // Crown (white oval)
      tooth.fillStyle(0xf5f0e0, 1); tooth.fillEllipse(0, -4, 12, 14);
      // Root (tapered below)
      tooth.fillStyle(0xe8e0cc, 1); tooth.fillTriangle(-4, 2, 4, 2, 1, 14);
      // Enamel lines
      tooth.lineStyle(0.5, 0xddddcc, 0.6);
      tooth.beginPath(); tooth.moveTo(-3, -6); tooth.lineTo(-3, 4); tooth.strokePath();
      tooth.beginPath(); tooth.moveTo(3, -6);  tooth.lineTo(3, 4);  tooth.strokePath();
      this.tweens.add({
        targets: tooth, y: camera.scrollY + height + 50, x: x + Phaser.Math.Between(-18, 18),
        angle: Phaser.Math.Between(-60, 60), alpha: 0,
        duration: Phaser.Math.Between(1000, 2500), ease: 'Power2',
        onComplete: () => tooth.destroy(),
      });
    }
  }

  // ── Bathroom sink opening (iris reveal) ─────────────────────────────────

  spawnBathroomOpening() {
    if (!this.spider?.isAlive || this.gameOver) return;
    const { width, height } = this.scale;
    const cx   = width / 2;
    const cy   = height * 0.45; // slightly above center
    const maxR = Math.min(width, height) * 0.32;

    const bathroomGfx = this.add.graphics().setScrollFactor(0).setDepth(22);
    const maskGfx     = this.make.graphics({ add: false });
    const mask        = maskGfx.createGeometryMask();
    bathroomGfx.setMask(mask);

    const proxy = { r: 0 };

    const drawBathroom = (r) => {
      maskGfx.clear();
      maskGfx.fillStyle(0xffffff, 1);
      maskGfx.fillCircle(cx, cy, r);

      bathroomGfx.clear();
      if (r < 1) return;

      // Checkerboard floor tiles
      const tSz = 26;
      for (let tx = cx - maxR; tx < cx + maxR + tSz; tx += tSz) {
        for (let ty = cy - maxR; ty < cy + maxR + tSz; ty += tSz) {
          const alt = (Math.floor((tx - cx + maxR) / tSz) + Math.floor((ty - cy + maxR) / tSz)) % 2;
          bathroomGfx.fillStyle(alt ? 0xe0d8cc : 0xf2ebe0, 1);
          bathroomGfx.fillRect(tx, ty, tSz, tSz);
        }
      }
      // Grout lines
      bathroomGfx.lineStyle(1, 0xb0a090, 0.5);
      for (let tx = cx - maxR; tx < cx + maxR + tSz; tx += tSz) {
        bathroomGfx.beginPath(); bathroomGfx.moveTo(tx, cy - maxR); bathroomGfx.lineTo(tx, cy + maxR); bathroomGfx.strokePath();
      }
      for (let ty = cy - maxR; ty < cy + maxR + tSz; ty += tSz) {
        bathroomGfx.beginPath(); bathroomGfx.moveTo(cx - maxR, ty); bathroomGfx.lineTo(cx + maxR, ty); bathroomGfx.strokePath();
      }

      // Warm ceiling glow (looking up)
      bathroomGfx.fillStyle(0xfff5cc, 0.2); bathroomGfx.fillCircle(cx, cy - maxR * 0.4, maxR * 0.55);
      bathroomGfx.fillStyle(0xffeeaa, 0.09); bathroomGfx.fillCircle(cx, cy - maxR * 0.4, maxR * 0.85);

      // Drain hole — looking up through it
      const dr = maxR * 0.11;
      bathroomGfx.fillStyle(0x1a1a1a, 1); bathroomGfx.fillCircle(cx, cy + maxR * 0.3, dr);
      bathroomGfx.lineStyle(2.5, 0x2a2a2a, 1);
      bathroomGfx.beginPath(); bathroomGfx.moveTo(cx - dr, cy + maxR * 0.3); bathroomGfx.lineTo(cx + dr, cy + maxR * 0.3); bathroomGfx.strokePath();
      bathroomGfx.beginPath(); bathroomGfx.moveTo(cx, cy + maxR * 0.3 - dr); bathroomGfx.lineTo(cx, cy + maxR * 0.3 + dr); bathroomGfx.strokePath();
      bathroomGfx.lineStyle(1.5, 0x2a2a2a, 0.7);
      [dr * -0.5, dr * 0.5].forEach(off => {
        bathroomGfx.beginPath(); bathroomGfx.moveTo(cx - dr, cy + maxR * 0.3 + off); bathroomGfx.lineTo(cx + dr, cy + maxR * 0.3 + off); bathroomGfx.strokePath();
      });

      // Rusty rim of the drain opening
      bathroomGfx.lineStyle(8, 0x4a3520, 0.9); bathroomGfx.strokeCircle(cx, cy, r);
      bathroomGfx.lineStyle(3, 0x6a5030, 0.5); bathroomGfx.strokeCircle(cx, cy, r - 5);
      bathroomGfx.lineStyle(2, 0x886644, 0.25); bathroomGfx.strokeCircle(cx, cy, r - 12);
    };

    // Iris open
    this.tweens.add({
      targets: proxy, r: maxR, duration: 1000, ease: 'Back.easeOut',
      onUpdate: () => drawBathroom(proxy.r),
      onComplete: () => {
        drawBathroom(maxR);
        // Hold 4-6s then close
        const holdMs = Phaser.Math.Between(4000, 7000);
        this.time.delayedCall(holdMs, () => {
          if (!bathroomGfx.scene) return;
          this.tweens.add({
            targets: proxy, r: 0, duration: 700, ease: 'Power2',
            onUpdate: () => drawBathroom(proxy.r),
            onComplete: () => { bathroomGfx.destroy(); maskGfx.destroy(); },
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

  // ── Server crash — JUMP SCARE + water surge ──────────────────────────────

  triggerServerFlood() {
    const { width, height } = this.scale;
    this._floodWarnActive = false; // cancel any warning

    // JUMP SCARE: immediate sound + violent shake + white flash
    sound.playJumpScareCrash();
    this.cameras.main.shake(900, 0.065);

    // Instant full-screen white flash (the scare)
    const flash = this.add.graphics().setScrollFactor(0).setDepth(25);
    flash.fillStyle(0xffffff, 1); flash.fillRect(0, 0, width, height);

    // Flash fades fast while water comes in behind it
    this.tweens.add({ targets: flash, alpha: 0, duration: 200, ease: 'Power2',
      onComplete: () => flash.destroy(),
    });

    // Water streams crash from top
    const streams = [];
    for (let i = 0; i < 8; i++) {
      const g = this.add.graphics().setScrollFactor(0).setDepth(17);
      const sx = (width / 8) * i + Phaser.Math.Between(-8, 8);
      const sw = Phaser.Math.Between(22, 52);
      g.fillStyle(0x1166ee, 0.48 + Math.random() * 0.38); g.fillRect(sx, 0, sw, height);
      g.setAlpha(0); streams.push(g);
      this.tweens.add({ targets: g, alpha: 1, duration: 180, delay: i * 22 });
    }

    // Full blue water surge slides down from top (the wave)
    const surge = this.add.graphics().setScrollFactor(0).setDepth(18);
    surge.fillStyle(0x0033bb, 0.92); surge.fillRect(0, 0, width, height);
    surge.y = -height;

    this.tweens.add({
      targets: surge, y: 0, duration: 340, delay: 80, ease: 'Power3',
      onComplete: () => {
        this.spider.die('flood');
        this.time.delayedCall(380, () => {
          this.tweens.add({
            targets: [...streams, surge], alpha: 0, duration: 1000,
            onComplete: () => { streams.forEach(g => g.destroy()); surge.destroy(); },
          });
        });
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
      this.tweens.add({ targets: winText, scaleX: { from: 0.5, to: 1.2 }, scaleY: { from: 0.5, to: 1.2 }, duration: 600, ease: 'Back.out' });
    });
  }

  // ── Reset for next server round ──────────────────────────────────────────

  resetSpiderToGround() {
    if (!this.spider) return;
    const { width, height } = this.scale;

    if (this._deathOverlays) {
      this._deathOverlays.forEach(o => o?.destroy());
      this._deathOverlays = [];
    }

    this.tweens.killTweensOf(this.spider.getBody());
    this.tweens.killTweensOf(this.spider.gfx);
    this.tweens.killTweensOf(this.spider.silkGfx);

    this.spider.getBody().setAlpha(1).setAngle(0);
    this.spider.gfx.setAlpha(1);
    this.spider.silkGfx.setAlpha(1);

    this.spider.isAlive         = true;
    this.spider.hoopSlipped     = false;
    this.spider.airTime         = 0;
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
  }

  // ── Auto climb (server mode) ─────────────────────────────────────────────

  autoClimbStep() {
    if (!this.serverMode || !this.spider.isAlive) return;
    const body = this.spider.getBody();
    const { width, height } = this.scale;
    const targetY = this.groundY - this.serverTiles * 10;
    const newY = Phaser.Math.Linear(body.y, targetY, 0.3);
    body.setPosition(width / 2, newY);
    body.setVelocity(0, 0);
    // Lock camera on spider — always centered, zero lag
    this.cameras.main.scrollY = body.y - height / 2;
  }

  // ── Main update ──────────────────────────────────────────────────────────

  update(time, delta) {
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

    // Ambient debris — two per burst every ~850 ms
    this._animTimer += delta;
    if (this._animTimer > 850) {
      this._animTimer = 0;
      this.spawnAmbientAnim();
      this.spawnAmbientAnim();
    }

    // Bathroom opening (more frequent — every 12-26s)
    this._bathroomTimer -= delta;
    if (this._bathroomTimer <= 0) {
      this._bathroomTimer = Phaser.Math.Between(14000, 28000);
      this.spawnBathroomOpening();
    }

    // Flash flood fake-out warnings (server/playing mode only)
    if (this.serverMode && this.spider?.isAlive) {
      this._floodWarnTimer -= delta;
      if (this._floodWarnTimer <= 0 && !this._floodWarnActive) {
        this._floodWarnTimer = Phaser.Math.Between(16000, 35000);
        this.triggerFloodWarning();
      }
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
