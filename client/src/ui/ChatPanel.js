import socket from '../systems/SocketManager';

const QUICK_REACTIONS = ['🚀', '💀', '🔥', '🤑', '😱', '💎', '🕷'];

export default class ChatPanel {
  constructor(scene) {
    this.scene = scene;
    this.visible = false;
    this.unread = 0;
    this.container = null;
    this.msgList = null;
    this.input = null;
    this.badge = null;
    this._boundOnMessage = this._onMessage.bind(this);
    this._boundOnHistory = this._onHistory.bind(this);
    this._boundOnError = this._onError.bind(this);

    socket.on('chat:message', this._boundOnMessage);
    socket.on('chat:history', this._boundOnHistory);
    socket.on('chat:error', this._boundOnError);
  }

  // ── Toggle ─────────────────────────────────────────────────────────────────

  toggle() {
    this.visible ? this.hide() : this.show();
  }

  show() {
    this.visible = true;
    this.unread = 0;
    this._updateBadge();
    if (!this.container) this._buildDOM();
    this.container.style.display = 'flex';
    // Scroll to bottom on open
    setTimeout(() => {
      if (this.msgList) this.msgList.scrollTop = this.msgList.scrollHeight;
      if (this.input) this.input.focus();
    }, 50);
  }

  hide() {
    this.visible = false;
    if (this.container) this.container.style.display = 'none';
  }

  // ── DOM Construction ───────────────────────────────────────────────────────

