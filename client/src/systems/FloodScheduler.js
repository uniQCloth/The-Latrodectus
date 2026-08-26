/**
 * FloodScheduler — offline / single-player flood crash system
 *
 * Controls the rising-water crash mechanic when playing without a server.
 * In multiplayer mode the server determines the crash point; this class
 * is only active in solo/offline sessions.
 *
 * ── How it works ──────────────────────────────────────────────────────────
 * 1. A timer fires 40-80 seconds into the round.
 * 2. startWarning() runs — identical warning animation every time so the
 *    player cannot tell what's coming.
 * 3. After the warning, a random roll decides the outcome:
 *    • 55% REAL FLOOD  — water rises continuously until it catches the spider
 *    • 45% FALSE ALARM — water rises partway then drains; "✓ False Alarm" shown
 * 4. After each event (real or false) the next cycle is scheduled.
 *
 * ── Why false alarms? ─────────────────────────────────────────────────────
 * Without false alarms, players always know to cash out the moment the
 * warning fires — which removes the core tension of the game. False alarms
 * force players to gamble: bail now (safe) or hold (risky). Neither is
 * always correct.
 */

import { sound } from './SoundManager';

export default class FloodScheduler {
  constructor(scene, spider) {
    this.scene = scene;
    this.spider = spider;
    this.active = false;
    this.floodY = null;
    this.riseSpeed = 90; // px per second — increases to 140 when flood is close
    this.warningShown = false;

    // Flood visuals — created on demand, destroyed after each event
    this.floodGraphic = null;
    this.warningText = null;
    this.foamGraphic = null;

    // First warning fires 40-80 seconds into the round (random start keeps
    // players from memorising a fixed safe window)
    const delay = Phaser.Math.Between(40000, 80000);
    this.nextFloodTimer = scene.time.delayedCall(delay, () => this.startWarning(), [], this);
  }

  // ── Warning phase ────────────────────────────────────────────────────────
  // Runs identically for both real floods and false alarms so the player
  // cannot tell the outcome until the water behaviour gives it away.

