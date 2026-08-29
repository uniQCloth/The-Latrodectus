import { PLATFORM_TYPES } from './Platform';
import { sound } from './SoundManager';

export default class Spider {
  constructor(scene, x, y) {
    this.scene = scene;
    this.isAlive = true;
    this._milestoneLevel = 0;
    this.fixedY = y;
    this.visualSlipY = 0;
    this.dropOffset = 0;
    this._dropDir = 0;
    this._dropTimer = 0;
    this._dropInterval = Phaser.Math.Between(3000, 6000);
    this._dropDuration = 0;
    this._isDropping = false;
    this._swingDir = 1;
    this._swingAmount = 0;
    this._swingSpeed = 0;

    this.externalStunned = false;
    this._knockedOff = false;
    this._knockTimer = 0;
    this._knockVelocityX = 0;
    this._knockVelocityY = 0;

    this.sprite = scene.physics.add.image(x, y, '__DEFAULT').setVisible(false);
    this.sprite.setCollideWorldBounds(false);
    this.sprite.setSize(36, 48);
    this.sprite.setDragX(350);
    this.sprite.setMaxVelocity(300, 900);

    this.gfx = scene.add.graphics().setScrollFactor(0).setDepth(10);
    this.silkGfx = scene.add.graphics().setScrollFactor(0).setDepth(9);

    this.drawSpider();

    this.cursors = scene.input.keyboard.createCursorKeys();
    this.wasd = scene.input.keyboard.addKeys({ up: 'W', left: 'A', right: 'D' });
    this.setupTouchInput();

    this.touchLeft = false;
    this.touchRight = false;

    scene.events.on('update', this.update, this);
  }

  setupTouchInput() {
    const { width, height } = this.scene.scale;

    const leftZone = this.scene.add.zone(0, 0, width * 0.5, height)
      .setOrigin(0, 0).setInteractive();
    leftZone.on('pointerdown', () => { this.touchLeft = true; });
    leftZone.on('pointerup', () => { this.touchLeft = false; });
    leftZone.on('pointerout', () => { this.touchLeft = false; });

    const rightZone = this.scene.add.zone(width * 0.5, 0, width * 0.5, height)
      .setOrigin(0, 0).setInteractive();
    rightZone.on('pointerdown', () => { this.touchRight = true; });
    rightZone.on('pointerup', () => { this.touchRight = false; });
    rightZone.on('pointerout', () => { this.touchRight = false; });
  }

  startDropCycle() {
    this._dropInterval = Phaser.Math.Between(3000, 6000);
    this._dropTimer = this._dropInterval;
    this._isDropping = false;
    this._dropDir = 0;
    this._dropDuration = 0;
  }

  knockOffScreen() {
    this._knockedOff = true;
    const { width, height } = this.scene.scale;
    this._knockVelocityX = this._swingDir > 0 ? Phaser.Math.Between(400, 700) : Phaser.Math.Between(-700, -400);
    this._knockVelocityY = Phaser.Math.Between(-200, -100);
    this.sprite.setVelocity(this._knockVelocityX, this._knockVelocityY);
    this.sprite.setAngle(Phaser.Math.Between(-30, 30));
    this.scene.tweens.add({ targets: this.silkGfx, alpha: 0, duration: 200 });
    this.scene.tweens.add({ targets: this.gfx, alpha: 0, duration: 200 });
  }

  isOffScreen() {
    const { width, height } = this.scene.scale;
    return this.sprite.x < -100 || this.sprite.x > width + 100 || this.sprite.y < -200 || this.sprite.y > height + 200;
  }

