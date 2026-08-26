import { startIdleWatch, stopIdleWatch } from '../systems/IdleManager';

export default class IntroScene extends Phaser.Scene {
  constructor() {
    super({ key: 'IntroScene' });
  }

  create() {
    const { width, height } = this.scale;

    // Dark background with gradient-like feel
    this.add.rectangle(width / 2, height / 2, width, height, 0x060612);
    this.add.rectangle(width / 2, height * 0.3, width, height * 0.6, 0x0d0520, 0.7);

    // Web strands decorative background
    this.drawWebStrands(width, height);

    // Title text
    const title = this.add.text(width / 2, height * 0.18, 'WIDOW SPIDER', {
      fontSize: '42px',
      fontFamily: 'Arial Black, sans-serif',
      color: '#ff2200',
      stroke: '#000000',
      strokeThickness: 6,
      shadow: { offsetX: 2, offsetY: 2, color: '#ff0000', blur: 10, fill: true },
    }).setOrigin(0.5);

    const subtitle = this.add.text(width / 2, height * 0.25, 'MULTIPLIER', {
      fontSize: '28px',
      fontFamily: 'Arial Black, sans-serif',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5);

    // Silk thread above spider
    const silkG = this.add.graphics();
    silkG.lineStyle(1.5, 0xaaaaaa, 0.4);
    silkG.beginPath();
    silkG.moveTo(width / 2, 0);
    silkG.lineTo(width / 2, height * 0.48 - 25);
    silkG.strokePath();

    // Animated spider body
    this.spider = this.createPlaceholderSpider(width / 2, height * 0.48);

    // Hula hoop
    this.hoop = this.add.ellipse(width / 2, height * 0.48, 120, 40, 0x000000, 0);
    this.hoop.setStrokeStyle(6, 0xff6600);

    // Animate hoop spin
    this.tweens.add({
      targets: this.hoop,
      scaleX: { from: 1, to: -1 },
      duration: 600,
      yoyo: true,
      repeat: -1,
    });

    // Bounce spider
    this.tweens.add({
      targets: this.spider.parts,
      y: '-=15',
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Glowing red hourglass on spider belly
    const hourglass = this.add.text(width / 2, height * 0.48 + 8, '⌛', {
      fontSize: '14px',
      color: '#ff0000',
    }).setOrigin(0.5);
    this.tweens.add({
      targets: hourglass,
      alpha: { from: 1, to: 0.3 },
      duration: 800,
      yoyo: true,
      repeat: -1,
    });

    // Tagline
    const tagline = this.add.text(width / 2, height * 0.65, 'Climb. Collect. Cash Out.', {
      fontSize: '18px',
      fontFamily: 'Arial, sans-serif',
      color: '#888888',
      fontStyle: 'italic',
    }).setOrigin(0.5);
    this.tweens.add({
      targets: tagline,
      alpha: { from: 0.4, to: 1 },
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Multiplier preview row
    const previews = ['2.50×', '10.00×', '48.32×'];
    const previewColors = ['#ff9900', '#00ff88', '#ffd700'];
    previews.forEach((text, i) => {
      const px = width * 0.25 + i * (width * 0.25);
      const pv = this.add.text(px, height * 0.75, text, {
        fontSize: '15px',
        fontFamily: 'Arial Black, sans-serif',
        color: previewColors[i],
      }).setOrigin(0.5).setAlpha(0);
      this.tweens.add({
        targets: pv,
        alpha: 1,
        y: height * 0.75 - 5,
        duration: 400,
        delay: 200 + i * 200,
      });
    });

    // Floating spores / particles for ambiance
    for (let i = 0; i < 18; i++) {
      const px = Phaser.Math.Between(0, width);
      const py = Phaser.Math.Between(height * 0.1, height * 0.9);
      const spore = this.add.circle(px, py, Phaser.Math.Between(1, 3), 0x663399, 0.5);
      this.tweens.add({
        targets: spore,
        y: py - Phaser.Math.Between(60, 160),
        x: px + Phaser.Math.Between(-20, 20),
        alpha: 0,
        duration: Phaser.Math.Between(2000, 4000),
        delay: Phaser.Math.Between(0, 2000),
        repeat: -1,
        yoyo: false,
        onRepeat: () => {
          spore.setPosition(Phaser.Math.Between(0, width), Phaser.Math.Between(height * 0.6, height));
          spore.setAlpha(0.5);
        },
      });
    }

    // PLAY button
    const playBtn = this.add.text(width / 2, height * 0.86, '▶  PLAY NOW', {
      fontSize: '20px',
      fontFamily: 'Arial Black, sans-serif',
      color: '#000000',
      backgroundColor: '#00ff88',
      padding: { x: 28, y: 12 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    this.tweens.add({
      targets: playBtn,
      scaleX: { from: 1, to: 1.04 },
      scaleY: { from: 1, to: 1.04 },
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    playBtn.on('pointerover', () => playBtn.setStyle({ backgroundColor: '#00cc66' }));
    playBtn.on('pointerout', () => playBtn.setStyle({ backgroundColor: '#00ff88' }));
    playBtn.on('pointerdown', () => this.scene.start('TutorialScene'));

    // "? HOW TO PLAY" link (top right)
    const helpBtn = this.add.text(width - 14, 14, '? HOW TO PLAY', {
      fontSize: '12px',
      color: '#444444',
    }).setOrigin(1, 0).setInteractive({ useHandCursor: true });

    helpBtn.on('pointerover', () => helpBtn.setColor('#888888'));
    helpBtn.on('pointerout', () => helpBtn.setColor('#444444'));
    helpBtn.on('pointerdown', () => this.scene.start('TutorialScene'));

    startIdleWatch(this.game);
  }

  shutdown() {
    stopIdleWatch();
  }

  drawWebStrands(width, height) {
    const g = this.add.graphics();

    // Corner orb web — top left
    this._drawOrbWeb(g, 0, 0, 160, 180, 0x553366, 0.55);
    // Corner orb web — top right
    this._drawOrbWeb(g, width, 0, 160, 180, 0x553366, 0.55);
    // Smaller web — bottom left
    this._drawOrbWeb(g, 0, height, 90, 100, 0x332244, 0.35);
    // Smaller web — bottom right
    this._drawOrbWeb(g, width, height, 90, 100, 0x332244, 0.35);
  }

  _drawOrbWeb(g, cx, cy, radW, radH, color, alpha) {
    const spokes = 8;
    const rings = 5;

    // Spoke lines
    g.lineStyle(1, color, alpha);
    for (let i = 0; i < spokes; i++) {
      const angle = (i / spokes) * Math.PI * 2;
      g.beginPath();
      g.moveTo(cx, cy);
      g.lineTo(cx + Math.cos(angle) * radW, cy + Math.sin(angle) * radH);
      g.strokePath();
    }

    // Concentric rings along spokes
    for (let r = 1; r <= rings; r++) {
      const rf = r / rings;
      g.lineStyle(1, color, alpha * (1 - rf * 0.4));
      g.beginPath();
      for (let i = 0; i <= spokes; i++) {
        const angle = (i / spokes) * Math.PI * 2;
        const px = cx + Math.cos(angle) * radW * rf;
        const py = cy + Math.sin(angle) * radH * rf;
        i === 0 ? g.moveTo(px, py) : g.lineTo(px, py);
      }
      g.strokePath();
    }
  }

  createPlaceholderSpider(x, y) {
    const body = this.add.ellipse(x, y, 50, 40, 0x1a0a2e);
    body.setStrokeStyle(2, 0x660066);

    const head = this.add.ellipse(x, y - 28, 28, 24, 0x1a0a2e);
    head.setStrokeStyle(2, 0x660066);

    // Eyes
    const eyeL = this.add.ellipse(x - 7, y - 30, 7, 7, 0xff0000);
    const eyeR = this.add.ellipse(x + 7, y - 30, 7, 7, 0xff0000);

    // Legs
    const legs = this.add.graphics();
    legs.lineStyle(3, 0x440044, 1);
    const legPositions = [
      [-25, -10, -55, -30], [-25, 0, -58, 5], [-25, 10, -55, 30], [-25, 18, -50, 45],
      [25, -10, 55, -30], [25, 0, 58, 5], [25, 10, 55, 30], [25, 18, 50, 45],
    ];
    legPositions.forEach(([x1, y1, x2, y2]) => {
      legs.beginPath();
      legs.moveTo(x + x1, y + y1);
      legs.lineTo(x + x2, y + y2);
      legs.strokePath();
    });

    return { parts: [body, head, eyeL, eyeR] };
  }

  startCountdown() {
    const { width, height } = this.scale;

    // Darken
    const overlay = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0);
    this.tweens.add({ targets: overlay, alpha: 0.7, duration: 300 });

    let count = 3;
    const countText = this.add.text(width / 2, height / 2, `${count}`, {
      fontSize: '120px',
      fontFamily: 'Arial Black, sans-serif',
      color: '#ff2200',
      stroke: '#000000',
      strokeThickness: 8,
    }).setOrigin(0.5).setAlpha(0);

    const showCount = () => {
      countText.setText(count > 0 ? `${count}` : 'GO!');
      countText.setColor(count > 0 ? '#ff2200' : '#00ff88');
      this.tweens.add({
        targets: countText,
        alpha: { from: 1, to: 0 },
        scaleX: { from: 1.4, to: 0.8 },
        scaleY: { from: 1.4, to: 0.8 },
        duration: 900,
        ease: 'Power2',
      });

      if (count === 0) {
        this.time.delayedCall(500, () => {
          this.scene.start('GameScene');
          this.scene.launch('UIScene');
        });
      } else {
        count--;
        this.time.delayedCall(1000, showCount);
      }
    };

    this.time.delayedCall(300, showCount);
  }
}
