import { SERVER_URL } from '../config';

const CSS = `
  #wp-overlay {
    position: fixed; inset: 0; z-index: 9999;
    background: rgba(0,0,0,0.75);
    display: flex; align-items: center; justify-content: center;
    font-family: Arial, sans-serif;
  }
  #wp-panel {
    background: #111; border: 2px solid #00ff88; border-radius: 12px;
    width: 400px; max-width: calc(100vw - 24px);
    max-height: calc(100vh - 40px); overflow: hidden;
    display: flex; flex-direction: column;
  }
  #wp-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 18px 0; flex-shrink: 0;
  }
  #wp-title { color: #00ff88; font-size: 16px; font-weight: bold; margin: 0; }
  #wp-close {
    background: none; border: none; color: #666; font-size: 20px;
    cursor: pointer; line-height: 1; padding: 0 2px;
  }
  #wp-close:hover { color: #fff; }
  #wp-tabs {
    display: flex; border-bottom: 2px solid #222;
    padding: 10px 18px 0; gap: 4px; flex-shrink: 0;
  }
  .wp-tab {
    padding: 7px 14px; font-size: 12px; font-weight: bold;
    border: none; border-radius: 6px 6px 0 0; cursor: pointer;
    background: #1a1a1a; color: #666; letter-spacing: .3px;
  }
  .wp-tab.active { background: #00ff88; color: #000; }
  #wp-body { padding: 18px; overflow-y: auto; flex: 1; }
  .wp-section { margin-bottom: 14px; }
  .wp-label {
    font-size: 11px; color: #888; text-transform: uppercase;
    letter-spacing: .8px; margin-bottom: 5px; display: block;
  }
  .wp-input {
    width: 100%; padding: 9px 11px; background: #1a1a1a;
    border: 1px solid #333; border-radius: 6px; color: #fff;
    font-size: 13px; outline: none; box-sizing: border-box;
  }
  .wp-input:focus { border-color: #00ff88; }
  .wp-input::placeholder { color: #444; }
  .wp-addr-row { display: flex; gap: 8px; align-items: stretch; }
  .wp-addr-row .wp-input { font-size: 10px; font-family: monospace; color: #00ff88; flex: 1; }
  .wp-copy-btn {
    padding: 0 14px; background: #00aa44; color: #000; border: none;
    border-radius: 6px; font-size: 12px; font-weight: bold;
    cursor: pointer; white-space: nowrap; flex-shrink: 0;
  }
  .wp-copy-btn:hover { background: #00cc55; }
  .wp-warning {
    font-size: 11px; color: #ff5500; background: #1a0a00;
    border: 1px solid #331100; border-radius: 5px;
    padding: 6px 10px; margin-bottom: 14px;
  }
  .wp-info-row {
    display: flex; gap: 10px; margin-top: 6px; flex-wrap: wrap;
  }
  .wp-info-pill {
    font-size: 10px; color: #666; background: #1a1a1a;
    border-radius: 4px; padding: 3px 8px;
  }
  .wp-amount-row { display: flex; gap: 8px; align-items: flex-start; }
  .wp-amount-row .wp-input { width: 130px; flex-shrink: 0; }
  .wp-receive-box {
    flex: 1; background: #001a0d; border: 1px solid #00aa44;
    border-radius: 6px; padding: 8px 11px;
  }
  .wp-receive-box .label { font-size: 10px; color: #555; }
  .wp-receive-box .value { font-size: 18px; font-weight: bold; color: #00ff88; margin-top: 1px; }
  .wp-btn {
    width: 100%; padding: 12px; border: none; border-radius: 7px;
    font-size: 14px; font-weight: bold; cursor: pointer; margin-top: 4px;
    letter-spacing: .3px;
  }
  .wp-btn-green { background: #00ff88; color: #000; }
  .wp-btn-green:hover { background: #00cc66; }
  .wp-btn-orange { background: #ff8800; color: #000; }
  .wp-btn-orange:hover { background: #cc6600; }
  .wp-btn:disabled { background: #333; color: #555; cursor: not-allowed; }
  .wp-rules {
    font-size: 10px; color: #444; text-align: center;
    margin-top: 10px; line-height: 1.7;
  }
  .wp-msg { font-size: 12px; margin-top: 10px; text-align: center;
            min-height: 18px; line-height: 1.5; }
  .wp-msg.ok  { color: #00ff88; }
  .wp-msg.err { color: #ff4444; }
  .wp-divider { border: none; border-top: 1px solid #1a1a1a; margin: 14px 0; }
  /* History */
  .wp-tx { display: flex; justify-content: space-between; align-items: center;
           padding: 9px 0; border-bottom: 1px solid #1a1a1a; font-size: 12px; }
  .wp-tx:last-child { border-bottom: none; }
  .wp-tx-type { color: #888; text-transform: uppercase; font-size: 10px;
                letter-spacing: .5px; margin-top: 2px; }
  .wp-tx-amt { font-weight: bold; }
  .wp-tx-amt.dep { color: #00ff88; }
  .wp-tx-amt.with { color: #ff8800; }
  .wp-tx-status { font-size: 10px; color: #555; margin-top: 2px; text-align: right; }
  .wp-empty { color: #444; text-align: center; padding: 30px 0; font-size: 13px; }
  .wp-mock { font-size: 10px; color: #ff8800; text-align: center;
             margin-bottom: 12px; }
`;

