// Long House uses ordinary editable volumes, with explicit sky slots in the row.
export const PLACES = [
  { id: 'live-court-sleep', name: 'Simple', uses: ['Live', 'Court', 'Sleep'] },
  { id: 'everyday', name: 'Everyday', uses: ['Live', 'Court', 'Service', 'Court', 'Sleep'] },
  { id: 'live-work', name: 'Live / work', uses: ['Work', 'Court', 'Live', 'Court', 'Sleep'] },
  { id: 'rise-once', name: 'Rise once', uses: ['Live', 'Court', 'Tall room', 'Service', 'Court', 'Sleep'] },
  { id: 'independence', name: 'Independence', uses: ['Home', 'Court', 'Independent room'] },
  { id: 'grow', name: 'Grow', uses: ['Room', 'Court', 'Room', 'Future court', 'Future room'] },
];
export const DEFAULT_SITE = { width: 16, depth: 80, front: 'South', rows: 1, groundHeight: 12, upperHeight: 9 };
// Projects saved before site heights existed retain their original 9′ stories.
export const siteGroundHeight = site => site.groundHeight ?? 9;
export const siteUpperHeight = site => site.upperHeight ?? 9;
export const isCourt = v => v.kind === 'court';
export const roomSide = v => v.side === 'right' ? 'right' : 'left';
export const upperSide = v => v.upperSide === 'right' ? 'right' : 'left';
export const upperEnd = v => v.upperEnd === 'front' ? 'front' : 'back';
export const upperSpan = (base, requested, wall) => {
  const span = Math.max(8, Math.min(base, requested ?? base));
  return base - span <= wall + .01 ? base : span;
};
export function thicknessOwnerIndex(items, index) {
  while (index > 0 && items[index].sharedBack) index--;
  return index;
}
export function roomInnerFootprint(v) {
  const left = v.siteLeft ? SITE_WALL : v.t;
  const right = v.siteRight ? SITE_WALL : v.t;
  const back = v.siteBack ? SITE_WALL : v.t;
  const front = v.siteFront ? SITE_WALL : v.t;
  return { w: v.w - left - right, d: v.d - back - front,
    x: (left - right) / 2, z: (back - front) / 2 };
}
export function makeRowItem(kind, width, nid, label) {
  return { id: nid(), shape: 'cubiform', kind, label: label || (kind === 'court' ? 'Court' : 'Room'),
    x: 0, z: 0, w: width, d: kind === 'court' ? 8 : 16, h: kind === 'court' ? 0.1 : DEFAULT_SITE.groundHeight,
    t: 1.5, rot: 0, material: 'earth', roof: kind === 'court' ? 'none' : 'flat', side: 'left',
    join: 'separate', stories: 1, openings: kind === 'court' ? [] : [
      { id: nid(), wall: 'front', type: 'door', pos: 0 },
      { id: nid(), wall: 'back', type: 'window', pos: 0, sill: 3 },
    ] };
}
export function layoutRow(items, site = DEFAULT_SITE) {
  let cursor = 0;
  const result = [];
  for (const item of items) {
    const previous = result.at(-1);
    const shared = previous && !isCourt(previous) && !isCourt(item) && item.join === 'shared' && previous.w === item.w && roomSide(previous) === roomSide(item);
    if (shared) cursor -= previous.t;
    const thickness = shared ? previous.t : item.t;
    const height = isCourt(item) ? .1 : siteGroundHeight(site) + (item.stories === 2 ? siteUpperHeight(site) : 0);
    const v = { ...item, x: 0, rot: 0, z: cursor + item.d / 2, h: height,
      upperWidth: item.stories === 2 ? upperSpan(item.w, item.upperWidth, SITE_WALL) : item.upperWidth,
      upperDepth: item.stories === 2 ? upperSpan(item.d, item.upperDepth, SITE_WALL) : item.upperDepth,
      sharedBack: shared ? Math.min(previous.h, height) : 0,
      t: thickness };
    v.openings = isCourt(v) ? [] : v.openings.map(o => {
      const level = v.stories === 2 && o.level === 1 ? 1 : 0;
      const upper = level === 1;
      const length = ['front','back'].includes(o.wall) ? (upper ? v.upperWidth : v.w) - 2 * v.t : (upper ? v.upperDepth : v.d) - 2 * v.t;
      const width = Math.min(o.width ?? 4, length - 1);
      const levelHeight = upper ? siteUpperHeight(site) : siteGroundHeight(site);
      const height = Math.min(o.height ?? (o.type === 'door' ? 7 : 4), levelHeight);
      const half = Math.max(0, (length - width) / 2);
      return { ...o, level, width, height, pos: Math.max(-half, Math.min(half, o.pos)),
        ...(o.type === 'window' ? { sill: Math.max(0, Math.min(o.sill ?? 3, levelHeight - height)) } : {}) };
    });
    cursor += item.d;
    result.push(v);
  }
  return result.map((v, i) => ({ ...v, z: v.z - cursor / 2,
    deckBackAccess: !!(v.deck && result[i - 1]?.stories === 2 && ((result[i - 1].upperDepth ?? result[i - 1].d) >= result[i - 1].d || upperEnd(result[i - 1]) === 'front') && result[i - 1].openings.some(o => o.level === 1 && o.type === 'door' && o.wall === 'front')),
    deckFrontAccess: !!(v.deck && result[i + 1]?.stories === 2 && ((result[i + 1].upperDepth ?? result[i + 1].d) >= result[i + 1].d || upperEnd(result[i + 1]) === 'back') && result[i + 1].openings.some(o => o.level === 1 && o.type === 'door' && o.wall === 'back')),
  }));
}
export function startingRow(preset, site, nid) {
  const place = PLACES.find(p => p.id === preset) || PLACES[0];
  const items = place.uses.map(label => {
    const v = makeRowItem(label.toLowerCase().includes('court') ? 'court' : 'room', site.width, nid, label);
    v.future = label.startsWith('Future');
    if (label === 'Tall room') { v.stories = 2; v.h = siteGroundHeight(site) + siteUpperHeight(site); v.openings.push({ id: nid(), wall: 'front', type: 'door', pos: 0, level: 1 }); }
    if (place.id === 'rise-once' && label === 'Service') { v.join = 'shared'; v.deck = true; }
    return v;
  });
  // The starting example keeps shared construction closed at ground level.
  // Subsequent edits preserve openings and surface guidance instead.
  items.forEach((v, i) => {
    if (v.join === 'shared' && i > 0) {
      v.openings = v.openings.filter(o => o.wall !== 'back' || o.level === 1);
      items[i - 1].openings = items[i - 1].openings.filter(o => o.wall !== 'front' || o.level === 1);
    }
  });
  const total = items.reduce((sum, v) => sum + v.d, 0);
  const scale = Math.min(1, site.depth / total);
  return layoutRow(items.map(v => ({ ...v, d: Math.max(isCourt(v) ? 4 : 8, Math.floor(v.d * scale / 2) * 2) })), site);
}
export function rowWarnings(items, site) {
  const warnings = [];
  const length = items.length ? items.at(-1).z + items.at(-1).d / 2 - (items[0].z - items[0].d / 2) : 0;
  if (length > site.depth) warnings.push('The row extends beyond the buildable depth. Shorten an element or increase the site depth.');
  if (items.some(v => v.w > site.width)) warnings.push('A room is wider than the buildable width.');
  if (items.filter(v => v.stories === 2).length > 1) warnings.push('Stay low. Rise once. More than one room now rises above the row.');
  items.forEach((v, i) => {
    if (isCourt(v) && v.d < 4) warnings.push(`${v.label}: this is a narrow gap; consider more space for light and circulation.`);
    if (v.join === 'shared' && i > 0 && !isCourt(items[i - 1]) && (items[i - 1].w !== v.w || roomSide(items[i - 1]) !== roomSide(v))) warnings.push(`${v.label}: match the adjacent room width and wall alignment to share one complete wall.`);
    if (!isCourt(v) && site.width - v.w > .01 && site.width - v.w < 4) warnings.push(`${v.label}: the side court is narrow; consider at least 4′ of open width.`);
    if (v.sharedBack && (v.openings.some(o => o.wall === 'back' && (o.level || 0) * siteGroundHeight(site) < v.sharedBack) || items[i - 1].openings.some(o => o.wall === 'front' && (o.level || 0) * siteGroundHeight(site) < v.sharedBack))) warnings.push(`${v.label}: review openings on the shared wall; they are not exterior openings.`);
    if (v.deck && !v.deckBackAccess && !v.deckFrontAccess) warnings.push(`${v.label}: add an upper-level door in an adjacent tall room for direct roof-deck access.`);
  });
  return warnings;
}
export function openingRelationship(items, id, wall, site, level = 0) {
  const selected = items.find(v => v.id === id);
  items = items.filter(v => (v.row ?? 0) === (selected?.row ?? 0));
  const i = items.findIndex(v => v.id === id);
  if (selected?.stories === 2 && level === 1) {
    const upper = roomLevels(selected, site)[1];
    if ((wall === 'left' && upper.x - upper.w / 2 > selected.x - selected.w / 2 + .01) ||
        (wall === 'right' && upper.x + upper.w / 2 < selected.x + selected.w / 2 - .01) ||
        (wall === 'back' && upper.z - upper.d / 2 > selected.z - selected.d / 2 + .01) ||
        (wall === 'front' && upper.z + upper.d / 2 < selected.z + selected.d / 2 - .01)) return 'Faces this room’s roof terrace';
  }
  if (wall !== 'front' && wall !== 'back') {
    const row = selected?.row ?? 0;
    const interior = wall === 'left' ? row > 0 : row < siteRowCount(site) - 1;
    const onBoundary = wall === 'left' ? (selected?.siteLeft ?? selected?.siteSides ?? true) : (selected?.siteRight ?? selected?.siteSides ?? true);
    return !onBoundary ? 'Faces side court' : interior ? 'Shared boundary between homes — keep openings toward courts' : 'Outer site wall';
  }
  const neighbor = items[i + (wall === 'front' ? 1 : -1)];
  if (!neighbor) return wall === 'back' ? `${site.front} street / front` : 'Rear exterior';
  if (isCourt(neighbor)) return `Faces ${neighbor.label.toLowerCase()} — open sky`;
  if (level === 1 && neighbor.stories !== 2) return neighbor.deck ? 'Faces roof deck' : 'Faces lower roof';
  const shared = wall === 'back' ? items[i].sharedBack : neighbor.sharedBack;
  return shared ? 'Shared wall — review this opening' : 'Faces another room — separate walls';
}

