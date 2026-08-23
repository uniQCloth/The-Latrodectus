import { sound } from './SoundManager';
export const MAX_GLOW_WORMS = 3;

export default class GlowWormManager {
  constructor(scene) {
    this.scene = scene;
    this.worms = scene.physics.add.staticGroup();
    this.collected = 0;
    this.spawnChance = 0.04; // 4% per platform spawn
    this.lastSpawnY = null;
  }

  trySpawn(x, y) {
    if (this.collected >= MAX_GLOW_WORMS) return;
    if (this.lastSpawnY && Math.abs(y - this.lastSpawnY) < 600) return; // min gap
    if (Math.random() > this.spawnChance) return;

    this.spawnWorm(x, y - 40);
    this.lastSpawnY = y;
  }

  spawnWorm(x, y) {
    const g = this.scene.add.graphics();
    g.fillStyle(0x00ff88, 1);
    g.fillCircle(0, 0, 10);
    g.fillStyle(0xffffff, 0.4);
    g.fillCircle(-3, -3, 4);
    const tex = g.generateTexture(`worm_${x}_${y}`, 24, 24);
    g.destroy();

    const worm = this.worms.create(x, y, `worm_${x}_${y}`);
    worm.setCircle(10, 2, 2);
    worm.refreshBody();

    // Glow pulse
    this.scene.tweens.add({
      targets: worm,
      alpha: { from: 1, to: 0.3 },
      scaleX: { from: 1, to: 1.3 },
      scaleY: { from: 1, to: 1.3 },
      duration: 600,
      yoyo: true,
      repeat: -1,
    });

    // Floating motion
    this.scene.tweens.add({
      targets: worm,
      y: y - 12,
      duration: 1000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    return worm;
  }

  collect(worm) {
    if (this.collected >= MAX_GLOW_WORMS) return 0;
    this.collected++;

    // Collect flash
    const flash = this.scene.add.ellipse(worm.x, worm.y, 60, 60, 0x00ff88, 0.8);
    this.scene.tweens.add({
      targets: flash,
      scaleX: 3, scaleY: 3, alpha: 0,
      duration: 400,
      onComplete: () => flash.destroy(),
    });

    worm.destroy();
    sound.playCollect();
    this.scene.events.emit('glowworm:collected', this.collected);
    return this.collected;
  }

  getGroup() {
    return this.worms;
  }

  getCollected() {
    return this.collected;
  }
}