export default class WalletPanel {
  constructor(scene, socketId, onBalanceUpdate) {
    this.scene       = scene;
    this.socketId    = socketId;
    this.onBalanceUpdate = onBalanceUpdate;
    this.visible     = false;
    this.depositInfo = null;
    this.tab         = 'deposit';
    this._el         = null;
    this._styleEl    = null;
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

  toggle() { this.visible ? this.hide() : this.show(); }

  show() {
    this.visible = true;
    this._injectStyles();
    if (this._el) this._el.remove();
    this._el = this._build();
    document.body.appendChild(this._el);
  }

  hide() {
    this.visible = false;
    if (this._el) { this._el.remove(); this._el = null; }
  }

  _injectStyles() {
    if (document.getElementById('wp-styles')) return;
    const s = document.createElement('style');
    s.id = 'wp-styles';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  _build() {
    const overlay = document.createElement('div');
    overlay.id = 'wp-overlay';
    overlay.addEventListener('click', e => { if (e.target === overlay) this.hide(); });

    overlay.innerHTML = `
      <div id="wp-panel">
        <div id="wp-header">
          <p id="wp-title">💰 WALLET</p>
          <button id="wp-close">✕</button>
        </div>
        <div id="wp-tabs">
          <button class="wp-tab ${this.tab==='deposit'  ?'active':''}" data-tab="deposit">DEPOSIT</button>
          <button class="wp-tab ${this.tab==='withdraw' ?'active':''}" data-tab="withdraw">WITHDRAW</button>
          <button class="wp-tab ${this.tab==='history'  ?'active':''}" data-tab="history">HISTORY</button>
        </div>
        <div id="wp-body">
          ${this.tab === 'deposit'  ? this._depositHTML()  : ''}
          ${this.tab === 'withdraw' ? this._withdrawHTML() : ''}
          ${this.tab === 'history'  ? this._historyHTML()  : ''}
        </div>
      </div>
    `;

    overlay.querySelector('#wp-close').addEventListener('click', () => this.hide());

    overlay.querySelectorAll('.wp-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        this.tab = btn.dataset.tab;
        this.hide();
        this.show();
      });
    });

    if (this.tab === 'deposit')  this._bindDeposit(overlay);
    if (this.tab === 'withdraw') this._bindWithdraw(overlay);
    if (this.tab === 'history')  this._loadHistory(overlay);

