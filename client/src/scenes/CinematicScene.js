// One-time cinematic intro: spider falls into a drain, water rises, spider shoots web
import Phaser from 'phaser';
import { sound } from '../systems/SoundManager';

const PIPE_WALL = 72;

export default class CinematicScene extends Phaser.Scene {
  constructor() {
    super({ key: 'CinematicScene' });
  }

  create() {
    const { width, height } = this.scale;
    this._done = false;

    // Spider state — starts just inside the grate, immediately visible
    this._spiderX   = width / 2;
    this._spiderY   = 48;
    this._scared    = false;
    this._silkTop   = 2;   // silk anchored at grate from frame 1
    this._silkVis   = true;

    // Water state
    this._waterY    = height + 40;  // starts below screen

    // Graphics layers
    this._drawPipe(width, height);

    this._silkGfx  = this.add.graphics().setDepth(14);
    this._spiderGfx = this.add.graphics().setDepth(15);
    this._waterBg  = this.add.graphics().setDepth(6);
    this._waterFg  = this.add.graphics().setDepth(7);

    this._drawDrain(width);

    // Skip button
    const skip = this.add.text(width - 16, 16, 'SKIP ›', {
      fontSize: '14px', color: '#555555',
    }).setOrigin(1, 0).setInteractive({ useHandCursor: true }).setDepth(30);
    skip.on('pointerover', () => skip.setColor('#aaaaaa'));
    skip.on('pointerout',  () => skip.setColor('#555555'));
    skip.on('pointerdown', () => this._goToMenu());

    // Drive animation in update
    this.events.on('update', this._tick, this);

    // Start cinematic theme — slight delay so the AudioContext is ready
    this.time.delayedCall(200, () => sound.startCinematicMusic());

    this._runSequence(width, height);
  }

  // ── Per-frame draw ─────────────────────────────────────────────────────────

  _tick() {
    if (this._done) return;
    this._drawWater(this._waterY);
    this._drawSpider(this._spiderX, this._spiderY, this._scared);
    if (this._silkVis) this._drawSilk(this._spiderX, this._spiderY, this._silkTop);
  }

  // ── Scene drawing ──────────────────────────────────────────────────────────

  _drawPipe(width, height) {
    const bg = this.add.graphics().setDepth(0);
    bg.fillStyle(0x3a3a3a, 1);
    bg.fillRect(0, 0, width, height);
    // Grey interior
    bg.fillStyle(0x888888, 1);
    bg.fillRect(PIPE_WALL, 0, width - PIPE_WALL * 2, height);
    bg.fillStyle(0x606060, 0.2);
    bg.fillRect(width / 2 - 18, 0, 36, height);

    // Walls
    const w = this.add.graphics().setDepth(8);
    w.fillStyle(0x686868, 1); w.fillRect(0, 0, PIPE_WALL, height);
    w.fillStyle(0x909090, 0.9); w.fillRect(PIPE_WALL - 12, 0, 12, height);
    w.fillStyle(0x686868, 1); w.fillRect(width - PIPE_WALL, 0, PIPE_WALL, height);
    w.fillStyle(0x909090, 0.9); w.fillRect(width - PIPE_WALL, 0, 12, height);

    // Pipe seam rings
    const s = this.add.graphics().setDepth(3);
    for (let y = height - 60; y > -20; y -= 190) {
      s.fillStyle(0x444444, 1);
      s.fillRect(PIPE_WALL, y - 3, width - PIPE_WALL * 2, 6);
      [PIPE_WALL + 8, width - PIPE_WALL - 8].forEach(rx => {
        s.fillStyle(0x777777, 1); s.fillCircle(rx, y, 4);
        s.fillStyle(0xcccccc, 0.4); s.fillCircle(rx - 1, y - 1, 1.5);
      });
    }
    // Wall rust streaks
    for (let i = 0; i < 14; i++) {
      const left = i % 2 === 0;
      const sx = left ? Phaser.Math.Between(PIPE_WALL, PIPE_WALL + 20) : Phaser.Math.Between(width - PIPE_WALL - 20, width - PIPE_WALL);
      const sy = Phaser.Math.Between(0, height);
      s.lineStyle(1, 0x666666, 0.22);
      s.beginPath(); s.moveTo(sx, sy); s.lineTo(sx, sy + Phaser.Math.Between(10, 45)); s.strokePath();
    }
  }

