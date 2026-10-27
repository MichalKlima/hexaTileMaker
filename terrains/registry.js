/**
 * Terrain registry — imports all terrains and exposes shared utilities.
 *
 * To add a new terrain:
 *   1. Create terrains/<name>/index.js  (copy any existing one as a template)
 *   2. Import it here and add to the TERRAINS map
 *   3. Add an <option> in index.html #terrain-select
 */

import { louka } from './louka/index.js';
import { les   } from './les/index.js';
import { voda  } from './voda/index.js';
import { hory  } from './hory/index.js';
import { cesta } from './cesta/index.js';
import { mesto } from './mesto/index.js';
import { most  } from './most/index.js';
import { zed   } from './zed/index.js';

/** All registered terrains, keyed by id. */
export const TERRAINS = new Map([
  [louka.id, louka],
  [les.id,   les],
  [voda.id,  voda],
  [hory.id,  hory],
  [cesta.id, cesta],
  [mesto.id, mesto],
  [most.id,  most],
  [zed.id,  zed],
]);

/**
 * Edge → neighbor direction mapping for flat-top axial hex grid.
 * Vertex angles: 0°,60°,120°,180°,240°,300°
 * Edge midpoint normals: 30°,90°,150°,210°,270°,330°
 */
export const EDGE_NEIGHBORS = [
  { dq: +1, dr:  0 }, // edge 0-1: E
  { dq:  0, dr: +1 }, // edge 1-2: SE
  { dq: -1, dr: +1 }, // edge 2-3: SW
  { dq: -1, dr:  0 }, // edge 3-4: W
  { dq:  0, dr: -1 }, // edge 4-5: NW
  { dq: +1, dr: -1 }, // edge 5-0: NE
];

/** Returns the SVG fill value for a terrain id (pattern URL or flat color). */
export function getTerrainFill(terrainId) {
  const terrain = TERRAINS.get(terrainId);
  if (!terrain) return '#888888';
  return (terrain.tile || terrain.pattern) ? `url(#tp-${terrainId})` : terrain.color;
}

/** Builds SVG <defs> with <pattern> elements for terrains with PNG tiles or pixel data. */
export function buildTerrainDefs(svg) {
  let defs = svg.querySelector('defs');
  if (!defs) {
    defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    svg.insertBefore(defs, svg.firstChild);
  }
  defs.innerHTML = '';

  TERRAINS.forEach((terrain) => {
    if (!terrain.tile && !terrain.pattern) return;

    const tileW = terrain.tile?.size ?? (terrain.pattern.grid * terrain.pattern.pixelSize);
    const tileH = terrain.tile?.size ?? (terrain.pattern.grid * terrain.pattern.pixelSize);

    const pattern = document.createElementNS('http://www.w3.org/2000/svg', 'pattern');
    pattern.setAttribute('id', `tp-${terrain.id}`);
    pattern.setAttribute('x', '0');
    pattern.setAttribute('y', '0');
    pattern.setAttribute('width', String(tileW));
    pattern.setAttribute('height', String(tileH));
    pattern.setAttribute('patternUnits', 'userSpaceOnUse');

    if (terrain.tile?.src) {
      const image = document.createElementNS('http://www.w3.org/2000/svg', 'image');
      image.setAttribute('x', '0');
      image.setAttribute('y', '0');
      image.setAttribute('width', String(tileW));
      image.setAttribute('height', String(tileH));
      image.setAttribute('preserveAspectRatio', 'none');
      image.setAttribute('href', terrain.tile.src);
      image.setAttributeNS('http://www.w3.org/1999/xlink', 'href', terrain.tile.src);
      pattern.appendChild(image);
    } else {
      const cfg = terrain.pattern;
      cfg.data.forEach((colorIdx, i) => {
        const row = Math.floor(i / cfg.grid);
        const col = i % cfg.grid;
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', String(col * cfg.pixelSize));
        rect.setAttribute('y', String(row * cfg.pixelSize));
        rect.setAttribute('width', String(cfg.pixelSize));
        rect.setAttribute('height', String(cfg.pixelSize));
        rect.setAttribute('fill', cfg.palette[colorIdx]);
        pattern.appendChild(rect);
      });
    }

    defs.appendChild(pattern);
  });
}
