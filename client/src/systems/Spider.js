import { PLATFORM_TYPES } from './Platform';
import { sound } from './SoundManager';

export default class Spider {
  constructor(scene, x, y) {
    this.scene = scene;
    this.isAlive = true;
    this.onGround = false;
    this.currentPlatform = null;
    this.tileHeight = 0;
    this.startY = y;

    this.externalStunned = false; // set by HazardManager for shock stun

    // Physics body
    this.sprite = scene.physics.add.image(x, y, '__DEFAULT').setVisible(false);
    this.sprite.setCollideWorldBounds(false);
    this.sprite.setSize(36, 48);
    this.sprite.setDragX(600);
    this.sprite.setMaxVelocity(300, 900);

    // Visual representation — screen-space so they're never culled by camera
    this.gfx     = scene.add.graphics().setScrollFactor(0).setDepth(10);
    this.silkGfx = scene.add.graphics().setScrollFactor(0).setDepth(9);
    this.silkOriginY  = y;
    this.visualSlipY  = 0;  // screen-space offset applied during silk-slip animation
    this._milestoneLevel = 0; // 0=normal, 1=100x gold, 2=500x inferno, 3=1000x void
    this.drawSpider();

    // Input
    this.cursors = scene.input.keyboard.createCursorKeys();
    this.wasd = scene.input.keyboard.addKeys({ up: 'W', left: 'A', right: 'D' });
    this.setupTouchInput();

    // Track active touches for mobile
    this.touchLeft = false;
    this.touchRight = false;

    scene.events.on('update', this.update, this);
  }

  setupTouchInput() {
    const { width, height } = this.scene.scale;

    // Left zone (left 50% of screen)
    const leftZone = this.scene.add.zone(0, 0, width * 0.5, height)
      .setOrigin(0, 0).setInteractive();
    leftZone.on('pointerdown', () => { this.touchLeft = true; });
    leftZone.on('pointerup', () => { this.touchLeft = false; });
    leftZone.on('pointerout', () => { this.touchLeft = false; });

    // Right zone (right 50%)
    const rightZone = this.scene.add.zone(width * 0.5, 0, width * 0.5, height)
      .setOrigin(0, 0).setInteractive();
    rightZone.on('pointerdown', () => { this.touchRight = true; });
    rightZone.on('pointerup', () => { this.touchRight = false; });
    rightZone.on('pointerout', () => { this.touchRight = false; });
  }

  update() {
    if (!this.isAlive) return;

    // Stunned (shock) — no player control
    if (this.externalStunned) {
      this.drawSpider();
      return;
    }

    const leftDown  = this.cursors.left.isDown  || this.wasd.left.isDown  || this.touchLeft;
    const rightDown = this.cursors.right.isDown || this.wasd.right.isDown || this.touchRight;

    // Horizontal swing
    if (leftDown) {
      this.sprite.setVelocityX(-160);
    } else if (rightDown) {
      this.sprite.setVelocityX(160);
    }

    // Clamp spider inside pipe walls — half-body (18px) + wall thickness (68px)
    const PIPE_WALL = 68;
    const halfW = 18;
    const minX = PIPE_WALL + halfW;
    const maxX = this.scene.scale.width - PIPE_WALL - halfW;
    if (this.sprite.x < minX) {
      this.sprite.x = minX;
      this.sprite.setVelocityX(0);
    } else if (this.sprite.x > maxX) {
      this.sprite.x = maxX;
      this.sprite.setVelocityX(0);
    }

    // Slippery platform reduces drag
    if (this.currentPlatform?.platformType === PLATFORM_TYPES.SLIPPERY) {
      this.sprite.setDragX(80);
    } else {
      this.sprite.setDragX(600);
    }

    // Update tile height (how high spider has climbed)
    const climbedPixels = this.startY - this.sprite.y;
    this.tileHeight = Math.max(0, Math.floor(climbedPixels / 10));

    // Land sound
    if (this.onGround && this._wasAirborne) sound.playLand();
    this._wasAirborne = !this.onGround;

    // Update visuals
    this.drawSilk();
    this.drawSpider();
    this.checkFallDeath();
  }

