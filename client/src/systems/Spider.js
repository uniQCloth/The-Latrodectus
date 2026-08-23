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
    this.drawSpider();

    // Input
    this.cursors = scene.input.keyboard.createCursorKeys();
    this.wasd = scene.input.keyboard.addKeys({ up: 'W', left: 'A', right: 'D' });
    this.setupTouchInput();

    // Track active touches for mobile
    this.touchLeft = false;
    this.touchRight = false;
    this.touchJump = false;

    scene.events.on('update', this.update, this);
  }

  setupTouchInput() {
    const { width, height } = this.scene.scale;

    // Left zone (left 40% of screen)
    const leftZone = this.scene.add.zone(0, 0, width * 0.4, height)
      .setOrigin(0, 0).setInteractive();
    leftZone.on('pointerdown', () => { this.touchLeft = true; });
    leftZone.on('pointerup', () => { this.touchLeft = false; });
    leftZone.on('pointerout', () => { this.touchLeft = false; });

    // Right zone (right 40%)
    const rightZone = this.scene.add.zone(width * 0.6, 0, width * 0.4, height)
      .setOrigin(0, 0).setInteractive();
    rightZone.on('pointerdown', () => { this.touchRight = true; });
    rightZone.on('pointerup', () => { this.touchRight = false; });
    rightZone.on('pointerout', () => { this.touchRight = false; });

    // Center zone = jump
    const jumpZone = this.scene.add.zone(width * 0.4, 0, width * 0.2, height)
      .setOrigin(0, 0).setInteractive();
    jumpZone.on('pointerdown', () => { this.touchJump = true; });
    jumpZone.on('pointerup', () => { this.touchJump = false; });
  }

  update() {
    if (!this.isAlive) return;

    // Stunned (shock) — no player control
    if (this.externalStunned) {
      this.drawSpider();
      return;
    }

    const leftDown = this.cursors.left.isDown || this.wasd.left.isDown || this.touchLeft;
    const rightDown = this.cursors.right.isDown || this.wasd.right.isDown || this.touchRight;
    const jumpDown = Phaser.Input.Keyboard.JustDown(this.cursors.up) ||
                     Phaser.Input.Keyboard.JustDown(this.wasd.up) ||
                     this.touchJump;

    // Horizontal movement
    const speed = this.onGround ? 220 : 160;
    if (leftDown) {
      this.sprite.setVelocityX(-speed);
    } else if (rightDown) {
      this.sprite.setVelocityX(speed);
    }

    // Slippery platform reduces drag
    if (this.currentPlatform?.platformType === PLATFORM_TYPES.SLIPPERY) {
      this.sprite.setDragX(80);
    } else {
      this.sprite.setDragX(600);
    }

    // Jump
    if (jumpDown && this.onGround) {
      this.sprite.setVelocityY(-580);
      this.onGround = false;
      this.currentPlatform = null;
      sound.playJump();
    }

    // Bounce platform
    if (this.currentPlatform?.platformType === PLATFORM_TYPES.BOUNCE && this.onGround) {
      this.sprite.setVelocityY(-700);
      this.onGround = false;
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
    // Screen-space: compute screen position from world + camera scroll
    const camera = this.scene.cameras.main;
    const sx = this.sprite.x - camera.scrollX;
    const sy = this.sprite.y - camera.scrollY + this.visualSlipY;
    this.silkGfx.clear();
    if (!this.isAlive) return;
    const vx = this.sprite.body?.velocity?.x ?? 0;
    const sway = vx * 0.04;
    // Silk looks tighter / more visible when spider is slipping
    const slipping = this.visualSlipY > 5;
    this.silkGfx.lineStyle(slipping ? 2.5 : 1.5, slipping ? 0xdddddd : 0xbbbbbb, slipping ? 0.65 : 0.4);
    this.silkGfx.beginPath();
    this.silkGfx.moveTo(sx, -60); // anchor just above screen top
    this.silkGfx.lineTo(sx + sway * 20, sy - 80);
    this.silkGfx.lineTo(sx + sway * 8, sy - 14);
    this.silkGfx.strokePath();
  }

  drawSpider() {
    // Screen-space: convert world position to screen coords
    const camera = this.scene.cameras.main;
    const x = this.sprite.x - camera.scrollX;
    const y = this.sprite.y - camera.scrollY + this.visualSlipY;
    const t = this.scene.time.now;
    this.gfx.clear();

    const stunned = this.externalStunned;
    const eyeColor = stunned ? 0xffff00 : 0xff2200;
    const bodyColor = stunned ? 0x1a1a00 : 0x0d0520;
    const outlineColor = stunned ? 0xaaaa00 : 0x8800aa;

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

    // Death animation — spin + fall
    this.scene.tweens.add({
      targets: this.sprite,
      angle: 720,
      alpha: 0,
      y: this.sprite.y + 200,
      duration: 800,
      ease: 'Power2',
    });
    this.scene.tweens.add({
      targets: this.gfx,
      alpha: 0,
      duration: 800,
    });
    // Silk snaps and fades
    this.scene.tweens.add({
      targets: this.silkGfx,
      alpha: 0,
      duration: 300,
    });
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
