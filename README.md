# Shelter on the Land

A kit-of-parts volume study tool for rammed-earth and lavacrete shelter design. Sketch cubiform or cylindrical volumes, place doors and windows, toggle roofs, and get a live materials takeoff and a dimensioned plan — all in the browser.

## Features

- Cubiform and cylinder volumes, dragged and snapped on a 2' module grid
- 12"/18"/24" wall thickness, rammed earth (CSRE) or lavacrete
- Doors and windows, freely resizable (0.5' increments), with wall-proximity snapping
- Flat or 3:12 mono-slope roofs
- Live materials takeoff (volume, weight, cement, aggregate, wall/floor area)
- Dimensioned plan export (SVG)
- Save/load as a project file, plus browser autosave

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

Not for construction — estimate only.

## Long House

Open `/?mode=long-house` for the row editor, or
`/?mode=long-house&preset=live-court-sleep` to launch a specific starting sequence.
Four Walls remains available at `/` and `/?mode=four-walls`. Each mode keeps its
own browser autosave; switching workspaces does not convert or replace geometry.
Project JSON files include the pattern, site, room/court sequence, and openings.

Long House includes six Places to Start; an empty start; editable site dimensions;
room and court insertion, removal, ordering and lengths; multirow lots with a shared width and independent sequences; shared party walls between rows;
ground and upper-level openings; two-story rooms with independently sized upper footprints; adjustable site-wide story heights (12 feet ground and 9 feet upper by default); and roof decks with parapets.
Drag an element along the row to reorder it, or use Earlier / Later in its panel.
Narrow rooms align to the left or right row wall, leaving an open side court that joins adjacent full-width courts. A smaller upper footprint leaves a roof terrace on the ground room; upper doors can face that terrace. Room walls offer 12″, 18″, and 24″ thicknesses; their outer faces stay fixed while the interior changes. The continuous compound boundary remains 18″. Shared runs use the first room's thickness. Room widths and alignment must match before a complete wall can be shared. Courts stay open to
sky inside side walls that continue past courts. The 3D model and site drawing show a continuous perimeter at the selected ground height. The materials takeoff counts the continuous compound boundary once and omits those same sections from room wall quantities, including shared party walls and two-story perimeter sections. The selected row count divides the lot width evenly; adding rows expands only a lot that would otherwise give a row less than 8 feet. Each row has its own sequence, and adjacent rows share one boundary wall. Reduce the row count to remove the final rows (Undo restores them). Model coordinates follow the row; street direction
sets the orientation reference on the exported ground-floor drawing.

The Rise once example places Service directly beside the tall room to make the
upper-door / roof-deck connection possible. Grow shows future elements translucently.
Site overflow, narrow courts, shared-wall openings, extra tall rooms, and missing
deck access produce guidance rather than blocking edits.

This is the initial Long House implementation. Detailed allocation of shared party walls to individual homes,
upper-floor drawings, stairs, a richer generator, Grow from Four Walls, and
Supported handoff are still to come. Roof decks are exploratory geometry, not
verified structure. Court / Space It integration is outside this first slice.

Run the row-model checks with `npm test`, plus
`npm run lint` and `npm run build`.
