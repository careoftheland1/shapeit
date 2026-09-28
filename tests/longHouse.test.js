import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SITE, PLACES, SITE_WALL, layoutRow, startingRow, rowWarnings, openingRelationship, layoutSite, resizeSite, rowWidth, rowCenter, roomLevels, roomInnerFootprint, thicknessOwnerIndex, sideCourtSections, courtNetworks, siteWallVolumes, sitePlanSVG } from '../src/longHouse.js';
import { pickVolumeHit } from '../src/volumePicking.js';
import { normalizeProjectIds } from '../src/projectIds.js';
import { deckParapetBoxes, terraceParapetBoxes } from '../src/parapetGeometry.js';
import { longHouseZoom } from '../src/cameraNavigation.js';
let id = 1;
const nid = () => id++;
test('zoom can travel through an 80-foot Long House after reaching a useful close view', () => {
  let radius = 70, targetZ = 0;
  for (let i = 0; i < 50; i++) {
    ({ radius, targetZ } = longHouseZoom(radius, targetZ, targetZ + radius * .55, Math.exp(-.1), 80, 150));
  }
  assert.equal(radius, 6);
  assert.ok(targetZ < -40);
  const outward = longHouseZoom(radius, targetZ, targetZ + 3, Math.exp(.1), 80, 150);
  assert.ok(outward.radius > radius);
});
test('every starting sequence is independent editable geometry and fits a normal site', () => {
  for (const place of PLACES) {
    const row = startingRow(place.id, DEFAULT_SITE, nid);
    assert.equal(row.length, place.uses.length);
    assert.equal(new Set(row.map(v => v.id)).size, row.length);
    assert.ok(row.at(-1).z + row.at(-1).d / 2 <= DEFAULT_SITE.depth / 2);
    assert.ok(row.every(v => v.x === 0 && v.rot === 0 && v.d > 0));
  }
});
test('shared construction overlaps one thickness only and never consumes a court', () => {
  const [a, court, b] = startingRow('live-court-sleep', DEFAULT_SITE, nid);
  const shared = layoutRow([a, {...b, join:'shared', t:2}]);
  assert.equal(shared[1].sharedBack, 12);
  assert.equal(shared[1].t, a.t);
  assert.equal(shared[1].z - shared[0].z, (a.d+b.d)/2-a.t);
  assert.equal(layoutRow([a,court,{...b,join:'shared'}])[2].sharedBack, 0);
  const separate = layoutRow([a,{...b,join:'separate'}]);
  assert.equal(separate[1].sharedBack, 0);
  assert.equal(separate[1].z - separate[0].z,(a.d+b.d)/2);
});
test('mismatched widths remain separate and report the relationship', () => {
  const [a,,b] = startingRow('live-court-sleep',DEFAULT_SITE,nid);
  const row=layoutRow([a,{...b,w:12,join:'shared'}]);
  assert.equal(row[1].sharedBack,0);
  assert.ok(rowWarnings(row,DEFAULT_SITE).some(w=>w.includes('match the adjacent room width')));
});
test('rise once connects an upper door to an adjacent roof deck', () => {
  const row=startingRow('rise-once',DEFAULT_SITE,nid);
  const tall=row.find(v=>v.stories===2), deck=row.find(v=>v.deck);
  assert.equal(deck.deckBackAccess,true);
  assert.equal(openingRelationship(row,tall.id,'front',DEFAULT_SITE,1),'Faces roof deck');
  assert.ok(!rowWarnings(row,DEFAULT_SITE).some(w=>w.includes('roof-deck access')));
});
test('shrinking rooms keeps openings within walls and lowering a room moves openings to ground', () => {
  const [a]=startingRow('live-court-sleep',DEFAULT_SITE,nid);
  const [small]=layoutRow([{...a,w:8,d:8,openings:[{id:nid(),wall:'front',type:'window',pos:20,width:12,height:12,sill:10,level:1}]}]);
  const o=small.openings[0];
  assert.equal(o.level,0);
  assert.ok(Math.abs(o.pos)+o.width/2 <= (small.w-2*small.t)/2);
  assert.ok(o.sill+o.height <= 12);
});
test('tight sites and extra tall rooms give soft warnings without deleting geometry', () => {
  const row=startingRow('everyday',{...DEFAULT_SITE,depth:16},nid);
  assert.equal(row.length,5);
  assert.ok(rowWarnings(row,{...DEFAULT_SITE,depth:16}).some(w=>w.includes('depth')));
  const tall=layoutRow(row.map(v=>v.kind==='room'?{...v,stories:2,h:18}:v));
  assert.ok(rowWarnings(tall,DEFAULT_SITE).some(w=>w.includes('Rise once')));
});

