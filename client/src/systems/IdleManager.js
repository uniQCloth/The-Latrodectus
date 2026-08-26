const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

const TRACKED_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'touchmove', 'wheel'];
let _timer = null;
let _game = null;

function _reset() {
  clearTimeout(_timer);
  _timer = setTimeout(_onIdle, IDLE_TIMEOUT_MS);
}

function _onIdle() {
  if (!_game) return;
  const game = _game;
  stopIdleWatch();
  localStorage.removeItem('wsm_token');
  localStorage.removeItem('wsm_username');
  const sm = game.scene;
  ['GameScene', 'UIScene', 'IntroScene', 'TutorialScene', 'CinematicScene'].forEach(key => {
    try { if (sm.isActive(key)) sm.stop(key); } catch (_) {}
  });
  sm.start('UsernameScene');
}

export function startIdleWatch(game) {
  _game = game;
  TRACKED_EVENTS.forEach(ev => window.addEventListener(ev, _reset, { passive: true }));
  _reset();
}

export function stopIdleWatch() {
  clearTimeout(_timer);
  _timer = null;
  TRACKED_EVENTS.forEach(ev => window.removeEventListener(ev, _reset));
  _game = null;
}
