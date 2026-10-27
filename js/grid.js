/** Hex grid data model: HexTile, HexGrid, MapDocument. */

export class HexTile {
  constructor({ q, r, terrain = 'louka', elevation = 0, label = '', id = null }) {
    this.id = id ?? `${q}:${r}`;
    this.q = q;
    this.r = r;
    this.terrain = terrain;
    this.elevation = elevation;
    this.label = label;
    this.meta = {};
  }
}

export class HexGrid {
  constructor({ size = 42, layout = 'flat-top' }) {
    this.size = size;
    this.layout = layout;
    this.tiles = new Map();
  }

  ensureTile(q, r, options = {}) {
    const key = `${q}:${r}`;
    if (!this.tiles.has(key)) {
      this.tiles.set(key, new HexTile({ q, r, ...options, id: key }));
    }
    return this.tiles.get(key);
  }

  getTile(q, r) {
    return this.tiles.get(`${q}:${r}`) ?? null;
  }

  /** Returns SVG polygon points string for a flat-top hex. */
  getHexPoints(cx, cy, size) {
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 180) * (60 * i);
      pts.push(`${(cx + size * Math.cos(a)).toFixed(2)},${(cy + size * Math.sin(a)).toFixed(2)}`);
    }
    return pts.join(' ');
  }

  /** Axial → pixel center (flat-top). */
  getPixelPosition(q, r) {
    const s = this.size;
    return {
      x: s * 1.5 * q,
      y: s * Math.sqrt(3) * (r + q / 2),
    };
  }
}

export class MapDocument {
  constructor({ name = 'Nový projekt', size = 42 }) {
    this.id = crypto.randomUUID();
    this.name = name;
    this.size = size;
    this.grid = new HexGrid({ size, layout: 'flat-top' });
    this.createdAt = new Date().toISOString();
    this.updatedAt = new Date().toISOString();
    this.tiles = this.grid.tiles;
    this.layers = { terrain: true, labels: true, decor: true };
  }

  clone() {
    const copy = new MapDocument({ name: `${this.name} kopie`, size: this.size });
    this.grid.tiles.forEach((tile) => {
      copy.grid.ensureTile(tile.q, tile.r, {
        terrain: tile.terrain,
        elevation: tile.elevation,
        label: tile.label,
        id: tile.id,
      });
    });
    return copy;
  }
}