export const SITE_WALL = 1.5;
export const siteRowCount = site => site.rows ?? 1;
export const rowWidth = site => (site.width + (siteRowCount(site) - 1) * SITE_WALL) / siteRowCount(site);
export const rowCenter = (site, row) => -site.width / 2 + rowWidth(site) / 2 + row * (rowWidth(site) - SITE_WALL);
export const touchesSide = (v, side, site) => {
  const edge = rowCenter(site, v.row ?? 0) + (side === 'left' ? -rowWidth(site) / 2 : rowWidth(site) / 2);
  return Math.abs(v.x + (side === 'left' ? -v.w / 2 : v.w / 2) - edge) < .01;
};
export function roomLevels(v, site) {
  if (v.stories !== 2) return [v];
  const w = upperSpan(v.w, v.upperWidth, SITE_WALL);
  const d = upperSpan(v.d, v.upperDepth, SITE_WALL);
  const groundHeight = siteGroundHeight(site);
  const lower = { ...v, h: groundHeight, stories: 1, roof: 'none', deck: false, sharedBack: Math.min(v.sharedBack || 0, groundHeight),
    openings: v.openings.filter(o => (o.level ?? 0) === 0) };
  const x = v.x + (upperSide(v) === 'left' ? -(v.w - w) / 2 : (v.w - w) / 2);
  const z = v.z + (upperEnd(v) === 'back' ? -(v.d - d) / 2 : (v.d - d) / 2);
  const upper = { ...v, x, z, w, d, h: siteUpperHeight(site), stories: 1, roof: v.roof, deck: false,
    sharedBack: Math.max(0, (v.sharedBack || 0) - groundHeight), openings: v.openings.filter(o => o.level === 1),
    siteLeft: !!v.siteLeft && touchesSide({ ...v, x, w }, 'left', site),
    siteRight: !!v.siteRight && touchesSide({ ...v, x, w }, 'right', site),
    siteBack: v.siteBack && Math.abs(z - d / 2 - (v.z - v.d / 2)) < .01,
    siteFront: v.siteFront && Math.abs(z + d / 2 - (v.z + v.d / 2)) < .01,
  };
  return [lower, upper];
}
export function sideCourtSections(items, site) {
  return items.filter(v => !isCourt(v) && v.w < rowWidth(site) - .01).map(v => {
    const width = rowWidth(site) - v.w;
    return { ...v, id: `side-court-${v.id}`, kind: 'court', label: `${v.label} side court`,
      x: rowCenter(site, v.row ?? 0) + (roomSide(v) === 'left' ? (rowWidth(site) - width) / 2 : -(rowWidth(site) - width) / 2),
      w: width, h: .1, roof: 'none', openings: [], siteSides: false };
  });
}
export function courtNetworks(items, site) {
  const courts = [...items.filter(isCourt), ...sideCourtSections(items, site)];
  const bounds = v => ({ left: v.x - v.w / 2, right: v.x + v.w / 2, back: v.z - v.d / 2, front: v.z + v.d / 2 });
  const connected = (a, b) => {
    if ((a.row ?? 0) !== (b.row ?? 0)) return false;
    const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const z = Math.min(a.front, b.front) - Math.max(a.back, b.back);
    return (x > .01 && z >= -.01) || (z > .01 && x >= -.01);
  };
  const remaining = new Set(courts);
  const networks = [];
  while (remaining.size) {
    const first = remaining.values().next().value;
    remaining.delete(first);
    const group = [first];
    for (let i = 0; i < group.length; i++) {
      for (const next of [...remaining]) {
        if (connected(bounds(group[i]), bounds(next)) && (group[i].row ?? 0) === (next.row ?? 0)) {
          remaining.delete(next);
          group.push(next);
        }
      }
    }
    networks.push({ row: first.row ?? 0, area: group.reduce((sum, v) => sum + v.w * v.d, 0), sections: group.length });
  }
  return networks;
}
export function layoutSite(items, site) {
  const result = [];
  for (let row = 0; row < siteRowCount(site); row++) {
    const sequence = layoutRow(items.filter(v => (v.row ?? 0) === row).map(v => ({ ...v, w: isCourt(v) ? rowWidth(site) : Math.max(8, Math.min(v.w, rowWidth(site))) })), site);
    result.push(...sequence.map(v => {
      const width = rowWidth(site);
      const w = isCourt(v) ? width : Math.max(8, Math.min(v.w, width));
      const x = rowCenter(site, row) + (isCourt(v) ? 0 : roomSide(v) === 'left' ? -(width - w) / 2 : (width - w) / 2);
      const withinSite = v.z - v.d / 2 >= -site.depth / 2 - .01 && v.z + v.d / 2 <= site.depth / 2 + .01;
      return { ...v, row, x, w,
        siteSides: Math.abs(w - width) < .01 && withinSite,
        siteLeft: withinSite && Math.abs(x - w / 2 - (rowCenter(site, row) - width / 2)) < .01,
        siteRight: withinSite && Math.abs(x + w / 2 - (rowCenter(site, row) + width / 2)) < .01,
        siteBack: Math.abs(v.z - v.d / 2 + site.depth / 2) < .01,
        siteFront: Math.abs(v.z + v.d / 2 - site.depth / 2) < .01,
      };
    }));
  }
  return result;
}
export function resizeSite(items, previous, next, nid) {
  const count = siteRowCount(next), width = rowWidth(next);
  const first = items.filter(v => (v.row ?? 0) === 0);
  const result = items.filter(v => (v.row ?? 0) < count).map(v => ({ ...v,
    w: isCourt(v) || Math.abs(v.w - rowWidth(previous)) < .01 ? width : v.w,
  }));
  for (let row = siteRowCount(previous); row < count; row++) {
    result.push(...first.map(v => ({ ...v, row, id: nid(), w: isCourt(v) || Math.abs(v.w - rowWidth(previous)) < .01 ? width : Math.min(v.w, width),
      openings: v.openings.map(o => ({ ...o, id: nid() })),
    })));
  }
  return layoutSite(result, next);
}