  update() {
    if (!this.isAlive) return;

    if (this._knockedOff) {
      this.drawSpider();
      this._knockTimer += 16;
      if (this.isOffScreen()) {
        this.scene.events.emit('spider:knocked');
        this._knockedOff = false;
      }
      return;
    }

    if (this.externalStunned) {
      this.drawSpider();
      return;
    }

    const leftDown = this.cursors.left.isDown || this.wasd.left.isDown || this.touchLeft;
    const rightDown = this.cursors.right.isDown || this.wasd.right.isDown || this.touchRight;

    if (leftDown) {
      this._swingDir = -1;
      this.sprite.setAccelerationX(-1600);
    } else if (rightDown) {
      this._swingDir = 1;
      this.sprite.setAccelerationX(1600);
    } else {
      this.sprite.setAccelerationX(0);
    }

    const { width } = this.scene.scale;
    const PIPE_WALL = 68;
    const halfW = 18;
    const minX = PIPE_WALL + halfW;
    const maxX = width - PIPE_WALL - halfW;

    if (this.sprite.x < minX) {
      this.sprite.x = minX;
      this.sprite.setVelocityX(0);
      this._swingDir = 1;
    } else if (this.sprite.x > maxX) {
      this.sprite.x = maxX;
      this.sprite.setVelocityX(0);
      this._swingDir = -1;
    }

    if (this.currentPlatform?.platformType === PLATFORM_TYPES.SLIPPERY) {
      this.sprite.setDragX(40);
    } else {
      this.sprite.setDragX(350);
    }

    // Pendulum swing — velocity-based sway
    const vx = this.sprite.body?.velocity?.x ?? 0;
    this._swingAmount = Phaser.Math.Clamp(vx * 0.08, -25, 25);

    // Periodic drop toward water then return to center
    this._dropTimer -= 16;
    if (!this._isDropping && this._dropTimer <= 0) {
      this._isDropping = true;
      this._dropDir = 1;
      this._dropDuration = 0;
      sound.playSlip();
    }
    if (this._isDropping) {
      this._dropDuration += 16;
      const dropDistance = 55;
      const dropSpeed = 380;
      const progress = Math.min(this._dropDuration / dropSpeed, 1);
      if (this._dropDir === 1) {
        this.dropOffset = Phaser.Math.Linear(0, dropDistance, progress);
        if (progress >= 1) { this._dropDir = -1; this._dropDuration = 0; }
      } else {
        this.dropOffset = Phaser.Math.Linear(dropDistance, 0, progress);
        if (progress >= 1) {
          this.dropOffset = 0;
          this._isDropping = false;
          this.startDropCycle();
        }
      }
    }

    const targetY = this.fixedY + this.dropOffset;
    const currentY = this.sprite.y;
    if (Math.abs(currentY - targetY) > 1) {
      this.sprite.y = Phaser.Math.Linear(currentY, targetY, 0.15);
    } else {
      this.sprite.y = targetY;
    }

    this.visualSlipY = this._swingAmount;

    this.drawSilk();
    this.drawSpider();
  }

  drawSilk() {
    const sx = this.sprite.x;
    const sy = this.sprite.y + this.visualSlipY;
    this.silkGfx.clear();
    if (!this.isAlive) return;

    // Long web string from spider up to the top of the visible pipe
    const anchorX = sx;
    const anchorY = sy - 70;
    const tipX = sx;
    const tipY = sy - 14;

    // Pendulum sway based on swing direction and velocity
    const vx = this.sprite.body?.velocity?.x ?? 0;
    const sway = Math.sin(this.scene.time.now * 0.003) * 5 + vx * 0.03;
    const ctrlX = sx + sway;
    const ctrlY = anchorY + 12;

    this.silkGfx.lineStyle(2, 0xbbbbbb, 0.7);
    this.silkGfx.beginPath();
    this.silkGfx.moveTo(anchorX, anchorY);
    for (let i = 1; i <= 14; i++) {
      const t = i / 14;
      const mt = 1 - t;
      const x = mt * mt * anchorX + 2 * mt * t * ctrlX + t * t * tipX;
      const y = mt * mt * anchorY + 2 * mt * t * ctrlY + t * t * tipY;
      this.silkGfx.lineTo(x, y);
    }
    this.silkGfx.strokePath();

    // Web strand detail
    this.silkGfx.lineStyle(0.8, 0xcccccc, 0.4);
    this.silkGfx.beginPath();
    this.silkGfx.moveTo(anchorX, anchorY + 5);
    this.silkGfx.lineTo(tipX, tipY - 2);
    this.silkGfx.strokePath();
  }

