import { state } from './state.js';
import { TERRAINS, EDGE_NEIGHBORS, getTerrainFill, buildTerrainDefs } from '../terrains/registry.js';
import { EDGE_INDEX_TO_DIRECTION } from '../terrains/transitions/index.js';

/** SVG coordinate of the map origin (hex 0,0 center). */
export const CENTER_X = 900;
export const CENTER_Y = 600;

/** Returns array of 6 vertex {x,y} for a flat-top hex. */
function getHexVertices(cx, cy, size) {
  const verts = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i);
    verts.push({ x: cx + size * Math.cos(a), y: cy + size * Math.sin(a) });
  }
  return verts;
}

/**
 * Renders the hex map into an SVG element using three z-ordered passes:
 *   1. Base terrain fills (patterns or flat colors)
 *   2. Terrain transition trapezoids at edges
 *   3. Hex borders + labels (always on top)
 */
export class Renderer {
  constructor(svgElement) {
    this.svg = svgElement;
    this.root = null;
    this.clipIdCounter = 0;
    this.assetVersion = Date.now();
  }

  withAssetVersion(src) {
    if (!src) return src;
    const join = src.includes('?') ? '&' : '?';
    return `${src}${join}v=${this.assetVersion}`;
  }

  normalizeOverlaySrc(src) {
    if (!src) return src;
    if (!src.includes('terrains/transitions/')) return src;

    // Legacy transition paths are force-mapped to directional overlays.
    const m = src.match(/terrains\/transitions\/([^/]+)\/.*overlay[_-]([A-Z]{1,2})\.png/i);
    if (m) {
      const terrainId = m[1].split('_').pop();
      const dir = m[2].toUpperCase();
      return `terrains/overlays/${terrainId}/overlay_${dir}.png`;
    }
    return src.replace('terrains/transitions/', 'terrains/overlays/');
  }

  makeClipPath(points) {
    const clipPath = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
    const clipId = `tr-clip-${this.clipIdCounter++}`;
    clipPath.setAttribute('id', clipId);

    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    poly.setAttribute(
      'points',
      points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' '),
    );
    clipPath.appendChild(poly);
    return { clipPath, clipId };
  }

  appendTransitionImage(layer, defs, points, src, size, cx, cy) {
    const { clipPath, clipId } = this.makeClipPath(points);
    defs.appendChild(clipPath);

    const image = document.createElementNS('http://www.w3.org/2000/svg', 'image');
    image.setAttribute('x', String(cx - size / 2));
    image.setAttribute('y', String(cy - size / 2));
    image.setAttribute('width', String(size));
    image.setAttribute('height', String(size));
    image.setAttribute('preserveAspectRatio', 'none');
    const imageSrc = this.withAssetVersion(src);
    image.setAttribute('href', imageSrc);
    image.setAttributeNS('http://www.w3.org/1999/xlink', 'href', imageSrc);
    image.setAttribute('clip-path', `url(#${clipId})`);
    image.setAttribute('image-rendering', 'pixelated');
    image.style.pointerEvents = 'none';
    layer.appendChild(image);
  }

  render(mapDocument, onTileClick) {
    const svg = this.svg;

    // Remove previous render root but keep <defs>
    if (this.root) this.root.remove();
    if (!svg.querySelector('defs')) buildTerrainDefs(svg);

    const root     = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const baseLyr  = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const transLyr = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const topLyr   = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    let defs = svg.querySelector('defs');
    if (!defs) {
      defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
      svg.insertBefore(defs, svg.firstChild);
    }
    defs.querySelectorAll('[data-transition-defs]').forEach((node) => node.remove());

    const transitionDefs = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    transitionDefs.setAttribute('data-transition-defs', 'true');
    root.appendChild(baseLyr);
    root.appendChild(transLyr);
    root.appendChild(topLyr);
    this.root = root;
    svg.appendChild(root);
    defs.appendChild(transitionDefs);

    const grid = mapDocument.grid;

    grid.tiles.forEach((tile) => {
      const { x, y } = grid.getPixelPosition(tile.q, tile.r);
      const cx = CENTER_X + x;
      const cy = CENTER_Y + y;
      const size = grid.size;
      const isSelected = state.selectedHexId === tile.id;
      const pts = grid.getHexPoints(cx, cy, size);
      const verts = getHexVertices(cx, cy, size);
      const terrainDef = TERRAINS.get(tile.terrain);
      const baseSrc = terrainDef?.tile?.src || null;

      // --- Pass 1: base fill ---
      if (baseSrc) {
        this.appendTransitionImage(
          baseLyr,
          transitionDefs,
          verts,
          baseSrc,
          size * 2,
          cx,
          cy,
        );
      } else {
        const base = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        base.setAttribute('points', pts);
        base.setAttribute('fill', getTerrainFill(tile.terrain));
        base.setAttribute('stroke', 'none');
        baseLyr.appendChild(base);
      }

      const hit = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      hit.setAttribute('points', pts);
      hit.setAttribute('fill', 'transparent');
      hit.setAttribute('stroke', 'none');
      hit.dataset.hexId = tile.id;
      hit.dataset.q = String(tile.q);
      hit.dataset.r = String(tile.r);
      hit.addEventListener('click', () => onTileClick(tile));
      baseLyr.appendChild(hit);

      // --- Pass 2: transitions ---
      const tilePriority = TERRAINS.get(tile.terrain)?.priority ?? 1;
      EDGE_NEIGHBORS.forEach(({ dq, dr }, edgeIdx) => {
        const neighbor = grid.getTile(tile.q + dq, tile.r + dr);
        if (!neighbor || neighbor.terrain === tile.terrain) return;
        const neighborPriority = TERRAINS.get(neighbor.terrain)?.priority ?? 1;
        if (neighborPriority <= tilePriority) return;

        const dir = EDGE_INDEX_TO_DIRECTION[edgeIdx];
        const overlaySrc = this.normalizeOverlaySrc(`terrains/overlays/${neighbor.terrain}/overlay_${dir}.png`);
        if (!overlaySrc) return;

        // Directional overlays are authored per side, no runtime rotation.
        this.appendTransitionImage(
          transLyr,
          transitionDefs,
          verts,
          overlaySrc,
          size * 2,
          cx,
          cy,
        );
      });

      // --- Pass 3: border + label ---
      const border = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      border.setAttribute('points', pts);
      border.setAttribute('fill', 'none');
      border.setAttribute('stroke', isSelected ? '#fbbf24' : 'rgba(255,255,255,0.18)');
      border.setAttribute('stroke-width', isSelected ? '2.4' : '1.2');
      border.style.pointerEvents = 'none';
      topLyr.appendChild(border);

      if (tile.label) {
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', String(cx));
        text.setAttribute('y', String(cy + 4));
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('font-size', '10');
        text.setAttribute('fill', '#ffffff');
        text.style.pointerEvents = 'none';
        text.textContent = tile.label;
        topLyr.appendChild(text);
      }
    });
  }
}
