export const PLATFORM_TYPES = {
  NORMAL: 'normal',
  BOUNCE: 'bounce',
  SLIPPERY: 'slippery',
  EXPLODING: 'exploding',
  FIRE: 'fire',
  SHOCKING: 'shocking',
};

export default class PlatformManager {
  constructor(scene) {
    this.scene = scene;
    this.platforms = scene.physics.add.staticGroup();
    this.highestY = scene.scale.height;
    this.disappearTimers = new Map();
    this.TILE_HEIGHT = 120;
    this.PLATFORM_WIDTH = 120;
    this.STAND_LIMIT = 2200; // ms before platform crumbles
  }

  spawnInitialPlatforms() {
    const { width, height } = this.scene.scale;

    // Ground platform
    this.spawnPlatform(width / 2, height - 40, width, PLATFORM_TYPES.NORMAL, true);

    // First few platforms guaranteed safe
    for (let i = 1; i <= 6; i++) {
      const x = Phaser.Math.Between(80, width - 80);
      this.spawnPlatform(x, height - 40 - i * this.TILE_HEIGHT, this.PLATFORM_WIDTH, PLATFORM_TYPES.NORMAL);
    }

    this.highestY = height - 40 - 6 * this.TILE_HEIGHT;
  }

  spawnPlatform(x, y, width = 120, type = PLATFORM_TYPES.NORMAL, isGround = false) {
    const colors = {
      [PLATFORM_TYPES.NORMAL]: 0x5a3e28,
      [PLATFORM_TYPES.BOUNCE]: 0x2ecc40,
      [PLATFORM_TYPES.SLIPPERY]: 0x7fdbff,
      [PLATFORM_TYPES.EXPLODING]: 0xcc3300,
      [PLATFORM_TYPES.FIRE]: 0xff6600,
      [PLATFORM_TYPES.SHOCKING]: 0xffff00,
    };

    const g = this.scene.add.graphics();
    const color = colors[type];

    // Platform body
    g.fillStyle(color, 1);
    g.fillRoundedRect(-width / 2, -8, width, 16, 4);

    // Top highlight
    g.fillStyle(0xffffff, 0.15);
    g.fillRoundedRect(-width / 2, -8, width, 4, 2);

    // Type indicator
    if (type === PLATFORM_TYPES.BOUNCE) {
      g.fillStyle(0x00ff44, 0.6);
      g.fillCircle(0, -12, 5);
    } else if (type === PLATFORM_TYPES.SLIPPERY) {
      g.fillStyle(0xaaddff, 0.6);
      g.fillRect(-width / 2, -8, width, 3);
    } else if (type === PLATFORM_TYPES.EXPLODING) {
      // Skull warning icons
      g.fillStyle(0xff0000, 0.8);
      g.fillCircle(-20, -2, 5);
      g.fillCircle(0, -2, 5);
      g.fillCircle(20, -2, 5);
    } else if (type === PLATFORM_TYPES.FIRE) {
      // Flame streaks
      g.fillStyle(0xff4400, 0.9);
      for (let fx = -width / 2 + 8; fx < width / 2; fx += 16) {
        g.fillTriangle(fx, -8, fx + 6, -20, fx + 12, -8);
      }
    } else if (type === PLATFORM_TYPES.SHOCKING) {
      // Lightning bolt marks
      g.fillStyle(0xffffff, 0.9);
      g.fillTriangle(-10, -8, -2, -16, 2, -8);
      g.fillTriangle(-2, -8, 6, -16, 10, -8);
    }

    const texture = g.generateTexture(`platform_${type}_${x}_${y}`, width + 4, 28);
    g.destroy();

    const plat = this.platforms.create(x, y, `platform_${type}_${x}_${y}`);
    plat.setImmovable(true);
    plat.refreshBody();
    plat.platformType = type;
    plat.isGround = isGround;

    return plat;
  }

  extendWorld(cameraTopY) {
    const spawnThreshold = cameraTopY - 200;
    const { width } = this.scene.scale;

    while (this.highestY > spawnThreshold) {
      const x = Phaser.Math.Between(60, width - 60);
      const y = this.highestY - this.TILE_HEIGHT;

      // Weight: 55% normal, 15% bounce, 10% slippery, 10% exploding, 5% fire, 5% shocking
      const roll = Math.random();
      let type = PLATFORM_TYPES.NORMAL;
      if (roll > 0.95) type = PLATFORM_TYPES.SHOCKING;
      else if (roll > 0.90) type = PLATFORM_TYPES.FIRE;
      else if (roll > 0.80) type = PLATFORM_TYPES.EXPLODING;
      else if (roll > 0.70) type = PLATFORM_TYPES.SLIPPERY;
      else if (roll > 0.55) type = PLATFORM_TYPES.BOUNCE;

      this.spawnPlatform(x, y, this.PLATFORM_WIDTH, type);
      this.highestY = y;
    }
  }

  startDisappearTimer(platform) {
    if (this.disappearTimers.has(platform) || platform.isGround) return;

    const timer = this.scene.time.addEvent({
      delay: this.STAND_LIMIT,
      callback: () => this.crumblePlatform(platform),
    });

    this.disappearTimers.set(platform, timer);
    this.showWarning(platform);
  }

  cancelDisappearTimer(platform) {
    const timer = this.disappearTimers.get(platform);
    if (timer) {
      timer.remove();
      this.disappearTimers.delete(platform);
      this.clearWarning(platform);
    }
  }

  showWarning(platform) {
    if (!platform.active) return;
    platform.warningTween = this.scene.tweens.add({
      targets: platform,
      alpha: { from: 1, to: 0.4 },
      duration: 300,
      yoyo: true,
      repeat: -1,
    });
  }

  clearWarning(platform) {
    if (platform.warningTween) {
      platform.warningTween.stop();
      platform.setAlpha(1);
    }
  }

  crumblePlatform(platform) {
    this.disappearTimers.delete(platform);
    this.scene.cameras.main.shake(150, 0.005);

    // Crumble particles effect
    const particles = this.scene.add.particles(platform.x, platform.y, null, {
      speed: { min: 50, max: 150 },
      angle: { min: 200, max: 340 },
      scale: { start: 0.4, end: 0 },
      lifespan: 400,
      quantity: 8,
      tint: [0x5a3e28, 0x8b6540],
    });
    this.scene.time.delayedCall(500, () => particles.destroy());

    platform.destroy();
  }

  cullDistantPlatforms(cameraBottomY) {
    this.platforms.getChildren().forEach(p => {
      if (p.y > cameraBottomY + 400) p.destroy();
    });
  }

  getGroup() {
    return this.platforms;
  }
}
