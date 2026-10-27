/**
 * Directional edge overlay system (no runtime rotation).
 *
 * Priority order P1..P7 in this project:
 *   P1 voda, P2 cesta, P3 most, P4 louka, P5 les, P6 hory, P7 mesto
 */
export const TERRAIN_PRIORITY_ORDER = ['voda', 'cesta', 'most', 'louka', 'les', 'hory', 'mesto', 'zed'];

/** Overlay directions in logical order used by assets. */
export const OVERLAY_DIRECTIONS = ['NE', 'E', 'SE', 'SW', 'W', 'NW'];

/** Renderer edge index -> logical direction mapping for flat-top axial hexes. */
export const EDGE_INDEX_TO_DIRECTION = ['E', 'SE', 'SW', 'W', 'NW', 'NE'];

/** Logical direction -> axial neighbor offset. */
export const DIRECTION_NEIGHBORS = {
  NE: { dq: +1, dr: -1 },
  E:  { dq: +1, dr:  0 },
  SE: { dq:  0, dr: +1 },
  SW: { dq: -1, dr: +1 },
  W:  { dq: -1, dr:  0 },
  NW: { dq:  0, dr: -1 },
};

export function getTerrainPriority(terrainId) {
  const idx = TERRAIN_PRIORITY_ORDER.indexOf(terrainId);
  return idx >= 0 ? idx + 1 : 0;
}

export function getLowerPriorityTerrains(terrainId) {
  const p = getTerrainPriority(terrainId);
  return TERRAIN_PRIORITY_ORDER.filter((id) => getTerrainPriority(id) < p);
}

export function getBaseTileAsset(terrainId) {
  return `terrains/${terrainId}/tile.png`;
}

export function getOverlayAsset(terrainId, direction) {
  if (!terrainId || !direction) return null;
  const p = getTerrainPriority(terrainId);
  if (p <= 1) return null;
  return `terrains/overlays/${terrainId}/overlay_${direction}.png`;
}
