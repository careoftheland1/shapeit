import React, { useState, useEffect } from 'react';
import { PLACES, isCourt, makeRowItem, startingRow, rowWarnings, rowWidth, siteRowCount, siteGroundHeight, siteUpperHeight, thicknessOwnerIndex, SITE_WALL } from './longHouse.js';
import './long-house.css';

export default function LongHousePanel({ items: allItems, selectedId, select, change, site, setSite, nid, openOpenings, placesInitially }) {
  const [activeRow, setActiveRow] = useState(0);
  const selectedRow = allItems.find(v => v.id === selectedId)?.row;
  useEffect(() => { if (selectedRow !== undefined) setActiveRow(selectedRow); }, [selectedRow]);
  const row = selectedRow ?? Math.min(activeRow, siteRowCount(site) - 1);
  const items = allItems.filter(v => (v.row ?? 0) === row);
  const rowSite = { ...site, width: rowWidth(site), rows: 1 };
  const changeRow = (next, frame) => change([...allItems.filter(v => (v.row ?? 0) !== row), ...next.map(v => ({ ...v, row }))], frame);
  const [placesOpen, setPlacesOpen] = useState(placesInitially || !items.length);
  const [pending, setPending] = useState(null);
  const index = items.findIndex(v => v.id === selectedId);
  const selected = items[index];
  const patch = fields => changeRow(items.map(v => v.id === selectedId ? { ...v, ...fields } : v));
  const changeThickness = t => {
    const owner = thicknessOwnerIndex(items, index);
    changeRow(items.map((v, i) => i === owner ? { ...v, t } : v));
  };
  const add = (kind, before = false) => {
    const item = makeRowItem(kind, rowWidth(site), nid);
    const next = [...items];
    next.splice(index < 0 ? next.length : index + (before ? 0 : 1), 0, item);
    changeRow(next); select(item.id); setPlacesOpen(false);
  };
  const applyPlace = id => { changeRow(id === 'empty' ? [] : startingRow(id, rowSite, nid), true); select(null); setPlacesOpen(false); setPending(null); };
  const move = direction => {
    const next = [...items];
    [next[index], next[index + direction]] = [next[index + direction], next[index]];
    changeRow(next);
  };
  const number = (label, value, onChange, min, max, step = 2) => <label className="lh-field">{label}<input aria-label={label} type="number" min={min} max={max} step={step} value={value} onChange={e => { const n = Number(e.target.value); if (e.target.value && Number.isFinite(n) && n >= min && n <= max) onChange(n); }}/></label>;
  const length = items.length ? items.at(-1).z + items.at(-1).d / 2 - items[0].z + items[0].d / 2 : 0;
  return <div className="long-house-panel">
    <section className="builder-section"><div className="section-number">01</div><h2>LONG HOUSE</h2><p>Room. Sky. Room. Shape a sequence along the land.</p>
      <details><summary>Buildable site · {site.width}′ × {site.depth}′</summary>
        {number('Lot width (ft)', site.width, width => setSite({ ...site, width }), siteRowCount(site) * 8 - (siteRowCount(site) - 1) * SITE_WALL, 400)}
        <label className="lh-field">Long House rows<select aria-label="Long House rows" value={siteRowCount(site)} onChange={e => { const rows = Number(e.target.value); setSite({ ...site, rows, width: Math.max(site.width, rows * 8 - (rows - 1) * SITE_WALL) }); }} >{Array.from({length:12}, (_,i) => <option key={i} value={i+1}>{i+1}</option>)}</select></label>
        {number('Depth (ft)', site.depth, depth => setSite({ ...site, depth }), 16, 300)}
        {number('Ground wall height (ft)', siteGroundHeight(site), groundHeight => setSite({ ...site, groundHeight }), 8, 20, 1)}
        {number('Upper wall height (ft)', siteUpperHeight(site), upperHeight => setSite({ ...site, upperHeight }), 7, 15, 1)}
        <label className="lh-field">Street / front<select value={site.front} onChange={e => setSite({ ...site, front: e.target.value })}>{['South','West','North','East'].map(s => <option key={s}>{s}</option>)}</select></label>
        <p>{rowWidth(site).toFixed(1).replace('.0','')}′ per row. Adding rows extends the lot at this width. Changing lot width resizes the rows. Reducing the count removes the last rows; Undo restores them.</p><p>Courts stay open to sky inside continuous {siteGroundHeight(site)}′ ground boundary walls. Adjacent homes share one wall.</p>
      </details>
      <button className="outline-action" aria-expanded={placesOpen} onClick={() => setPlacesOpen(!placesOpen)}>PLACES TO START {placesOpen ? '−' : '＋'}</button>
      {placesOpen && <div className="lh-places">{PLACES.map(p => <button key={p.id} onClick={() => items.length ? setPending(p.id) : applyPlace(p.id)}><strong>{p.name}</strong><span>{p.uses.join(' — ')}</span></button>)}<button onClick={() => items.length ? setPending('empty') : applyPlace('empty')}>Start empty</button></div>}
      {pending && <div className="lh-confirm"><p>Replace this sequence? You can undo to return to it.</p><button onClick={() => applyPlace(pending)}>REPLACE SEQUENCE</button><button onClick={() => setPending(null)}>KEEP EDITING</button></div>}
    </section>
    <section className="builder-section"><div className="section-number">02</div><h2>{siteRowCount(site) > 1 ? `ROW ${row + 1}` : 'THE ROW'}</h2><p>{length.toFixed(1).replace('.0','')}′ of {site.depth}′ · street at the start</p>
      <div className="lh-row-tabs" role="group" aria-label="Choose Long House row">{Array.from({length:siteRowCount(site)}, (_,i) => <button key={i} aria-pressed={row === i} onClick={() => { setActiveRow(i); select(null); }}>ROW {i+1}</button>)}</div>
      <div className="lh-row" aria-label="Long House sequence">{items.map((v, i) => <button key={v.id} className={`${isCourt(v) ? 'sky' : ''} ${selectedId === v.id ? 'selected' : ''}`} onClick={() => select(v.id)}><span>{String(i + 1).padStart(2,'0')} · {isCourt(v) ? 'OPEN SKY' : v.stories === 2 ? 'TWO STORIES' : 'ROOM'}{v.sharedBack ? ' · SHARED WALL' : ''}</span><strong>{v.label}</strong><small>{v.w}′ × {v.d}′{!isCourt(v) && v.w < rowWidth(site) - .01 ? ` · ${v.side === 'right' ? 'RIGHT' : 'LEFT'} EDGE + SIDE COURT` : ''}{v.stories === 2 && ((v.upperWidth ?? v.w) < v.w || (v.upperDepth ?? v.d) < v.d) ? ' · ROOF TERRACE' : v.deck ? ' · ROOF DECK' : ''}</small></button>)}</div>
      {!items.length && <p>Add the first room, or choose a place to start.</p>}
      <div className="choice-grid"><button className="primary" onClick={() => add('room')}>＋ ROOM {selected ? 'AFTER' : ''}</button><button className="primary" onClick={() => add('court')}>＋ COURT {selected ? 'AFTER' : ''}</button></div>
    </section>
    {selected && <section className="builder-section"><div className="section-number">03</div><h2>{isCourt(selected) ? 'SKY' : 'ROOM'}</h2>
      <label className="lh-field">Use / name<input aria-label="Use / name" value={selected.label} maxLength={60} onChange={e => patch({ label: e.target.value })}/></label>
      <label className="lh-check"><input type="checkbox" checked={!!selected.future} onChange={e => patch({ future: e.target.checked })}/> Future growth</label>
      {number('Length along row (ft)', selected.d, d => patch({ d }), isCourt(selected) ? 2 : 8, 80)}
      {!isCourt(selected) && <>{number('Room width (ft)', selected.w, w => patch({ w }), 8, rowWidth(site))}
        <label className="lh-field">Align room to<select aria-label="Align room to" value={selected.side === 'right' ? 'right' : 'left'} onChange={e => patch({ side: e.target.value })}><option value="left">Left wall</option><option value="right">Right wall</option></select></label>
        <label className="lh-field">Material<select value={selected.material} onChange={e => patch({ material: e.target.value })}><option value="earth">Rammed earth</option><option value="lava">Lavacrete</option></select></label>
        <div className="field-label">ROOM WALL THICKNESS · OUTER FACES FIXED</div>
        <div className="segmented thirds" role="group" aria-label="Room wall thickness">{[[1,'12″'],[1.5,'18″'],[2,'24″']].map(([t, label]) => <button key={t} type="button" className={selected.t === t ? 'active' : ''} aria-pressed={selected.t === t} onClick={() => changeThickness(t)}>{label}</button>)}</div>
        {selected.sharedBack ? <p>This room shares a wall. Thickness changes apply to the connected rooms in this shared run.</p> : <p>Thickness changes inward. The compound boundary remains 18″.</p>}
        <label className="lh-field">Rise once<select value={selected.stories || 1} onChange={e => patch({ stories: Number(e.target.value), h: siteGroundHeight(site) + (Number(e.target.value) === 2 ? siteUpperHeight(site) : 0), deck: false })}><option value="1">One story</option><option value="2">Two stories</option></select></label>
        {selected.stories === 2 && <>{number('Upper room width (ft)', selected.upperWidth ?? selected.w, upperWidth => patch({ upperWidth }), 8, selected.w)}{number('Upper room depth (ft)', selected.upperDepth ?? selected.d, upperDepth => patch({ upperDepth }), 8, selected.d)}
          <label className="lh-field">Upper room side<select aria-label="Upper room side" value={selected.upperSide === 'right' ? 'right' : 'left'} onChange={e => patch({ upperSide: e.target.value })}><option value="left">Left</option><option value="right">Right</option></select></label>
          <label className="lh-field">Upper room end<select aria-label="Upper room end" value={selected.upperEnd === 'front' ? 'front' : 'back'} onChange={e => patch({ upperEnd: e.target.value })}><option value="back">Back · terrace ahead</option><option value="front">Front · terrace behind</option></select></label>
          <p>A smaller upper room opens roof terrace on the ground room below. Gaps no wider than the wall thickness close to the edge. Place an upper door toward the terrace.</p></>}
        {index > 0 && !isCourt(items[index - 1]) && <label className="lh-field">Wall before<select value={selected.join} onChange={e => patch({ join: e.target.value })}><option value="separate">Separate walls</option><option value="shared">Shared wall</option></select></label>}
        {!!selected.sharedBack && <p>One wall serves both rooms, using the preceding room’s material and thickness.</p>}
        {selected.stories !== 2 && <label className="lh-check"><input type="checkbox" checked={!!selected.deck} onChange={e => patch({ deck: e.target.checked })}/> Usable roof / deck</label>}
        <button className="outline-action" onClick={openOpenings}>EDIT OPENINGS ↗</button>
      </>}
      <div className="lh-order"><button disabled={index === 0} onClick={() => move(-1)}>↑ EARLIER</button><button disabled={index === items.length - 1} onClick={() => move(1)}>↓ LATER</button></div>
      <div className="lh-order"><button onClick={() => add('room', true)}>＋ ROOM BEFORE</button><button onClick={() => add('court', true)}>＋ COURT BEFORE</button></div>
      <button className="remove-action" onClick={() => { changeRow(items.filter(v => v.id !== selectedId)); select(null); }}>REMOVE {isCourt(selected) ? 'COURT' : 'ROOM'}</button>
    </section>}
    {rowWarnings(items, rowSite).length > 0 && <section className="lh-guidance"><h3>PATTERN NOTES</h3>{rowWarnings(items, rowSite).map((w, i) => <p key={i}>{w}</p>)}</section>}
    {items.some(v => !isCourt(v) && v.siteSides && v.openings.some(o => (o.wall === 'left' && row > 0) || (o.wall === 'right' && row < siteRowCount(site) - 1))) && <section className="lh-guidance"><p>Side openings on a shared boundary are retained in the project but closed in the model. Move them toward a court or an outer wall.</p></section>}
    <p className="lh-footnote">Share construction where it helps. Leave sky where separation helps.</p>
  </div>;
}