    return overlay;
  }

  // ── DEPOSIT ────────────────────────────────────────────────────────────────

  _depositHTML() {
    const address = this.depositInfo?.houseAddress || 'Loading…';
    const mock    = this.depositInfo?.mock;
    return `
      ${mock ? '<div class="wp-mock">⚠ MOCK MODE — no real funds moved</div>' : ''}
      <div class="wp-warning">
        ⚠ Send <strong>USDT only</strong> on the <strong>Ethereum (ERC-20)</strong> network.<br>
        Wrong network = lost funds. No other tokens accepted.
      </div>

      <div class="wp-section">
        <span class="wp-label">① Send USDT to this address</span>
        <div class="wp-addr-row">
          <input class="wp-input" id="wp-dep-addr" readonly value="${address}" />
          <button class="wp-copy-btn" id="wp-copy-btn">COPY</button>
        </div>
      </div>

      <hr class="wp-divider">

      <div class="wp-section">
        <span class="wp-label">② After sending — paste your transaction hash</span>
        <input class="wp-input" id="wp-txid" placeholder="0x… transaction hash from MetaMask" />
      </div>

      <div class="wp-section">
        <span class="wp-label">③ Amount you sent (USDT)</span>
        <input class="wp-input" id="wp-dep-amt" type="number" placeholder="e.g. 50" min="10" max="5000" style="width:160px;" />
        <div class="wp-info-row">
          <span class="wp-info-pill">Min deposit: $10</span>
          <span class="wp-info-pill">Max deposit: $5,000</span>
        </div>
      </div>

      <button class="wp-btn wp-btn-green" id="wp-dep-btn">VERIFY & CREDIT BALANCE</button>
      <div class="wp-msg" id="wp-dep-msg"></div>
    `;
  }

  _bindDeposit(overlay) {
    // Copy button
    overlay.querySelector('#wp-copy-btn').addEventListener('click', () => {
      const addr = this.depositInfo?.houseAddress || '';
      const btn  = overlay.querySelector('#wp-copy-btn');
      navigator.clipboard.writeText(addr).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = addr; document.body.appendChild(ta);
        ta.select(); document.execCommand('copy');
        document.body.removeChild(ta);
      });
      btn.textContent = '✓ COPIED';
      btn.style.background = '#00ff88';
      setTimeout(() => { btn.textContent = 'COPY'; btn.style.background = ''; }, 2000);
    });

    // Submit
    overlay.querySelector('#wp-dep-btn').addEventListener('click', async () => {
      const txid   = overlay.querySelector('#wp-txid').value.trim();
      const amount = parseFloat(overlay.querySelector('#wp-dep-amt').value);
      const msg    = overlay.querySelector('#wp-dep-msg');
      const btn    = overlay.querySelector('#wp-dep-btn');

      if (!txid)              return this._msg(msg, 'Paste your transaction hash first', false);
      if (amount < 10)        return this._msg(msg, 'Minimum deposit is $10 USDT', false);
      if (amount > 5000)      return this._msg(msg, 'Maximum deposit is $5,000 USDT', false);

      btn.disabled = true; btn.textContent = 'Verifying…';
      try {
        const res  = await fetch(`${SERVER_URL}/payment/deposit`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ socketId: this.socketId, txid, amount }),
        });
        const data = await res.json();
        if (data.ok) {
          this._msg(msg, `✓ Credited $${data.amountUSDT} USDT to your balance${data.mock ? ' (mock)' : ''}`, true);
          if (this.onBalanceUpdate) this.onBalanceUpdate(data.newBalance);
          overlay.querySelector('#wp-txid').value      = '';
          overlay.querySelector('#wp-dep-amt').value   = '';
        } else {
          this._msg(msg, `✗ ${data.error}`, false);
        }
      } catch { this._msg(msg, 'Server error — try again', false); }
      btn.disabled = false; btn.textContent = 'VERIFY & CREDIT BALANCE';
    });
  }

  // ── WITHDRAW ───────────────────────────────────────────────────────────────

  _withdrawHTML() {
    return `
      <div class="wp-section">
        <span class="wp-label">① Your Ethereum wallet address</span>
        <input class="wp-input" id="wp-w-addr" placeholder="0x… your MetaMask address" />
      </div>

      <div class="wp-section">
        <span class="wp-label">② Amount to withdraw</span>
        <div class="wp-amount-row">
          <input class="wp-input" id="wp-w-amt" type="number" placeholder="10" min="10" max="2000" />
          <div class="wp-receive-box">
            <div class="label">You receive</div>
            <div class="value" id="wp-receive">$5.00</div>
          </div>
        </div>
      </div>

      <button class="wp-btn wp-btn-orange" id="wp-w-btn">WITHDRAW USDT</button>

      <div class="wp-rules">
        $5 fee deducted per withdrawal &nbsp;·&nbsp; Min $10 &nbsp;·&nbsp; Max $2,000/day<br>
        10 min cooldown between withdrawals &nbsp;·&nbsp; ERC-20 USDT on Ethereum only
      </div>
      <div class="wp-msg" id="wp-w-msg"></div>
    `;
  }

  _bindWithdraw(overlay) {
    const amtEl     = overlay.querySelector('#wp-w-amt');
    const receiveEl = overlay.querySelector('#wp-receive');
    const FEE = 5;

    amtEl.addEventListener('input', () => {
      const v   = parseFloat(amtEl.value) || 0;
      const net = Math.max(0, v - FEE);
      receiveEl.textContent = `$${net.toFixed(2)}`;
      receiveEl.style.color = v >= 10 ? '#00ff88' : '#ff4444';
    });

    overlay.querySelector('#wp-w-btn').addEventListener('click', async () => {
      const addr   = overlay.querySelector('#wp-w-addr').value.trim();
      const amount = parseFloat(amtEl.value);
      const msg    = overlay.querySelector('#wp-w-msg');
      const btn    = overlay.querySelector('#wp-w-btn');

      if (!addr.startsWith('0x') || addr.length !== 42)
        return this._msg(msg, 'Enter a valid Ethereum address (0x + 40 characters)', false);
      if (!amount || amount < 10)
        return this._msg(msg, 'Minimum withdrawal is $10 USDT', false);
      if (amount > 2000)
        return this._msg(msg, 'Maximum $2,000 per day', false);

      btn.disabled = true; btn.textContent = 'Processing…';
      try {
        const res  = await fetch(`${SERVER_URL}/payment/withdraw`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ socketId: this.socketId, toAddress: addr, amount }),
        });
        const data = await res.json();
        if (data.ok) {
          const net = data.netAmount ?? (amount - FEE);
          const txt = data.status === 'queued'
            ? `⏳ Queued for review — you will receive $${net.toFixed(2)} USDT once approved`
            : `✓ Sent $${net.toFixed(2)} USDT${data.mock ? ' (mock)' : ''} — Tx: ${(data.txid||'').slice(0,20)}…`;
          this._msg(msg, txt, true);
          if (this.onBalanceUpdate) this.onBalanceUpdate(data.newBalance);
          amtEl.value = '';
          receiveEl.textContent = '$5.00';
        } else {
          this._msg(msg, `✗ ${data.error}`, false);
        }
      } catch { this._msg(msg, 'Server error — try again', false); }
      btn.disabled = false; btn.textContent = 'WITHDRAW USDT';
    });
  }

  // ── HISTORY ────────────────────────────────────────────────────────────────

  _historyHTML() {
    return `<div id="wp-hist-list"><div class="wp-empty">Loading…</div></div>`;
  }

  async _loadHistory(overlay) {
    const container = overlay.querySelector('#wp-hist-list');
    try {
      const res  = await fetch(`${SERVER_URL}/payment/history/${this.socketId}`);
      const rows = await res.json();
      if (!rows.length) {
        container.innerHTML = '<div class="wp-empty">No transactions yet</div>';
        return;
      }
      container.innerHTML = rows.slice(0, 12).map(r => {
        const dep  = r.type === 'deposit';
        const amt  = parseFloat(r.amount).toFixed(2);
        const date = new Date(r.created_at || r.confirmed_at).toLocaleDateString();
        const ok   = r.status === 'confirmed';
        return `
          <div class="wp-tx">
            <div>
              <div style="color:#ccc;font-size:13px;">${dep ? '↓ Deposit' : '↑ Withdraw'}</div>
              <div class="wp-tx-type">${date}</div>
            </div>
            <div style="text-align:right;">
              <div class="wp-tx-amt ${dep ? 'dep' : 'with'}">
                ${dep ? '+' : '-'}$${amt}
              </div>
              <div class="wp-tx-status">${ok ? '✓ confirmed' : '⏳ pending'}</div>
            </div>
          </div>`;
      }).join('');
    } catch {
      container.innerHTML = '<div class="wp-empty">Could not load history</div>';
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  _msg(el, text, ok) {
    el.textContent = text;
    el.className   = `wp-msg ${ok ? 'ok' : 'err'}`;
  }

  destroy() { this.hide(); }
}
