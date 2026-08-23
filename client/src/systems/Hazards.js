import { PLATFORM_TYPES } from './Platform';
import { sound } from './SoundManager';

export default class HazardManager {
  constructor(scene, spider) {
    this.scene = scene;
    this.spider = spider;
    this.shockStunned = false;
    this.shockTimer = null;
    this.explodeTimers = new Map(); // platform → timer
  }

  // Called from GameScene collider when spider lands on any platform
  handlePlatformContact(platform) {
    if (!this.spider.isAlive) return;

    switch (platform.platformType) {
      case PLATFORM_TYPES.EXPLODING:
        this.triggerExplosionFuse(platform);
        break;
      case PLATFORM_TYPES.FIRE:
        this.triggerFire(platform);
        break;
      case PLATFORM_TYPES.SHOCKING:
        this.triggerShock(platform);
        break;
    }
  }

  // --- EXPLODING ---
  // Flash warning for 1.8s then boom — spider on it when it blows = death
  triggerExplosionFuse(platform) {
    if (this.explodeTimers.has(platform)) return;

    // Rapid flash warning
    const flashTween = this.scene.tweens.add({
      targets: platform,
      alpha: { from: 1, to: 0.1 },
      duration: 150,
      yoyo: true,
      repeat: 5,
    });

    sound.playTick();
    const timer = this.scene.time.delayedCall(1800, () => {
      this.explodeTimers.delete(platform);
      this.explode(platform);
    });

    this.explodeTimers.set(platform, { timer, flashTween });
  }

  explode(platform) {
    const { x, y } = platform;

    // Shockwave ring
    const ring = this.scene.add.ellipse(x, y, 20, 20, 0xff4400, 0);
    ring.setStrokeStyle(4, 0xff8800);
    this.scene.tweens.add({
      targets: ring,
      scaleX: 6, scaleY: 6,
      alpha: 0,
      duration: 400,
      onComplete: () => ring.destroy(),
    });

    // Debris particles
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const debris = this.scene.add.rectangle(
        x, y, Phaser.Math.Between(4, 10), Phaser.Math.Between(4, 10), 0xcc3300
      );
      this.scene.tweens.add({
        targets: debris,
        x: x + Math.cos(angle) * Phaser.Math.Between(40, 120),
        y: y + Math.sin(angle) * Phaser.Math.Between(40, 120),
        alpha: 0,
        angle: Phaser.Math.Between(0, 360),
        duration: 500,
        ease: 'Power2',
        onComplete: () => debris.destroy(),
      });
    }

    // Flash screen orange briefly
    const flash = this.scene.add.rectangle(
      this.scene.cameras.main.scrollX + this.scene.scale.width / 2,
      this.scene.cameras.main.scrollY + this.scene.scale.height / 2,
      this.scene.scale.width, this.scene.scale.height,
      0xff4400, 0.4
    );
    this.scene.tweens.add({
      targets: flash, alpha: 0, duration: 200,
      onComplete: () => flash.destroy(),
    });

    this.scene.cameras.main.shake(200, 0.015);
    sound.playExplosion();

    // Kill spider if on or near the platform
    const spiderPos = this.spider.getPosition();
    const dist = Phaser.Math.Distance.Between(spiderPos.x, spiderPos.y, x, y);
    if (dist < 80) {
      this.spider.die('explosion');
    }

    platform.destroy();
  }

  // --- FIRE ---
  // Instant death on contact — no warning
  triggerFire(platform) {
    const { x, y } = platform;

    // Flame burst visual
    for (let i = 0; i < 8; i++) {
      const flame = this.scene.add.ellipse(
        x + Phaser.Math.Between(-30, 30),
        y - Phaser.Math.Between(10, 40),
        Phaser.Math.Between(8, 20),
        Phaser.Math.Between(15, 35),
        Phaser.Math.FloatBetween(0, 1) > 0.5 ? 0xff6600 : 0xff2200,
        0.9
      );
      this.scene.tweens.add({
        targets: flame,
        y: flame.y - Phaser.Math.Between(30, 60),
        alpha: 0,
        scaleX: 0.2,
        duration: 300,
        ease: 'Power1',
        onComplete: () => flame.destroy(),
      });
    }

    this.scene.cameras.main.shake(150, 0.012);
    sound.playExplosion();
    this.spider.die('fire');
  }

  // --- SHOCKING ---
  // Stun for 2 seconds: spider can't control, physics takes over
  triggerShock(platform) {
    if (this.shockStunned) return;
    this.shockStunned = true;
    sound.playShock();

    // Electric arc visual
    const arcs = [];
    for (let i = 0; i < 6; i++) {
      const arc = this.scene.add.graphics();
      arc.lineStyle(2, 0xffff00, 1);
      const pos = this.spider.getPosition();
      arc.beginPath();
      arc.moveTo(pos.x + Phaser.Math.Between(-20, 20), pos.y + Phaser.Math.Between(-20, 20));
      arc.lineTo(pos.x + Phaser.Math.Between(-30, 30), pos.y + Phaser.Math.Between(-30, 30));
      arc.strokePath();
      arcs.push(arc);
    }

    // Flicker effect on spider
    this.spider.getBody().setTint(0xffff00);

    // Clear stun after 2 seconds
    this.shockTimer = this.scene.time.delayedCall(2000, () => {
      this.shockStunned = false;
      this.spider.getBody().clearTint();
      arcs.forEach(a => a.destroy());
    });

    this.scene.cameras.main.shake(100, 0.008);
  }

  isStunned() {
    return this.shockStunned;
  }

  cancelExplosionTimers() {
    this.explodeTimers.forEach(({ timer, flashTween }) => {
      timer.remove();
      if (flashTween) flashTween.stop();
    });
    this.explodeTimers.clear();
  }

  destroy() {
    this.cancelExplosionTimers();
    if (this.shockTimer) this.shockTimer.remove();
  }
}
