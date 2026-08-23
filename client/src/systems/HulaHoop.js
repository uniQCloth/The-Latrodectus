export default class HulaHoop {
  constructor(scene, spider) {
    this.scene = scene;
    this.spider = spider;
    this.angle = 0;
    this.spinSpeed = 4;
    this.momentum = 0; // -1 (left) to 1 (right)

    // Visual hoop — ellipse outline
    this.graphic = scene.add.graphics();
    this.draw();

    // Momentum decay
    scene.events.on('update', this.update, this);
  }

  draw() {
    this.graphic.clear();
    const { x, y } = this.spider;

    // Hoop squishes based on spin (3D rotation illusion)
    const squish = Math.abs(Math.cos(this.angle));
    const hoopW = 70;
    const hoopH = 20 + squish * 10;

    this.graphic.lineStyle(5, 0xff6600, 1);
    this.graphic.strokeEllipse(x, y + 10, hoopW, hoopH);

    // Highlight
    this.graphic.lineStyle(2, 0xffaa44, 0.5);
    this.graphic.strokeEllipse(x, y + 6, hoopW * 0.7, hoopH * 0.5);
  }

  update() {
    this.angle += this.spinSpeed * 0.05;
    this.momentum *= 0.95; // decay
    this.draw();
  }

  applyInput(direction) {
    // direction: -1 left, 1 right
    this.momentum = Phaser.Math.Clamp(this.momentum + direction * 0.3, -1, 1);
    this.spinSpeed = 4 + Math.abs(this.momentum) * 4;
  }

  getJumpBoost() {
    return 50 + Math.abs(this.momentum) * 80;
  }

  destroy() {
    this.scene.events.off('update', this.update, this);
    this.graphic.destroy();
  }
}
