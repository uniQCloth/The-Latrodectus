import { sound } from './SoundManager';

export default class FloodScheduler {
  constructor(scene, spider) {
    this.scene = scene;
    this.spider = spider;
    this.active = false;
    this.floodY = null;
    this.riseSpeed = 90; // px per second
    this.warningShown = false;

    // First flood triggers between 40-80 seconds in
    const delay = Phaser.Math.Between(40000, 80000);
    this.nextFloodTimer = scene.time.delayedCall(delay, () => this.startWarning(), [], this);

    // Flood visuals (created when triggered)
    this.floodGraphic = null;
    this.warningText = null;
    this.foamGraphic = null;
  }

  startWarning() {
    if (!this.spider.isAlive) return;
    sound.playFloodWarning();

    const { width } = this.scene.scale;
    const camera = this.scene.cameras.main;

    // Warning text — flashes at top of screen
    this.warningText = this.scene.add.text(
      camera.scrollX + width / 2,
      camera.scrollY + 140,
      '⚠ FLOOD RISING ⚠',
      {
        fontSize: '28px',
        fontFamily: 'Arial Black, sans-serif',
        color: '#00aaff',
        stroke: '#000000',
        strokeThickness: 5,
      }
    ).setOrigin(0.5).setScrollFactor(0).setDepth(20);

    this.scene.tweens.add({
      targets: this.warningText,
      alpha: { from: 1, to: 0.1 },
      duration: 400,
      yoyo: true,
      repeat: 7,
      onComplete: () => {
        if (this.warningText) {
          this.warningText.destroy();
          this.warningText = null;
        }
        this.spawnFlood();
      },
    });

    // Screen edge blue pulse
    const camera2 = this.scene.cameras.main;
    const edgeFlash = this.scene.add.rectangle(
      camera2.scrollX + this.scene.scale.width / 2,
      camera2.scrollY + this.scene.scale.height / 2,
      this.scene.scale.width,
      this.scene.scale.height,
      0x0044ff,
      0
    ).setScrollFactor(0).setDepth(15);

    this.scene.tweens.add({
      targets: edgeFlash,
      alpha: { from: 0, to: 0.3 },
      duration: 400,
      yoyo: true,
      repeat: 7,
      onComplete: () => edgeFlash.destroy(),
    });
  }

  spawnFlood() {
    if (!this.spider.isAlive) return;
    const { width, height } = this.scene.scale;
    const camera = this.scene.cameras.main;

    // Start flood below bottom of camera view
    this.floodY = camera.scrollY + height + 50;
    this.active = true;

    // Main water body
    this.floodGraphic = this.scene.add.graphics();
    this.foamGraphic = this.scene.add.graphics();

    this.drawFlood();
  }

  drawFlood() {
    if (!this.floodGraphic) return;
    const { width, height } = this.scene.scale;

    // Water body — fills everything below floodY
    this.floodGraphic.clear();
    this.floodGraphic.fillStyle(0x0044cc, 0.75);
    this.floodGraphic.fillRect(0, this.floodY, width, height + 200);

    // Animated foam line at top of flood
    this.foamGraphic.clear();
    const time = this.scene.time.now * 0.003;
    this.foamGraphic.lineStyle(6, 0x66ccff, 0.9);
    this.foamGraphic.beginPath();
    this.foamGraphic.moveTo(0, this.floodY);
    for (let x = 0; x <= width; x += 10) {
      const waveY = this.floodY + Math.sin(x * 0.05 + time) * 8;
      this.foamGraphic.lineTo(x, waveY);
    }
    this.foamGraphic.strokePath();

    // White foam dots
    this.foamGraphic.fillStyle(0xffffff, 0.6);
    for (let i = 0; i < 8; i++) {
      const fx = (i * 71 + this.scene.time.now * 0.05) % width;
      const fy = this.floodY + Math.sin(fx * 0.04 + time) * 8;
      this.foamGraphic.fillCircle(fx, fy - 4, 4);
    }
  }

  update(delta) {
    if (!this.active || !this.spider.isAlive) return;

    // Rise
    this.floodY -= this.riseSpeed * (delta / 1000);
    this.drawFlood();

    // Keep flood visuals synced to world (not camera)
    const camera = this.scene.cameras.main;
    if (this.floodGraphic) {
      this.floodGraphic.setScrollFactor(0);
      // Re-position in world space
      this.floodGraphic.clear();
      this.floodGraphic.fillStyle(0x0044cc, 0.75);

      // Convert world floodY to screen Y
      const screenFloodY = this.floodY - camera.scrollY;
      const { width, height } = this.scene.scale;

      this.floodGraphic.fillRect(0, screenFloodY, width, height - screenFloodY + 200);

      this.foamGraphic.clear();
      const time = this.scene.time.now * 0.003;
      this.foamGraphic.lineStyle(6, 0x66ccff, 0.9);
      this.foamGraphic.beginPath();
      this.foamGraphic.moveTo(0, screenFloodY);
      for (let x = 0; x <= width; x += 10) {
        const waveY = screenFloodY + Math.sin(x * 0.05 + time) * 8;
        this.foamGraphic.lineTo(x, waveY);
      }
      this.foamGraphic.strokePath();

      this.foamGraphic.fillStyle(0xffffff, 0.6);
      for (let i = 0; i < 8; i++) {
        const fx = (i * 71 + this.scene.time.now * 0.05) % width;
        const fy = screenFloodY + Math.sin(fx * 0.04 + time) * 8;
        this.foamGraphic.fillCircle(fx, fy - 4, 4);
      }
    }

    // Death check — spider caught by flood
    const spiderPos = this.spider.getPosition();
    if (spiderPos.y >= this.floodY) {
      this.triggerDrown();
    }

    // Speed up as flood gets closer
    const distToSpider = spiderPos.y - this.floodY;
    if (distToSpider < 200) {
      this.riseSpeed = 140; // surge when close
    }
  }

  triggerDrown() {
    if (!this.spider.isAlive) return;
    this.active = false;

    // Blue drowning flash
    const { width, height } = this.scene.scale;
    const drown = this.scene.add.rectangle(
      width / 2, height / 2, width, height, 0x0044cc, 0.7
    ).setScrollFactor(0).setDepth(25);

    this.scene.tweens.add({
      targets: drown, alpha: 0, duration: 800,
      onComplete: () => drown.destroy(),
    });

    this.spider.die('flood');
  }

  scheduleNextFlood() {
    // After first flood subsides, next one triggers in 60-120s
    const delay = Phaser.Math.Between(60000, 120000);
    this.nextFloodTimer = this.scene.time.delayedCall(delay, () => this.startWarning(), [], this);
  }

  destroy() {
    if (this.nextFloodTimer) this.nextFloodTimer.remove();
    if (this.floodGraphic) this.floodGraphic.destroy();
    if (this.foamGraphic) this.foamGraphic.destroy();
    if (this.warningText) this.warningText.destroy();
  }
}