  startWarning() {
    if (!this.spider.isAlive) return;
    sound.playFloodWarning();

    // Decide outcome NOW but don't reveal it until after the animation.
    // 45% false alarm — player cannot predict which it is.
    this._isFalseAlarm = Math.random() < 0.45;

    const { width } = this.scene.scale;
    const camera = this.scene.cameras.main;

    // Warning banner — same text, same flash, same sound every time
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

    // Blink 8 times (~3.2s) then branch to real flood or false alarm
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
        if (this._isFalseAlarm) {
          this._doFalseAlarm();
        } else {
          this.spawnFlood(); // real crash
        }
      },
    });

    // Blue screen-edge pulse — adds physical feel to the warning
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

  // ── False alarm sequence ─────────────────────────────────────────────────
  // Water creeps up ~28% of the screen height (looks like a real flood
  // starting) then drains back down. Players who held through it survive;
  // players who cashed out sacrificed their potential gains for nothing.

  _doFalseAlarm() {
    if (!this.spider.isAlive) return;
    const { width, height } = this.scene.scale;
    const camera = this.scene.cameras.main;

    const innerW = width - 40;
    const startY = camera.scrollY + height + 30;      // just off screen below
    const peakY  = camera.scrollY + height * 0.72;   // rises ~28% then retreats

    this.floodGraphic = this.scene.add.graphics().setScrollFactor(0).setDepth(14);
    this.foamGraphic  = this.scene.add.graphics().setScrollFactor(0).setDepth(15);

    const proxy = { y: startY };

    // Phase 1: water rises over 1.8s (looks threatening)
    this.scene.tweens.add({
      targets: proxy,
      y: peakY,
      duration: 1800,
      ease: 'Sine.easeIn',
      onUpdate: () => this._drawFalseAlarmWater(proxy.y, innerW, width, height, camera),
      onComplete: () => {

        // Phase 2: water drains back over 1.4s
        this.scene.tweens.add({
          targets: proxy,
          y: startY + 60,
          duration: 1400,
          ease: 'Sine.easeOut',
          onUpdate: () => this._drawFalseAlarmWater(proxy.y, innerW, width, height, camera),
          onComplete: () => {
            // Clean up water graphics
            if (this.floodGraphic) { this.floodGraphic.destroy(); this.floodGraphic = null; }
            if (this.foamGraphic)  { this.foamGraphic.destroy();  this.foamGraphic  = null; }

            // Confirm it was a false alarm so players understand the mechanic
            const clear = this.scene.add.text(
              camera.scrollX + width / 2,
              camera.scrollY + height * 0.3,
              '✓  False Alarm', {
                fontSize: '20px', fontFamily: 'Arial Black, sans-serif',
                color: '#00ff88', stroke: '#000000', strokeThickness: 4,
              }
            ).setOrigin(0.5).setScrollFactor(0).setDepth(20).setAlpha(0);

            this.scene.tweens.add({
              targets: clear, alpha: 1, duration: 220,
              onComplete: () => {
                this.scene.tweens.add({
                  targets: clear, alpha: 0, duration: 500, delay: 1000,
                  onComplete: () => clear.destroy(),
                });
              },
            });

            // Schedule the next warning cycle (could be real or false again)
            this.scheduleNextFlood();
          },
        });
      },
    });
  }

  // Draws the false-alarm water body + animated foam line each frame.
  // Uses the same visual style as the real flood so players can't distinguish
  // by appearance — only by whether it stops rising.
  _drawFalseAlarmWater(surfaceY, innerW, width, height, camera) {
    const screenY = surfaceY - camera.scrollY;
    if (!this.floodGraphic || !this.foamGraphic) return;

    this.floodGraphic.clear();
    this.floodGraphic.fillStyle(0x0044cc, 0.65);
    this.floodGraphic.fillRect(20, screenY, innerW, height - screenY + 200);

    this.foamGraphic.clear();
    const t = this.scene.time.now * 0.003;
    this.foamGraphic.lineStyle(5, 0x66ccff, 0.8);
    this.foamGraphic.beginPath();
    this.foamGraphic.moveTo(20, screenY);
    for (let x = 20; x <= width - 20; x += 10) {
      this.foamGraphic.lineTo(x, screenY + Math.sin(x * 0.05 + t) * 6);
    }
    this.foamGraphic.strokePath();
  }

  // ── Real flood sequence ──────────────────────────────────────────────────
  // Water spawns below the camera and rises until it catches the spider.

  spawnFlood() {
    if (!this.spider.isAlive) return;
    const { width, height } = this.scene.scale;
    const camera = this.scene.cameras.main;

    // Start below the visible area so water appears to rise from the bottom
    this.floodY = camera.scrollY + height + 50;
    this.active = true;

    this.floodGraphic = this.scene.add.graphics();
    this.foamGraphic = this.scene.add.graphics();

    this.drawFlood();
  }

  drawFlood() {
    if (!this.floodGraphic) return;
    const { width, height } = this.scene.scale;

    // Water body fills everything below the current flood surface
    this.floodGraphic.clear();
    this.floodGraphic.fillStyle(0x0044cc, 0.75);
    this.floodGraphic.fillRect(0, this.floodY, width, height + 200);

    // Animated foam line at the water surface
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

    // White foam bubbles riding the wave
    this.foamGraphic.fillStyle(0xffffff, 0.6);
    for (let i = 0; i < 8; i++) {
      const fx = (i * 71 + this.scene.time.now * 0.05) % width;
      const fy = this.floodY + Math.sin(fx * 0.04 + time) * 8;
      this.foamGraphic.fillCircle(fx, fy - 4, 4);
    }
  }

  update(delta) {
    if (!this.active || !this.spider.isAlive) return;

    // Move flood surface up each frame
    this.floodY -= this.riseSpeed * (delta / 1000);
    this.drawFlood();

    // Redraw in screen space (flood must stay fixed to screen, not world)
    const camera = this.scene.cameras.main;
    if (this.floodGraphic) {
      this.floodGraphic.setScrollFactor(0);
      this.floodGraphic.clear();
      this.floodGraphic.fillStyle(0x0044cc, 0.75);

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

    // Kill spider if flood surface reaches it
    const spiderPos = this.spider.getPosition();
    if (spiderPos.y >= this.floodY) {
      this.triggerDrown();
    }

    // Surge speed up when flood is close — makes the final moment frantic
    const distToSpider = spiderPos.y - this.floodY;
    if (distToSpider < 200) {
      this.riseSpeed = 140;
    }
  }

  triggerDrown() {
    if (!this.spider.isAlive) return;
    this.active = false;

    // Blue flash confirms the spider was caught
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
    // After any event (real or false alarm), next warning fires 60-120s later
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
