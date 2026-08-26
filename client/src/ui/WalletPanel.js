import { SERVER_URL } from '../config';

export default class WalletPanel {
  constructor(scene, socketId, onBalanceUpdate) {
    this.scene = scene;
    this.socketId = socketId;
    this.onBalanceUpdate = onBalanceUpdate;
    this.visible = false;
    this.depositInfo = null;
    this.elements = [];
    this.tab = 'deposit'; // 'deposit' | 'withdraw' | 'history'

    this._fetchDepositInfo();
  }

  async _fetchDepositInfo() {
    try {
      const res = await fetch(`${SERVER_URL}/payment/deposit-info`);
      this.depositInfo = await res.json();
    } catch {
      this.depositInfo = { houseAddress: 'Unavailable', mock: true };
    }
  }

  // ── Toggle ────────────────────────────────────────────────────────────────

  toggle() {
    this.visible ? this.hide() : this.show();
  }

  show() {
    this.visible = true;
    this._render();
  }

  hide() {
    this.visible = false;
    this.elements.forEach(e => e?.destroy?.());
    this.elements = [];
  }

  // ── Render ────────────────────────────────────────────────────────────────

  _render() {
    this.elements.forEach(e => e?.destroy?.());
    this.elements = [];

    const { width, height } = this.scene.scale;
    const panelW = Math.min(width - 20, 440);
    const panelH = 420;
    const panelX = width / 2;
    const panelY = height / 2;

    // Backdrop
    const backdrop = this.scene.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.6)
      .setScrollFactor(0).setDepth(30).setInteractive();
    backdrop.on('pointerdown', () => this.hide());
    this.elements.push(backdrop);

    // Panel bg
    const panel = this.scene.add.rectangle(panelX, panelY, panelW, panelH, 0x111111, 1)
      .setScrollFactor(0).setDepth(31);
    panel.setStrokeStyle(2, 0x00ff88);
    this.elements.push(panel);

    // Title
    const title = this.scene.add.text(panelX, panelY - panelH / 2 + 24, '💰 WALLET', {
      fontSize: '20px', fontFamily: 'Arial Black, sans-serif', color: '#00ff88',
    }).setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(32);
    this.elements.push(title);

    // Mock badge
    if (this.depositInfo?.mock) {
      const badge = this.scene.add.text(panelX, panelY - panelH / 2 + 46, '⚠ MOCK MODE — no real funds', {
        fontSize: '11px', color: '#ff8800',
      }).setOrigin(0.5).setScrollFactor(0).setDepth(32);
      this.elements.push(badge);
    }

