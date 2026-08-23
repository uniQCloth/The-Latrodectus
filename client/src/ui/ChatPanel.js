import socket from '../systems/SocketManager';

const QUICK_REACTIONS = ['🚀', '💀', '🔥', '🤑', '😱', '💎', '🕷'];
const TROPHIES = ['🥇', '🥈', '🥉'];

export default class ChatPanel {
  constructor(scene) {
    this.scene = scene;
    this.visible = false;
    this.unread = 0;
    this.container = null;
    this.msgList = null;
    this.input = null;
    this.badge = null;
    this._mode = 'chat'; // 'chat' | 'leaderboard'
    this._topScores = [];

    this._boundOnMessage = this._onMessage.bind(this);
    this._boundOnHistory = this._onHistory.bind(this);
    this._boundOnError = this._onError.bind(this);
    this._boundOnTopScores = this._onTopScores.bind(this);

    socket.on('chat:message', this._boundOnMessage);
    socket.on('chat:history', this._boundOnHistory);
    socket.on('chat:error', this._boundOnError);
    socket.on('topscores:update', this._boundOnTopScores);
  }

  toggle() { this.visible ? this.hide() : this.show(); }

  show() {
    this.visible = true;
    this.unread = 0;
    this._updateBadge();
    if (!this.container) this._buildDOM();
    this.container.style.display = 'flex';
    if (this._mode === 'chat') {
      setTimeout(() => {
        if (this.msgList) this.msgList.scrollTop = this.msgList.scrollHeight;
        if (this.input) this.input.focus();
      }, 50);
    }
  }

  hide() {
    this.visible = false;
    if (this.container) this.container.style.display = 'none';
  }