// One wall per boundary, including the entire open-air length of every court.
// Upper wall bands are unioned across neighboring rows, never doubled.
export function siteWallVolumes(items, site) {
  const width = rowWidth(site), count = siteRowCount(site), walls = [];
  const wall = (id, x, z, length, rot, openings = [], baseY = 0, material = 'earth') => ({
    id, shape: 'wall', x, z, w: length, d: SITE_WALL, t: SITE_WALL, h: baseY ? siteUpperHeight(site) : siteGroundHeight(site),
    rot, openings, baseY, material, roof: 'none', batter: 0,
  });
  for (let boundary = 0; boundary <= count; boundary++) {
    const x = -site.width / 2 + SITE_WALL / 2 + boundary * (width - SITE_WALL);
    const neighbors = items.filter(v => !isCourt(v) && (((v.row ?? 0) === boundary - 1 && v.siteRight) || ((v.row ?? 0) === boundary && v.siteLeft)));
    const external = boundary === 0 || boundary === count;
    const side = boundary === 0 ? 'left' : 'right';
    const openings = external ? neighbors.flatMap(v => v.openings.filter(o => o.wall === side && !o.level).map(o => ({ ...o, wall: 'front', pos: v.z + o.pos }))).filter(o=>Math.abs(o.pos)+(o.width??4)/2 <= site.depth/2) : [];
    walls.push(wall(`site-side-${boundary}`, x, 0, site.depth - 2 * SITE_WALL, -90, openings));
    const tall = neighbors.filter(v => v.stories === 2 && !v.future).map(v => roomLevels(v, site)[1]).filter(v => (v.row === boundary - 1 && v.siteRight) || (v.row === boundary && v.siteLeft));
    const ticks = [...new Set(tall.flatMap(v => [Math.max(-site.depth/2+SITE_WALL,v.z-v.d/2),Math.min(site.depth/2-SITE_WALL,v.z+v.d/2)]))].sort((a,b)=>a-b);
    for (let i = 1; i < ticks.length; i++) {
      const a=ticks[i-1], b=ticks[i], mid=(a+b)/2;
      const owners=tall.filter(v=>v.z-v.d/2 < mid && v.z+v.d/2 > mid);
      if (!owners.length || b <= a) continue;
      const upperOpenings = external ? owners.flatMap(v=>v.openings.filter(o=>o.wall===side && o.level===1).map(o=>({...o,wall:'front',pos:v.z+o.pos-mid}))).filter(o=>Math.abs(o.pos)+(o.width??4)/2 <= (b-a)/2+.001) : [];
      walls.push(wall(`site-upper-${boundary}-${i}`, x, mid, b-a, -90, upperOpenings, siteGroundHeight(site), owners[0].material));
    }
  }
  for (const [edge, z] of [['back',-site.depth/2+SITE_WALL/2],['front',site.depth/2-SITE_WALL/2]]) {
    const openings=items.filter(v=>!isCourt(v) && (edge==='back'?v.siteBack:v.siteFront)).flatMap(v=>v.openings.filter(o=>o.wall===edge && !o.level).map(o=>({...o,wall:'front',pos:v.x+o.pos})));
    walls.push(wall(`site-${edge}`,0,z,site.width,0,openings));
    items.filter(v=>!isCourt(v) && v.stories===2 && (edge==='back'?v.siteBack:v.siteFront)).map(v=>roomLevels(v,site)[1]).filter(v=>edge==='back'?v.siteBack:v.siteFront).forEach(v=>{
      const upperOpenings=v.openings.filter(o=>o.wall===edge && o.level===1).map(o=>({...o,wall:'front',pos:v.x+o.pos-v.x}));
      walls.push(wall(`site-upper-${edge}-${v.row}`,v.x,z,v.w,0,upperOpenings,siteGroundHeight(site),v.material));
    });
  }
  return walls;
}

