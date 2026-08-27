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
    const panelW = Math.min(width - 20, 460);
    const panelH = 500;
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
    const token   = this.depositInfo?.token || 'USDT-ERC20';
    const chain   = this.depositInfo?.chain || 'Ethereum';

    add(this.scene.add.text(cx, y, 'HOW TO DEPOSIT USDT', {
      fontSize: '13px', fontFamily: 'Arial Black, sans-serif', color: '#00ff88',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(32));

    // Step 1
    add(this.scene.add.text(x, y + 20, '① SEND USDT TO THIS ADDRESS', {
      fontSize: '11px', fontFamily: 'Arial Black, sans-serif', color: '#ff8800',
    }).setScrollFactor(0).setDepth(32));

    add(this.scene.add.text(x, y + 33, '⚠ Ethereum network only — ERC-20 USDT — minimum $10', {
      fontSize: '10px', color: '#ff4400',
    }).setScrollFactor(0).setDepth(32));

    // House address box
    const addrBg = this.scene.add.rectangle(cx, y + 56, w, 30, 0x0d1a0d)
      .setScrollFactor(0).setDepth(32).setStrokeStyle(1, 0x00aa44);
    add(addrBg);

    const addrText = this.scene.add.text(cx, y + 52, address, {
      fontSize: '10px', color: '#00ff88', fontFamily: 'monospace',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(33);
    add(addrText);

    // Copy address button
    const copyDom = this.scene.add.dom(cx, y + 74).createFromHTML(
      `<button style="padding:4px 18px;background:#00aa44;color:#000;border:none;border-radius:4px;
        font-size:11px;font-weight:bold;cursor:pointer;font-family:Arial Black,sans-serif;
        letter-spacing:.5px;">📋 COPY ADDRESS</button>`
    ).setScrollFactor(0).setDepth(33);
    copyDom.node.querySelector('button').addEventListener('click', () => {
      navigator.clipboard.writeText(address).then(() => {
        const btn = copyDom.node.querySelector('button');
        btn.textContent = '✓ COPIED!';
        btn.style.background = '#00ff88';
        setTimeout(() => { btn.textContent = '📋 COPY ADDRESS'; btn.style.background = '#00aa44'; }, 2000);
      }).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = address; document.body.appendChild(ta); ta.select();
        document.execCommand('copy'); document.body.removeChild(ta);
        const btn = copyDom.node.querySelector('button');
        btn.textContent = '✓ COPIED!';
        setTimeout(() => { btn.textContent = '📋 COPY ADDRESS'; }, 2000);
      });
    });
    add(copyDom);

    // Step 2
    add(this.scene.add.text(x, y + 96, '② COPY YOUR TRANSACTION HASH', {
      fontSize: '11px', fontFamily: 'Arial Black, sans-serif', color: '#ff8800',
    }).setScrollFactor(0).setDepth(32));

    add(this.scene.add.text(x, y + 109,
      'After sending: MetaMask → Activity → tap the tx → copy the hash (0x…)',
      { fontSize: '10px', color: '#666666' }
    ).setScrollFactor(0).setDepth(32));

    // Step 3
    add(this.scene.add.text(x, y + 126, '③ ENTER HASH + AMOUNT AND VERIFY', {
      fontSize: '11px', fontFamily: 'Arial Black, sans-serif', color: '#ff8800',
    }).setScrollFactor(0).setDepth(32));

    add(this.scene.add.text(cx, y + 140, 'Transaction Hash (0x…):', {
      fontSize: '11px', color: '#aaaaaa',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(32));

    const txidInput = this._createInput(cx, y + 158, w, 'Paste transaction hash here (0x…)');
    add(txidInput.el);

    add(this.scene.add.text(cx, y + 182, 'Amount you sent (USDT):', {
      fontSize: '11px', color: '#aaaaaa',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(32));

    const amtInput = this._createInput(cx - w * 0.15, y + 200, w * 0.55, 'e.g. 50');
    add(amtInput.el);

    // Submit button
    const submitBtn = this.scene.add.text(cx, y + 236, '  VERIFY & CREDIT BALANCE  ', {
      fontSize: '15px', fontFamily: 'Arial Black, sans-serif',
      color: '#000000', backgroundColor: '#00ff88',
      padding: { x: 16, y: 10 },
    }).setOrigin(0.5).setScrollFactor(0).setDepth(32).setInteractive({ useHandCursor: true });

    submitBtn.on('pointerdown', () => {
      this._submitDeposit(txidInput.dom, amtInput.dom, submitBtn);
    });
    submitBtn.on('pointerover', () => submitBtn.setStyle({ backgroundColor: '#00cc66' }));
    submitBtn.on('pointerout', () => submitBtn.setStyle({ backgroundColor: '#00ff88' }));
    add(submitBtn);

    this.resultText = this.scene.add.text(cx, y + 278, '', {
      fontSize: '12px', color: '#00ff88', align: 'center',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(32);
    add(this.resultText);
  }

  _renderWithdraw(x, y, w, cx) {
    const add = (el) => this.elements.push(el);
    const FEE = 5;
    const MIN = 10;
    const MAX_DAILY = 2000;

    // ── Header ────────────────────────────────────────────────────────────────
    add(this.scene.add.text(cx, y, 'HOW TO WITHDRAW YOUR USDT', {
      fontSize: '13px', fontFamily: 'Arial Black, sans-serif', color: '#00ff88',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(32));

    // ── Step 1 ────────────────────────────────────────────────────────────────
    add(this.scene.add.text(x, y + 20, '① ENTER YOUR WALLET ADDRESS', {
      fontSize: '11px', fontFamily: 'Arial Black, sans-serif', color: '#ff8800',
    }).setScrollFactor(0).setDepth(32));

    add(this.scene.add.text(x, y + 34, 'Open MetaMask (or any Ethereum wallet) and copy your address.', {
      fontSize: '10px', color: '#666666',
    }).setScrollFactor(0).setDepth(32));

    const addrInput = this._createInput(cx, y + 56, w, '0x… paste your Ethereum address here');
    add(addrInput.el);

    // ── Step 2 ────────────────────────────────────────────────────────────────
    add(this.scene.add.text(x, y + 80, '② ENTER AMOUNT (USDT)', {
      fontSize: '11px', fontFamily: 'Arial Black, sans-serif', color: '#ff8800',
    }).setScrollFactor(0).setDepth(32));

    add(this.scene.add.text(x, y + 93, `Minimum $${MIN} USDT. A $${FEE} flat fee is deducted per withdrawal.`, {
      fontSize: '10px', color: '#666666',
    }).setScrollFactor(0).setDepth(32));

    const amtInput = this._createInput(cx - w * 0.18, y + 114, w * 0.55, 'Amount in USDT, e.g. 50');
    add(amtInput.el);

    // Live fee calculator
    const feeBox = this.scene.add.text(cx + w * 0.27, y + 114, `You receive:\n$${MIN - FEE}.00`, {
      fontSize: '11px', color: '#00ff88', align: 'center',
      backgroundColor: '#002211', padding: { x: 8, y: 6 },
    }).setOrigin(0.5).setScrollFactor(0).setDepth(32);
    add(feeBox);

    amtInput.dom.addEventListener('input', () => {
      const v = parseFloat(amtInput.dom.value) || 0;
      const net = Math.max(0, v - FEE);
      feeBox.setText(`You receive:\n$${net.toFixed(2)}`);
      feeBox.setColor(v >= MIN ? '#00ff88' : '#ff4444');
    });

    // ── Step 3 ────────────────────────────────────────────────────────────────
    add(this.scene.add.text(x, y + 140, '③ CONFIRM & SEND', {
      fontSize: '11px', fontFamily: 'Arial Black, sans-serif', color: '#ff8800',
    }).setScrollFactor(0).setDepth(32));

    add(this.scene.add.text(x, y + 153,
      'USDT-ERC20 will be sent to your address on the Ethereum network.',
      { fontSize: '10px', color: '#666666' }
    ).setScrollFactor(0).setDepth(32));

    const withdrawBtn = this.scene.add.text(cx, y + 178, '  WITHDRAW USDT  ', {
      fontSize: '15px', fontFamily: 'Arial Black, sans-serif',
      color: '#000000', backgroundColor: '#ff8800',
      padding: { x: 20, y: 10 },
    }).setOrigin(0.5).setScrollFactor(0).setDepth(32).setInteractive({ useHandCursor: true });

    withdrawBtn.on('pointerdown', () => {
      this._submitWithdrawal(addrInput.dom, amtInput.dom, withdrawBtn);
    });
    withdrawBtn.on('pointerover', () => withdrawBtn.setStyle({ backgroundColor: '#cc6600' }));
    withdrawBtn.on('pointerout', () => withdrawBtn.setStyle({ backgroundColor: '#ff8800' }));
    add(withdrawBtn);

    // ── Rules summary ─────────────────────────────────────────────────────────
    add(this.scene.add.text(cx, y + 214,
      `$${FEE} fee  •  $${MIN} min  •  $${MAX_DAILY}/day max  •  10 min cooldown  •  ERC-20 USDT only`,
      { fontSize: '10px', color: '#444444', align: 'center' }
    ).setOrigin(0.5).setScrollFactor(0).setDepth(32));

    this.resultText = this.scene.add.text(cx, y + 240, '', {
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
    if (!amount || amount < 10) return this._showResult('Minimum deposit is $10 USDT (Ethereum ERC-20 only)', false);

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

    if (!toAddress) return this._showResult('Enter your Ethereum wallet address (0x…)', false);
    if (!toAddress.startsWith('0x') || toAddress.length !== 42) return this._showResult('Address must be a valid Ethereum address (0x + 40 hex chars)', false);
    if (!amount || amount < 10) return this._showResult('Minimum withdrawal is $10 USDT (you receive $5 after the $5 fee)', false);

    btn.setText('Processing…').setStyle({ backgroundColor: '#555555' });

    try {
      const res = await fetch(`${SERVER_URL}/payment/withdraw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ socketId: this.socketId, toAddress, amount }),
      });
      const data = await res.json();

      if (data.ok) {
        const net = data.netAmount ?? (amount - 5);
        const msg = data.status === 'queued'
          ? `⏳ ${data.message}`
          : `✓ Sent $${net.toFixed(2)} USDT${data.mock ? ' (MOCK)' : ''}\nTx: ${data.txid?.slice(0, 22)}…`;
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