  _drawDrain(width) {
    // Circular drain grate at top — where spider falls through
    const g = this.add.graphics().setDepth(22);
    const cx = width / 2;
    const cy = 0;
    const r  = 56;

    // Dark void behind grate
    g.fillStyle(0x080808, 1);
    g.fillCircle(cx, cy, r);

    // Faint daylight glow through grate
    g.fillStyle(0xe8dfc0, 0.10);
    g.fillCircle(cx, cy, r - 6);

    // Grate bars — horizontal
    g.lineStyle(4, 0x404040, 0.95);
    for (let i = -3; i <= 3; i++) {
      const barY = cy + i * 14;
      const hw = Math.sqrt(Math.max(0, (r - 3) ** 2 - (barY - cy) ** 2));
      if (hw > 2) {
        g.beginPath(); g.moveTo(cx - hw, barY); g.lineTo(cx + hw, barY); g.strokePath();
      }
    }
    // Grate bars — vertical
    for (let i = -3; i <= 3; i++) {
      const barX = cx + i * 14;
      const hh = Math.sqrt(Math.max(0, (r - 3) ** 2 - (barX - cx) ** 2));
      if (hh > 2) {
        g.beginPath(); g.moveTo(barX, cy - hh); g.lineTo(barX, cy + hh); g.strokePath();
      }
    }
    // Ring
    g.lineStyle(7, 0x555555, 1); g.strokeCircle(cx, cy, r);
    g.lineStyle(3, 0x909090, 0.45); g.strokeCircle(cx, cy, r - 8);
  }

  // ── Spider draw (procedural, same style as in-game) ───────────────────────

  _drawSpider(x, y, scared) {
    const g = this._spiderGfx;
    g.clear();

    const t = this.time.now;
    const eyeColor     = scared ? 0xffcc00 : 0xff2200;
    const outlineColor = scared ? 0xffaa00 : 0xaa00dd;
    const bodyColor    = 0x1a0a30;

    // Glow — large halo so spider is clearly visible against grey pipe
    const pulse = 0.45 + Math.sin(t * 0.003) * 0.15;
    g.fillStyle(outlineColor, pulse * 0.55);
    g.fillEllipse(x, y + 2, 56, 26);

    // Abdomen
    g.fillStyle(bodyColor, 1); g.fillEllipse(x, y + 4, 38, 32);
    g.lineStyle(1.5, outlineColor, 0.9); g.strokeEllipse(x, y + 4, 38, 32);

    // Hourglass
    g.fillStyle(0xff2200, 0.9);
    g.fillTriangle(x - 6, y, x + 6, y, x, y + 8);
    g.fillTriangle(x - 6, y + 10, x + 6, y + 10, x, y + 4);

    // Cephalothorax
    g.fillStyle(bodyColor, 1); g.fillEllipse(x, y - 16, 26, 20);
    g.lineStyle(1.5, outlineColor, 0.8); g.strokeEllipse(x, y - 16, 26, 20);

    // Eyes
    const ep = 0.85 + Math.sin(t * 0.007) * 0.15;
    g.fillStyle(eyeColor, ep);
    g.fillCircle(x - 6, y - 18, 4); g.fillCircle(x + 6, y - 18, 4);
    g.fillCircle(x - 3, y - 23, 2.5); g.fillCircle(x + 3, y - 23, 2.5);
    g.fillStyle(0xffffff, 0.7);
    g.fillCircle(x - 7, y - 19, 1.2); g.fillCircle(x + 5, y - 19, 1.2);

    // Fangs
    g.fillStyle(0x440022, 1);
    g.fillTriangle(x - 5, y - 26, x - 2, y - 26, x - 4, y - 31);
    g.fillTriangle(x + 5, y - 26, x + 2, y - 26, x + 4, y - 31);

    // Legs
    const freq = scared ? 0.025 : 0.012;
    const w = Math.sin(t * freq);
    g.lineStyle(2, outlineColor, 0.85);
    const defs = scared
      ? [ [-13,-10,-34,-38,-54,-22,0],[-13,-6,-36,-2,-58,8,0.5],[-13,2,-32,18,-52,36,-0.5],[-13,8,-28,30,-44,50,1.0],
          [13,-10,34,-38,54,-22,0.2],[13,-6,36,-2,58,8,0.7],[13,2,32,18,52,36,-0.3],[13,8,28,30,44,50,1.2] ]
      : [ [-13,-10,-28,-28,-46,-16,0],[-13,-6,-30,-4,-50,4,0.5],[-13,2,-28,14,-46,28,-0.5],[-13,8,-24,26,-40,42,1.0],
          [13,-10,28,-28,46,-16,0.2],[13,-6,30,-4,50,4,0.7],[13,2,28,14,46,28,-0.3],[13,8,24,26,40,42,1.2] ];
    defs.forEach(([ax,ay,mx,my,tx,ty,phase]) => {
      const wave = w * 6 * Math.cos(phase * Math.PI);
      const ex = x + mx + (mx < 0 ? -wave : wave) * 0.3;
      const ey = y + my + wave;
      g.beginPath(); g.moveTo(x + ax, y + ay); g.lineTo(ex, ey); g.strokePath();
      g.lineStyle(1.5, outlineColor, 0.6);
      g.beginPath(); g.moveTo(ex, ey); g.lineTo(x + tx + (tx < 0 ? -wave : wave) * 0.5, y + ty + wave); g.strokePath();
      g.lineStyle(2, outlineColor, 0.85);
    });

    // Spinnerets
    g.fillStyle(bodyColor, 1); g.fillEllipse(x, y + 20, 12, 8);
  }