  _buildDOM() {
    const { width } = this.scene.scale;

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
      userSelect: 'none',
    });

    // ── Header ──────────────────────────────────────────────────────────────
    const header = document.createElement('div');
    Object.assign(header.style, {
      display: 'flex',
      alignItems: 'center',
      padding: '8px 10px',
      borderBottom: '1px solid #1a1a1a',
      background: 'rgba(0,0,0,0.4)',
      flexShrink: '0',
      gap: '6px',
      cursor: 'grab',
    });
    this._headerEl = header;

    // 🏆 leaderboard tab button
    const lbBtn = document.createElement('span');
    lbBtn.textContent = '🏆';
    lbBtn.setAttribute('data-btn', '1');
    Object.assign(lbBtn.style, {
      fontSize: '16px', cursor: 'pointer', lineHeight: '1',
      opacity: '0.5', transition: 'opacity 0.15s', flexShrink: '0',
    });
    lbBtn.title = 'Top Scores';
    lbBtn.addEventListener('mouseover', () => { lbBtn.style.opacity = '1'; });
    lbBtn.addEventListener('mouseout', () => { lbBtn.style.opacity = this._mode === 'leaderboard' ? '1' : '0.5'; });
    lbBtn.addEventListener('click', () => this._switchTab(this._mode === 'leaderboard' ? 'chat' : 'leaderboard'));

    // Title label
    this._headerTitle = document.createElement('span');
    this._headerTitle.textContent = '💬 Live Chat';
    Object.assign(this._headerTitle.style, {
      color: '#00ff88', fontWeight: 'bold', fontSize: '13px', flex: '1',
    });

    // Close button
    const closeBtn = document.createElement('span');
    closeBtn.textContent = '✕';
    closeBtn.setAttribute('data-btn', '1');
    Object.assign(closeBtn.style, {
      color: '#666', cursor: 'pointer', fontSize: '16px', lineHeight: '1', padding: '2px 4px', flexShrink: '0',
    });
    closeBtn.addEventListener('click', () => this.hide());
    closeBtn.addEventListener('mouseover', () => { closeBtn.style.color = '#fff'; });
    closeBtn.addEventListener('mouseout', () => { closeBtn.style.color = '#666'; });

    header.append(lbBtn, this._headerTitle, closeBtn);
    this._lbBtn = lbBtn;

    // ── Chat section ─────────────────────────────────────────────────────────
    this._chatSection = document.createElement('div');
    Object.assign(this._chatSection.style, {
      display: 'flex', flexDirection: 'column', flex: '1', minHeight: '0', overflow: 'hidden',
    });

    // Scrollbar style
    if (!document.getElementById('wsm-scroll-style')) {
      const scrollStyle = document.createElement('style');
      scrollStyle.id = 'wsm-scroll-style';
      scrollStyle.textContent = `
        .wsm-msglist::-webkit-scrollbar { width: 4px; }
        .wsm-msglist::-webkit-scrollbar-track { background: transparent; }
        .wsm-msglist::-webkit-scrollbar-thumb { background: #333; border-radius: 2px; }
        .wsm-lb-scroll::-webkit-scrollbar { width: 4px; }
        .wsm-lb-scroll::-webkit-scrollbar-track { background: transparent; }
        .wsm-lb-scroll::-webkit-scrollbar-thumb { background: #333; border-radius: 2px; }
      `;
      document.head.appendChild(scrollStyle);
    }

    this.msgList = document.createElement('div');
    Object.assign(this.msgList.style, {
      flex: '1', overflowY: 'auto', padding: '8px 10px',
      display: 'flex', flexDirection: 'column', gap: '4px',
    });
    this.msgList.className = 'wsm-msglist';

    // Quick reactions
    const reactBar = document.createElement('div');
    Object.assign(reactBar.style, {
      display: 'flex', gap: '4px', padding: '6px 10px',
      borderTop: '1px solid #1a1a1a', background: 'rgba(0,0,0,0.2)', flexShrink: '0',
    });
    QUICK_REACTIONS.forEach(emoji => {
      const btn = document.createElement('button');
      btn.textContent = emoji;
      Object.assign(btn.style, {
        background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '4px',
        cursor: 'pointer', fontSize: '16px', padding: '2px 4px', flex: '1',
        lineHeight: '1.4', transition: 'background 0.1s',
      });
      btn.addEventListener('mouseover', () => { btn.style.background = '#2a2a2a'; });
      btn.addEventListener('mouseout', () => { btn.style.background = '#1a1a1a'; });
      btn.addEventListener('click', () => {
        this._sendMessage(emoji);
        btn.style.transform = 'scale(1.3)';
        setTimeout(() => { btn.style.transform = ''; }, 200);
      });
      reactBar.appendChild(btn);
    });

    // Input row
    const inputRow = document.createElement('div');
    Object.assign(inputRow.style, {
      display: 'flex', padding: '8px', gap: '6px',
      borderTop: '1px solid #1a1a1a', flexShrink: '0',
    });
    this.input = document.createElement('input');
    this.input.type = 'text';
    this.input.placeholder = 'Say something…';
    this.input.maxLength = 160;
    Object.assign(this.input.style, {
      flex: '1', background: '#0d0d0d', border: '1px solid #2a2a2a',
      borderRadius: '4px', color: '#eee', fontSize: '13px',
      padding: '7px 10px', outline: 'none', fontFamily: 'Arial, sans-serif',
    });
    this.input.addEventListener('focus', () => { this.input.style.borderColor = '#00ff88'; });
    this.input.addEventListener('blur', () => { this.input.style.borderColor = '#2a2a2a'; });
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this._sendMessage(this.input.value);
      e.stopPropagation();
    });
    const sendBtn = document.createElement('button');
    sendBtn.textContent = '↑';
    Object.assign(sendBtn.style, {
      background: '#00ff88', border: 'none', borderRadius: '4px',
      color: '#000', fontWeight: 'bold', fontSize: '16px', width: '34px',
      cursor: 'pointer', flexShrink: '0',
    });
    sendBtn.addEventListener('click', () => this._sendMessage(this.input.value));
    sendBtn.addEventListener('mouseover', () => { sendBtn.style.background = '#00cc66'; });
    sendBtn.addEventListener('mouseout', () => { sendBtn.style.background = '#00ff88'; });
    inputRow.append(this.input, sendBtn);

    this._chatSection.append(this.msgList, reactBar, inputRow);

    // ── Leaderboard section ───────────────────────────────────────────────────
    this._lbSection = document.createElement('div');
    Object.assign(this._lbSection.style, {
      display: 'none', flexDirection: 'column', flex: '1', minHeight: '0',
    });

    const lbHeaderRow = document.createElement('div');
    Object.assign(lbHeaderRow.style, {
      padding: '8px 12px 4px', color: '#ffd700', fontSize: '11px',
      fontWeight: 'bold', borderBottom: '1px solid #1a1a1a', flexShrink: '0',
    });
    lbHeaderRow.textContent = '🏆 Top Scores — Last 10 Minutes';

    this._lbList = document.createElement('div');
    Object.assign(this._lbList.style, {
      flex: '1', overflowY: 'auto', padding: '6px 8px',
    });
    this._lbList.className = 'wsm-lb-scroll';

    this._lbSection.append(lbHeaderRow, this._lbList);

    this.container.append(header, this._chatSection, this._lbSection);
    document.body.appendChild(this.container);

    this._makeDraggable();

    // Replay pending history
    if (this._pendingHistory) {
      this._pendingHistory.forEach(m => this._renderMessage(m, false));
      this._pendingHistory = null;
      this.msgList.scrollTop = this.msgList.scrollHeight;
    }

    // Render any top scores already received
    if (this._topScores.length) this._renderLeaderboard();
  }

  // ── Drag ─────────────────────────────────────────────────────────────────────

  _makeDraggable() {
    let drag = null;

    this._headerEl.addEventListener('mousedown', e => {
      if (e.target.getAttribute('data-btn')) return;
      const rect = this.container.getBoundingClientRect();
      drag = { startX: e.clientX, startY: e.clientY, origX: rect.left, origY: rect.top };
      this.container.style.left = rect.left + 'px';
      this.container.style.top = rect.top + 'px';
      this.container.style.right = 'auto';
      this.container.style.bottom = 'auto';
      this._headerEl.style.cursor = 'grabbing';
      e.preventDefault();
    });

    const onMove = e => {
      if (!drag) return;
      this.container.style.left = (drag.origX + e.clientX - drag.startX) + 'px';
      this.container.style.top  = (drag.origY + e.clientY - drag.startY) + 'px';
    };

    const onUp = () => {
      drag = null;
      if (this._headerEl) this._headerEl.style.cursor = 'grab';
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    this._dragCleanup = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }

  // ── Tab switching ─────────────────────────────────────────────────────────────

  _switchTab(mode) {
    this._mode = mode;
    if (mode === 'leaderboard') {
      this._chatSection.style.display = 'none';
      this._lbSection.style.display = 'flex';
      this._headerTitle.textContent = '🏆 Leaderboard';
      this._lbBtn.style.opacity = '1';
      this._renderLeaderboard();
    } else {
      this._lbSection.style.display = 'none';
      this._chatSection.style.display = 'flex';
      this._headerTitle.textContent = '💬 Live Chat';
      this._lbBtn.style.opacity = '0.5';
      setTimeout(() => {
        if (this.msgList) this.msgList.scrollTop = this.msgList.scrollHeight;
        if (this.input) this.input.focus();
      }, 30);
    }
  }

  // ── Leaderboard rendering ─────────────────────────────────────────────────────

  _onTopScores(scores) {
    this._topScores = scores || [];
    if (this.container && this._mode === 'leaderboard') this._renderLeaderboard();
  }

  _renderLeaderboard() {
    if (!this._lbList) return;
    this._lbList.innerHTML = '';

    if (!this._topScores.length) {
      const empty = document.createElement('div');
      Object.assign(empty.style, {
        color: '#444', fontSize: '12px', textAlign: 'center',
        marginTop: '20px', fontStyle: 'italic',
      });
      empty.textContent = 'No cashouts in the last 10 minutes yet.';
      this._lbList.appendChild(empty);
      return;
    }

    this._topScores.forEach((entry, i) => {
      const trophy = i < 3 ? TROPHIES[i] : `#${i + 1}`;
      const row = document.createElement('div');
      Object.assign(row.style, {
        padding: '5px 4px',
        borderBottom: '1px solid #111',
        display: 'grid',
        gridTemplateColumns: '28px 1fr auto',
        gap: '4px',
        alignItems: 'center',
      });

      const rankEl = document.createElement('span');
      rankEl.textContent = trophy;
      rankEl.style.fontSize = i < 3 ? '16px' : '11px';
      rankEl.style.textAlign = 'center';

      const nameEl = document.createElement('span');
      nameEl.textContent = entry.username;
      Object.assign(nameEl.style, {
        color: i === 0 ? '#ffd700' : i === 1 ? '#c0c0c0' : i === 2 ? '#cd7f32' : '#aaaaaa',
        fontSize: '12px', fontWeight: 'bold',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      });

      const multEl = document.createElement('span');
      multEl.textContent = `${entry.multiplier.toFixed(2)}×`;
      Object.assign(multEl.style, {
        color: '#00ff88', fontSize: '13px', fontWeight: 'bold', textAlign: 'right',
      });

      const detailEl = document.createElement('div');
      detailEl.style.gridColumn = '2 / -1';
      detailEl.style.paddingLeft = '2px';
      Object.assign(detailEl.style, {
        fontSize: '10px', color: '#555',
      });
      detailEl.textContent = `Bet $${(entry.betAmount || 0).toFixed(2)}  ·  Won $${(entry.payout || 0).toFixed(2)}`;

      row.append(rankEl, nameEl, multEl, detailEl);
      this._lbList.appendChild(row);
    });
  }

  // ── Message rendering ──────────────────────────────────────────────────────────

  _onHistory(messages) {
    if (!this.msgList && !this.visible) {
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
      fontSize: '12px', lineHeight: '1.5', wordBreak: 'break-word',
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
    if (animate) requestAnimationFrame(() => { row.style.opacity = '1'; });
    while (this.msgList.children.length > 80) this.msgList.removeChild(this.msgList.firstChild);
    const nearBottom = this.msgList.scrollHeight - this.msgList.scrollTop - this.msgList.clientHeight < 60;
    if (nearBottom || !this.visible) this.msgList.scrollTop = this.msgList.scrollHeight;
  }

  _onError({ error }) {
    const row = document.createElement('div');
    Object.assign(row.style, {
      fontSize: '11px', color: '#ff4444', fontStyle: 'italic', textAlign: 'center',
    });
    row.textContent = `⚠ ${error}`;
    if (this.msgList) {
      this.msgList.appendChild(row);
      setTimeout(() => row.remove(), 3000);
    }
  }

  _sendMessage(text) {
    if (typeof text !== 'string') return;
    const clean = text.trim();
    if (!clean) return;
    socket.emit('chat:send', { text: clean });
    if (this.input) this.input.value = '';
  }

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

  _escape(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  destroy() {
    socket.off('chat:message', this._boundOnMessage);
    socket.off('chat:history', this._boundOnHistory);
    socket.off('chat:error', this._boundOnError);
    socket.off('topscores:update', this._boundOnTopScores);
    this._dragCleanup?.();
    if (this.container) this.container.remove();
  }
}