  drawSilk() {
    const camera = this.scene.cameras.main;
    const sx = this.sprite.x - camera.scrollX;
    const sy = this.sprite.y - camera.scrollY + this.visualSlipY;
    this.silkGfx.clear();
    if (!this.isAlive) return;
    const vx = this.sprite.body?.velocity?.x ?? 0;
    const slipping = this.visualSlipY > 5;
    this.silkGfx.lineStyle(slipping ? 2.5 : 1.8, slipping ? 0xdddddd : 0xbbbbbb, slipping ? 0.65 : 0.5);

    // Pendulum arc — silk bows opposite to the swing direction
    const anchorX = sx;
    const anchorY = -60;
    const tipY    = sy - 14;
    const ctrlX   = sx - vx * 0.12;                        // lags behind motion
    const ctrlY   = anchorY + (tipY - anchorY) * 0.42;

    // Quadratic bezier approximated with 10 segments
    this.silkGfx.beginPath();
    this.silkGfx.moveTo(anchorX, anchorY);
    for (let i = 1; i <= 10; i++) {
      const t  = i / 10;
      const mt = 1 - t;
      this.silkGfx.lineTo(
        mt * mt * anchorX + 2 * mt * t * ctrlX + t * t * sx,
        mt * mt * anchorY + 2 * mt * t * ctrlY + t * t * tipY
      );
    }
    this.silkGfx.strokePath();
  }

  drawSpider() {
    const camera = this.scene.cameras.main;
    const sx = this.sprite.x - camera.scrollX;
    const sy = this.sprite.y - camera.scrollY + this.visualSlipY;
    const t  = this.scene.time.now;

    // Tilt body based on horizontal velocity — pendulum swing feel
    const vx = this.sprite.body?.velocity?.x ?? 0;
    this.gfx.setPosition(sx, sy);
    this.gfx.setAngle(Phaser.Math.Clamp(vx * 0.055, -22, 22));

    this.gfx.clear();
    // Draw relative to (0,0) — gfx is already positioned at spider center
    const x = 0;
    const y = 0;

    const stunned = this.externalStunned;
    let eyeColor, bodyColor, outlineColor;
    if (stunned) {
      eyeColor = 0xffff00; bodyColor = 0x1a1a00; outlineColor = 0xaaaa00;
    } else if (this._milestoneLevel >= 3) {
      // 1000x — void spider: pure black body, magenta aura, cyan eyes
      eyeColor = 0x00ffee; bodyColor = 0x000000; outlineColor = 0xff00cc;
    } else if (this._milestoneLevel >= 2) {
      // 500x — inferno spider: deep red, orange glow, white-hot eyes
      eyeColor = 0xffffff; bodyColor = 0x1a0000; outlineColor = 0xff6600;
    } else if (this._milestoneLevel >= 1) {
      // 100x — gilded spider: same body, gold outline and eyes
      eyeColor = 0xffcc00; bodyColor = 0x0d0520; outlineColor = 0xffaa00;
    } else {
      eyeColor = 0xff2200; bodyColor = 0x0d0520; outlineColor = 0x8800aa;
    }

    // Glow under body
    const pulse = 0.3 + Math.sin(t * 0.003) * 0.15;
    this.gfx.fillStyle(outlineColor, pulse * 0.4);
    this.gfx.fillEllipse(x, y + 2, 46, 20);

    // Abdomen (main body)
    this.gfx.fillStyle(bodyColor, 1);
    this.gfx.fillEllipse(x, y + 4, 38, 32);
    this.gfx.lineStyle(1.5, outlineColor, 0.9);
    this.gfx.strokeEllipse(x, y + 4, 38, 32);

    // Hourglass marking on abdomen
    this.gfx.fillStyle(0xff2200, 0.9);
    this.gfx.fillTriangle(x - 6, y, x + 6, y, x, y + 8);
    this.gfx.fillTriangle(x - 6, y + 10, x + 6, y + 10, x, y + 4);

    // Cephalothorax (head section)
    this.gfx.fillStyle(bodyColor, 1);
    this.gfx.fillEllipse(x, y - 16, 26, 20);
    this.gfx.lineStyle(1.5, outlineColor, 0.8);
    this.gfx.strokeEllipse(x, y - 16, 26, 20);

    // Eyes — cluster of 4 (widow has 8 but clustered)
    const eyePulse = 0.85 + Math.sin(t * 0.006) * 0.15;
    this.gfx.fillStyle(eyeColor, eyePulse);
    this.gfx.fillCircle(x - 6, y - 18, 4);
    this.gfx.fillCircle(x + 6, y - 18, 4);
    this.gfx.fillCircle(x - 3, y - 23, 2.5);
    this.gfx.fillCircle(x + 3, y - 23, 2.5);
    // Glint
    this.gfx.fillStyle(0xffffff, 0.7);
    this.gfx.fillCircle(x - 7, y - 19, 1.2);
    this.gfx.fillCircle(x + 5, y - 19, 1.2);

    // Chelicerae (fangs)
    this.gfx.fillStyle(0x440022, 1);
    this.gfx.fillTriangle(x - 5, y - 26, x - 2, y - 26, x - 4, y - 31);
    this.gfx.fillTriangle(x + 5, y - 26, x + 2, y - 26, x + 4, y - 31);

    // Legs — animated walk cycle
    const speed = Math.abs(this.sprite.body?.velocity?.x ?? 0);
    const freq = this.onGround ? 0.012 + speed * 0.00005 : 0.005;
    const w = Math.sin(t * freq);
    this.gfx.lineStyle(2, outlineColor, 0.85);

    const legDefs = [
      // [attachX, attachY, midDX, midDY, tipDX, tipDY, phaseOffset]
      [-13, -10, -28, -28, -46, -16, 0],
      [-13, -6,  -30, -4,  -50,  4,  0.5],
      [-13,  2,  -28, 14,  -46, 28, -0.5],
      [-13,  8,  -24, 26,  -40, 42,  1.0],
      [ 13, -10,  28, -28,  46, -16, 0.2],
      [ 13, -6,   30, -4,   50,  4,  0.7],
      [ 13,  2,   28, 14,   46, 28, -0.3],
      [ 13,  8,   24, 26,   40, 42,  1.2],
    ];

    legDefs.forEach(([ax, ay, mx, my, tx, ty, phase]) => {
      const wave = w * 6 * Math.cos(phase * Math.PI);
      const elbowX = x + mx + (mx < 0 ? -wave : wave) * 0.3;
      const elbowY = y + my + wave;
      const tipX = x + tx + (tx < 0 ? -wave : wave) * 0.5;
      const tipY = y + ty + wave;
      this.gfx.beginPath();
      this.gfx.moveTo(x + ax, y + ay);
      this.gfx.lineTo(elbowX, elbowY);
      this.gfx.strokePath();
      this.gfx.lineStyle(1.5, outlineColor, 0.6);
      this.gfx.beginPath();
      this.gfx.moveTo(elbowX, elbowY);
      this.gfx.lineTo(tipX, tipY);
      this.gfx.strokePath();
      this.gfx.lineStyle(2, outlineColor, 0.85);
    });

    // Spinnerets (web-spinning organs at back)
    this.gfx.fillStyle(bodyColor, 1);
    this.gfx.fillEllipse(x, y + 20, 12, 8);
  }