  // ── Silk draw ───────────────────────────────────────────────────────────────

  _drawSilk(x, spiderY, anchorY) {
    const g = this._silkGfx;
    g.clear();
    if (anchorY >= spiderY - 14) return;
    g.lineStyle(2.5, 0xdddddd, 0.80);
    g.beginPath();
    g.moveTo(this.scale.width / 2, anchorY);  // anchor always at pipe center top
    g.lineTo(x, spiderY - 14);
    g.strokePath();
  }

  // ── Water draw ─────────────────────────────────────────────────────────────

  _drawWater(surfaceY) {
    const { width, height } = this.scale;
    const innerW = width - PIPE_WALL * 2;
    const t = this.time.now * 0.003;

    this._waterBg.clear();
    this._waterBg.fillStyle(0x000c22, 0.92);
    this._waterBg.fillRect(PIPE_WALL, surfaceY, innerW, height - surfaceY + 4);

    this._waterFg.clear();
    if (surfaceY >= height) return;
    this._waterFg.fillStyle(0x0d3d99, 0.80);
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

  // ── Cinematic sequence ─────────────────────────────────────────────────────

  _runSequence(width, height) {
    const restY = height * 0.42;  // where spider hangs after descent

    // ── 0.3s: Dust motes fall through grate ──────────────────────────────
    this.time.delayedCall(300, () => {
      for (let i = 0; i < 10; i++) {
        this.time.delayedCall(i * 55, () => {
          const d = this.add.graphics().setDepth(16);
          d.fillStyle(0x999999, 0.55);
          d.fillCircle(0, 0, Phaser.Math.Between(2, 5));
          d.x = width / 2 + Phaser.Math.Between(-28, 28);
          d.y = 10;
          this.tweens.add({
            targets: d, y: d.y + Phaser.Math.Between(35, 80), alpha: 0,
            duration: Phaser.Math.Between(350, 650), ease: 'Power1',
            onComplete: () => d.destroy(),
          });
        });
      }
    });

    // ── 0.5s: Spider descends the pipe on silk ────────────────────────────
    // All tweens use a proxy object — tweening scene props directly is unreliable
    this.time.delayedCall(500, () => {
      const py = { v: 48 };                     // proxy for _spiderY
      this.tweens.add({
        targets: py, v: restY,
        duration: 2000, ease: 'Linear',          // steady descent, clearly visible
        onUpdate: () => { this._spiderY = py.v; },
        onComplete: () => {
          // Silk snaps taut — elastic bob: drop, spring up, settle
          this.tweens.add({
            targets: py, v: restY + 30,
            duration: 190, ease: 'Power2',
            onUpdate: () => { this._spiderY = py.v; },
            onComplete: () => {
              this.tweens.add({
                targets: py, v: restY - 10,
                duration: 140, ease: 'Power2',
                onUpdate: () => { this._spiderY = py.v; },
                onComplete: () => {
                  this.tweens.add({
                    targets: py, v: restY + 4,
                    duration: 100, ease: 'Sine.easeOut',
                    onUpdate: () => { this._spiderY = py.v; },
                    onComplete: () => {
                      this._spiderY = restY;
                      // Pendulum sway — spider swings on the thread
                      const px = { v: width / 2 };
                      this.tweens.add({
                        targets: px, v: width / 2 + 14,
                        duration: 360, ease: 'Sine.easeInOut', yoyo: true,
                        onUpdate: () => { this._spiderX = px.v; },
                        onComplete: () => {
                          this.tweens.add({
                            targets: px, v: width / 2 - 10,
                            duration: 280, ease: 'Sine.easeInOut', yoyo: true,
                            onUpdate: () => { this._spiderX = px.v; },
                            onComplete: () => { this._spiderX = width / 2; },
                          });
                        },
                      });
                    },
                  });
                },
              });
            },
          });
        },
      });
    });

    // ── 3.0s: Water seeps up from below ───────────────────────────────────
    this.time.delayedCall(3000, () => {
      const pw = { v: height + 40 };
      this.tweens.add({
        targets: pw, v: height * 0.80,
        duration: 1400, ease: 'Sine.easeIn',
        onUpdate: () => { this._waterY = pw.v; },
      });
    });

    // ── 4.0s: Spider spots water — scared, tugs upward ────────────────────
    this.time.delayedCall(4000, () => {
      this._scared = true;
      const py = { v: restY };
      this.tweens.add({
        targets: py, v: restY - 22,
        duration: 120, ease: 'Power3', yoyo: true,
        onUpdate: () => { this._spiderY = py.v; },
        onComplete: () => { this._spiderY = restY; },
      });
    });

    // ── 4.7s: Water surges faster ─────────────────────────────────────────
    this.time.delayedCall(4700, () => {
      const pw = { v: this._waterY };
      this.tweens.add({
        targets: pw, v: height * 0.58,
        duration: 1300, ease: 'Power2',
        onUpdate: () => { this._waterY = pw.v; },
      });
    });

    // ── 5.4s: Spider panics — second climb tug + sway ─────────────────────
    this.time.delayedCall(5400, () => {
      const py = { v: restY };
      this.tweens.add({
        targets: py, v: restY - 32,
        duration: 170, ease: 'Power3', yoyo: true,
        onUpdate: () => { this._spiderY = py.v; },
        onComplete: () => {
          this._spiderY = restY;
          const px = { v: width / 2 };
          this.tweens.add({
            targets: px, v: width / 2 - 18,
            duration: 240, ease: 'Sine.easeOut', yoyo: true,
            onUpdate: () => { this._spiderX = px.v; },
            onComplete: () => { this._spiderX = width / 2; },
          });
        },
      });
    });

    // ── 6.0s: Title fades in ──────────────────────────────────────────────
    this.time.delayedCall(6000, () => {
      const titleBg = this.add.rectangle(width / 2, height * 0.12, width - 24, 90, 0x000000, 0)
        .setDepth(24);
      this.tweens.add({ targets: titleBg, alpha: 0.65, duration: 600 });

      const title = this.add.text(width / 2, height * 0.09, 'WIDOW SPIDER', {
        fontSize: '36px', fontFamily: 'Arial Black, sans-serif',
        color: '#ff2200', stroke: '#000000', strokeThickness: 6,
        shadow: { offsetX: 2, offsetY: 2, color: '#cc0000', blur: 10, fill: true },
      }).setOrigin(0.5).setDepth(25).setAlpha(0);

      const sub = this.add.text(width / 2, height * 0.165, 'MULTIPLIER', {
        fontSize: '24px', fontFamily: 'Arial Black, sans-serif',
        color: '#ffffff', stroke: '#000000', strokeThickness: 4,
      }).setOrigin(0.5).setDepth(25).setAlpha(0);

      const tag = this.add.text(width / 2, height * 0.215, 'climb. survive. cash out.', {
        fontSize: '13px', fontFamily: 'Arial, sans-serif',
        color: '#aaaaaa', fontStyle: 'italic',
      }).setOrigin(0.5).setDepth(25).setAlpha(0);

      this.tweens.add({ targets: title, alpha: 1, y: height * 0.09 - 4, duration: 700, ease: 'Power2' });
      this.tweens.add({ targets: sub,   alpha: 1, duration: 600, delay: 200 });
      this.tweens.add({ targets: tag,   alpha: 1, duration: 600, delay: 500 });
    });

    // ── 9.5s: Fade to main menu ───────────────────────────────────────────
    this.time.delayedCall(9500, () => this._goToMenu());
  }

  // ── Transition ─────────────────────────────────────────────────────────────

  _goToMenu() {
    if (this._done) return;
    this._done = true;
    sound.stopCinematicMusic(0.6);
    this.cameras.main.fadeOut(600, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('IntroScene');
    });
  }

  shutdown() {
    this.events.off('update', this._tick, this);
    sound.stopCinematicMusic(0.3);
  }
}