  _buildDOM() {
    const { width, height } = this.scene.scale;

    // Outer panel container
    this.container = document.createElement('div');
    Object.assign(this.container.style, {
      position: 'fixed',
      bottom: '140px',
      right: '8px',
      width: `${Math.min(width - 16, 280)}px`,
      height: '340px',
      background: 'rgba(10, 10, 18, 0.92)',
      border: '1px solid #222',
      borderRadius: '8px',
      display: 'flex',
      flexDirection: 'column',
      zIndex: '200',
      fontFamily: 'Arial, sans-serif',
      boxShadow: '0 4px 24px rgba(0,0,0,0.7)',
      backdropFilter: 'blur(4px)',
      overflow: 'hidden',
    });

    // Header
    const header = document.createElement('div');
    Object.assign(header.style, {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '8px 12px',
      borderBottom: '1px solid #1a1a1a',
      background: 'rgba(0,0,0,0.4)',
      flexShrink: '0',
    });
    const headerTitle = document.createElement('span');
    headerTitle.textContent = '💬 Live Chat';
    Object.assign(headerTitle.style, { color: '#00ff88', fontWeight: 'bold', fontSize: '13px' });
    const closeBtn = document.createElement('span');
    closeBtn.textContent = '✕';
    Object.assign(closeBtn.style, {
      color: '#666', cursor: 'pointer', fontSize: '16px', lineHeight: '1',
      padding: '2px 4px',
    });
    closeBtn.addEventListener('click', () => this.hide());
    closeBtn.addEventListener('mouseover', () => { closeBtn.style.color = '#fff'; });
    closeBtn.addEventListener('mouseout', () => { closeBtn.style.color = '#666'; });
    header.append(headerTitle, closeBtn);

    // Message list
    this.msgList = document.createElement('div');
    Object.assign(this.msgList.style, {
      flex: '1',
      overflowY: 'auto',
      padding: '8px 10px',
      display: 'flex',
      flexDirection: 'column',
      gap: '4px',
    });
    // Thin scrollbar
    const scrollStyle = document.createElement('style');
    scrollStyle.textContent = `
      .wsm-msglist::-webkit-scrollbar { width: 4px; }
      .wsm-msglist::-webkit-scrollbar-track { background: transparent; }
      .wsm-msglist::-webkit-scrollbar-thumb { background: #333; border-radius: 2px; }
    `;
    document.head.appendChild(scrollStyle);
    this.msgList.className = 'wsm-msglist';

    // Quick reactions bar
    const reactBar = document.createElement('div');
    Object.assign(reactBar.style, {
      display: 'flex',
      gap: '4px',
      padding: '6px 10px',
      borderTop: '1px solid #1a1a1a',
      background: 'rgba(0,0,0,0.2)',
      flexShrink: '0',
    });
    QUICK_REACTIONS.forEach(emoji => {
      const btn = document.createElement('button');
      btn.textContent = emoji;
      Object.assign(btn.style, {
        background: '#1a1a1a',
        border: '1px solid #2a2a2a',
        borderRadius: '4px',
        cursor: 'pointer',
        fontSize: '16px',
        padding: '2px 4px',
        flex: '1',
        lineHeight: '1.4',
        transition: 'background 0.1s',
      });
      btn.addEventListener('mouseover', () => { btn.style.background = '#2a2a2a'; });
      btn.addEventListener('mouseout', () => { btn.style.background = '#1a1a1a'; });
      btn.addEventListener('click', () => {
        this._sendMessage(emoji);
        // Pop animation
        btn.style.transform = 'scale(1.3)';
        setTimeout(() => { btn.style.transform = ''; }, 200);
      });
      reactBar.appendChild(btn);
    });

    // Input row
    const inputRow = document.createElement('div');
    Object.assign(inputRow.style, {
      display: 'flex',
      padding: '8px',
      gap: '6px',
      borderTop: '1px solid #1a1a1a',
      flexShrink: '0',
    });

    this.input = document.createElement('input');
    this.input.type = 'text';
    this.input.placeholder = 'Say something…';
    this.input.maxLength = 160;
    Object.assign(this.input.style, {
      flex: '1',
      background: '#0d0d0d',
      border: '1px solid #2a2a2a',
      borderRadius: '4px',
      color: '#eee',
      fontSize: '13px',
      padding: '7px 10px',
      outline: 'none',
      fontFamily: 'Arial, sans-serif',
    });
    this.input.addEventListener('focus', () => { this.input.style.borderColor = '#00ff88'; });
    this.input.addEventListener('blur', () => { this.input.style.borderColor = '#2a2a2a'; });
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this._sendMessage(this.input.value);
      e.stopPropagation(); // prevent Phaser capturing keyboard
    });

    const sendBtn = document.createElement('button');
    sendBtn.textContent = '↑';
    Object.assign(sendBtn.style, {
      background: '#00ff88',
      border: 'none',
      borderRadius: '4px',
      color: '#000',
      fontWeight: 'bold',
      fontSize: '16px',
      width: '34px',
      cursor: 'pointer',
      flexShrink: '0',
    });
    sendBtn.addEventListener('click', () => this._sendMessage(this.input.value));
    sendBtn.addEventListener('mouseover', () => { sendBtn.style.background = '#00cc66'; });
    sendBtn.addEventListener('mouseout', () => { sendBtn.style.background = '#00ff88'; });
    inputRow.append(this.input, sendBtn);

    this.container.append(header, this.msgList, reactBar, inputRow);
    document.body.appendChild(this.container);
  }

  // ── Message rendering ──────────────────────────────────────────────────────

  _onHistory(messages) {
    if (!this.msgList && !this.visible) {
      // Store for when panel opens
      this._pendingHistory = messages;
      return;
    }
    if (!this.msgList) this._buildDOM();
    messages.forEach(msg => this._renderMessage(msg, false));
    this.msgList.scrollTop = this.msgList.scrollHeight;
  }

  _onMessage(msg) {
    if (!this.msgList) {
      if (!this.visible) {
        this.unread++;
        this._updateBadge();
        return;
      }
      this._buildDOM();
      // Replay pending history first
      if (this._pendingHistory) {
        this._pendingHistory.forEach(m => this._renderMessage(m, false));
        this._pendingHistory = null;
      }
    }
    this._renderMessage(msg, true);
    if (!this.visible) {
      this.unread++;
      this._updateBadge();
    }
  }

  _renderMessage(msg, animate = true) {
    if (!this.msgList) return;

    const row = document.createElement('div');
    Object.assign(row.style, {
      fontSize: '12px',
      lineHeight: '1.5',
      wordBreak: 'break-word',
      transition: animate ? 'opacity 0.2s' : 'none',
      opacity: animate ? '0' : '1',
    });

    if (msg.type === 'system') {
      row.style.color = '#556677';
      row.style.fontStyle = 'italic';
      row.style.textAlign = 'center';
      row.style.fontSize = '11px';
      row.textContent = msg.text;
    } else {
      const time = new Date(msg.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      row.innerHTML = `<span style="color:#444;font-size:10px">${time}</span> <span style="color:#00cc66;font-weight:bold">${this._escape(msg.from)}</span><span style="color:#666">:</span> <span style="color:#cccccc">${this._escape(msg.text)}</span>`;
    }

    this.msgList.appendChild(row);

    // Animate in
    if (animate) requestAnimationFrame(() => { row.style.opacity = '1'; });

    // Keep max 80 messages in DOM
    while (this.msgList.children.length > 80) {
      this.msgList.removeChild(this.msgList.firstChild);
    }

    // Auto-scroll if near bottom
    const nearBottom = this.msgList.scrollHeight - this.msgList.scrollTop - this.msgList.clientHeight < 60;
    if (nearBottom || !this.visible) {
      this.msgList.scrollTop = this.msgList.scrollHeight;
    }
  }

  _onError({ error }) {
    const row = document.createElement('div');
    Object.assign(row.style, {
      fontSize: '11px',
      color: '#ff4444',
      fontStyle: 'italic',
      textAlign: 'center',
    });
    row.textContent = `⚠ ${error}`;
    if (this.msgList) {
      this.msgList.appendChild(row);
      setTimeout(() => row.remove(), 3000);
    }
  }

  // ── Send ───────────────────────────────────────────────────────────────────

  _sendMessage(text) {
    if (typeof text !== 'string') return;
    const clean = text.trim();
    if (!clean) return;
    socket.emit('chat:send', { text: clean });
    if (this.input) this.input.value = '';
  }

  // ── Badge (unread count on toggle button) ─────────────────────────────────

  setBadgeEl(el) {
    this.badge = el;
    this._updateBadge();
  }

  _updateBadge() {
    if (!this.badge) return;
    if (this.unread > 0 && !this.visible) {
      this.badge.setText(`💬 CHAT  ${this.unread > 9 ? '9+' : this.unread}`);
      this.badge.setStyle({ color: '#00ff88', backgroundColor: '#1a2a1a' });
    } else {
      this.badge.setText('💬 CHAT');
      this.badge.setStyle({ color: '#888888', backgroundColor: '#1a1a1a' });
    }
  }

  // ── Utils ──────────────────────────────────────────────────────────────────

  _escape(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  destroy() {
    socket.off('chat:message', this._boundOnMessage);
    socket.off('chat:history', this._boundOnHistory);
    socket.off('chat:error', this._boundOnError);
    if (this.container) this.container.remove();
  }
}
