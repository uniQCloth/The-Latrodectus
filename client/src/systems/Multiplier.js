export const MAX_TILES = 5000;
export const MAX_MULTIPLIER = 5000;

export function tileToMultiplier(tile, glowWorms = 0) {
  // Exponential curve: 1x at 0, 5000x at 5000
  const base = Math.max(1, parseFloat((Math.exp(tile / 1200) * 0.99).toFixed(2)));
  const capped = Math.min(base, MAX_MULTIPLIER);
  const wormBoost = Math.pow(3, glowWorms); // 3^0=1, 3^1=3, 3^2=9, 3^3=27
  return parseFloat((capped * wormBoost).toFixed(2));
}

export function multiplierColor(multiplier) {
  if (multiplier < 2) return '#ffffff';
  if (multiplier < 5) return '#ffff00';
  if (multiplier < 20) return '#ff9900';
  if (multiplier < 100) return '#ff4400';
  if (multiplier < 1000) return '#ff00ff';
  return '#00ffff';
}