  setMilestoneLevel(level) {
    this._milestoneLevel = level;
  }

  setStunned(isStunned) {
    this.externalStunned = isStunned;
  }

  setOnGround(platform) {
    this.onGround = true;
    this.currentPlatform = platform;
  }

  setAirborne() {
    if (this.sprite.body?.velocity?.y < 0) {
      this.onGround = false;
      this.currentPlatform = null;
    }
  }

  checkFallDeath() {
    const camera = this.scene.cameras.main;
    if (this.sprite.y > camera.scrollY + this.scene.scale.height + 100) {
      this.die('fall');
    }
  }

  die(cause) {
    if (!this.isAlive) return;
    this.isAlive = false;
    this.scene.events.emit('spider:died', cause);

    if (cause === 'flood') {
      // Silk snaps instantly as thread breaks under water force
      this.scene.tweens.add({ targets: this.silkGfx, alpha: 0, duration: 80 });
      // Spider gfx swept straight down by the rushing water, then fades
      this.scene.tweens.add({
        targets: this.gfx,
        y: `+=380`,
        alpha: 0,
        duration: 650,
        ease: 'Power3',
      });
      // Physics body follows (camera already frozen)
      this.scene.tweens.add({
        targets: this.sprite,
        y: this.sprite.y + 380,
        alpha: 0,
        duration: 650,
        ease: 'Power3',
      });
    } else {
      // Standard spin + fall for non-flood deaths
      this.scene.tweens.add({
        targets: this.sprite,
        angle: 720, alpha: 0, y: this.sprite.y + 200, duration: 800, ease: 'Power2',
      });
      this.scene.tweens.add({ targets: this.gfx, alpha: 0, duration: 800 });
      this.scene.tweens.add({ targets: this.silkGfx, alpha: 0, duration: 300 });
    }
  }

  getTileHeight() {
    return this.tileHeight;
  }

  getPosition() {
    return { x: this.sprite.x, y: this.sprite.y };
  }

  getBody() {
    return this.sprite;
  }

  destroy() {
    this.scene.events.off('update', this.update, this);
    this.gfx.destroy();
    this.silkGfx.destroy();
    this.sprite.destroy();
  }
}
