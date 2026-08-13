import React, { useRef, useEffect, useState, useCallback } from "react";
import * as THREE from "three";
import lavacreteTextureUrl from "./assets/lavacrete-texture.jpg";
import csreTextureUrl from "./assets/csre-texture.jpg";

/* ============================================================
   SHELTER ON THE LAND — volume study
   Kit-of-parts configurator: rammed earth / lavacrete volumes,
   cubiform or cylinder, 12"/18"/24" walls, module-snapped openings,
   flat or 3:12 mono-slope roofs, wall-proximity snapping, napkin
   plan export. Module = 2'. Door 4' wide. Window 4' wide, sill 3',
   head 7'.
   ============================================================ */

const MODULE = 2;        // ft — plan module for openings + drag snap
const OPEN_W = 4;        // ft — default width for a new door or window
const OPENING_STEP = 0.5; // ft — width/height adjustment increment, door and window alike
const DOOR_MIN_W = 2;    // ft — narrowest a door can be adjusted to
const DOOR_MIN_H = 6;    // ft — shortest a door can be adjusted to
// Windows have no real floor beyond the adjustment increment itself —
// unlike a door, there's no structural minimum a window needs to clear.
const WIN_MIN_W = OPENING_STEP;
const WIN_MIN_H = OPENING_STEP;
const roundToStep = (v) => Math.round(v / OPENING_STEP) * OPENING_STEP;
const openingWidth = (o) => o.width ?? OPEN_W;
const SILL = 3;          // ft — default window sill (bottom of opening)
const HEAD = 7;          // ft — default door height (floor to head)
const WIN_H = HEAD - SILL; // ft — default window height
const openingHeight = (o) => o.height ?? (o.type === "window" ? WIN_H : HEAD);
const FT = 1;            // world units are feet
const SANDBOX = 50;       // ft — half-extent of the buildable plot from center
const clampCoord = (v) => Math.min(SANDBOX, Math.max(-SANDBOX, v));

const ROOF_EAVE = 0;      // ft — roof overhang beyond wall face (flush)
const ROOF_PITCH = 3 / 12; // 3:12 pitch, rise/run
const ROOF_T = 0.3;       // ft — placeholder roof slab/panel thickness

// wall-proximity snapping (drag) — judgment calls, tune to taste
const SNAP_ENGAGE = 1.5;   // ft — proximity to trigger a flush (shared-wall / offset-join) snap
const SNAP_FULL_SLOP = 1;  // ft — shortfall from full wall-length overlap still called "shared wall"
const COURTYARD_MIN = 4, COURTYARD_MAX = 12; // ft — facing gap range that snaps to nearest module

const INK = "#262119";
const PAPER = "#efebe2";
const OXIDE = "#8a4b2d";
const SAGE = "#7c8471";
const ROOF_COLOR = 0x9b968a; // placeholder roof tone, distinct from wall materials

let _id = 1;
const nid = () => _id++;

/* ---------------- save / load ---------------- */

const PROJECT_VERSION = 1;
const AUTOSAVE_KEY = "shelter-on-the-land:autosave:v1";

// Restored/imported volumes carry their own ids (and their openings'
// ids), assigned by whatever session saved them. Advance the counter
// past the highest one seen so newly-created volumes/openings can never
// collide with them.
function bumpIdCounter(volumes) {
  let max = 0;
  for (const v of volumes) {
    if (typeof v.id === "number") max = Math.max(max, v.id);
    for (const o of v.openings ?? []) {
      if (typeof o.id === "number") max = Math.max(max, o.id);
    }
  }
  if (max >= _id) _id = max + 1;
}

function serializeProject(volumes, units, showRoofs) {
  return { version: PROJECT_VERSION, savedAt: new Date().toISOString(), units, showRoofs, volumes };
}

// Returns an error string if `obj` isn't a project this app can safely
// load, or null if it looks sound. Checks structure and field types
// rather than every possible invariant — enough to catch a wrong,
// corrupted, or future-version file without becoming a full schema
// validator.
function validateProject(obj) {
  if (!obj || typeof obj !== "object") return "not a valid project file";
  if (obj.version !== PROJECT_VERSION) {
    return obj.version > PROJECT_VERSION
      ? `saved by a newer version of the app (version ${obj.version}) — can't load it here`
      : `unrecognized project file version (${obj.version ?? "none"})`;
  }
  if (!Array.isArray(obj.volumes)) return "missing volumes";
  for (const v of obj.volumes) {
    if (!v || typeof v !== "object") return "a volume entry is malformed";
    if (v.shape !== "cubiform" && v.shape !== "cylinder") return "a volume has an invalid shape";
    if (v.material !== "earth" && v.material !== "lava") return "a volume has an invalid material";
    if (typeof v.x !== "number" || typeof v.z !== "number" || typeof v.h !== "number" || typeof v.t !== "number" || typeof v.rot !== "number") {
      return "a volume is missing required numeric fields";
    }
    if (v.shape === "cylinder" ? typeof v.r !== "number" : (typeof v.w !== "number" || typeof v.d !== "number")) {
      return "a volume is missing footprint dimensions";
    }
    if (!Array.isArray(v.openings)) return "a volume is missing its openings array";
  }
  return null;
}

// Synchronous — read once, at component init, to seed initial state
// directly rather than restoring in a later effect (which would flash
// the default seed scene first).
function loadAutosave() {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (validateProject(obj)) return null;
    bumpIdCounter(obj.volumes);
    return obj;
  } catch {
    return null;
  }
}

/* ---------------- wall photo textures ---------------- */

