// Once a Long House view is close enough to inspect rooms, continued zoom
// travels down the row instead of stopping at the orbit-radius limit.
export function longHouseZoom(radius, targetZ, cameraZ, scale, depth, maxRadius) {
  const minRadius = 6;
  const requested = radius * scale;
  const nextRadius = Math.min(maxRadius, Math.max(minRadius, requested));
  const travel = Math.max(0, minRadius - requested) * 8;
  const direction = cameraZ >= targetZ ? -1 : 1;
  const limit = depth / 2 + 8;
  const nextZ = Math.min(limit, Math.max(-limit, targetZ + direction * travel));
  return { radius: nextRadius, targetZ: nextZ };
}
