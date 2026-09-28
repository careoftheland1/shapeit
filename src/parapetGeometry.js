// Box centers follow the wall centerlines, so the parapets' outer faces
// remain flush with the room below. Full wall thickness also closes the
// visible step that thin roof rails left above the walls.
import { SITE_WALL } from './longHouse.js';

const edgeThickness = (vol, side) => vol[`site${side}`] ? SITE_WALL : vol.t;

export function deckParapetBoxes(vol) {
  const { w, d } = vol;
  const left = edgeThickness(vol, 'Left'), right = edgeThickness(vol, 'Right');
  const back = edgeThickness(vol, 'Back'), front = edgeThickness(vol, 'Front');
  const boxes = [];
  if (!vol.deckBackAccess) boxes.push({ w, d: back, x: 0, z: -(d - back) / 2 });
  if (!vol.deckFrontAccess) boxes.push({ w, d: front, x: 0, z: (d - front) / 2 });
  const sideStart = vol.deckBackAccess ? -d / 2 : -d / 2 + back;
  const sideEnd = vol.deckFrontAccess ? d / 2 : d / 2 - front;
  boxes.push({ w: left, d: sideEnd - sideStart, x: -(w - left) / 2, z: (sideStart + sideEnd) / 2 });
  boxes.push({ w: right, d: sideEnd - sideStart, x: (w - right) / 2, z: (sideStart + sideEnd) / 2 });
  return boxes;
}

export function terraceParapetBoxes(vol, upper) {
  const { w, d } = vol;
  const left = edgeThickness(vol, 'Left'), right = edgeThickness(vol, 'Right');
  const back = edgeThickness(vol, 'Back'), front = edgeThickness(vol, 'Front');
  const ux0 = upper.x - vol.x - upper.w / 2, ux1 = upper.x - vol.x + upper.w / 2;
  const uz0 = upper.z - vol.z - upper.d / 2, uz1 = upper.z - vol.z + upper.d / 2;
  const boxes = [];
  const segments = (start, end, coverStart, coverEnd) => coverStart == null
    ? [[start, end]] : [[start, coverStart], [coverEnd, end]];
  const add = (axis, edge, thickness, start, end) => {
    if (end - start < .1) return;
    boxes.push(axis === 'z'
      ? { w: thickness, d: end - start, x: edge, z: (start + end) / 2 }
      : { w: end - start, d: thickness, x: (start + end) / 2, z: edge });
  };
  for (const side of [-1, 1]) {
    const outer = side * w / 2;
    const thickness = side < 0 ? left : right;
    const covered = Math.abs(outer - ux0) < .01 || Math.abs(outer - ux1) < .01;
    segments(-d / 2 + back, d / 2 - front, covered ? uz0 : null, covered ? uz1 : null)
      .forEach(([start, end]) => add('z', side * (w - thickness) / 2, thickness, start, end));
  }
  for (const side of [-1, 1]) {
    const outer = side * d / 2;
    const thickness = side < 0 ? back : front;
    const covered = Math.abs(outer - uz0) < .01 || Math.abs(outer - uz1) < .01;
    segments(-w / 2, w / 2, covered ? ux0 : null, covered ? ux1 : null)
      .forEach(([start, end]) => add('x', side * (d - thickness) / 2, thickness, start, end));
  }
  return boxes;
}