export function sitePlanSVG(items, site, units = 'imperial') {
  const scale = 8, pad = 65, w = site.width * scale + pad * 2, h = site.depth * scale + pad * 2 + 40;
  const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&apos;' }[c]));
  const dimension = n => units === 'metric' ? `${(n * .3048).toFixed(2)} m` : `${Number(n.toFixed(2))}′`;
  const px = x => pad + (x + site.width / 2) * scale;
  const py = z => pad + (z + site.depth / 2) * scale;
  let markup = `<rect width="100%" height="100%" fill="#efebe2"/><g font-family="monospace" fill="#262119" font-size="10">`;
  markup += `<text x="${pad}" y="20">LONG HOUSE · ${siteRowCount(site)} ${siteRowCount(site) === 1 ? 'ROW' : 'ROWS'} · GROUND FLOOR</text><text x="${w/2}" y="40" text-anchor="middle">STREET · ${escape(site.front)} · ${dimension(site.width)}</text>`;
  for (let row = 0; row < siteRowCount(site); row++) {
    markup += `<text x="${px(rowCenter(site,row))}" y="${h-48}" text-anchor="middle">ROW ${row+1}</text>`;
  }
  for (const court of sideCourtSections(items, site)) {
    markup += `<rect x="${px(court.x-court.w/2)}" y="${py(court.z-court.d/2)}" width="${court.w*scale}" height="${court.d*scale}" fill="#d9dfce"/><text x="${px(court.x)}" y="${py(court.z)}" text-anchor="middle" font-size="8">SKY</text>`;
  }
  for (const v of items) {
    const label = escape(v.label.slice(0, Math.max(6, Math.floor(v.w * scale / 6))));
    markup += `<g opacity="${v.future ? .5 : 1}"><rect x="${px(v.x-v.w/2)}" y="${py(v.z-v.d/2)}" width="${v.w*scale}" height="${v.d*scale}" fill="${isCourt(v)?'#d9dfce':'#e9e0d1'}"/>`;
    markup += `<text x="${px(v.x)}" y="${py(v.z)-3}" text-anchor="middle">${label}</text>`;
    if (v.d >= 4) markup += `<text x="${px(v.x)}" y="${py(v.z)+10}" text-anchor="middle" font-size="8">${isCourt(v)?'OPEN SKY · ':''}${dimension(v.w)} × ${dimension(v.d)}</text>`;
    markup += '</g>';
  }
  const drawWall = (x,z,length,t,rotation,openings) => {
    let result = `<g transform="translate(${px(x)} ${py(z)}) rotate(${rotation})"><rect x="${-length*scale/2}" y="${-t*scale/2}" width="${length*scale}" height="${t*scale}"/>`;
    for (const o of openings) {
      const width = o.width ?? 4;
      result += `<rect x="${(o.pos-width/2)*scale}" y="${-t*scale/2-.5}" width="${width*scale}" height="${t*scale+1}" fill="#efebe2"/>`;
      if (o.type === 'window') result += `<line x1="${(o.pos-width/2)*scale}" y1="0" x2="${(o.pos+width/2)*scale}" y2="0" stroke="#262119" stroke-width="1"/>`;
    }
    return result + '</g>';
  };
  for (const v of items.filter(v=>!isCourt(v))) {
    for (const key of ['front','back','left','right']) {
      if ((key==='left' && v.siteLeft) || (key==='right' && v.siteRight) || (key==='back' && (v.siteBack || v.sharedBack)) || (key==='front' && v.siteFront)) continue;
      const side=key==='left'||key==='right';
      const x=v.x+(side?(key==='left'?-1:1)*(v.w-v.t)/2:0);
      const z=v.z+(!side?(key==='back'?-1:1)*(v.d-v.t)/2:0);
      markup += drawWall(x,z,side?v.d-2*v.t:v.w,v.t,side?90:0,v.openings.filter(o=>o.wall===key&&!o.level));
    }
  }
  for (const v of items.filter(v => !isCourt(v) && v.stories === 2)) {
    const upper = roomLevels(v, site)[1];
    if (upper.w < v.w - .01 || upper.d < v.d - .01) {
      markup += `<rect x="${px(upper.x-upper.w/2)}" y="${py(upper.z-upper.d/2)}" width="${upper.w*scale}" height="${upper.d*scale}" fill="none" stroke="#8a4b2d" stroke-width="2" stroke-dasharray="5 3"/><text x="${px(upper.x)}" y="${py(upper.z)}" text-anchor="middle" font-size="8" fill="#8a4b2d">UPPER ABOVE</text>`;
    }
  }
  for (const wall of siteWallVolumes(items,site).filter(v=>!v.baseY)) markup += drawWall(wall.x,wall.z,wall.w,wall.d,-wall.rot,wall.openings);
  markup += `<text x="18" y="${h/2}" transform="rotate(-90 18 ${h/2})" text-anchor="middle">LOT DEPTH ${dimension(site.depth)}</text>`;
  markup += `<text x="${pad}" y="${h-16}" font-size="9">SHAPE IT · NOT FOR CONSTRUCTION</text></g>`;
  return { markup:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">${markup}</svg>`,w,h };
}