  drawSpider() {
    const sx = this.sprite.x;
    const sy = this.sprite.y + this.visualSlipY;
    const t = this.scene.time.now;
    const vx = this.sprite.body?.velocity?.x ?? 0;

    this.gfx.setPosition(sx, sy);
    this.gfx.setAngle(Phaser.Math.Clamp(vx * 0.055, -25, 25));

    this.gfx.clear();
    const x = 0;
    const y = 0;

    const stunned = this.externalStunned;
    let eyeColor, bodyColor, outlineColor;
    if (stunned) {
      eyeColor = 0xffff00; bodyColor = 0x1a1a00; outlineColor = 0xaaaa00;
    } else if (this._milestoneLevel >= 3) {
      eyeColor = 0x00ffee; bodyColor = 0x000000; outlineColor = 0xff00cc;
    } else if (this._milestoneLevel >= 2) {
      eyeColor = 0xffffff; bodyColor = 0x1a0000; outlineColor = 0xff6600;
    } else if (this._milestoneLevel >= 1) {
      eyeColor = 0xffcc00; bodyColor = 0x0d0520; outlineColor = 0xffaa00;
    } else {
      eyeColor = 0xff2200; bodyColor = 0x0d0520; outlineColor = 0x8800aa;
    }

    const pulse = 0.3 + Math.sin(t * 0.003) * 0.15;
    this.gfx.fillStyle(outlineColor, pulse * 0.4);
    this.gfx.fillEllipse(x, y + 2, 46, 20);

    this.gfx.fillStyle(bodyColor, 1);
    this.gfx.fillEllipse(x, y + 4, 38, 32);
    this.gfx.lineStyle(1.5, outlineColor, 0.9);
    this.gfx.strokeEllipse(x, y + 4, 38, 32);

    this.gfx.fillStyle(0xff2200, 0.9);
    this.gfx.fillTriangle(x - 6, y, x + 6, y, x, y + 8);
    this.gfx.fillTriangle(x - 6, y + 10, x + 6, y + 10, x, y + 4);

    this.gfx.fillStyle(bodyColor, 1);
    this.gfx.fillEllipse(x, y - 16, 26, 20);
    this.gfx.lineStyle(1.5, outlineColor, 0.8);
    this.gfx.strokeEllipse(x, y - 16, 26, 20);

    const eyePulse = 0.85 + Math.sin(t * 0.006) * 0.15;
    this.gfx.fillStyle(eyeColor, eyePulse);
    this.gfx.fillCircle(x - 6, y - 18, 4);
    this.gfx.fillCircle(x + 6, y - 18, 4);
    this.gfx.fillCircle(x - 3, y - 23, 2.5);
    this.gfx.fillCircle(x + 3, y - 23, 2.5);
    this.gfx.fillStyle(0xffffff, 0.7);
    this.gfx.fillCircle(x - 7, y - 19, 1.2);
    this.gfx.fillCircle(x + 5, y - 19, 1.2);

    this.gfx.fillStyle(0x440022, 1);
    this.gfx.fillTriangle(x - 5, y - 26, x - 2, y - 26, x - 4, y - 31);
    this.gfx.fillTriangle(x + 5, y - 26, x + 2, y - 26, x + 4, y - 31);

    const speed = Math.abs(vx);
    const freq = 0.012 + speed * 0.00005;
    const w = Math.sin(t * freq);
    this.gfx.lineStyle(2, outlineColor, 0.85);

    const legDefs = [
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
    this.currentPlatform = platform;
  }

  die(cause) {
    if (!this.isAlive) return;
    this.isAlive = false;
    this.scene.events.emit('spider:died', cause);

    if (cause === 'flood') {
      this.scene.tweens.add({ targets: this.silkGfx, alpha: 0, duration: 300 });
      this.scene.tweens.add({
        targets: this.gfx,
        y: `+=400`, alpha: 0,
        duration: 800, ease: 'Power3',
      });
      this.scene.tweens.add({
        targets: this.sprite,
        y: this.sprite.y + 400,
        x: this.sprite.x + Phaser.Math.Between(-150, 150),
        alpha: 0, angle: 720,
        duration: 800, ease: 'Power3',
      });
    } else {
      this.scene.tweens.add({
        targets: this.sprite,
        angle: 720, alpha: 0, y: this.sprite.y + 200, duration: 800, ease: 'Power2',
      });
      this.scene.tweens.add({ targets: this.gfx, alpha: 0, duration: 800 });
      this.scene.tweens.add({ targets: this.silkGfx, alpha: 0, duration: 300 });
    }
  }

  getTileHeight() {
    return Math.max(0, Math.floor((this.fixedY - this.sprite.y) / 10));
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