// Older Long House files can contain copied rows with repeated IDs. IDs are
// used for selection, editing, and mesh lookup, so every saved object needs a
// distinct one. Keep existing volume IDs where possible and reassign only
// duplicates (including collisions with opening IDs).
export function normalizeProjectIds(volumes) {
  const allIds = volumes.flatMap(volume => [volume.id, ...volume.openings.map(opening => opening.id)]);
  let nextId = Math.max(0, ...allIds.filter(Number.isSafeInteger)) + 1;
  const seen = new Set();
  const unique = id => {
    if (Number.isSafeInteger(id) && id > 0 && !seen.has(id)) {
      seen.add(id);
      return id;
    }
    const replacement = nextId++;
    seen.add(replacement);
    return replacement;
  };
  const ids = volumes.map(volume => unique(volume.id));
  return volumes.map((volume, index) => ({
    ...volume,
    id: ids[index],
    openings: volume.openings.map(opening => ({ ...opening, id: unique(opening.id) })),
  }));
}