    // Close button
    const closeBtn = this.scene.add.text(panelX + panelW / 2 - 12, panelY - panelH / 2 + 12, '✕', {
      fontSize: '18px', color: '#888888',
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(32).setInteractive({ useHandCursor: true });
    closeBtn.on('pointerdown', () => this.hide());
    closeBtn.on('pointerover', () => closeBtn.setColor('#ffffff'));
    closeBtn.on('pointerout', () => closeBtn.setColor('#888888'));
    this.elements.push(closeBtn);

    // Tab bar
    const tabs = ['DEPOSIT', 'WITHDRAW', 'HISTORY'];
    const tabY = panelY - panelH / 2 + 72;
    tabs.forEach((label, i) => {
      const tabX = panelX - panelW / 2 + 30 + i * (panelW / 3);
      const isActive = this.tab === label.toLowerCase();
      const tabBtn = this.scene.add.text(tabX, tabY, label, {
        fontSize: '13px', fontFamily: 'Arial Black, sans-serif',
        color: isActive ? '#000000' : '#aaaaaa',
        backgroundColor: isActive ? '#00ff88' : '#222222',
        padding: { x: 12, y: 6 },
      }).setScrollFactor(0).setDepth(32).setInteractive({ useHandCursor: true });

      tabBtn.on('pointerdown', () => {
        this.tab = label.toLowerCase();
        this.hide();
        this.show();
      });
      this.elements.push(tabBtn);
    });

    // Content area
    const contentY = panelY - panelH / 2 + 110;
    const contentX = panelX - panelW / 2 + 20;
    const contentW = panelW - 40;

    if (this.tab === 'deposit') this._renderDeposit(contentX, contentY, contentW, panelX);
    if (this.tab === 'withdraw') this._renderWithdraw(contentX, contentY, contentW, panelX);
    if (this.tab === 'history') this._renderHistory(contentX, contentY, contentW, panelX);
  }

  _renderDeposit(x, y, w, cx) {
    const add = (el) => this.elements.push(el);
    const address = this.depositInfo?.houseAddress || 'Loading…';

    add(this.scene.add.text(cx, y, 'Send USDT-TRC20 to this address:', {
      fontSize: '13px', color: '#aaaaaa',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(32));

    // House address box
    const addrBg = this.scene.add.rectangle(cx, y + 30, w, 32, 0x1a1a1a)
      .setScrollFactor(0).setDepth(32).setStrokeStyle(1, 0x333333);
    add(addrBg);

    const addrText = this.scene.add.text(cx, y + 30, address, {
      fontSize: '11px', color: '#00ff88', fontFamily: 'monospace',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(33);
    add(addrText);

    // Instructions
    add(this.scene.add.text(cx, y + 60,
      '1. Send USDT-TRC20 to address above\n2. Copy your transaction ID (TXID)\n3. Enter TXID + amount below',
      { fontSize: '12px', color: '#888888', align: 'center' }
    ).setOrigin(0.5).setScrollFactor(0).setDepth(32));

    // TXID input (HTML overlay)
    add(this.scene.add.text(cx, y + 108, 'Transaction ID (TXID):', {
      fontSize: '12px', color: '#aaaaaa',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(32));

    const txidInput = this._createInput(cx, y + 128, w, 'Paste TXID here…');
    add(txidInput.el);

    add(this.scene.add.text(cx, y + 158, 'Amount (USDT):', {
      fontSize: '12px', color: '#aaaaaa',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(32));

    const amtInput = this._createInput(cx, y + 178, w * 0.4, '0.00');
    add(amtInput.el);

    // Submit button
    const submitBtn = this.scene.add.text(cx, y + 215, 'VERIFY & CREDIT', {
      fontSize: '16px', fontFamily: 'Arial Black, sans-serif',
      color: '#000000', backgroundColor: '#00ff88',
      padding: { x: 20, y: 10 },
    }).setOrigin(0.5).setScrollFactor(0).setDepth(32).setInteractive({ useHandCursor: true });

    submitBtn.on('pointerdown', () => {
      this._submitDeposit(txidInput.dom, amtInput.dom, submitBtn);
    });
    submitBtn.on('pointerover', () => submitBtn.setStyle({ backgroundColor: '#00cc66' }));
    submitBtn.on('pointerout', () => submitBtn.setStyle({ backgroundColor: '#00ff88' }));
    add(submitBtn);

    this.resultText = this.scene.add.text(cx, y + 255, '', {
      fontSize: '12px', color: '#00ff88', align: 'center',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(32);
    add(this.resultText);
  }

  _renderWithdraw(x, y, w, cx) {
    const add = (el) => this.elements.push(el);

    add(this.scene.add.text(cx, y, 'Withdraw USDT to your TRC20 wallet:', {
      fontSize: '13px', color: '#aaaaaa',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(32));

    add(this.scene.add.text(cx, y + 30, 'Your TRC20 address:', {
      fontSize: '12px', color: '#888888',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(32));

    const addrInput = this._createInput(cx, y + 52, w, 'TYourWalletAddressHere…');
    add(addrInput.el);

    add(this.scene.add.text(cx, y + 80, 'Amount (USDT) — min $5:', {
      fontSize: '12px', color: '#888888',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(32));

    const amtInput = this._createInput(cx, y + 102, w * 0.4, '5.00');
    add(amtInput.el);

    add(this.scene.add.text(cx, y + 128,
      '• Min $5 USDT  • 10 min cooldown\n• >$500 requires manual review (24h)',
      { fontSize: '11px', color: '#555555', align: 'center' }
    ).setOrigin(0.5).setScrollFactor(0).setDepth(32));

    const withdrawBtn = this.scene.add.text(cx, y + 168, 'WITHDRAW', {
      fontSize: '16px', fontFamily: 'Arial Black, sans-serif',
      color: '#000000', backgroundColor: '#ff8800',
      padding: { x: 24, y: 10 },
    }).setOrigin(0.5).setScrollFactor(0).setDepth(32).setInteractive({ useHandCursor: true });

    withdrawBtn.on('pointerdown', () => {
      this._submitWithdrawal(addrInput.dom, amtInput.dom, withdrawBtn);
    });
    withdrawBtn.on('pointerover', () => withdrawBtn.setStyle({ backgroundColor: '#cc6600' }));
    withdrawBtn.on('pointerout', () => withdrawBtn.setStyle({ backgroundColor: '#ff8800' }));
    add(withdrawBtn);

    this.resultText = this.scene.add.text(cx, y + 210, '', {
      fontSize: '12px', color: '#00ff88', align: 'center', wordWrap: { width: w },
    }).setOrigin(0.5).setScrollFactor(0).setDepth(32);
    add(this.resultText);
  }

  _renderHistory(x, y, w, cx) {
    const add = (el) => this.elements.push(el);

    add(this.scene.add.text(cx, y, 'Loading transaction history…', {
      fontSize: '12px', color: '#666666',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(32));

    fetch(`${SERVER_URL}/payment/history/${this.socketId}`)
      .then(r => r.json())
      .then(rows => {
        this.elements = this.elements.filter(e => e?.active !== false);
        if (!rows.length) {
          add(this.scene.add.text(cx, y, 'No transactions yet.', {
            fontSize: '13px', color: '#555555',
          }).setOrigin(0.5).setScrollFactor(0).setDepth(32));
          return;
        }
        rows.slice(0, 8).forEach((row, i) => {
          const color = row.type === 'deposit' ? '#00ff88' : '#ff8800';
          const icon = row.type === 'deposit' ? '↓' : '↑';
          const status = row.status === 'confirmed' ? '✓' : '⏳';
          add(this.scene.add.text(x, y + i * 28,
            `${icon} $${parseFloat(row.amount).toFixed(2)} USDT  ${status} ${row.type}`,
            { fontSize: '12px', color }
          ).setScrollFactor(0).setDepth(32));
        });
      })
      .catch(() => {});
  }

  // ── DOM Input Elements ────────────────────────────────────────────────────

  _createInput(cx, cy, w, placeholder) {
    const domEl = this.scene.add.dom(cx, cy).createFromHTML(
      `<input type="text" placeholder="${placeholder}"
        style="width:${w}px;padding:6px 10px;background:#1a1a1a;color:#fff;
               border:1px solid #333;border-radius:4px;font-size:12px;outline:none;
               font-family:monospace;" />`
    ).setScrollFactor(0).setDepth(33);
    return { el: domEl, dom: domEl.node.querySelector('input') };
  }

  // ── API Calls ─────────────────────────────────────────────────────────────

  async _submitDeposit(txidEl, amtEl, btn) {
    const txid = txidEl?.value?.trim();
    const amount = parseFloat(amtEl?.value);

    if (!txid) return this._showResult('Enter a transaction ID', false);
    if (!amount || amount < 1) return this._showResult('Enter a valid amount (min $1)', false);

    btn.setText('Verifying…').setStyle({ backgroundColor: '#555555' });

    try {
      const res = await fetch(`${SERVER_URL}/payment/deposit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ socketId: this.socketId, txid, amount }),
      });
      const data = await res.json();

      if (data.ok) {
        this._showResult(`✓ Deposited $${data.amountUSDT} USDT${data.mock ? ' (MOCK)' : ''}`, true);
        if (this.onBalanceUpdate) this.onBalanceUpdate(data.newBalance);
        txidEl.value = '';
        amtEl.value = '';
      } else {
        this._showResult(`✗ ${data.error}`, false);
      }
    } catch {
      this._showResult('Server error — try again', false);
    }

    btn.setText('VERIFY & CREDIT').setStyle({ backgroundColor: '#00ff88' });
  }

  async _submitWithdrawal(addrEl, amtEl, btn) {
    const toAddress = addrEl?.value?.trim();
    const amount = parseFloat(amtEl?.value);

    if (!toAddress) return this._showResult('Enter your TRC20 wallet address', false);
    if (!amount || amount < 5) return this._showResult('Minimum withdrawal is $5 USDT', false);

    btn.setText('Processing…').setStyle({ backgroundColor: '#555555' });

    try {
      const res = await fetch(`${SERVER_URL}/payment/withdraw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ socketId: this.socketId, toAddress, amount }),
      });
      const data = await res.json();

      if (data.ok) {
        const msg = data.status === 'queued'
          ? `⏳ ${data.message}`
          : `✓ Sent $${amount} USDT${data.mock ? ' (MOCK)' : ''}\nTXID: ${data.txid?.slice(0, 20)}…`;
        this._showResult(msg, true);
        if (this.onBalanceUpdate) this.onBalanceUpdate(data.newBalance);
      } else {
        this._showResult(`✗ ${data.error}`, false);
      }
    } catch {
      this._showResult('Server error — try again', false);
    }

    btn.setText('WITHDRAW').setStyle({ backgroundColor: '#ff8800' });
  }

  _showResult(msg, success) {
    if (this.resultText?.active) {
      this.resultText.setText(msg).setColor(success ? '#00ff88' : '#ff4444');
    }
  }

  destroy() {
    this.hide();
  }
}