test('three homes have independent IDs and one wall per shared boundary', () => {
  const first = layoutSite(startingRow('live-court-sleep', DEFAULT_SITE, nid), DEFAULT_SITE);
  const site = { ...DEFAULT_SITE, width: 45, rows: 3 };
  const items = resizeSite(first, DEFAULT_SITE, site, nid);
  assert.equal(rowWidth(site), 16);
  assert.equal(items.length, 9);
  const ids = items.flatMap(v => [v.id, ...v.openings.map(o=>o.id)]);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(rowCenter(site, 1), 0);
  assert.equal(rowCenter(site, 2)-rowCenter(site,1), 14.5);
  const walls = siteWallVolumes(items, site);
  assert.equal(walls.filter(w=>w.id.startsWith('site-side-')).length, 4);
  assert.equal(walls.length, 6);
  assert.ok(walls.every(w=>w.h===12));
  assert.ok(items.filter(v=>v.kind==='room').every(v=>v.siteSides));
  const changed = layoutSite(items.map(v=>v.row===1 && v.kind==='court'?{...v,d:12}:v),site);
  assert.equal(changed.find(v=>v.row===0 && v.kind==='court').d,8);
  assert.equal(changed.find(v=>v.row===1 && v.kind==='court').d,12);
  assert.match(openingRelationship(changed,changed.find(v=>v.row===1).id,'left',site), /Shared boundary/);
});
test('model clicks select the visible volume across rows, even when row 1 is open', () => {
  const volumes = [{ id: 1, row: 0 }, { id: 2, row: 1 }];
  const hit = id => ({ object: { userData: { volumeId: id } } });
  const boundary = { object: { userData: { volumeId: 'site-side-1' } } };
  assert.equal(pickVolumeHit([boundary, hit(2), hit(1)], volumes)?.object.userData.volumeId, 2);
  assert.equal(pickVolumeHit([boundary, hit(1), hit(2)], volumes)?.object.userData.volumeId, 1);
  assert.equal(pickVolumeHit([boundary, hit(99)], volumes), null);
});
test('saved rows with duplicate IDs regain independent selection and opening IDs', () => {
  const saved = [
    { id: 1, row: 0, openings: [{ id: 2 }] },
    { id: 1, row: 1, openings: [{ id: 2 }] },
    { id: 3, row: 2, openings: [{ id: 3 }] },
  ];
  const repaired = normalizeProjectIds(saved);
  const allIds = repaired.flatMap(v => [v.id, ...v.openings.map(o => o.id)]);
  assert.equal(new Set(allIds).size, allIds.length);
  assert.equal(repaired[0].id, 1);
  assert.equal(repaired[1].row, 1);
  assert.notEqual(repaired[1].id, repaired[0].id);
  assert.equal(repaired[2].id, 3);
  assert.equal(pickVolumeHit([{ object: { userData: { volumeId: repaired[1].id } } }], repaired)?.object.userData.volumeId, repaired[1].id);
});
test('one row encloses both court sides and the full lot front and rear', () => {
  const items=layoutSite(startingRow('live-court-sleep',DEFAULT_SITE,nid),DEFAULT_SITE);
  const walls=siteWallVolumes(items,DEFAULT_SITE);
  assert.equal(walls.length,4);
  assert.equal(walls[0].w,DEFAULT_SITE.depth-2*SITE_WALL);
  assert.equal(walls[1].w,DEFAULT_SITE.depth-2*SITE_WALL);
  assert.equal(walls[0].x,-7.25);
  assert.equal(walls[1].x,7.25);
  assert.equal(walls.find(v=>v.id==='site-back').z,-39.25);
  assert.equal(walls.find(v=>v.id==='site-front').z,39.25);
});
test('neighboring tall rooms share upper wall bands without duplicates', () => {
  const site={...DEFAULT_SITE,rows:2,width:30.5};
  const first=layoutSite(startingRow('rise-once',DEFAULT_SITE,nid),DEFAULT_SITE);
  const items=resizeSite(first,DEFAULT_SITE,site,nid);
  const shared=siteWallVolumes(items,site).filter(w=>w.id.startsWith('site-upper-1-'));
  assert.equal(shared.length,1);
  assert.equal(shared[0].baseY,12);
  assert.equal(shared[0].w,16);
  assert.equal(shared[0].openings.length,0);
});
test('narrow rooms meet a chosen wall and form a side court connected to the next court', () => {
  const [room, court] = startingRow('live-court-sleep', DEFAULT_SITE, nid);
  for (const side of ['left', 'right']) {
    const [placed, nextCourt] = layoutSite([{ ...room, w: 10, side }, court], DEFAULT_SITE);
    const [strip] = sideCourtSections([placed, nextCourt], DEFAULT_SITE);
    assert.equal(placed.w + strip.w, DEFAULT_SITE.width);
    assert.equal(placed.siteLeft, side === 'left');
    assert.equal(placed.siteRight, side === 'right');
    assert.equal(openingRelationship([placed, nextCourt], placed.id, side === 'left' ? 'right' : 'left', DEFAULT_SITE), 'Faces side court');
    assert.equal(Math.abs(placed.x - strip.x), (placed.w + strip.w) / 2);
    assert.equal(strip.z + strip.d / 2, nextCourt.z - nextCourt.d / 2);
    assert.deepEqual(courtNetworks([placed, nextCourt], DEFAULT_SITE).map(network => [network.area, network.sections]), [[strip.w * strip.d + nextCourt.w * nextCourt.d, 2]]);
    assert.equal(siteWallVolumes([placed, nextCourt], DEFAULT_SITE).filter(w => w.id.startsWith('site-side-')).length, 2);
    assert.match(sitePlanSVG([placed, nextCourt], DEFAULT_SITE).markup, /SKY/);
  }
});
test('a smaller upper room leaves a terrace and only extends boundary walls where it touches', () => {
  const [room, court] = startingRow('live-court-sleep', DEFAULT_SITE, nid);
  const [placed] = layoutSite([{ ...room, stories: 2, h: 18, upperWidth: 8, upperDepth: 8,
    upperSide: 'left', upperEnd: 'back', openings: [...room.openings, { id: nid(), wall: 'front', type: 'door', level: 1, pos: 0 }] }, { ...court, d: 64 }], DEFAULT_SITE);
  const [lower, upper] = roomLevels(placed, DEFAULT_SITE);
  assert.equal(lower.h, 12);
  assert.equal(upper.h, 9);
  assert.equal(upper.w, 8);
  assert.equal(upper.d, 8);
  assert.equal(upper.siteLeft, true);
  assert.equal(upper.siteRight, false);
  assert.equal(upper.siteBack, true);
  assert.equal(upper.siteFront, false);
  assert.equal(openingRelationship([placed], placed.id, 'front', DEFAULT_SITE, 1), 'Faces this room’s roof terrace');
  const walls = siteWallVolumes([placed], DEFAULT_SITE);
  assert.equal(walls.filter(w => w.id.startsWith('site-upper-0-')).length, 1);
  assert.equal(walls.filter(w => w.id.startsWith('site-upper-1-')).length, 0);
  assert.match(sitePlanSVG([placed], DEFAULT_SITE).markup, /UPPER ABOVE/);
});
test('site heights govern rooms, upper walls, openings, and old project defaults', () => {
  const site = { ...DEFAULT_SITE, groundHeight: 14, upperHeight: 10 };
  const [seed] = startingRow('rise-once', site, nid).filter(v => v.stories === 2);
  const [room] = layoutSite([{ ...seed, d: site.depth, openings: [
    { id: nid(), wall: 'left', type: 'window', pos: 0, height: 20, sill: 20 },
    { id: nid(), wall: 'left', type: 'window', pos: 0, height: 20, sill: 20, level: 1 },
  ] }], site);
  assert.equal(room.h, 24);
  assert.deepEqual(roomLevels(room, site).map(v => v.h), [14, 10]);
  assert.ok(room.openings.every(o => o.height + o.sill <= (o.level ? 10 : 14)));
  const walls = siteWallVolumes([room], site);
  assert.ok(walls.filter(w => !w.baseY).every(w => w.h === 14));
  assert.ok(walls.filter(w => w.baseY).every(w => w.baseY === 14 && w.h === 10));

  const legacy = { width: 16, depth: 80, front: 'South', rows: 1 };
  const [oldRoom] = layoutSite([{ ...room, h: 18 }], legacy);
  assert.equal(oldRoom.h, 18);
  assert.deepEqual(roomLevels(oldRoom, legacy).map(v => v.h), [9, 9]);
  assert.ok(siteWallVolumes([oldRoom], legacy).every(w => w.h === 9));
});
test('an upper gap no wider than its wall closes to the edge', () => {
  const site = { ...DEFAULT_SITE, width: 49.5, rows: 4 };
  const room = { ...startingRow('live-court-sleep', DEFAULT_SITE, nid)[0], row: 3, w: 13.5, d: 16,
    stories: 2, h: 18, upperWidth: 12, upperDepth: 12 };
  const court = { ...startingRow('live-court-sleep', DEFAULT_SITE, nid)[1], row: 3, w: 13.5, d: 64 };
  const [placed] = layoutSite([room, court], site);
  const upper = roomLevels(placed, site)[1];
  assert.equal(placed.upperWidth, 13.5);
  assert.equal(upper.w, placed.w);
  assert.equal(upper.siteRight, true);
  assert.equal(upper.d, 12);
  assert.ok(siteWallVolumes([placed], site).some(w => w.id.startsWith('site-upper-4-')));
  assert.ok(!terraceParapetBoxes(placed, upper).some(box => box.x > 0 && box.d >= upper.d));
});
test('adding a row preserves a narrow room and its side alignment', () => {
  const [room] = startingRow('live-court-sleep', DEFAULT_SITE, nid);
  const [placed] = layoutSite([{ ...room, w: 10, side: 'right' }], DEFAULT_SITE);
  const nextSite = { ...DEFAULT_SITE, rows: 2, width: 30.5 };
  const copied = resizeSite([placed], DEFAULT_SITE, nextSite, nid);
  assert.equal(copied.length, 2);
  assert.ok(copied.every(v => v.w === 10 && v.side === 'right' && v.siteRight));
});
test('roof parapets match wall thickness and stop at the room perimeter', () => {
  const room = { x: 0, z: 0, w: 16, d: 20, t: 1.5 };
  const upper = { x: -4, z: -6, w: 8, d: 8 };
  for (const boxes of [deckParapetBoxes(room), terraceParapetBoxes(room, upper)]) {
    assert.ok(boxes.length > 0);
    assert.ok(boxes.some(box => Math.abs(box.x) + box.w / 2 === room.w / 2));
    assert.ok(boxes.some(box => Math.abs(box.z) + box.d / 2 === room.d / 2));
    for (const box of boxes) {
      assert.ok(box.w === room.t || box.d === room.t);
      assert.ok(Math.abs(box.x) + box.w / 2 <= room.w / 2 + .001);
      assert.ok(Math.abs(box.z) + box.d / 2 <= room.d / 2 + .001);
    }
  }
  const deck = deckParapetBoxes({ ...room, deckBackAccess: true });
  assert.ok(deck.every(box => !(box.w === room.w && box.z < 0)));
});
test('reducing room thickness expands inward while outer footprint and compound walls stay fixed', () => {
  const [seed] = startingRow('live-court-sleep', DEFAULT_SITE, nid);
  const [thick] = layoutSite([{ ...seed, t: 1.5 }], DEFAULT_SITE);
  const [thin] = layoutSite([{ ...seed, t: 1 }], DEFAULT_SITE);
  assert.deepEqual([thin.x, thin.z, thin.w, thin.d], [thick.x, thick.z, thick.w, thick.d]);
  assert.deepEqual(siteWallVolumes([thin], DEFAULT_SITE).map(w => [w.x, w.z, w.w, w.d]), siteWallVolumes([thick], DEFAULT_SITE).map(w => [w.x, w.z, w.w, w.d]));
  const thickInside = roomInnerFootprint(thick), thinInside = roomInnerFootprint(thin);
  assert.equal(thinInside.w, thickInside.w); // both sides use the fixed compound wall
  assert.equal(thinInside.d, thickInside.d + 1); // both room end walls move inward
  const [narrowThick] = layoutSite([{ ...seed, w: 10, side: 'left', t: 1.5 }], DEFAULT_SITE);
  const [narrowThin] = layoutSite([{ ...seed, w: 10, side: 'left', t: 1 }], DEFAULT_SITE);
  assert.deepEqual([narrowThin.x, narrowThin.w], [narrowThick.x, narrowThick.w]);
  assert.equal(roomInnerFootprint(narrowThin).w, roomInnerFootprint(narrowThick).w + .5);
  const [upperThick] = layoutSite([{ ...seed, stories: 2, h: 18, upperWidth: 14.25, t: 2 }], DEFAULT_SITE);
  const [upperThin] = layoutSite([{ ...seed, stories: 2, h: 18, upperWidth: 14.25, t: 1 }], DEFAULT_SITE);
  assert.deepEqual([roomLevels(upperThin, DEFAULT_SITE)[1].x, roomLevels(upperThin, DEFAULT_SITE)[1].w], [roomLevels(upperThick, DEFAULT_SITE)[1].x, roomLevels(upperThick, DEFAULT_SITE)[1].w]);
});
test('shared rooms use the thickness of their first connected room', () => {
  const [first,,second] = startingRow('live-court-sleep', DEFAULT_SITE, nid);
  const row = layoutRow([first, { ...second, join: 'shared' }]);
  assert.equal(thicknessOwnerIndex(row, 1), 0);
  const changed = layoutRow([{ ...first, t: 1 }, { ...second, join: 'shared' }]);
  assert.equal(changed[0].t, 1);
  assert.equal(changed[1].t, 1);
});
test('parapets keep compound-wall thickness on site edges when room walls thin', () => {
  const room = { x: 0, z: 0, w: 16, d: 20, t: 1, siteLeft: true, siteBack: true };
  const deck = deckParapetBoxes(room);
  assert.ok(deck.some(box => box.x < 0 && box.w === SITE_WALL));
  assert.ok(deck.some(box => box.x > 0 && box.w === 1));
  assert.ok(deck.some(box => box.z < 0 && box.d === SITE_WALL));
  const terrace = terraceParapetBoxes(room, { x: -4, z: -6, w: 8, d: 8 });
  assert.ok(terrace.some(box => box.x < 0 && box.w === SITE_WALL));
  assert.ok(terrace.some(box => box.x > 0 && box.w === 1));
});
test('row-count reduction is explicit and full-site drawings escape use labels', () => {
  const site={...DEFAULT_SITE,rows:3,width:45};
  const first=startingRow('live-court-sleep',DEFAULT_SITE,nid);
  const items=resizeSite(first,DEFAULT_SITE,site,nid);
  const reduced=resizeSite(items,site,DEFAULT_SITE,nid);
  assert.equal(reduced.length,3);
  assert.ok(reduced.every(v=>v.row===0));
  const drawing=sitePlanSVG(items.map(v=>({...v,label:'<room>'})),site);
  assert.match(drawing.markup,/3 ROWS/);
  assert.match(drawing.markup,/OPEN SKY/);
  assert.match(drawing.markup,/&lt;room&gt;/);
  assert.ok(!drawing.markup.includes('<room>'));
});
