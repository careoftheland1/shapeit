// Three.js returns ray intersections from nearest to farthest. Select the
// visible volume under the pointer, regardless of which Long House row is
// currently open in the side panel.
export function pickVolumeHit(hits, volumes) {
  const ids = new Set(volumes.map(volume => volume.id));
  return hits.find(hit => {
    const id = hit.object.userData.volumeId;
    return typeof id === 'number' && ids.has(id);
  }) ?? null;
}