// Both materials use a photographed wall as their texture, tiled by the
// same world-feet repeat convention set per-mesh in buildVolumeGroup's
// mkMesh. Downscaled + re-encoded as JPEG on the way in (source photos
// were multi-megapixel PNGs — massive overkill for a repeated tile a few
// hundred px across on screen, and each wall segment clones its own copy
// of the texture for independent repeat/offset, so the byte size multiplies
// fast with more volumes/openings). onLoad fires once the image actually
// arrives over the network, since walls are built well before that.
function makeWallTexture(url, onLoad) {
  const t = new THREE.TextureLoader().load(url, onLoad);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// World-feet a texture repeat spans vertically, per material — this is
// what controls how many of the photo's lift-lines read on a wall (see
// mkMesh/mkBevelPrism). CSRE's 6-lines-per-tile photo needs a wider span
// than lavacrete's blotchier one, which doesn't read as countable lines
// at any scale.
const WALL_TEX_V_SPAN = { earth: 5, lava: 4 };

/* ---------------- wall geometry from data ---------------- */

// Wall runs along local X, thickness along local Z, length L, height H.
// Returns [{ size:[sx,sy,sz], pos:[x,y,z] }]
function wallBoxes(L, H, t, openings) {
  const boxes = [];
  const cuts = openings
    .map((o) => {
      const sill = o.type === "window" ? o.sill ?? SILL : 0;
      const head = sill + openingHeight(o);
      const ow = openingWidth(o);
      return { a: o.pos - ow / 2, b: o.pos + ow / 2, ow, type: o.type, sill, head };
    })
    .sort((p, q) => p.a - q.a);
  let cursor = -L / 2;
  for (const cut of cuts) {
    if (cut.a > cursor) {
      const w = cut.a - cursor;
      boxes.push({ size: [w, H, t], pos: [cursor + w / 2, H / 2, 0] });
    }
    // header above opening
    if (H > cut.head) {
      boxes.push({ size: [cut.ow, H - cut.head, t], pos: [(cut.a + cut.b) / 2, cut.head + (H - cut.head) / 2, 0] });
    }
    // base below opening (sill for window, ground for door)
    if (cut.sill > 0) {
      boxes.push({ size: [cut.ow, cut.sill, t], pos: [(cut.a + cut.b) / 2, cut.sill / 2, 0] });
    }
    cursor = Math.max(cursor, cut.b);
  }
  if (cursor < L / 2) {
    const w = L / 2 - cursor;
    boxes.push({ size: [w, H, t], pos: [cursor + w / 2, H / 2, 0] });
  }
  return boxes;
}

/* ---------------- cylinder wall geometry (angle-domain analogue) ---------------- */

const CYL_SEG_ANGLE = Math.PI / 24; // ~7.5° chunks — 48 segments per full circle

// Straight tangent-chord segments approximating an arc from a0 to a1 (radians),
// at outer radius r, wall thickness t, height band [yBottom, yBottom+sy].
// Same box shape ({size, pos}) as the rectangular wall boxes, plus rotY.
function pushArcBoxes(boxes, a0, a1, yBottom, sy, r, t) {
  const span = a1 - a0;
  if (span <= 0 || sy <= 0) return;
  const n = Math.max(1, Math.ceil(span / CYL_SEG_ANGLE));
  const step = span / n;
  const midR = r - t / 2;
  for (let i = 0; i < n; i++) {
    const amid = a0 + step * (i + 0.5);
    const chord = 2 * midR * Math.sin(step / 2);
    boxes.push({
      size: [chord, sy, t],
      pos: [Math.cos(amid) * midR, yBottom + sy / 2, Math.sin(amid) * midR],
      rotY: -amid - Math.PI / 2, // aligns box local-X with the circle's tangent at amid
    });
  }
}

// Circular wall, angle-domain analogue of wallBoxes. openings: [{angle
// (radians, normalized to [-PI,PI)), type, sill?}]. Outer radius r is the
// angle<->arc-length reference (matches OPEN_W being measured along the
// outer wall face). Swept like a linear wall from -PI to PI; a seam sits at
// angle=PI — openings placed right on it aren't supported in this pass.
function cylinderWallBoxes(r, t, H, openings) {
  const boxes = [];
  const cuts = openings
    .map((o) => {
      const sill = o.type === "window" ? o.sill ?? SILL : 0;
      const head = sill + openingHeight(o);
      const halfOpenAngle = openingWidth(o) / 2 / r;
      return { a: o.angle - halfOpenAngle, b: o.angle + halfOpenAngle, sill, head };
    })
    .sort((p, q) => p.a - q.a);
  let cursor = -Math.PI;
  for (const cut of cuts) {
    if (cut.a > cursor) pushArcBoxes(boxes, cursor, cut.a, 0, H, r, t);
    if (H > cut.head) pushArcBoxes(boxes, cut.a, cut.b, cut.head, H - cut.head, r, t);
    if (cut.sill > 0) pushArcBoxes(boxes, cut.a, cut.b, 0, cut.sill, r, t);
    cursor = Math.max(cursor, cut.b);
  }
  if (cursor < Math.PI) pushArcBoxes(boxes, cursor, Math.PI, 0, H, r, t);
  return boxes;
}

function normalizeAngle(rad) {
  let a = rad % (2 * Math.PI);
  if (a < -Math.PI) a += 2 * Math.PI;
  if (a >= Math.PI) a -= 2 * Math.PI;
  return a;
}
// Snaps an opening's angle so its arc-length position (at outer radius r)
// lands on the same MODULE grid the rectangular walls use.
function clampAngle(vol, angleRad) {
  const norm = normalizeAngle(angleRad);
  const snappedArc = Math.round((norm * vol.r) / MODULE) * MODULE;
  return normalizeAngle(snappedArc / vol.r);
}

// Procedural placeholder roof. "flat" is a flush overlay slab (both
// shapes). "pitched" (cubiform only) is just the diagonal skin — the walls
// themselves are reshaped to the same 3:12 slope in buildVolumeGroup
// (buildSlopeWedge closes the two gable ends), so this piece doesn't need
// its own end infill. Slope direction is fixed in the volume's local frame
// (high at +Z/front, low at -Z/back) — there's no independent roof
// rotation; rotate the volume itself to point the slope elsewhere.
// Cylinders only support the flat option — a single slope has no sensible
// mapping onto a circular plan.
function buildRoofGroup(vol) {
  if (!vol.roof || vol.roof === "none") return null;
  const { h } = vol;
  const roofGroup = new THREE.Group();
  roofGroup.position.y = h;
  roofGroup.userData.isRoof = true;

  if (vol.shape === "cylinder") {
    if (vol.roof !== "flat") return roofGroup;
    const { r } = vol;
    const mat = new THREE.MeshStandardMaterial({ color: ROOF_COLOR, roughness: 0.85, metalness: 0 });
    const geo = new THREE.CylinderGeometry(r + ROOF_EAVE, r + ROOF_EAVE, ROOF_T, 48);
    const m = new THREE.Mesh(geo, mat);
    m.position.y = ROOF_T / 2;
    m.castShadow = true;
    m.receiveShadow = true;
    m.userData.volumeId = vol.id;
    roofGroup.add(m);
    return roofGroup;
  }

  const { w, d } = vol;

  if (vol.roof === "flat") {
    const geo = new THREE.BoxGeometry(w + 2 * ROOF_EAVE, ROOF_T, d + 2 * ROOF_EAVE);
    const mat = new THREE.MeshStandardMaterial({ color: ROOF_COLOR, roughness: 0.85, metalness: 0 });
    const m = new THREE.Mesh(geo, mat);
    m.position.y = ROOF_T / 2;
    m.castShadow = true;
    m.receiveShadow = true;
    m.userData.volumeId = vol.id;
    roofGroup.add(m);
    return roofGroup;
  }

  // mono-slope, 3:12 — low at -Z (y=0), high at +Z (y=rise), spanning the
  // full footprint (flush with the outer wall faces, zero eave). The walls
  // themselves are beveled in buildVolumeGroup to this exact same plane
  // (roofHeightAt there uses the identical formula), so the cap's edge
  // always lands precisely on the wall surface below it — no gap, no
  // overlap, reads as one continuous plane from low wall to high wall.
  const halfW = w / 2 + ROOF_EAVE;
  const halfD = d / 2 + ROOF_EAVE;
  const rise = d * ROOF_PITCH;

  const pos = [];
  const pushTri = (a, b, c) => pos.push(...a, ...b, ...c);
  const A1 = [-halfW, 0, -halfD], A2 = [halfW, 0, -halfD], A3 = [halfW, rise, halfD], A4 = [-halfW, rise, halfD];
  pushTri(A1, A2, A3); pushTri(A1, A3, A4);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: ROOF_COLOR, roughness: 0.85, metalness: 0, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.volumeId = vol.id;
  roofGroup.add(mesh);
  return roofGroup;
}


function buildVolumeGroup(vol, baseTex) {
  const group = new THREE.Group();
  group.rotation.y = THREE.MathUtils.degToRad(vol.rot);
  group.position.set(vol.x, 0, vol.z);
  group.userData.volumeId = vol.id;

  const { h, t } = vol;
  const tex = baseTex[vol.material];

  const mkMesh = (box, yBottomOffset = 0) => {
    const [sx, sy, sz] = box.size;
    const geo = new THREE.BoxGeometry(sx, sy, sz);
    const map = tex.clone();
    map.needsUpdate = true;
    const vSpan = WALL_TEX_V_SPAN[vol.material];
    map.repeat.set(Math.max(sx, sz) / 4, sy / vSpan);
    const yBottom = box.pos[1] - sy / 2;
    map.offset.set(0, (yBottom / vSpan) % 1);
    const mat = new THREE.MeshStandardMaterial({ map, roughness: 0.95, metalness: 0 });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(box.pos[0], box.pos[1] + yBottomOffset, box.pos[2]);
    if (box.rotY) m.rotation.y = box.rotY;
    m.castShadow = true;
    m.receiveShadow = true;
    m.userData.volumeId = vol.id;
    return m;
  };

  if (vol.shape === "cylinder") {
    const { r } = vol;
    for (const b of cylinderWallBoxes(r, t, h, vol.openings)) group.add(mkMesh(b));

    const slabGeo = new THREE.CylinderGeometry(r - t, r - t, 0.33, 48);
    const slabMat = new THREE.MeshStandardMaterial({ color: 0x9b9186, roughness: 1 });
    const slab = new THREE.Mesh(slabGeo, slabMat);
    slab.position.y = 0.165;
    slab.receiveShadow = true;
    slab.userData.volumeId = vol.id;
    group.add(slab);

    const roof = buildRoofGroup(vol);
    if (roof) group.add(roof);
    return group;
  }

  const { w, d } = vol;
  const pitched = vol.roof === "pitched";
  const rise = d * ROOF_PITCH; // low eave = h (back), high eave = h+rise (front)

  // Walls are always built at the volume's plain height h, every side,
  // identically to the flat-roof/no-roof case — the roof (flat or pitched)
  // is purely an add-on layer on top, never a shape that reduces or
  // replaces wall geometry. For "pitched", two more wall-textured add-on
  // pieces finish the gap between the flat wall-top (h) and the sloped
  // roofline above it: a plain rectangular topping on the high (front)
  // wall, and a triangular topping (mkWedge) on each side wall.
  const walls = [
    { key: "front", L: w, rotY: 0, px: 0, pz: d / 2 - t / 2 },
    { key: "back", L: w, rotY: 0, px: 0, pz: -(d / 2 - t / 2) },
    { key: "right", L: d - 2 * t, rotY: -Math.PI / 2, px: w / 2 - t / 2, pz: 0 },
    { key: "left", L: d - 2 * t, rotY: -Math.PI / 2, px: -(w / 2 - t / 2), pz: 0 },
  ];

  for (const wall of walls) {
    const ops = vol.openings.filter((o) => o.wall === wall.key);
    const boxes = wallBoxes(wall.L, h, t, ops);
    const wg = new THREE.Group();
    wg.rotation.y = wall.rotY;
    wg.position.set(wall.px, 0, wall.pz);
    for (const b of boxes) wg.add(mkMesh(b));
    group.add(wg);
  }

  // Every wall stays a flat box up to h (above); what closes the gap up to
  // the roofline is a wall-textured bevel that literally lies on the same
  // plane as the roof cap (roofHeightAt matches buildRoofGroup's pitched
  // cap exactly, full footprint, zero eave) — so the roof reads as one
  // continuous surface from the low wall, up the gable ends, to the high
  // wall, instead of a flat lid sitting on flat-topped walls. Front/back
  // toppings and the two side wedges are literally the same shape (a
  // z-sloped trapezoid extruded along X) — mkBevelPrism handles both by
  // extruding across either the full width w (front/back) or just the
  // wall thickness t (left/right).
  const roofHeightAt = (z) => h + (rise * (z + d / 2)) / d;
  const mkBevelPrism = (z1, z2, xMin, xMax) => {
    const y1 = roofHeightAt(z1), y2 = roofHeightAt(z2);
    const p = (x, y, z) => [x, y, z];
    const positions = [];
    const uvs = [];
    const pushTri = (a, b, c, ua, ub, uc) => {
      positions.push(...a, ...b, ...c);
      uvs.push(...ua, ...ub, ...uc);
    };
    const uv00 = [0, 0], uv10 = [1, 0], uv01 = [0, 1], uv11 = [1, 1];

    // sloped top face
    pushTri(p(xMin, y1, z1), p(xMax, y1, z1), p(xMax, y2, z2), uv00, uv10, uv11);
    pushTri(p(xMin, y1, z1), p(xMax, y2, z2), p(xMin, y2, z2), uv00, uv11, uv01);
    // z1 face, from the wall top (h) up to y1
    pushTri(p(xMin, h, z1), p(xMax, h, z1), p(xMax, y1, z1), uv00, uv10, uv11);
    pushTri(p(xMin, h, z1), p(xMax, y1, z1), p(xMin, y1, z1), uv00, uv11, uv01);
    // z2 face, from the wall top (h) up to y2
    pushTri(p(xMin, h, z2), p(xMax, h, z2), p(xMax, y2, z2), uv00, uv10, uv11);
    pushTri(p(xMin, h, z2), p(xMax, y2, z2), p(xMin, y2, z2), uv00, uv11, uv01);
    // end-cap trapezoids at xMin and xMax
    const cap = (x) => {
      pushTri(p(x, h, z1), p(x, h, z2), p(x, y2, z2), uv00, uv10, uv11);
      pushTri(p(x, h, z1), p(x, y2, z2), p(x, y1, z1), uv00, uv11, uv01);
    };
    cap(xMin); cap(xMax);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geo.computeVertexNormals();
    const map = tex.clone();
    map.needsUpdate = true;
    map.repeat.set(Math.max(0.5, xMax - xMin) / 4, Math.max(0.5, rise) / WALL_TEX_V_SPAN[vol.material]);
    const mat = new THREE.MeshStandardMaterial({ map, roughness: 0.95, metalness: 0, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.volumeId = vol.id;
    return mesh;
  };

  if (pitched) {
    group.add(mkBevelPrism(d / 2 - t, d / 2, -w / 2, w / 2));           // front (high) topping
    group.add(mkBevelPrism(-d / 2, -(d / 2 - t), -w / 2, w / 2));       // back (low) topping
    group.add(mkBevelPrism(-(d / 2 - t), d / 2 - t, w / 2 - t, w / 2)); // right gable wedge
    group.add(mkBevelPrism(-(d / 2 - t), d / 2 - t, -w / 2, -(w / 2 - t))); // left gable wedge
  }

  // interior slab, 4" proud
  const slabGeo = new THREE.BoxGeometry(w - 2 * t, 0.33, d - 2 * t);
  const slabMat = new THREE.MeshStandardMaterial({ color: 0x9b9186, roughness: 1 });
  const slab = new THREE.Mesh(slabGeo, slabMat);
  slab.position.y = 0.165;
  slab.receiveShadow = true;
  slab.userData.volumeId = vol.id;
  group.add(slab);

  const roof = buildRoofGroup(vol);
  if (roof) group.add(roof);

  return group;
}

/* ---------------- opening position limits ---------------- */

function wallLength(vol, wallKey) {
  return wallKey === "front" || wallKey === "back" ? vol.w : vol.d - 2 * vol.t;
}
function clampPos(vol, wallKey, pos, width = OPEN_W) {
  const L = wallLength(vol, wallKey);
  const max = Math.floor((L / 2 - width / 2 - vol.t) / MODULE) * MODULE;
  const lim = Math.max(0, max);
  return Math.min(lim, Math.max(-lim, Math.round(pos / MODULE) * MODULE));
}
function clampSill(vol, sill, height = WIN_H) {
  const max = Math.max(0, vol.h - height);
  return Math.min(max, Math.max(0, Math.round(sill)));
}
// Doors and windows share the same clamp shape but different floors — a
// door needs to stay usable (2' wide, 6' tall minimum); a window doesn't,
// so its floor is just the smallest step the +/- controls can reach.
function clampOpeningHeight(vol, height, type) {
  const minH = type === "door" ? DOOR_MIN_H : WIN_MIN_H;
  const max = Math.max(minH, vol.h);
  return Math.min(max, Math.max(minH, roundToStep(height)));
}
// wallKey null means cylinder (width measured as arc-length at outer radius r).
function clampOpeningWidth(vol, wallKey, width, type) {
  const minW = type === "door" ? DOOR_MIN_W : WIN_MIN_W;
  const maxW = wallKey == null
    ? Math.max(minW, 2 * Math.PI * vol.r - 4)
    : Math.max(minW, wallLength(vol, wallKey) - 2 * vol.t);
  return Math.min(maxW, Math.max(minW, roundToStep(width)));
}

/* ---------------- wall-proximity snapping (drag) ----------------
   Scope: axis-aligned (rot a multiple of 90°) rectangular volumes only.
   Rotated volumes and cylinders are dragged freely without engaging this
   system — oriented-bbox / curved-wall snapping is a lot more geometry
   for a marginal case and was cut for this pass. */

function rectExtent(vol) {
  const swapped = ((vol.rot % 180) + 180) % 180 === 90;
  return swapped ? { hw: vol.d / 2, hd: vol.w / 2 } : { hw: vol.w / 2, hd: vol.d / 2 };
}

// One candidate snap between the dragged volume (at candidate nx/nz) and one
// other volume, along one facing axis. axis "x" = volumes side by side along
// X, facing each other across the gap, with overlap measured along Z (and
// vice versa for axis "z"). Returns null if they aren't in a snappable
// relationship at all.
function facingSnap(axis, dExt, nx, nz, ov, oExt) {
  const dMinP = axis === "x" ? nx - dExt.hw : nz - dExt.hd;
  const dMaxP = axis === "x" ? nx + dExt.hw : nz + dExt.hd;
  const dMinQ = axis === "x" ? nz - dExt.hd : nx - dExt.hw;
  const dMaxQ = axis === "x" ? nz + dExt.hd : nx + dExt.hw;
  const oMinP = axis === "x" ? ov.x - oExt.hw : ov.z - oExt.hd;
  const oMaxP = axis === "x" ? ov.x + oExt.hw : ov.z + oExt.hd;
  const oMinQ = axis === "x" ? ov.z - oExt.hd : ov.x - oExt.hw;
  const oMaxQ = axis === "x" ? ov.z + oExt.hd : ov.x + oExt.hw;

  const overlapQ = Math.min(dMaxQ, oMaxQ) - Math.max(dMinQ, oMinQ);
  if (overlapQ <= 0) return null; // not facing along this axis at all

  const lenD = dMaxQ - dMinQ, lenO = oMaxQ - oMinQ;
  const shortfall = Math.min(lenD, lenO) - overlapQ;
  const nearFull = shortfall <= SNAP_FULL_SLOP;

  const ovIsHigh = (axis === "x" ? ov.x : ov.z) > (axis === "x" ? nx : nz);
  const gap = ovIsHigh ? oMinP - dMaxP : dMinP - oMaxP;

  let targetGap = null, kind = null;
  if (nearFull) {
    if (Math.abs(gap) <= SNAP_ENGAGE) { targetGap = 0; kind = "shared-wall"; }
    else if (gap >= COURTYARD_MIN && gap <= COURTYARD_MAX) {
      targetGap = Math.min(COURTYARD_MAX, Math.max(COURTYARD_MIN, Math.round(gap / MODULE) * MODULE));
      kind = "courtyard";
    }
  } else if (Math.abs(gap) <= SNAP_ENGAGE) {
    targetGap = 0; kind = "offset-join"; // L/T corner — partial overlap, flush the walls
  }
  if (targetGap == null) return null;

  const delta = ovIsHigh ? (oMinP - targetGap) - dMaxP : (oMaxP + targetGap) - dMinP;
  const qMid = (Math.max(dMinQ, oMinQ) + Math.min(dMaxQ, oMaxQ)) / 2;
  const guideP = ovIsHigh ? dMaxP + delta + targetGap / 2 : dMinP + delta - targetGap / 2;
  return {
    delta, axis, kind,
    guide: axis === "x"
      ? { x: guideP, z: qMid, len: overlapQ, dir: "z" }
      : { x: qMid, z: guideP, len: overlapQ, dir: "x" },
  };
}

// Candidate drag position (nx, nz) in, possibly-adjusted position + a guide
// descriptor out. Picks the smallest-delta candidate when several volumes
// are in range so one drag doesn't get yanked by a distant match.
function computeSnap(dragged, others, nx, nz) {
  const none = { x: nx, z: nz, guide: null, kind: null };
  if (dragged.shape === "cylinder") return none;
  if (((dragged.rot % 90) + 90) % 90 !== 0) return none;
  const dExt = rectExtent(dragged);
  let best = null;
  for (const ov of others) {
    if (ov.id === dragged.id) continue;
    if (ov.shape === "cylinder") continue;
    if (((ov.rot % 90) + 90) % 90 !== 0) continue;
    const oExt = rectExtent(ov);
    for (const axis of ["x", "z"]) {
      const cand = facingSnap(axis, dExt, nx, nz, ov, oExt);
      if (cand && (!best || Math.abs(cand.delta) < Math.abs(best.delta))) best = cand;
    }
  }
  if (!best) return none;
  return {
    x: best.axis === "x" ? nx + best.delta : nx,
    z: best.axis === "z" ? nz + best.delta : nz,
    guide: best.guide,
    kind: best.kind,
  };
}

/* ---------------- materials takeoff ----------------
   Scope note: this only totals the perimeter walls each volume already
   has — there's no interior-partition concept in the data model yet. If
   one gets added later, the open question is whether it shares this same
   wall-volume accounting (almost certainly yes, for consistency) — flagged
   here rather than guessed at, since nothing to include exists today. */

const CEMENT_BAG_LB = 94;
const CUFT_PER_CUYD = 27;

// Fixed backend constants, not exposed in the UI — just the math.
const TAKEOFF_DEFAULTS = {
  csreDensity: 130, csreCementPct: 8, csreSoilDensity: 95,
  lavaDensity: 92, lavaCementPct: 12.5, lavaSandDensity: 95,
};

// Exact wall footprint area for a rectangular ring = outer area minus
// inner area; equivalently the *centerline* perimeter (not outer, not
// inner — averaging them) times thickness. Using the outer perimeter here
// would double-count the four corners.
function wallFootprintArea(vol) {
  if (vol.shape === "cylinder") {
    const { r, t } = vol;
    return Math.PI * (r * r - (r - t) * (r - t));
  }
  const { w, d, t } = vol;
  const centerlineP = 2 * (w + d) - 4 * t;
  return centerlineP * t;
}

function wallPerimeters(vol) {
  if (vol.shape === "cylinder") {
    const { r, t } = vol;
    return { ext: 2 * Math.PI * r, int: 2 * Math.PI * (r - t) };
  }
  const { w, d, t } = vol;
  return { ext: 2 * (w + d), int: 2 * ((w - 2 * t) + (d - 2 * t)) };
}

function volumeTakeoff(vol, settings) {
  const { h, t, material } = vol;
  const grossVol = wallFootprintArea(vol) * h;
  const perims = wallPerimeters(vol);

  let openingVol = 0, openingArea = 0;
  for (const o of vol.openings) {
    const ow = openingWidth(o), oh = openingHeight(o);
    openingVol += ow * oh * t;
    openingArea += ow * oh;
  }

  const netVolCuft = Math.max(0, grossVol - openingVol);
  const netVolCuyd = netVolCuft / CUFT_PER_CUYD;

  const isEarth = material === "earth";
  const density = isEarth ? settings.csreDensity : settings.lavaDensity;
  const cementPct = isEarth ? settings.csreCementPct : settings.lavaCementPct;
  const aggDensity = isEarth ? settings.csreSoilDensity : settings.lavaSandDensity;

  const weightLb = netVolCuft * density;
  const weightTons = weightLb / 2000;
  const cementLb = weightLb * (cementPct / 100);
  const cementBags = cementLb / CEMENT_BAG_LB;
  const aggLb = Math.max(0, weightLb - cementLb);
  const aggCuyd = aggLb / aggDensity / CUFT_PER_CUYD;

  const extNetArea = Math.max(0, perims.ext * h - openingArea);
  const intNetArea = Math.max(0, perims.int * h - openingArea);
  const floorArea = vol.shape === "cylinder"
    ? Math.PI * (vol.r - t) * (vol.r - t)
    : (vol.w - 2 * t) * (vol.d - 2 * t);

  return {
    id: vol.id, material, aggLabel: isEarth ? "soil" : "lavasand",
    netVolCuft, netVolCuyd, weightTons, cementBags, aggCuyd,
    extNetArea, intNetArea, floorArea,
  };
}

// Volume/weight/cement/area combine fine across materials (same units,
// same physical meaning either way). Soil and lavasand don't — they're
// different materials — so those stay split by which volumes use them,
// rather than summed into one meaningless "aggregate" number.
function projectTakeoff(volumes, settings) {
  const rows = volumes.map((v) => volumeTakeoff(v, settings));
  const sum = (key) => rows.reduce((a, r) => a + r[key], 0);
  const grand = {
    netVolCuft: sum("netVolCuft"), netVolCuyd: sum("netVolCuyd"),
    weightTons: sum("weightTons"), cementBags: sum("cementBags"),
    extNetArea: sum("extNetArea"), intNetArea: sum("intNetArea"),
    floorArea: sum("floorArea"),
  };
  const soilCuyd = rows.filter((r) => r.material === "earth").reduce((a, r) => a + r.aggCuyd, 0);
  const lavaSandCuyd = rows.filter((r) => r.material === "lava").reduce((a, r) => a + r.aggCuyd, 0);
  return { rows, grand, soilCuyd, lavaSandCuyd };
}

/* ---------------- dimension strings (plan) ----------------
   Judgment calls (flagged per the request, tune here):
   - DIM_OFFSET_1/2: how far outside the wall face the two dimension lines
     sit. 3' and 6' — clear of door swings (~4') and window/opening glyphs
     without reading as detached from the building.
   - Bottom + left always dimensioned (the usual convention); a third
     string (back or right, whichever wall has no openings) adds a bit
     more legibility for clustered plans without dimensioning all four
     walls on every volume, which got cluttered fast with duplicate
     totals on facing sides.
   - Segments narrower than DIM_MIN_LABEL_PX get a tick but no text — a
     real drafter would letter these outside the string with a leader, which
     is out of scope here; dropping the label (keeping the tick) avoids
     overlapping digits without inventing a leader-line system. */

const DIM_OFFSET_1 = 3;    // ft — broken-down dimension line, off the wall face
const DIM_OFFSET_2 = 6;    // ft — overall dimension line, further out than #1
const DIM_EXT_GAP = 0.4;   // ft — gap between wall face and start of extension line
const DIM_EXT_OVER = 0.5;  // ft — how far extension lines overshoot the dimension line
const DIM_TICK = 0.5;      // ft — 45° tick mark size
const DIM_TEXT_PX = 9;     // dimension text size, px
const DIM_MARGIN = DIM_OFFSET_2 + 4; // ft — extra plan margin so strings aren't clipped
const DIM_CHAIN_MAX_GAP = 20; // ft — beyond this, facing volumes dimension independently
const DIM_MIN_LABEL_PX = 20;  // px — segments narrower than this get a tick but no text
const DIM_MARKER_R = 1.4;  // ft — volume-number marker radius
const LEGEND_LINE_H = 14;  // px — key row height, one per volume

function feetInches(ftValue) {
  const totalInches = Math.round(ftValue * 12);
  const neg = totalInches < 0;
  const abs = Math.abs(totalInches);
  const feet = Math.floor(abs / 12);
  const inches = abs % 12;
  return `${neg ? "-" : ""}${feet}'-${inches}"`;
}
// Dimension-string label, feet-inches or metric (meters, 2dp) per the
// units toggle in the control card.
function formatLength(ftValue, units) {
  if (units === "metric") return `${(ftValue * 0.3048).toFixed(2)}m`;
  return feetInches(ftValue);
}
// Wall-thickness callout (12"/18"/24" vs. cm) and footprint spec numbers —
// same toggle, but feet (not feet-inches) and cm (not m) fit the existing
// "16' x 12'" / "18"" style callouts better than a dimension-string label.
function formatFeet(ftValue, units) {
  if (units === "metric") return `${(ftValue * 0.3048).toFixed(2)}m`;
  return `${ftValue}′`;
}
function formatThickness(tFt, units) {
  if (units === "metric") return `${Math.round(tFt * 30.48)}cm`;
  return `${Math.round(tFt * 12)}″`;
}
function formatArea(sqft, units) {
  if (units === "metric") return `${(sqft * 0.092903).toFixed(1)}m²`;
  return `${Math.round(sqft)}sqft`;
}
// Same "16' x 12' · 18" CSRE · H 9'" style callout used in both the plan's
// per-volume legend and the takeoff panel's dimension overview. Literal
// unicode (not &#...; entities) so this drops straight into JSX text as
// well as the SVG markup string.
function volumeDesc(v, units) {
  return v.shape === "cylinder"
    ? `⌀ ${formatFeet(v.r * 2, units)} · ${formatThickness(v.t, units)} ${v.material === "earth" ? "CSRE" : "LAVACRETE"} · H ${formatFeet(v.h, units)}`
    : `${formatFeet(v.w, units)} × ${formatFeet(v.d, units)} · ${formatThickness(v.t, units)} ${v.material === "earth" ? "CSRE" : "LAVACRETE"} · H ${formatFeet(v.h, units)}`;
}

// Ordered tick positions along a wall run [-L/2, L/2] (that wall's own
// local coordinate), split at every jamb edge — corners plus each
// opening's two edges. openings: [{pos, width}].
function wallDimTicks(L, openings) {
  const cuts = openings
    .map((o) => ({ a: o.pos - o.width / 2, b: o.pos + o.width / 2 }))
    .sort((p, q) => p.a - q.a);
  const ticks = [-L / 2];
  let cursor = -L / 2;
  for (const cut of cuts) {
    if (cut.a > cursor + 0.01) ticks.push(cut.a);
    if (cut.b > cursor + 0.01) { ticks.push(cut.b); cursor = cut.b; }
  }
  if (cursor < L / 2 - 0.01) ticks.push(L / 2);
  return ticks;
}

// Left/right walls are inset by t at each end (they run between the
// front/back walls, not through them — see buildVolumeGroup), so their own
// tick run is shorter than the full footprint. Swap the run's own two ends
// for the true outer corners so the corner-return segments show up too —
// this is what makes the broken-down string add up to the full "wall to
// wall" overall dimension.
function fullSideTicks(halfFull, wallTicks) {
  return [-halfFull, ...wallTicks.slice(1, -1), halfFull];
}

function worldAABB(v) {
  const swapped = ((v.rot % 180) + 180) % 180 === 90;
  const hw = swapped ? v.d / 2 : v.w / 2;
  const hd = swapped ? v.w / 2 : v.d / 2;
  return { x0: v.x - hw, x1: v.x + hw, z0: v.z - hd, z1: v.z + hd };
}

// True when some other volume sits within a plausible courtyard gap in
// world direction (dirAxis, dirSign) from v's own face — used to suppress
// a dimension string on that side. A close neighbor almost always has its
// own string facing back into that same gap (its front/left, or its own
// third side), so drawing both overlaps; skipping this one and keeping
// the neighbor's is the only way to guarantee no overlap regardless of
// scale, rather than just reducing how likely it looks.
function hasCloseNeighbor(volumes, v, dirAxis, dirSign) {
  const vb = worldAABB(v);
  return volumes.some((o) => {
    if (o === v) return false;
    const ob = worldAABB(o);
    if (dirAxis === "x") {
      const overlapsOther = ob.z0 < vb.z1 && ob.z1 > vb.z0;
      const gap = dirSign > 0 ? ob.x0 - vb.x1 : vb.x0 - ob.x1;
      return overlapsOther && gap >= -0.1 && gap <= DIM_CHAIN_MAX_GAP;
    }
    const overlapsOther = ob.x0 < vb.x1 && ob.x1 > vb.x0;
    const gap = dirSign > 0 ? ob.z0 - vb.z1 : vb.z0 - ob.z1;
    return overlapsOther && gap >= -0.1 && gap <= DIM_CHAIN_MAX_GAP;
  });
}

// Groups unrotated (rot===0) cubiform volumes into left-to-right (axis
// 'x', for the bottom string) or back-to-front (axis 'z', for the left
// string) chains for a combined dimension string — two volumes chain when
// their facing edge lines up and the gap between them is a plausible
// courtyard distance, echoing the same shared-wall / courtyard-gap
// relationships the drag-snapping system already models (computeSnap).
// Rotated volumes and cylinders always dimension on their own — merging
// their footprints into a shared string would need cross-rotation edge
// math this pass doesn't attempt.
function buildDimChains(volumes, axis) {
  const eligible = volumes.filter((v) => v.shape !== "cylinder" && v.rot === 0);
  const sorted = [...eligible].sort((a, b) => (axis === "x" ? a.x - b.x : a.z - b.z));
  const chains = [];
  let current = [];
  for (const v of sorted) {
    if (current.length === 0) { current.push(v); continue; }
    const prev = current[current.length - 1];
    const pb = worldAABB(prev), vb = worldAABB(v);
    const facesAlign = axis === "x" ? Math.abs(pb.z1 - vb.z1) < 0.1 : Math.abs(pb.x0 - vb.x0) < 0.1;
    const gap = axis === "x" ? vb.x0 - pb.x1 : vb.z0 - pb.z1;
    if (facesAlign && gap >= -0.1 && gap <= DIM_CHAIN_MAX_GAP) {
      current.push(v);
    } else {
      chains.push(current);
      current = [v];
    }
  }
  if (current.length) chains.push(current);
  return chains;
}

/* ---------------- plan SVG (drawn from data) ---------------- */

function planSVG(volumes, units = "imperial") {
  if (!volumes.length) return { markup: "<svg></svg>", w: 400, h: 300 };
  const S = 9; // px per ft — bumped up from 7 so clustered multi-volume plans read clearly
  const PAD = 14; // ft margin
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const v of volumes) {
    const r = (v.shape === "cylinder" ? v.r : Math.max(v.w, v.d) / 2) + 2;
    minX = Math.min(minX, v.x - r); maxX = Math.max(maxX, v.x + r);
    minY = Math.min(minY, v.z - r); maxY = Math.max(maxY, v.z + r);
  }
  // extra room on all four sides — bottom+left always carry dimension
  // strings, and the third string (back or right, whichever wall has no
  // openings) can land on either of the remaining two sides.
  minX -= PAD + DIM_MARGIN; maxX += PAD + DIM_MARGIN; minY -= PAD + DIM_MARGIN; maxY += PAD + DIM_MARGIN;
  const W = (maxX - minX) * S;
  const planH = (maxY - minY) * S; // plan+dimensions only, before the key
  const H = planH + volumes.length * LEGEND_LINE_H + 24; // + one row per volume
  const px = (ft) => (ft * S).toFixed(1);

  // One dimension string: extension lines + tick marks + dimension line +
  // (optionally) segment text. ticks: ascending positions along the
  // running axis. perp: the wall face's coordinate on the other axis.
  // axis: 'x' = horizontal string (ticks vary in X), 'z' = vertical string
  // (ticks vary in Z, text rotated to read bottom-to-top). dir: +1/-1,
  // which side of the wall face the string sits on. ox/oy: 0 for a string
  // drawn inside a volume's own local (already-translated) <g>; minX/minY
  // for one drawn in world/plan coordinates (multi-volume chains).
  const dimString = (ticks, perp, axis, dir, offset, drawText, ox, oy, suffix = "") => {
    if (ticks.length < 2) return "";
    let out = "";
    const lineC = perp + dir * offset;
    const extStart = perp + dir * DIM_EXT_GAP;
    const extEnd = lineC + dir * DIM_EXT_OVER;
    const half = DIM_TICK / 2;
    const first = ticks[0], last = ticks[ticks.length - 1];

    for (const c of ticks) {
      out += axis === "x"
        ? `<line x1="${px(c - ox)}" y1="${px(extStart - oy)}" x2="${px(c - ox)}" y2="${px(extEnd - oy)}" stroke="${INK}" stroke-width="0.5"/>`
        : `<line x1="${px(extStart - ox)}" y1="${px(c - oy)}" x2="${px(extEnd - ox)}" y2="${px(c - oy)}" stroke="${INK}" stroke-width="0.5"/>`;
    }
    out += axis === "x"
      ? `<line x1="${px(first - ox)}" y1="${px(lineC - oy)}" x2="${px(last - ox)}" y2="${px(lineC - oy)}" stroke="${INK}" stroke-width="0.6"/>`
      : `<line x1="${px(lineC - ox)}" y1="${px(first - oy)}" x2="${px(lineC - ox)}" y2="${px(last - oy)}" stroke="${INK}" stroke-width="0.6"/>`;
    for (const c of ticks) {
      out += axis === "x"
        ? `<line x1="${px(c - half - ox)}" y1="${px(lineC + half - oy)}" x2="${px(c + half - ox)}" y2="${px(lineC - half - oy)}" stroke="${INK}" stroke-width="0.9"/>`
        : `<line x1="${px(lineC - half - ox)}" y1="${px(c + half - oy)}" x2="${px(lineC + half - ox)}" y2="${px(c - half - oy)}" stroke="${INK}" stroke-width="0.9"/>`;
    }
    if (drawText) {
      for (let i = 0; i < ticks.length - 1; i++) {
        const a = ticks[i], b = ticks[i + 1], len = b - a;
        if (len < 0.05 || len * S < DIM_MIN_LABEL_PX) continue;
        const mid = (a + b) / 2;
        const label = formatLength(len, units) + suffix;
        if (axis === "x") {
          out += `<text x="${px(mid - ox)}" y="${px(lineC - dir * 0.4 - oy)}" text-anchor="middle" font-family="ui-monospace,monospace" font-size="${DIM_TEXT_PX}" fill="${INK}">${label}</text>`;
        } else {
          const tx = px(lineC - dir * 0.4 - ox), ty = px(mid - oy);
          out += `<text x="${tx}" y="${ty}" text-anchor="middle" font-family="ui-monospace,monospace" font-size="${DIM_TEXT_PX}" transform="rotate(-90 ${tx} ${ty})" fill="${INK}">${label}</text>`;
        }
      }
    }
    return out;
  };

  const wallOpenings = (v, key) =>
    v.openings.filter((o) => o.wall === key).map((o) => ({ pos: o.pos, width: openingWidth(o) }));

  // Bottom (front wall) exterior ticks need no corner-return adjustment —
  // the front/back walls already run the full width w (see
  // buildVolumeGroup). Chains always use these (a merged string across
  // volumes stays in "wall to wall" terms throughout).
  const bottomExteriorTicks = (v) => wallDimTicks(v.w, wallOpenings(v, "front"));
  // Left wall is inset by t at each end, so splice in the true corners.
  const leftExteriorTicks = (v) => fullSideTicks(v.d / 2, wallDimTicks(v.d - 2 * v.t, wallOpenings(v, "left")));
  // Back mirrors front (full width w, no corner-return adjustment); right
  // mirrors left (inset, needs the corner splice).
  const backExteriorTicks = (v) => wallDimTicks(v.w, wallOpenings(v, "back"));
  const rightExteriorTicks = (v) => fullSideTicks(v.d / 2, wallDimTicks(v.d - 2 * v.t, wallOpenings(v, "right")));

  // Single-volume (non-chained) version: when the wall has no openings,
  // the broken-down string would just repeat the overall (wall-to-wall)
  // number — instead show the interior clear dimension (wall-to-wall minus
  // the two perpendicular walls' thickness), which is new information
  // rather than a duplicate.
  const bottomLocalTicks = (v) => {
    const ticks = bottomExteriorTicks(v);
    return ticks.length > 2 ? { ticks, interior: false } : { ticks: [-(v.w / 2 - v.t), v.w / 2 - v.t], interior: true };
  };
  const leftLocalTicks = (v) => {
    const ticks = leftExteriorTicks(v);
    return ticks.length > 2 ? { ticks, interior: false } : { ticks: [-(v.d / 2 - v.t), v.d / 2 - v.t], interior: true };
  };
  const backLocalTicks = (v) => {
    const ticks = backExteriorTicks(v);
    return ticks.length > 2 ? { ticks, interior: false } : { ticks: [-(v.w / 2 - v.t), v.w / 2 - v.t], interior: true };
  };
  const rightLocalTicks = (v) => {
    const ticks = rightExteriorTicks(v);
    return ticks.length > 2 ? { ticks, interior: false } : { ticks: [-(v.d / 2 - v.t), v.d / 2 - v.t], interior: true };
  };

  const chainTicks = (chain, axis, exteriorTicksFn) => {
    const out = [];
    for (const v of chain) {
      const c = axis === "x" ? v.x : v.z;
      for (const t of exteriorTicksFn(v)) {
        const world = c + t;
        if (out.length && Math.abs(world - out[out.length - 1]) < 0.05) continue;
        out.push(world);
      }
    }
    return out;
  };

  const bottomChains = buildDimChains(volumes, "x").filter((c) => c.length > 1);
  const leftChains = buildDimChains(volumes, "z").filter((c) => c.length > 1);
  const bottomChainedIds = new Set(bottomChains.flat().map((v) => v.id));
  const leftChainedIds = new Set(leftChains.flat().map((v) => v.id));

  let dimMarkup = "";
  for (const chain of bottomChains) {
    const perp = chain[0].z + chain[0].d / 2;
    const ticks = chainTicks(chain, "x", bottomExteriorTicks);
    const overall = [ticks[0], ticks[ticks.length - 1]];
    dimMarkup += dimString(ticks, perp, "x", 1, DIM_OFFSET_1, true, minX, minY);
    dimMarkup += dimString(overall, perp, "x", 1, DIM_OFFSET_2, true, minX, minY);
  }
  for (const chain of leftChains) {
    const perp = chain[0].x - chain[0].w / 2;
    const ticks = chainTicks(chain, "z", leftExteriorTicks);
    const overall = [ticks[0], ticks[ticks.length - 1]];
    dimMarkup += dimString(ticks, perp, "z", -1, DIM_OFFSET_1, true, minX, minY);
    dimMarkup += dimString(overall, perp, "z", -1, DIM_OFFSET_2, true, minX, minY);
  }

  let s = "";
  // 2' grid
  s += `<g stroke="#d8d2c4" stroke-width="0.5">`;
  for (let gx = Math.ceil(minX / MODULE) * MODULE; gx <= maxX; gx += MODULE)
    s += `<line x1="${px(gx - minX)}" y1="0" x2="${px(gx - minX)}" y2="${H}"/>`;
  for (let gy = Math.ceil(minY / MODULE) * MODULE; gy <= maxY; gy += MODULE)
    s += `<line x1="0" y1="${px(gy - minY)}" x2="${W}" y2="${px(gy - minY)}"/>`;
  s += `</g>`;

  const flips = { front: 1, back: -1, right: -1, left: 1 };
  const wallXf = (v, key) => {
    const inset = key === "front" || key === "back" ? v.d / 2 - v.t / 2 : v.w / 2 - v.t / 2;
    if (key === "front") return `translate(0 ${px(inset)})`;
    if (key === "back") return `translate(0 ${-px(inset)}) rotate(180)`;
    if (key === "right") return `translate(${px(inset)} 0) rotate(-90)`;
    return `translate(${-px(inset)} 0) rotate(90)`;
  };

  // Door/window glyph drawn in the opening's own local frame: x along the
  // wall, y outward, origin centered on the opening (a=-OPEN_W/2, b=+OPEN_W/2
  // for a centered call; rect walls pass their own along-wall a/b instead).
  const openingGlyph = (a, b, t, type) => {
    if (type === "door") {
      return `<line x1="${px(a)}" y1="${-px(t / 2)}" x2="${px(a)}" y2="${px(t / 2)}" stroke="${INK}" stroke-width="1"/>
        <line x1="${px(b)}" y1="${-px(t / 2)}" x2="${px(b)}" y2="${px(t / 2)}" stroke="${INK}" stroke-width="1"/>
        <line x1="${px(a)}" y1="${-px(t / 2)}" x2="${px(a)}" y2="${-px(t / 2 + OPEN_W)}" stroke="${INK}" stroke-width="1.2"/>
        <path d="M ${px(a)} ${-px(t / 2 + OPEN_W)} A ${px(OPEN_W)} ${px(OPEN_W)} 0 0 1 ${px(b)} ${-px(t / 2)}" fill="none" stroke="${INK}" stroke-width="0.7" stroke-dasharray="3 3"/>`;
    }
    return `<line x1="${px(a)}" y1="${-px(t / 2)}" x2="${px(b)}" y2="${-px(t / 2)}" stroke="${INK}" stroke-width="1"/>
      <line x1="${px(a)}" y1="${px(t / 2)}" x2="${px(b)}" y2="${px(t / 2)}" stroke="${INK}" stroke-width="1"/>
      <line x1="${px(a)}" y1="0" x2="${px(b)}" y2="0" stroke="${INK}" stroke-width="1.6"/>
      <line x1="${px(a)}" y1="${-px(t / 2)}" x2="${px(a)}" y2="${px(t / 2)}" stroke="${INK}" stroke-width="1"/>
      <line x1="${px(b)}" y1="${-px(t / 2)}" x2="${px(b)}" y2="${px(t / 2)}" stroke="${INK}" stroke-width="1"/>`;
  };

  for (const v of volumes) {
    s += `<g transform="translate(${px(v.x - minX)} ${px(v.z - minY)}) rotate(${-v.rot})">`;

    if (v.shape === "cylinder") {
      const circlePath = (rad) =>
        `M ${px(rad)} 0 A ${px(rad)} ${px(rad)} 0 1 0 ${-px(rad)} 0 A ${px(rad)} ${px(rad)} 0 1 0 ${px(rad)} 0 Z`;
      // ring poché
      s += `<path fill="${INK}" fill-rule="evenodd" d="${circlePath(v.r)} ${circlePath(v.r - v.t)}"/>`;
      // openings — each in its own translate+rotate frame, tangent to the ring
      for (const o of v.openings) {
        const ow = openingWidth(o);
        const deg = (o.angle * 180) / Math.PI - 90;
        s += `<g transform="translate(${px(Math.cos(o.angle) * v.r)} ${px(Math.sin(o.angle) * v.r)}) rotate(${deg.toFixed(2)})">`;
        s += `<rect x="${-px(ow / 2)}" y="${-px(v.t / 2 + 0.05)}" width="${px(ow)}" height="${px(v.t + 0.1)}" fill="${PAPER}"/>`;
        s += openingGlyph(-ow / 2, ow / 2, v.t, o.type);
        s += `</g>`;
      }
    } else {
      // poché ring
      s += `<path fill="${INK}" fill-rule="evenodd" d="
        M ${-px(v.w / 2)} ${-px(v.d / 2)} h ${px(v.w)} v ${px(v.d)} h ${-px(v.w)} Z
        M ${-px(v.w / 2 - v.t)} ${-px(v.d / 2 - v.t)} h ${px(v.w - 2 * v.t)} v ${px(v.d - 2 * v.t)} h ${-px(v.w - 2 * v.t)} Z"/>`;
      // openings per wall, drawn in wall-local coords (x along wall, +y outward)
      for (const key of ["front", "back", "right", "left"]) {
        const ops = v.openings.filter((o) => o.wall === key);
        if (!ops.length) continue;
        s += `<g transform="${wallXf(v, key)}">`;
        for (const o of ops) {
          const ow = openingWidth(o);
          const fo = flips[key] * o.pos;
          const a = fo - ow / 2, b = fo + ow / 2;
          s += `<rect x="${px(a)}" y="${-px(v.t / 2 + 0.05)}" width="${px(ow)}" height="${px(v.t + 0.1)}" fill="${PAPER}"/>`;
          s += openingGlyph(a, b, v.t, o.type);
        }
        s += `</g>`;
      }

      // Local dimension strings — drawn inside this volume's own rotated
      // <g>, so they read correctly at any orientation without extra
      // trig. Skipped on whichever side a multi-volume chain already
      // covers (see bottomChainedIds/leftChainedIds below).
      if (!bottomChainedIds.has(v.id)) {
        const { ticks, interior } = bottomLocalTicks(v);
        dimMarkup += `<g transform="translate(${px(v.x - minX)} ${px(v.z - minY)}) rotate(${-v.rot})">`;
        dimMarkup += dimString(ticks, v.d / 2, "x", 1, DIM_OFFSET_1, true, 0, 0, interior ? " clear" : "");
        dimMarkup += dimString([-v.w / 2, v.w / 2], v.d / 2, "x", 1, DIM_OFFSET_2, true, 0, 0);
        dimMarkup += `</g>`;
      }
      if (!leftChainedIds.has(v.id)) {
        const { ticks, interior } = leftLocalTicks(v);
        dimMarkup += `<g transform="translate(${px(v.x - minX)} ${px(v.z - minY)}) rotate(${-v.rot})">`;
        dimMarkup += dimString(ticks, -v.w / 2, "z", -1, DIM_OFFSET_1, true, 0, 0, interior ? " clear" : "");
        dimMarkup += dimString([-v.d / 2, v.d / 2], -v.w / 2, "z", -1, DIM_OFFSET_2, true, 0, 0);
        dimMarkup += `</g>`;
      }
      // Third side — bottom+left cover two walls; a third string helps
      // orient clustered plans without dimensioning every wall on every
      // volume. Pick whichever of back/right has no openings, so it
      // doesn't compete with a door swing or window glyph, AND has no
      // close neighbor on that side — a nearby volume almost always has
      // its own string facing back into the same gap, and two strings
      // sharing one gap is what actually overlaps (scale wouldn't fix
      // that; only not drawing the second one does). Skip entirely if
      // neither remaining wall qualifies, rather than crowd the drawing.
      const backClear = !v.openings.some((o) => o.wall === "back") && !hasCloseNeighbor(volumes, v, "z", -1);
      const rightClear = !v.openings.some((o) => o.wall === "right") && !hasCloseNeighbor(volumes, v, "x", 1);
      if (backClear) {
        const { ticks, interior } = backLocalTicks(v);
        dimMarkup += `<g transform="translate(${px(v.x - minX)} ${px(v.z - minY)}) rotate(${-v.rot})">`;
        dimMarkup += dimString(ticks, -v.d / 2, "x", -1, DIM_OFFSET_1, true, 0, 0, interior ? " clear" : "");
        dimMarkup += dimString([-v.w / 2, v.w / 2], -v.d / 2, "x", -1, DIM_OFFSET_2, true, 0, 0);
        dimMarkup += `</g>`;
      } else if (rightClear) {
        const { ticks, interior } = rightLocalTicks(v);
        dimMarkup += `<g transform="translate(${px(v.x - minX)} ${px(v.z - minY)}) rotate(${-v.rot})">`;
        dimMarkup += dimString(ticks, v.w / 2, "z", 1, DIM_OFFSET_1, true, 0, 0, interior ? " clear" : "");
        dimMarkup += dimString([-v.d / 2, v.d / 2], v.w / 2, "z", 1, DIM_OFFSET_2, true, 0, 0);
        dimMarkup += `</g>`;
      }
    }

    s += `</g>`;
    // Numbered marker at the volume's center — never rotated, so it always
    // reads upright. Full spec moves to the key below the plan instead of
    // sitting inline, where it kept colliding with the dimension strings.
    const idx = volumes.indexOf(v) + 1;
    s += `<circle cx="${px(v.x - minX)}" cy="${px(v.z - minY)}" r="${px(DIM_MARKER_R)}" fill="${INK}"/>`;
    s += `<text x="${px(v.x - minX)}" y="${px(v.z - minY + 0.35)}" text-anchor="middle"
      font-family="ui-monospace,monospace" font-size="11" font-weight="bold" fill="${PAPER}">${idx}</text>`;
  }

  s += dimMarkup;

  // key — one row per volume, numbered to match the plan markers
  volumes.forEach((v, i) => {
    s += `<text x="12" y="${planH + 16 + i * LEGEND_LINE_H}" font-family="ui-monospace,monospace" font-size="11" fill="${INK}">${i + 1}. ${volumeDesc(v, units)}</text>`;
  });

  // north arrow + titleblock line
  s += `<g transform="translate(${W - 34} 40)">
    <line x1="0" y1="14" x2="0" y2="-14" stroke="${INK}" stroke-width="1.4"/>
    <path d="M 0 -14 L -5 -4 L 5 -4 Z" fill="${INK}"/>
    <text x="0" y="30" text-anchor="middle" font-family="ui-monospace,monospace" font-size="10" fill="${INK}">N</text>
  </g>`;
  s += `<text x="12" y="${H - 12}" font-family="ui-monospace,monospace" font-size="11" fill="${INK}">SHELTER ON THE LAND &#183; VOLUME STUDY &#183; PLAN &#183; grid = 2&#8242; module &#183; not for construction</text>`;

  const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" style="background:${PAPER}">${s}</svg>`;
  return { markup, w: W, h: H };
}

/* ================================================================ */

export default function ShelterVolumeStudy() {
  const mountRef = useRef(null);
  const threeRef = useRef({});
  // Read once, at init — if a browser autosave exists, it seeds the
  // scene directly rather than flashing the default seed first and
  // swapping it in a later effect.
  const [initialProject] = useState(() => loadAutosave());
  const [volumes, setVolumes] = useState(() => initialProject?.volumes ?? [
    // First-time-visit preload — one volume, door off-center, a low
    // window on the opposite wall (across from the door), roof on and
    // sloped, so a new visitor's first view already reads as a real
    // building rather than a centered box.
    {
      id: nid(), shape: "cubiform", x: 0, z: 0, w: 16, d: 12, h: 9, t: 1.5, rot: 0, material: "earth",
      roof: "pitched",
      openings: [
        { id: nid(), wall: "front", type: "door", pos: 4 },
        { id: nid(), wall: "back", type: "window", pos: -4, sill: 1 },
      ],
    },
  ]);
  const [selectedId, setSelectedId] = useState(null);
  const [planOpen, setPlanOpen] = useState(false);
  const [history, setHistory] = useState([]);
  const [showRoofs, setShowRoofs] = useState(() => initialProject?.showRoofs ?? true);
  const [units, setUnits] = useState(() => initialProject?.units ?? "imperial");
  const [takeoffOpen, setTakeoffOpen] = useState(true);
  // Small non-blocking notice — autosave restore, or a save/load result.
  const [toast, setToast] = useState(() => (initialProject ? "restored your last session" : ""));
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(t);
  }, [toast]);
  // Wall textures are loaded photos, not synchronously-drawn canvases —
  // neither is ready on first mount. Walls clone their texture per-mesh
  // (see mkMesh), and a clone taken before the image finishes loading
  // never picks up the image later, so these flags force one rebuild
  // each once their photo actually arrives.
  const [earthTexReady, setEarthTexReady] = useState(false);
  const [lavaTexReady, setLavaTexReady] = useState(false);
  const volumesRef = useRef(volumes);
  volumesRef.current = volumes;
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;

  // Autosave: a safety net, not the primary save path (that's the
  // explicit export below) — debounced so rapid-fire edits (nudging an
  // opening repeatedly, a stepper held down) coalesce into one write
  // instead of hitting localStorage on every change. A live drag doesn't
  // touch `volumes` until release (see the pointer handlers' `up`), so
  // this never fires mid-drag regardless.
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(serializeProject(volumes, units, showRoofs)));
      } catch {
        // Quota exceeded / private browsing — autosave is best-effort,
        // not critical path, so fail silently rather than interrupt.
      }
    }, 700);
    return () => clearTimeout(t);
  }, [volumes, units, showRoofs]);

  const pushUndo = useCallback(() => {
    setHistory((h) => {
      const next = [...h, volumesRef.current];
      return next.length > 50 ? next.slice(next.length - 50) : next;
    });
  }, []);

  const undo = useCallback(() => {
    setHistory((h) => {
      if (!h.length) return h;
      setVolumes(h[h.length - 1]);
      setSelectedId(null);
      return h.slice(0, -1);
    });
  }, []);

  /* ---------- scene bootstrap ---------- */
  useEffect(() => {
    const mount = mountRef.current;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#e6e0d2");
    scene.fog = new THREE.Fog(0xe6e0d2, 140, 420);

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1200);
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    const hemi = new THREE.HemisphereLight(0xfff6e8, 0x8a7a5f, 0.75);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff1d6, 1.0);
    sun.position.set(60, 80, 30);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -90; sun.shadow.camera.right = 90;
    sun.shadow.camera.top = 90; sun.shadow.camera.bottom = -90;
    scene.add(sun);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(SANDBOX * 2 + 60, SANDBOX * 2 + 60),
      new THREE.MeshStandardMaterial({ color: 0xcdbfa4, roughness: 1 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const grid = new THREE.GridHelper(SANDBOX * 2, SANDBOX * 2 / MODULE, 0xb3a888, 0xbfb397);
    grid.position.y = 0.02;
    grid.material.opacity = 0.35;
    grid.material.transparent = true;
    scene.add(grid);

    const boundary = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-SANDBOX, 0.05, -SANDBOX),
        new THREE.Vector3(SANDBOX, 0.05, -SANDBOX),
        new THREE.Vector3(SANDBOX, 0.05, SANDBOX),
        new THREE.Vector3(-SANDBOX, 0.05, SANDBOX),
      ]),
      new THREE.LineBasicMaterial({ color: OXIDE, transparent: true, opacity: 0.55 })
    );
    scene.add(boundary);

    const guideLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineDashedMaterial({ color: OXIDE, dashSize: 1, gapSize: 0.6, transparent: true, opacity: 0.9 })
    );
    guideLine.visible = false;
    guideLine.renderOrder = 1;
    scene.add(guideLine);

    const volGroup = new THREE.Group();
    scene.add(volGroup);

    const baseTex = {
      earth: makeWallTexture(csreTextureUrl, () => setEarthTexReady(true)),
      lava: makeWallTexture(lavacreteTextureUrl, () => setLavaTexReady(true)),
    };

    const cam = { theta: Math.PI * 0.75, phi: Math.PI * 0.32, radius: 70, target: new THREE.Vector3(0, 4, 0) };
    const applyCam = () => {
      const sp = Math.sin(cam.phi), cp = Math.cos(cam.phi);
      camera.position.set(
        cam.target.x + cam.radius * sp * Math.cos(cam.theta),
        cam.target.y + cam.radius * cp,
        cam.target.z + cam.radius * sp * Math.sin(cam.theta)
      );
      camera.lookAt(cam.target);
    };

    const resize = () => {
      const w = mount.clientWidth, h = mount.clientHeight;
      renderer.setSize(w, h);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    /* -------- pointer interaction -------- */
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const pointers = new Map();
    let mode = null; // 'orbit' | 'drag' | 'pinch'
    let dragId = null, dragOffset = new THREE.Vector3(), moved = 0, pinchDist = 0;

    const setNDC = (e) => {
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    };
    const groundHit = (e) => {
      setNDC(e);
      ray.setFromCamera(ndc, camera);
      const p = new THREE.Vector3();
      ray.ray.intersectPlane(groundPlane, p);
      return p;
    };

    const down = (e) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      renderer.domElement.setPointerCapture(e.pointerId);
      moved = 0;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
        mode = "pinch";
        return;
      }
      setNDC(e);
      ray.setFromCamera(ndc, camera);
      const hits = ray.intersectObjects(volGroup.children, true);
      const hit = hits.find((h) => h.object.userData.volumeId);
      if (hit) {
        dragId = hit.object.userData.volumeId;
        setSelectedId(dragId);
        const v = volumesRef.current.find((v) => v.id === dragId);
        const gp = groundHit(e);
        dragOffset.set(gp.x - v.x, 0, gp.z - v.z);
        mode = "drag";
      } else {
        mode = "orbit";
      }
    };

    const move = (e) => {
      if (!pointers.has(e.pointerId)) return;
      const prev = pointers.get(e.pointerId);
      const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      moved += Math.abs(dx) + Math.abs(dy);
      if (mode === "pinch" && pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const nd = Math.hypot(a.x - b.x, a.y - b.y);
        cam.radius = Math.min(130, Math.max(18, cam.radius * (pinchDist / Math.max(nd, 1))));
        pinchDist = nd;
        applyCam();
      } else if (mode === "drag" && dragId != null) {
        const gp = groundHit(e);
        const rawX = clampCoord(Math.round((gp.x - dragOffset.x) / 1) * 1);
        const rawZ = clampCoord(Math.round((gp.z - dragOffset.z) / 1) * 1);
        const dragged = volumesRef.current.find((v) => v.id === dragId);
        const snap = dragged ? computeSnap(dragged, volumesRef.current, rawX, rawZ) : { x: rawX, z: rawZ, guide: null };
        const nx = clampCoord(snap.x), nz = clampCoord(snap.z);
        const g = volGroup.children.find((c) => c.userData.volumeId === dragId);
        if (g) g.position.set(nx, 0, nz);
        threeRef.current.pendingPos = { id: dragId, x: nx, z: nz };

        const gl = threeRef.current.guideLine;
        if (gl) {
          if (snap.guide) {
            const { guide } = snap;
            const half = guide.len / 2;
            const p1 = guide.dir === "z"
              ? new THREE.Vector3(guide.x, 0.08, guide.z - half)
              : new THREE.Vector3(guide.x - half, 0.08, guide.z);
            const p2 = guide.dir === "z"
              ? new THREE.Vector3(guide.x, 0.08, guide.z + half)
              : new THREE.Vector3(guide.x + half, 0.08, guide.z);
            gl.geometry.setFromPoints([p1, p2]);
            gl.geometry.computeBoundingSphere();
            gl.computeLineDistances();
            gl.visible = true;
          } else {
            gl.visible = false;
          }
        }
      } else if (mode === "orbit") {
        if (e.shiftKey) {
          const right = new THREE.Vector3().subVectors(camera.position, cam.target).cross(camera.up).normalize();
          const fwd = new THREE.Vector3().crossVectors(camera.up, right).normalize();
          cam.target.addScaledVector(right, dx * 0.06).addScaledVector(fwd, dy * 0.06);
          cam.target.x = clampCoord(cam.target.x);
          cam.target.z = clampCoord(cam.target.z);
        } else {
          cam.theta += dx * 0.006;
          cam.phi = Math.min(Math.PI * 0.49, Math.max(0.12, cam.phi - dy * 0.006));
        }
        applyCam();
      }
    };

    const up = (e) => {
      pointers.delete(e.pointerId);
      if (mode === "drag") {
        const p = threeRef.current.pendingPos;
        if (p) {
          pushUndo();
          setVolumes((vs) => vs.map((v) => (v.id === p.id ? { ...v, x: p.x, z: p.z } : v)));
        }
        threeRef.current.pendingPos = null;
        if (threeRef.current.guideLine) threeRef.current.guideLine.visible = false;
      } else if (mode === "orbit" && moved < 6) {
        setSelectedId(null);
      }
      if (pointers.size < 2 && mode === "pinch") mode = null;
      if (pointers.size === 0) { mode = null; dragId = null; }
    };

    const wheel = (e) => {
      e.preventDefault();
      cam.radius = Math.min(130, Math.max(18, cam.radius * (1 + e.deltaY * 0.001)));
      applyCam();
    };

    const el = renderer.domElement;
    el.style.touchAction = "none";
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("wheel", wheel, { passive: false });
    el.addEventListener("contextmenu", (e) => e.preventDefault());

    applyCam();
    let raf;
    const loop = () => { renderer.render(scene, camera); raf = requestAnimationFrame(loop); };
    loop();

    threeRef.current = { ...threeRef.current, scene, camera, renderer, volGroup, baseTex, cam, applyCam, guideLine };
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.dispose();
      mount.removeChild(el);
    };
  }, []);

  /* ---------- rebuild volumes on state change ---------- */
  useEffect(() => {
    const { volGroup, baseTex } = threeRef.current;
    if (!volGroup) return;
    while (volGroup.children.length) {
      const c = volGroup.children.pop();
      c.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); }
      });
      volGroup.remove(c);
    }
    for (const v of volumes) volGroup.add(buildVolumeGroup(v, baseTex));
    if (selectedId != null) {
      const g = volGroup.children.find((c) => c.userData.volumeId === selectedId);
      if (g) {
        const helper = new THREE.BoxHelper(g, new THREE.Color(OXIDE));
        helper.userData.volumeId = null;
        volGroup.add(helper);
      }
    }
    volGroup.traverse((o) => { if (o.userData.isRoof) o.visible = showRoofs; });
  }, [volumes, selectedId, showRoofs, earthTexReady, lavaTexReady]);

  /* ---------- actions ---------- */
  const sel = volumes.find((v) => v.id === selectedId) || null;

  const update = (patch) => {
    pushUndo();
    setVolumes((vs) => vs.map((v) => {
      if (v.id !== selectedId) return v;
      const nv = { ...v, ...patch };
      if (nv.shape === "cylinder") {
        nv.openings = nv.openings.map((o) => {
          const width = clampOpeningWidth(nv, null, o.width ?? OPEN_W, o.type);
          const height = clampOpeningHeight(nv, openingHeight(o), o.type);
          const angle = clampAngle(nv, o.angle);
          return o.type === "window"
            ? { ...o, width, height, angle, sill: clampSill(nv, o.sill ?? SILL, height) }
            : { ...o, width, height, angle };
        });
      } else {
        nv.openings = nv.openings
          .map((o) => {
            const width = clampOpeningWidth(nv, o.wall, o.width ?? OPEN_W, o.type);
            const height = clampOpeningHeight(nv, openingHeight(o), o.type);
            const pos = clampPos(nv, o.wall, o.pos, width);
            return o.type === "window"
              ? { ...o, width, height, pos, sill: clampSill(nv, o.sill ?? SILL, height) }
              : { ...o, width, height, pos };
          })
          .filter((o) => wallLength(nv, o.wall) >= openingWidth(o) + 2 * nv.t + 1);
      }
      return nv;
    }));
  };

  const addVolume = () => {
    pushUndo();
    const n = volumes.length;
    const nv = {
      id: nid(), shape: "cubiform", x: clampCoord((n % 3) * 22 - 22), z: clampCoord(Math.floor(n / 3) * 18), w: 12, d: 12, h: 9, t: 1.5,
      rot: 0, material: "earth", roof: "none",
      openings: [{ id: nid(), wall: "front", type: "door", pos: 0 }],
    };
    setVolumes((vs) => [...vs, nv]);
    setSelectedId(nv.id);
  };

  const addCylinder = () => {
    pushUndo();
    const n = volumes.length;
    const nv = {
      id: nid(), shape: "cylinder", x: clampCoord((n % 3) * 22 - 22), z: clampCoord(Math.floor(n / 3) * 18), r: 8, h: 9, t: 1.5,
      rot: 0, material: "earth", roof: "none",
      openings: [{ id: nid(), type: "door", angle: 0 }],
    };
    setVolumes((vs) => [...vs, nv]);
    setSelectedId(nv.id);
  };

  const clearAll = () => {
    if (!volumes.length) return;
    pushUndo();
    setVolumes([]);
    setSelectedId(null);
  };

  const saveProject = () => {
    const payload = serializeProject(volumes, units, showRoofs);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `shelter-project-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    setToast("project saved");
  };

  const loadInputRef = useRef(null);
  const triggerLoad = () => loadInputRef.current?.click();

  const handleLoadFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // reset so re-picking the same file still fires onChange
    if (!file) return;

    let obj;
    try {
      obj = JSON.parse(await file.text());
    } catch {
      setToast("couldn't load — not valid JSON");
      return;
    }
    const err = validateProject(obj);
    if (err) {
      setToast(`couldn't load — ${err}`);
      return;
    }
    if (volumes.length > 0 && !window.confirm("Loading this file will replace your current scene. Continue?")) {
      return;
    }

    bumpIdCounter(obj.volumes);
    pushUndo();
    setVolumes(obj.volumes);
    setUnits(obj.units === "metric" ? "metric" : "imperial");
    setShowRoofs(obj.showRoofs !== false);
    setSelectedId(null);
    setToast("project loaded");
  };

  const addOpening = (wall, type) => {
    if (!sel) return;
    if (sel.shape === "cylinder") {
      const halfOpenAngle = (OPEN_W / 2) / sel.r;
      const taken = sel.openings.map((o) => o.angle);
      let a = 0, tries = 0;
      const angleClose = (a1, a2) => Math.abs(normalizeAngle(a1 - a2)) < halfOpenAngle * 2;
      while (taken.some((ta) => angleClose(ta, a)) && tries < 24) { a = clampAngle(sel, a + halfOpenAngle * 2); tries++; }
      const opening = { id: nid(), type, angle: clampAngle(sel, a) };
      if (type === "window") opening.sill = SILL;
      update({ openings: [...sel.openings, opening] });
      return;
    }
    const pos = clampPos(sel, wall, 0);
    const taken = sel.openings.filter((o) => o.wall === wall).map((o) => o.pos);
    let p = pos, tries = 0;
    while (taken.some((tp) => Math.abs(tp - p) < OPEN_W) && tries < 12) { p = clampPos(sel, wall, p + OPEN_W); tries++; }
    const opening = { id: nid(), wall, type, pos: p };
    if (type === "window") opening.sill = SILL;
    update({ openings: [...sel.openings, opening] });
  };

  const nudgeOpening = (oid, dir) => {
    if (!sel) return;
    if (sel.shape === "cylinder") {
      const step = (dir * MODULE) / sel.r; // arc-length MODULE step, converted to radians
      update({
        openings: sel.openings.map((o) =>
          o.id === oid ? { ...o, angle: clampAngle(sel, o.angle + step) } : o
        ),
      });
      return;
    }
    update({
      openings: sel.openings.map((o) =>
        o.id === oid ? { ...o, pos: clampPos(sel, o.wall, o.pos + dir * MODULE, openingWidth(o)) } : o
      ),
    });
  };

  const nudgeSill = (oid, dir) => {
    if (!sel) return;
    update({
      openings: sel.openings.map((o) =>
        o.id === oid && o.type === "window" ? { ...o, sill: clampSill(sel, (o.sill ?? SILL) + dir, openingHeight(o)) } : o
      ),
    });
  };

  const nudgeWidth = (oid, dir) => {
    if (!sel) return;
    update({
      openings: sel.openings.map((o) =>
        o.id === oid ? { ...o, width: openingWidth(o) + dir * OPENING_STEP } : o
      ),
    });
  };

  const nudgeHeight = (oid, dir) => {
    if (!sel) return;
    update({
      openings: sel.openings.map((o) =>
        o.id === oid ? { ...o, height: openingHeight(o) + dir * OPENING_STEP } : o
      ),
    });
  };

  const snapshot = () => {
    const { renderer } = threeRef.current;
    const a = document.createElement("a");
    a.href = renderer.domElement.toDataURL("image/png");
    a.download = "shelter-view.png";
    a.click();
  };

  const preset = (name) => {
    const { cam, applyCam } = threeRef.current;
    let cx = 0, cz = 0;
    if (volumes.length) {
      cx = volumes.reduce((s, v) => s + v.x, 0) / volumes.length;
      cz = volumes.reduce((s, v) => s + v.z, 0) / volumes.length;
    }
    cam.target.set(cx, 4, cz);
    const P = {
      "aerial-sw": { theta: Math.PI * 0.75, phi: Math.PI * 0.30, radius: 75 },
      "aerial-ne": { theta: -Math.PI * 0.25, phi: Math.PI * 0.30, radius: 75 },
      "eye-s": { theta: Math.PI * 0.5, phi: Math.PI * 0.47, radius: 58 },
      "eye-w": { theta: Math.PI, phi: Math.PI * 0.47, radius: 58 },
      top: { theta: Math.PI * 0.5, phi: 0.14, radius: 95 },
    }[name];
    Object.assign(cam, P);
    if (name.startsWith("eye")) cam.target.y = 5;
    applyCam();
  };

  const downloadPlan = () => {
    const { markup } = planSVG(volumes, units);
    const blob = new Blob([markup], { type: "image/svg+xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "shelter-plan.svg";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  /* ---------- UI ---------- */
  const wallNames = { front: "S", back: "N", right: "E", left: "W" };
  // ---- aesthetic tokens: glass panels, text-only monochrome controls ----
  // Panel "material" — a dark, blurred glass so the earth-tone lighting of
  // the 3D scene reads through, rather than an opaque card. The tint is
  // INK itself (the app's near-black), not a new accent — the palette
  // restriction below is about control color, not the glass tone.
  const GLASS_BG = "rgba(20,17,13,0.42)";
  const GLASS_BORDER = "1px solid rgba(255,255,255,0.14)";
  const GLASS_SHADOW = "0 12px 40px rgba(0,0,0,0.35)";
  const GLASS_RADIUS = 16;
  const WHITE = "rgba(255,255,255,0.92)";
  const WHITE_DIM = "rgba(255,255,255,0.5)";
  const RULE = "1px solid rgba(255,255,255,0.12)";

  // Controls: text-only, no border/box in the resting state. Selected /
  // active state reads as a weight + underline shift, not a filled box.
  // Disabled reads as strikethrough rather than a faded/grayed color.
  const btn = {
    background: "none", border: "none", color: WHITE, padding: "5px 2px",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 11,
    cursor: "pointer", lineHeight: 1.2, letterSpacing: "0.02em",
  };
  const btnActive = { ...btn, color: "#fff", fontWeight: 700, textDecoration: "underline", textUnderlineOffset: "3px" };
  const btnDisabled = { ...btn, color: WHITE_DIM, textDecoration: "line-through", cursor: "default" };
  // Camera strip sits directly on the 3D canvas, no glass behind it —
  // a soft text-shadow keeps it legible over whatever's under it without
  // reintroducing a box.
  const btnOnCanvas = { ...btn, textShadow: "0 1px 4px rgba(0,0,0,0.65)" };
  const btnOnCanvasActive = { ...btnActive, textShadow: "0 1px 4px rgba(0,0,0,0.65)" };
  // The plan modal is an opaque printed-drawing card, not glass — its
  // buttons stay ink-on-paper.
  const btnPaper = { ...btn, color: INK };
  const label = { fontFamily: "ui-monospace, monospace", fontSize: 10, letterSpacing: "0.08em", color: WHITE_DIM, textTransform: "uppercase", margin: "10px 0 4px" };
  const row = { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" };

  // Aligned label/value row with a thin rule line — the "tabular rhythm"
  // treatment for data lists (openings, takeoff totals) instead of
  // stacked cards.
  const DataRow = ({ k, v, dim }) => (
    <div style={{
      display: "flex", justifyContent: "space-between", gap: 10, padding: "4px 0",
      borderBottom: RULE, fontFamily: "ui-monospace,monospace", fontSize: 11,
      color: dim ? WHITE_DIM : WHITE,
    }}>
      <span>{k}</span>
      <span>{v}</span>
    </div>
  );

  const Stepper = ({ ftValue, onDec, onInc }) => (
    <div style={{ ...row, gap: 6 }}>
      <button style={btn} onClick={onDec}>&#8722;</button>
      <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, minWidth: 42, textAlign: "center", color: WHITE }}>{formatFeet(ftValue, units)}</span>
      <button style={btn} onClick={onInc}>+</button>
    </div>
  );

  const plan = planOpen ? planSVG(volumes, units) : null;
  const takeoff = takeoffOpen ? projectTakeoff(volumes, TAKEOFF_DEFAULTS) : null;
  const fmt = (n, dp = 0) => n.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });

  const downloadTakeoff = () => {
    if (!takeoff) return;
    const { grand, soilCuyd, lavaSandCuyd, rows } = takeoff;
    const totalArea = grand.extNetArea + grand.intNetArea;
    const lines = [
      "SHELTER ON THE LAND · MATERIALS TAKEOFF",
      `${volumes.length} volume${volumes.length === 1 ? "" : "s"}`,
      "",
      "PROJECT TOTAL",
      `net wall volume: ${fmt(grand.netVolCuft)} cuft (${fmt(grand.netVolCuyd, 1)} cuyd)`,
      `wall weight: ${fmt(grand.weightTons, 1)} tons`,
      `cement: ${Math.ceil(grand.cementBags)} bags (${CEMENT_BAG_LB}lb)`,
      ...(soilCuyd > 0 ? [`soil: ${fmt(soilCuyd, 1)} cuyd`] : []),
      ...(lavaSandCuyd > 0 ? [`lavasand: ${fmt(lavaSandCuyd, 1)} cuyd`] : []),
      `wall area exterior: ${formatArea(grand.extNetArea, units)}`,
      `wall area interior: ${formatArea(grand.intNetArea, units)}`,
      `wall area total: ${formatArea(totalArea, units)}`,
      `floor area: ${formatArea(grand.floorArea, units)}`,
      "",
      "PER VOLUME",
      ...volumes.flatMap((v, i) => {
        const r = rows[i];
        const rTotalArea = r.extNetArea + r.intNetArea;
        return [
          `${i + 1}. ${volumeDesc(v, units)}`,
          `   vol ${fmt(r.netVolCuft)} cuft (${fmt(r.netVolCuyd, 1)} cuyd) · wt ${fmt(r.weightTons, 1)} t · cement ${Math.ceil(r.cementBags)} bags`,
          `   ${r.aggLabel} ${fmt(r.aggCuyd, 1)} cuyd · area ext ${formatArea(r.extNetArea, units)} · int ${formatArea(r.intNetArea, units)} · total ${formatArea(rTotalArea, units)}`,
          `   floor area ${formatArea(r.floorArea, units)}`,
        ];
      }),
      "",
      "not for construction · estimate only",
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "shelter-takeoff.txt";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: PAPER, overflow: "hidden" }}>
      <div ref={mountRef} style={{ position: "absolute", inset: 0 }} />

      {/* wordmark — same type treatment as the toast (monospace, 11px,
          0.02em tracking, no uppercase) */}
      <div style={{
        position: "absolute", top: 14, left: 16, pointerEvents: "none",
        fontFamily: "ui-monospace, monospace", fontSize: 11,
        letterSpacing: "0.02em", color: INK,
      }}>
        shelter&nbsp;&nbsp;. on the .&nbsp;&nbsp;land
      </div>

      {/* top-right label */}
      <div style={{
        position: "absolute", top: 15, right: 16, pointerEvents: "none",
        fontFamily: "ui-monospace, monospace", fontSize: 11,
        letterSpacing: "0.02em", color: INK,
      }}>
        building blocks
      </div>

      {/* toast — autosave restore notice, save/load result */}
      {toast && (
        <div style={{
          position: "absolute", top: 15, left: "50%", transform: "translateX(-50%)",
          pointerEvents: "none", fontFamily: "ui-monospace, monospace", fontSize: 11,
          letterSpacing: "0.02em", color: INK,
        }}>
          {toast}
        </div>
      )}

      {/* control card */}
      <div className="glass-scroll" style={{
        position: "absolute", top: 64, left: 12, width: 218, maxHeight: "calc(100% - 140px)",
        overflowY: "auto", background: GLASS_BG, backdropFilter: "blur(20px) saturate(140%)",
        WebkitBackdropFilter: "blur(20px) saturate(140%)",
        border: GLASS_BORDER, borderRadius: GLASS_RADIUS, padding: "10px 12px 14px", boxShadow: GLASS_SHADOW,
      }}>
        <div style={row}>
          <button style={{ ...btnActive, flex: 1, padding: "8px 0" }} onClick={addVolume}>+ CUBIFORM</button>
          <button style={{ ...btnActive, flex: 1, padding: "8px 0" }} onClick={addCylinder}>+ CYLINDER</button>
        </div>

        <div style={{ ...row, marginTop: 6 }}>
          <button
            style={{ ...(history.length ? btn : btnDisabled), flex: 1 }}
            onClick={undo}
            disabled={!history.length}
          >
            &#8630; undo
          </button>
          <button
            style={{ ...(volumes.length ? btn : btnDisabled), flex: 1 }}
            onClick={clearAll}
            disabled={!volumes.length}
          >
            clear all
          </button>
        </div>

        <div style={{ ...row, marginTop: 6 }}>
          <button
            style={{ ...(showRoofs ? btnActive : btn), flex: 1 }}
            onClick={() => setShowRoofs((s) => !s)}
          >
            roofs: {showRoofs ? "on" : "off"}
          </button>
        </div>

        <div style={{ ...row, marginTop: 6 }}>
          <button
            style={{ ...(units === "imperial" ? btnActive : btn), flex: 1 }}
            onClick={() => setUnits("imperial")}
          >
            imperial
          </button>
          <button
            style={{ ...(units === "metric" ? btnActive : btn), flex: 1 }}
            onClick={() => setUnits("metric")}
          >
            metric
          </button>
        </div>

        {sel ? (
          <>
            <div style={label}>Material</div>
            <div style={row}>
              <button style={sel.material === "earth" ? btnActive : btn} onClick={() => update({ material: "earth" })}>rammed earth</button>
              <button style={sel.material === "lava" ? btnActive : btn} onClick={() => update({ material: "lava" })}>lavacrete</button>
            </div>

            <div style={label}>Wall</div>
            <div style={row}>
              <button style={sel.t === 1 ? btnActive : btn} onClick={() => update({ t: 1 })}>12&#8243;</button>
              <button style={sel.t === 1.5 ? btnActive : btn} onClick={() => update({ t: 1.5 })}>18&#8243;</button>
              <button style={sel.t === 2 ? btnActive : btn} onClick={() => update({ t: 2 })}>24&#8243;</button>
            </div>

            <div style={label}>Footprint</div>
            {sel.shape === "cylinder" ? (
              <div style={row}>
                <span style={{ fontFamily: "ui-monospace,monospace", fontSize: 10, width: 12, color: WHITE_DIM }}>R</span>
                <Stepper ftValue={sel.r} onDec={() => update({ r: Math.max(4, sel.r - MODULE) })} onInc={() => update({ r: Math.min(20, sel.r + MODULE) })} />
              </div>
            ) : (
              <>
                <div style={{ ...row, marginBottom: 4 }}>
                  <span style={{ fontFamily: "ui-monospace,monospace", fontSize: 10, width: 12, color: WHITE_DIM }}>W</span>
                  <Stepper ftValue={sel.w} onDec={() => update({ w: Math.max(8, sel.w - MODULE) })} onInc={() => update({ w: Math.min(32, sel.w + MODULE) })} />
                </div>
                <div style={row}>
                  <span style={{ fontFamily: "ui-monospace,monospace", fontSize: 10, width: 12, color: WHITE_DIM }}>D</span>
                  <Stepper ftValue={sel.d} onDec={() => update({ d: Math.max(8, sel.d - MODULE) })} onInc={() => update({ d: Math.min(32, sel.d + MODULE) })} />
                </div>
              </>
            )}

            <div style={label}>Height</div>
            <Stepper ftValue={sel.h} onDec={() => update({ h: Math.max(8, sel.h - 1) })} onInc={() => update({ h: Math.min(14, sel.h + 1) })} />

            <div style={label}>Orientation</div>
            <div style={row}>
              <button style={btn} onClick={() => update({ rot: (sel.rot + 45) % 360 })}>rotate 45&#176;</button>
              <span style={{ fontFamily: "ui-monospace,monospace", fontSize: 11, color: WHITE }}>{sel.rot}&#176;</span>
            </div>

            <div style={label}>Roof</div>
            <div style={row}>
              <button style={(sel.roof ?? "none") === "none" ? btnActive : btn} onClick={() => update({ roof: "none" })}>none</button>
              <button style={sel.roof === "flat" ? btnActive : btn} onClick={() => update({ roof: "flat" })}>flat</button>
              {sel.shape !== "cylinder" && (
                <button style={sel.roof === "pitched" ? btnActive : btn} onClick={() => update({ roof: "pitched" })}>3:12 mono-slope</button>
              )}
            </div>
            {sel.roof === "pitched" && sel.shape !== "cylinder" && (
              <div style={{ fontFamily: "ui-monospace,monospace", fontSize: 10, color: WHITE_DIM, marginTop: 4, lineHeight: 1.4 }}>
                high side faces the volume&#8217;s front &#8212; use Orientation above to point it elsewhere
              </div>
            )}

            <div style={label}>Openings &#183; snap {MODULE}&#8242;</div>
            {sel.shape === "cylinder" ? (
              <div style={{ ...row, marginBottom: 3 }}>
                <button style={btn} onClick={() => addOpening(null, "door")}>+door</button>
                <button style={btn} onClick={() => addOpening(null, "window")}>+win</button>
              </div>
            ) : (
              ["front", "back", "right", "left"].map((wk) => (
                <div key={wk} style={{ ...row, marginBottom: 3 }}>
                  <span style={{ fontFamily: "ui-monospace,monospace", fontSize: 11, width: 14, color: WHITE_DIM }}>{wallNames[wk]}</span>
                  <button style={btn} onClick={() => addOpening(wk, "door")}>+door</button>
                  <button style={btn} onClick={() => addOpening(wk, "window")}>+win</button>
                </div>
              ))
            )}
            {sel.openings.length > 0 && <div style={{ ...label, marginTop: 8 }}>Placed</div>}
            {sel.openings.map((o) => (
              <div key={o.id} style={{ padding: "4px 0", borderBottom: RULE }}>
                <div style={{ fontFamily: "ui-monospace,monospace", fontSize: 11, color: WHITE }}>
                  {sel.shape === "cylinder"
                    ? `${o.type} @ ${Math.round((o.angle * 180) / Math.PI)}°`
                    : `${wallNames[o.wall]} ${o.type} @ ${o.pos >= 0 ? "+" : ""}${o.pos}′`}
                </div>
                <div style={{ fontFamily: "ui-monospace,monospace", fontSize: 11, color: WHITE_DIM, marginBottom: 3 }}>
                  {`${openingWidth(o)}′w × ${openingHeight(o)}′h`}
                </div>
                <div style={{ ...row, gap: 6 }}>
                  <button style={btn} onClick={() => nudgeOpening(o.id, -1)}>&#9668;</button>
                  <button style={btn} onClick={() => nudgeOpening(o.id, 1)}>&#9658;</button>
                  {o.type === "window" && (
                    <>
                      <button style={btn} onClick={() => nudgeSill(o.id, 1)}>&#9650;</button>
                      <button style={btn} onClick={() => nudgeSill(o.id, -1)}>&#9660;</button>
                    </>
                  )}
                  <button style={btn} onClick={() => nudgeWidth(o.id, -1)}>w&#8722;</button>
                  <button style={btn} onClick={() => nudgeWidth(o.id, 1)}>w+</button>
                  <button style={btn} onClick={() => nudgeHeight(o.id, -1)}>h&#8722;</button>
                  <button style={btn} onClick={() => nudgeHeight(o.id, 1)}>h+</button>
                  <button style={{ ...btn, marginLeft: "auto" }} onClick={() => update({ openings: sel.openings.filter((x) => x.id !== o.id) })}>&#215;</button>
                </div>
              </div>
            ))}

            <div style={{ marginTop: 12 }}>
              <button style={{ ...btn, width: "100%", textAlign: "left" }}
                onClick={() => { pushUndo(); setVolumes((vs) => vs.filter((v) => v.id !== selectedId)); setSelectedId(null); }}>
                remove volume
              </button>
            </div>
          </>
        ) : (
          <div style={{ fontFamily: "ui-monospace,monospace", fontSize: 11, color: WHITE_DIM, marginTop: 10, lineHeight: 1.5 }}>
            Tap a volume to edit its walls, height, and openings. Drag to move &#8212; snaps to the ground grid. Tap ground to deselect.
          </div>
        )}
      </div>

      {/* camera + output strip */}
      <div style={{
        position: "absolute", bottom: 12, right: 12, display: "flex", gap: 6, flexWrap: "wrap",
        justifyContent: "flex-end", maxWidth: 340,
      }}>
        {[["aerial-sw", "SW"], ["aerial-ne", "NE"], ["eye-s", "eye S"], ["eye-w", "eye W"], ["top", "top"]].map(([k, n]) => (
          <button key={k} style={btnOnCanvas} onClick={() => preset(k)}>{n}</button>
        ))}
        <button style={btnOnCanvas} onClick={snapshot}>&#128247; view</button>
        <button style={btnOnCanvas} onClick={saveProject}>SAVE</button>
        <button style={btnOnCanvas} onClick={triggerLoad}>LOAD</button>
        <input ref={loadInputRef} type="file" accept=".json,application/json" style={{ display: "none" }} onChange={handleLoadFile} />
        <button style={btnOnCanvasActive} onClick={() => setPlanOpen(true)}>PLAN &#8599;</button>
        <button style={takeoffOpen ? btnOnCanvasActive : btnOnCanvas} onClick={() => setTakeoffOpen((s) => !s)}>TAKEOFF</button>
      </div>

      {/* plan modal — an opaque printed-drawing card (not glass): it's meant
          to read as an actual technical output, not a floating UI panel. */}
      {planOpen && plan && (
        <div style={{ position: "absolute", inset: 0, background: "rgba(38,33,25,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={() => setPlanOpen(false)}>
          <div style={{ background: PAPER, border: `1px solid ${INK}`, borderRadius: GLASS_RADIUS, maxWidth: "97%", maxHeight: "93%", overflow: "auto", padding: 10 }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontFamily: "Georgia,serif", fontSize: 13, letterSpacing: "0.15em", color: INK }}>PLAN</span>
              <div style={{ display: "flex", gap: 10 }}>
                <button style={btnPaper} onClick={downloadPlan}>download .svg</button>
                <button style={btnPaper} onClick={() => setPlanOpen(false)}>close</button>
              </div>
            </div>
            <div style={{ width: Math.min(plan.w, 1500) }} dangerouslySetInnerHTML={{ __html: plan.markup }} />
          </div>
        </div>
      )}

      {/* materials takeoff — a side panel, not a modal, so the 3D view and
          left controls stay usable while it's open. Density/cement-% are
          fixed backend constants (TAKEOFF_DEFAULTS) — no settings UI, just
          the totals. Per-volume numbering matches the plan's own markers
          (both walk the same volumes array in the same order). */}
      {takeoffOpen && takeoff && (
        <div className="glass-scroll" style={{
          position: "absolute", top: 64, right: 12, width: 280, maxHeight: "calc(100% - 90px)",
          overflowY: "auto", background: GLASS_BG, backdropFilter: "blur(20px) saturate(140%)",
          WebkitBackdropFilter: "blur(20px) saturate(140%)",
          border: GLASS_BORDER, borderRadius: GLASS_RADIUS, padding: "10px 12px 14px", boxShadow: GLASS_SHADOW,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontFamily: "Georgia,serif", fontSize: 13, letterSpacing: "0.08em", color: WHITE }}>TAKEOFF</span>
            <button style={btn} onClick={() => setTakeoffOpen(false)}>close</button>
          </div>

          <div style={label}>Project Total &#183; {volumes.length} volume{volumes.length === 1 ? "" : "s"}</div>
          <div>
            <DataRow k="net wall vol" v={`${fmt(takeoff.grand.netVolCuft)} cuft · ${fmt(takeoff.grand.netVolCuyd, 1)} cuyd`} />
            <DataRow k="wall weight" v={`${fmt(takeoff.grand.weightTons, 1)} tons`} />
            <DataRow k="cement" v={`${Math.ceil(takeoff.grand.cementBags)} bags (${CEMENT_BAG_LB}lb)`} />
            {takeoff.soilCuyd > 0 && <DataRow k="soil" v={`${fmt(takeoff.soilCuyd, 1)} cuyd`} />}
            {takeoff.lavaSandCuyd > 0 && <DataRow k="lavasand" v={`${fmt(takeoff.lavaSandCuyd, 1)} cuyd`} />}
            <DataRow k="wall area ext" v={formatArea(takeoff.grand.extNetArea, units)} />
            <DataRow k="wall area int" v={formatArea(takeoff.grand.intNetArea, units)} />
            <DataRow k="wall area total" v={formatArea(takeoff.grand.extNetArea + takeoff.grand.intNetArea, units)} />
            <DataRow k="floor area" v={formatArea(takeoff.grand.floorArea, units)} />
          </div>

          <div style={{ ...label, marginTop: 10 }}>Per Volume</div>
          {takeoff.rows.map((r, i) => (
            <div key={r.id} style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 2 }}>
                <span style={{
                  display: "inline-flex", alignItems: "center", justifyContent: "center", width: 15, height: 15,
                  borderRadius: "50%", background: "rgba(255,255,255,0.85)", color: "#141210", fontSize: 9,
                  fontFamily: "ui-monospace,monospace", flexShrink: 0,
                }}>{i + 1}</span>
                <span style={{ fontFamily: "ui-monospace,monospace", fontSize: 10, color: WHITE }}>{volumeDesc(volumes[i], units)}</span>
              </div>
              <DataRow k="vol" v={`${fmt(r.netVolCuft)} cuft · ${fmt(r.netVolCuyd, 1)} cuyd`} dim />
              <DataRow k="weight · cement" v={`${fmt(r.weightTons, 1)} t · ${Math.ceil(r.cementBags)} bags`} dim />
              <DataRow k={r.aggLabel} v={`${fmt(r.aggCuyd, 1)} cuyd`} dim />
              <DataRow k="area ext · int · total" v={`${formatArea(r.extNetArea, units)} · ${formatArea(r.intNetArea, units)} · ${formatArea(r.extNetArea + r.intNetArea, units)}`} dim />
              <DataRow k="floor area" v={formatArea(r.floorArea, units)} dim />
            </div>
          ))}

          <button style={{ ...btn, width: "100%", marginTop: 4 }} onClick={downloadTakeoff}>download .txt</button>
        </div>
      )}
    </div>
  );
}
