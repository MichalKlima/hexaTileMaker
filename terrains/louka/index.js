/**
 * LOUKA — Meadow terrain
 *
 * Pattern format:
 *   grid: NxN pixel art tile size
 *   pixelSize: how many SVG units each "pixel" occupies
 *   palette: color array (indexed by data values)
 *   data: flat array of palette indices, row by row (grid × grid values)
 *
 * Tile preview (palette indices, 8×8):
 *   0 = #7ecb6b  mid green (base)
 *   1 = #9ed67a  light green
 *   2 = #5ab552  dark green
 *   3 = #b4e899  highlight
 */
export const louka = {
  id: 'louka',
  label: 'Louka',
  priority: 4,
  color: '#7ecb6b',
  tile: {
    src: 'terrains/louka/tile.png',
    size: 64,
  },
};
