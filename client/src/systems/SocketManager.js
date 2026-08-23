import { io } from 'socket.io-client';

const SERVER_URL = 'http://localhost:3001';

class SocketManager {
  constructor() {
    this.socket = null;
    this.listeners = new Map();
    this.connected = false;
  }

  connect(username, uuid, token) {
    if (this.socket) return; // already connected — prevent double-connect
    const query = {};
    if (username) query.username = username;
    if (uuid)     query.uuid     = uuid;
    if (token)    query.token    = token;
    this.socket = io(SERVER_URL, {
      query,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
    });

    this.socket.on('connect', () => {
      this.connected = true;
      console.log('[Socket] Connected:', this.socket.id);
      this._emit('connected', { id: this.socket.id });
    });

    this.socket.on('disconnect', (reason) => {
      this.connected = false;
      console.warn('[Socket] Disconnected:', reason);
      this._emit('disconnected', { reason });
    });

    this.socket.on('connect_error', (err) => {
      console.error('[Socket] Connection error:', err.message);
      this._emit('error', { message: err.message });
    });

    // Game events — forward to registered listeners
    const gameEvents = [
      'game:state', 'round:betting', 'round:start', 'round:tick',
      'round:crashed', 'betting:countdown', 'bets:update',
      'bet:result', 'bet:cancel:result', 'cashout:confirmed',
      'cashout:error', 'wallet:balance', 'history:update',
      // Chat events
      'chat:message', 'chat:history', 'chat:error',
      // Wallet events
      'wallet:deposit:confirmed', 'wallet:withdraw:confirmed',
      // Username events
      'username:claimed', 'username:taken', 'username:needed', 'username:restored',
    ];
    gameEvents.forEach(ev => {
      this.socket.on(ev, (data) => this._emit(ev, data));
    });
  }

  on(event, callback) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event).push(callback);
  }

  off(event, callback) {
    if (!this.listeners.has(event)) return;
    const filtered = this.listeners.get(event).filter(cb => cb !== callback);
    this.listeners.set(event, filtered);
  }

  _emit(event, data) {
    const cbs = this.listeners.get(event) || [];
    cbs.forEach(cb => cb(data));
  }

  emit(event, data) {
    if (!this.connected || !this.socket) return;
    this.socket.emit(event, data);
  }

  placeBet(amount, autoCashout = null) {
    if (!this.connected) return;
    this.socket.emit('bet:place', { amount, autoCashout });
  }

  cancelBet() {
    if (!this.connected) return;
    this.socket.emit('bet:cancel');
  }

  cashOut() {
    if (!this.connected) return;
    this.socket.emit('cashout');
  }

  disconnect() {
    if (this.socket) this.socket.disconnect();
  }
}

// Singleton — shared across all scenes
export default new SocketManager();
