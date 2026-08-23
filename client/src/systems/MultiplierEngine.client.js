// Client-side mirror of server MultiplierEngine — for offline/solo fallback only
export function multiplierToTiles(multiplier) {
  return Math.max(0, Math.round(Math.log(Math.max(multiplier, 0.99) / 0.99) * 1200));
}
