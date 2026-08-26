import socket from '../systems/SocketManager';
import { SERVER_URL } from '../config';

export default class UsernameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'UsernameScene' });
    this._inputs = [];
    this._mode = 'login'; // 'login' | 'register'
  }

  create() {
    // Always require login — clear any stored session so the form always shows
    localStorage.removeItem('wsm_token');
    localStorage.removeItem('wsm_username');

    const { width, height } = this.scale;
    this._buildBackground(width, height);
    this._buildUI(width, height);
  }

  _buildBackground(width, height) {
    this.add.rectangle(width / 2, height / 2, width, height, 0x060612);
    this.add.rectangle(width / 2, height * 0.28, width, height * 0.56, 0x0d0520, 0.65);
    this._drawWebStrands(width, height);

    // Title
    this.add.text(width / 2, height * 0.07, 'WIDOW SPIDER', {
      fontSize: '32px', fontFamily: 'Arial Black, sans-serif',
      color: '#ff2200', stroke: '#000000', strokeThickness: 5,
    }).setOrigin(0.5);
    this.add.text(width / 2, height * 0.13, 'MULTIPLIER', {
      fontSize: '20px', fontFamily: 'Arial Black, sans-serif',
      color: '#ffffff', stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5);

    // Silk thread + mini spider
    const silk = this.add.graphics();
    silk.lineStyle(1.5, 0xaaaaaa, 0.3);
    silk.beginPath(); silk.moveTo(width / 2, 0); silk.lineTo(width / 2, height * 0.22); silk.strokePath();
    this._drawMiniSpider(width / 2, height * 0.23);

    // Particles
    for (let i = 0; i < 10; i++) {
      const px = Phaser.Math.Between(0, width);
      const py = Phaser.Math.Between(height * 0.1, height * 0.9);
      const sp = this.add.circle(px, py, Phaser.Math.Between(1, 3), 0x663399, 0.4);
      this.tweens.add({
        targets: sp, y: py - Phaser.Math.Between(50, 120), alpha: 0,
        duration: Phaser.Math.Between(3000, 6000), delay: Phaser.Math.Between(0, 3000),
        repeat: -1,
        onRepeat: () => { sp.setPosition(Phaser.Math.Between(0, width), py); sp.setAlpha(0.4); },
      });
    }
  }

  _buildUI(width, height) {
    const cardW = width * 0.86;
    const cardY = height * 0.62;

    // Card panel
    this._card = this.add.rectangle(width / 2, cardY, cardW, height * 0.6, 0x0d0d1a, 0.97)
      .setStrokeStyle(1.5, 0x8800aa, 0.7);

    // Tab buttons
    const tabY = height * 0.34;
    this._loginTab = this._makeTab(width * 0.35, tabY, 'LOGIN', () => this._switchMode('login'));
    this._regTab   = this._makeTab(width * 0.65, tabY, 'REGISTER', () => this._switchMode('register'));
    this._updateTabs();

    // Status text
    this._statusText = this.add.text(width / 2, height * 0.41, '', {
      fontSize: '11px', color: '#ff4444', align: 'center', wordWrap: { width: cardW - 30 },
    }).setOrigin(0.5);

    // Build fields based on mode
    this._fieldContainer = {};
    this._buildFields(width, height);
  }

  _makeTab(x, y, label, onClick) {
    const bg = this.add.rectangle(x, y, 110, 28, 0x1a1a2e).setInteractive({ useHandCursor: true });
    const txt = this.add.text(x, y, label, {
      fontSize: '12px', fontFamily: 'Arial Black, sans-serif', color: '#ffffff',
    }).setOrigin(0.5);
    bg.on('pointerdown', onClick);
    return { bg, txt };
  }

  _updateTabs() {
    const isLogin = this._mode === 'login';
    this._loginTab.bg.setFillStyle(isLogin ? 0x8800aa : 0x1a1a2e);
    this._regTab.bg.setFillStyle(isLogin ? 0x1a1a2e : 0x8800aa);
    this._loginTab.txt.setColor(isLogin ? '#ffffff' : '#888888');
    this._regTab.txt.setColor(isLogin ? '#888888' : '#ffffff');
  }

  _switchMode(mode) {
    if (this._mode === mode) return;
    this._mode = mode;
    this._updateTabs();
    this._statusText.setText('');
    this._clearFields();
    this._buildFields(this.scale.width, this.scale.height);
  }

  _buildFields(width, height) {
    const isLogin = this._mode === 'login';
    const scale = this._canvasScale();
    const offset = this._canvasOffset();

    const fieldW = width * 0.76;
    const fieldH = 34;
    const labelStyle = { fontSize: '9px', color: '#8800aa', fontFamily: 'Arial Black, sans-serif' };
    const hintStyle  = { fontSize: '9px', color: '#555555', align: 'center' };

    const fields = isLogin
      ? [
          { key: 'email',    label: 'EMAIL',    type: 'email',    y: height * 0.485, hint: '' },
          { key: 'password', label: 'PASSWORD', type: 'password', y: height * 0.565, hint: '' },
        ]
      : [
          { key: 'username', label: 'USERNAME', type: 'text',     y: height * 0.455, hint: '3–20 chars · letters, numbers, _ only' },
          { key: 'email',    label: 'EMAIL',    type: 'email',    y: height * 0.535, hint: '' },
          { key: 'password', label: 'PASSWORD', type: 'password', y: height * 0.615, hint: 'At least 6 characters' },
        ];

    this._fieldDefs = fields;

    fields.forEach(({ key, label, type, y, hint }) => {
      const labelObj = this.add.text(width * 0.12, y - fieldH * 0.5 - 12, label, labelStyle);
      const bgRect = this.add.rectangle(width / 2, y, fieldW, fieldH, 0x111122)
        .setStrokeStyle(1.5, 0x8800aa, 0.8);

      const el = document.createElement('input');
      el.type = type;
      el.placeholder = label === 'EMAIL' ? 'your@email.com' : label === 'USERNAME' ? 'e.g. SpiderKing_99' : '••••••••';
      el.maxLength = key === 'username' ? 20 : 255;
      el.autocomplete = key === 'password' ? 'current-password' : key === 'email' ? 'email' : 'off';
      el.spellcheck = false;
      Object.assign(el.style, {
        position: 'absolute',
        left: `${(width / 2 - fieldW / 2) * scale + offset.x}px`,
        top:  `${(y - fieldH / 2) * scale + offset.y}px`,
        width: `${fieldW * scale}px`,
        height: `${fieldH * scale}px`,
        background: 'transparent', border: 'none', outline: 'none',
        color: '#00ff88', fontSize: `${13 * scale}px`,
        fontFamily: 'Arial, monospace', padding: '0 10px',
        boxSizing: 'border-box', zIndex: '100',
      });
      document.body.appendChild(el);

      el.addEventListener('keydown', (e) => { if (e.key === 'Enter') this._submit(); });

      const hintObj = hint
        ? this.add.text(width / 2, y + fieldH * 0.5 + 6, hint, hintStyle).setOrigin(0.5)
        : null;

      this._inputs.push(el);
      this._fieldContainer[key] = { el, labelObj, bgRect, hintObj };
    });

    // Focus first field
    this._inputs[0]?.focus();

    // Age + terms checkbox (register only) — placed BEFORE submit button so it has clear space
    let ageCheckEl = null;
    let ageCheckLabel = null;
    let ageCheckBox = null;
    const ckY = isLogin ? 0 : height * 0.695;
    if (!isLogin) {
      ageCheckEl = document.createElement('input');
      ageCheckEl.type = 'checkbox';
      const ckScale = this._canvasScale();
      const ckOff   = this._canvasOffset();
      Object.assign(ageCheckEl.style, {
        position: 'absolute',
        left: `${width * 0.12 * ckScale + ckOff.x}px`,
        top:  `${(ckY - 8) * ckScale + ckOff.y}px`,
        width: `${18 * ckScale}px`, height: `${18 * ckScale}px`,
        accentColor: '#00ff88', zIndex: '200', cursor: 'pointer',
      });
      document.body.appendChild(ageCheckEl);
      this._inputs.push(ageCheckEl);
      ageCheckLabel = this.add.text(width * 0.12 + 24, ckY, 'I confirm I am 21 or older and agree to the Terms of Service', {
        fontSize: '9px', color: '#888888', wordWrap: { width: fieldW - 40 },
      }).setOrigin(0, 0.5);
      ageCheckBox = ageCheckEl;
    }

    // Submit button — placed well below checkbox so it never overlaps
    const btnY = isLogin ? height * 0.645 : height * 0.755;
    this._submitBg = this.add.rectangle(width / 2, btnY, fieldW, 38, 0x00cc66)
      .setInteractive({ useHandCursor: true });
    this._submitTxt = this.add.text(width / 2, btnY, isLogin ? 'LOGIN  →' : 'CREATE ACCOUNT  →', {
      fontSize: '14px', fontFamily: 'Arial Black, sans-serif', color: '#000000',
    }).setOrigin(0.5);

    this._submitBg.on('pointerover', () => !this._loading && this._submitBg.setFillStyle(0x00ff88));
    this._submitBg.on('pointerout',  () => !this._loading && this._submitBg.setFillStyle(0x00cc66));
    this._submitBg.on('pointerdown', () => this._submit());

    // Toggle hint
    const toggleY = btnY + 38;
    const toggleMsg = isLogin ? "Don't have an account?  REGISTER" : 'Already have an account?  LOGIN';
    this._toggleText = this.add.text(width / 2, toggleY, toggleMsg, {
      fontSize: '10px', color: '#555555',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    this._toggleText.on('pointerover', () => this._toggleText.setColor('#aaaaaa'));
    this._toggleText.on('pointerout',  () => this._toggleText.setColor('#555555'));
    this._toggleText.on('pointerdown', () => this._switchMode(isLogin ? 'register' : 'login'));

    this._ageCheckEl = ageCheckBox;

    this._dynamicObjects = [this._submitBg, this._submitTxt, this._toggleText, ageCheckLabel,
      ...Object.values(this._fieldContainer).flatMap(f => [f.labelObj, f.bgRect, f.hintObj].filter(Boolean))].filter(Boolean);
  }

  _clearFields() {
    this._inputs.forEach(el => el.remove());
    this._inputs = [];
    this._dynamicObjects?.forEach(o => o?.destroy());
    this._dynamicObjects = [];
    this._submitBg = null;
    this._submitTxt = null;
    this._fieldContainer = {};
    this._fieldDefs = [];
  }

  _getFieldValue(key) {
    return (this._fieldContainer[key]?.el?.value || '').trim();
  }

  async _submit() {
    if (this._loading) return;
    this._statusText.setText('').setColor('#ff4444');

    const isLogin = this._mode === 'login';
    const email    = this._getFieldValue('email');
    const password = this._getFieldValue('password');

    // Client-side validation
    if (!email) return this._showError('Email is required');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return this._showError('Enter a valid email address');
    if (!password) return this._showError('Password is required');

    let body = { email, password };
    let endpoint = '/auth/login';

    if (!isLogin) {
      const username = this._getFieldValue('username');
      if (!username) return this._showError('Username is required');
      if (username.length < 3) return this._showError('Username must be at least 3 characters');
      if (!/^[a-zA-Z0-9_]+$/.test(username)) return this._showError('Username: letters, numbers and _ only');
      if (password.length < 6) return this._showError('Password must be at least 6 characters');
      if (!this._ageCheckEl?.checked) return this._showError('You must confirm you are 21 or older to play');
      body.username = username;
      endpoint = '/auth/register';
    }

    this._setLoading(true);

    try {
      const res = await fetch(`${SERVER_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok) {
        this._setLoading(false);
        return this._showError(data.error || 'Something went wrong');
      }

      // Success — save token and username
      localStorage.setItem('wsm_token', data.token);
      localStorage.setItem('wsm_username', data.username);

      this._statusText.setText(`✓ Welcome, ${data.username}!`).setColor('#00ff88');
      this._submitBg?.disableInteractive();
      this._submitTxt?.setText('ENTERING THE WEB…');
      this._clearAllInputs();

      this.time.delayedCall(800, () => {
        const overlay = this.add.rectangle(this.scale.width / 2, this.scale.height / 2, this.scale.width, this.scale.height, 0x000000, 0);
        this.tweens.add({ targets: overlay, alpha: 1, duration: 400, onComplete: () => this.scene.start('CinematicScene') });
      });
    } catch (err) {
      this._setLoading(false);
      this._showError('Cannot reach server — check connection');
    }
  }

  _showError(msg) {
    this._statusText.setText(msg).setColor('#ff4444');
    this.tweens.add({
      targets: this._statusText,
      x: { from: this.scale.width / 2 - 5, to: this.scale.width / 2 + 5 },
      duration: 55, yoyo: true, repeat: 3,
    });
  }

  _setLoading(on) {
    this._loading = on;
    this._submitBg?.setFillStyle(on ? 0x334433 : 0x00cc66);
    const label = on ? 'CHECKING…' : this._mode === 'login' ? 'LOGIN  →' : 'CREATE ACCOUNT  →';
    this._submitTxt?.setText(label);
  }

  _clearAllInputs() {
    this._inputs.forEach(el => el.remove());
    this._inputs = [];
  }

  _canvasScale() {
    const c = this.sys.game.canvas;
    return c.offsetWidth / c.width;
  }

  _canvasOffset() {
    const rect = this.sys.game.canvas.getBoundingClientRect();
    return { x: rect.left, y: rect.top };
  }

  _drawMiniSpider(x, y) {
    const g = this.add.graphics();
    g.fillStyle(0x0d0520, 1);
    g.fillEllipse(x, y + 4, 26, 20); g.lineStyle(1.5, 0x8800aa, 0.9); g.strokeEllipse(x, y + 4, 26, 20);
    g.fillEllipse(x, y - 10, 16, 12); g.lineStyle(1.5, 0x8800aa, 0.8); g.strokeEllipse(x, y - 10, 16, 12);
    g.fillStyle(0xff2200, 0.9);
    g.fillTriangle(x - 3, y + 1, x + 3, y + 1, x, y + 6);
    g.fillTriangle(x - 3, y + 7, x + 3, y + 7, x, y + 3);
    g.fillStyle(0xff2200, 0.9); g.fillCircle(x - 3, y - 12, 2.5); g.fillCircle(x + 3, y - 12, 2.5);
    g.lineStyle(1.5, 0x8800aa, 0.65);
    [[-8,-6,-18,-18],[-8,-3,-20,0],[8,-6,18,-18],[8,-3,20,0],[-8,3,-18,14],[8,3,18,14]].forEach(([ax,ay,ex,ey]) => {
      g.beginPath(); g.moveTo(x+ax, y+ay); g.lineTo(x+ex, y+ey); g.strokePath();
    });
    this.tweens.add({ targets: g, y: '-=7', duration: 950, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  _drawWebStrands(width, height) {
    const g = this.add.graphics();
    const draw = (cx, cy, rW, rH, col, alpha) => {
      const spokes = 7, rings = 4;
      g.lineStyle(1, col, alpha);
      for (let i = 0; i < spokes; i++) {
        const a = (i / spokes) * Math.PI * 2;
        g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * rW, cy + Math.sin(a) * rH); g.strokePath();
      }
      for (let r = 1; r <= rings; r++) {
        g.lineStyle(1, col, alpha * (1 - r / rings * 0.5));
        g.beginPath();
        for (let i = 0; i <= spokes; i++) {
          const a = (i / spokes) * Math.PI * 2, rf = r / rings;
          i === 0 ? g.moveTo(cx + Math.cos(a)*rW*rf, cy + Math.sin(a)*rH*rf)
                  : g.lineTo(cx + Math.cos(a)*rW*rf, cy + Math.sin(a)*rH*rf);
        }
        g.strokePath();
      }
    };
    draw(0, 0, 120, 140, 0x553366, 0.45);
    draw(width, 0, 120, 140, 0x553366, 0.45);
    draw(0, height, 75, 85, 0x332244, 0.28);
    draw(width, height, 75, 85, 0x332244, 0.28);
  }

  shutdown() {
    this._clearAllInputs();
  }
}
