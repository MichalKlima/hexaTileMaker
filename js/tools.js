import { state } from './state.js';
import { CENTER_X, CENTER_Y } from './renderer.js';

const ZOOM_MIN = 0.35;
const ZOOM_MAX = 6;
const ZOOM_STEP = 1.12;

function hexRound(fq, fr) {
  const fs = -fq - fr;
  let q = Math.round(fq);
  let r = Math.round(fr);
  let s = Math.round(fs);
  const dq = Math.abs(q - fq);
  const dr = Math.abs(r - fr);
  const ds = Math.abs(s - fs);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  return { q, r };
}

/** Converts SVG pixel coords to axial hex coordinates (flat-top). */
function pixelToHex(px, py) {
  const size = state.map.grid.size;
  const x = px - CENTER_X;
  const y = py - CENTER_Y;
  return hexRound((2 / 3 * x) / size, (-1 / 3 * x + Math.sqrt(3) / 3 * y) / size);
}

/**
 * Attaches pointer-based paint/erase interaction to the SVG canvas.
 * @param {SVGElement} svg
 * @param {() => void} renderMap  — callback to trigger a re-render
 */
export function bindSvgInteraction(svg, renderMap) {
  let isPainting = false;
  let isPanning = false;
  let lastPanPoint = null;
  let baseViewBox = null;

  function getSVGCoords(event) {
    const pt = svg.createSVGPoint();
    pt.x = event.clientX;
    pt.y = event.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }

  function getViewBox() {
    const vb = svg.viewBox?.baseVal;
    if (vb && vb.width > 0 && vb.height > 0) {
      return { x: vb.x, y: vb.y, width: vb.width, height: vb.height };
    }

    const fallback = {
      x: 0,
      y: 0,
      width: CENTER_X * 2,
      height: CENTER_Y * 2,
    };
    svg.setAttribute('viewBox', `${fallback.x} ${fallback.y} ${fallback.width} ${fallback.height}`);
    return fallback;
  }

  function ensureViewBox() {
    const vb = getViewBox();
    if (!baseViewBox) baseViewBox = { ...vb };
    return vb;
  }

  function setViewBox(x, y, width, height) {
    svg.setAttribute('viewBox', `${x} ${y} ${width} ${height}`);
    if (baseViewBox?.width) {
      state.zoom = Number((baseViewBox.width / width).toFixed(3));
    }
  }

  function zoomAtClientPoint(event, zoomIn) {
    const vb = ensureViewBox();
    const factor = zoomIn ? (1 / ZOOM_STEP) : ZOOM_STEP;
    const minW = baseViewBox.width / ZOOM_MAX;
    const maxW = baseViewBox.width / ZOOM_MIN;

    const newWidth = Math.max(minW, Math.min(maxW, vb.width * factor));
    const scale = newWidth / vb.width;
    const newHeight = vb.height * scale;

    const p = getSVGCoords(event);
    const relX = (p.x - vb.x) / vb.width;
    const relY = (p.y - vb.y) / vb.height;
    const newX = p.x - relX * newWidth;
    const newY = p.y - relY * newHeight;
    setViewBox(newX, newY, newWidth, newHeight);
  }

  function paintAt(x, y) {
    if (!state.map) return;
    const { q, r } = pixelToHex(x, y);
    const key = `${q}:${r}`;

    if (state.tool === 'paint') {
      const terrain = document.getElementById('terrain-select').value;
      const existed = state.map.grid.tiles.has(key);
      const tile = state.map.grid.ensureTile(q, r);
      if (!existed || tile.terrain !== terrain) {
        tile.terrain = terrain;
        renderMap();
      }
    } else if (state.tool === 'erase') {
      if (!state.map.grid.tiles.has(key)) return;
      state.map.grid.tiles.delete(key);
      if (state.selectedHexId === key) state.selectedHexId = null;
      renderMap();
    }
  }

  svg.addEventListener('pointerdown', (event) => {
    if (event.button === 1) {
      ensureViewBox();
      isPanning = true;
      lastPanPoint = { x: event.clientX, y: event.clientY };
      svg.style.cursor = 'grabbing';
      svg.setPointerCapture(event.pointerId);
      event.preventDefault();
      return;
    }

    if (state.tool !== 'paint' && state.tool !== 'erase') return;
    isPainting = true;
    svg.setPointerCapture(event.pointerId);
    const { x, y } = getSVGCoords(event);
    paintAt(x, y);
    event.preventDefault();
  });

  svg.addEventListener('pointermove', (event) => {
    if (isPanning && lastPanPoint) {
      const vb = ensureViewBox();
      const rect = svg.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const dx = event.clientX - lastPanPoint.x;
        const dy = event.clientY - lastPanPoint.y;
        const svgDx = (dx * vb.width) / rect.width;
        const svgDy = (dy * vb.height) / rect.height;
        setViewBox(vb.x - svgDx, vb.y - svgDy, vb.width, vb.height);
      }
      lastPanPoint = { x: event.clientX, y: event.clientY };
      return;
    }

    if (!isPainting) return;
    const { x, y } = getSVGCoords(event);
    paintAt(x, y);
  });

  svg.addEventListener('wheel', (event) => {
    if (!event.shiftKey) return;
    ensureViewBox();
    zoomAtClientPoint(event, event.deltaY < 0);
    event.preventDefault();
  }, { passive: false });

  const stopPointer = (event) => {
    isPainting = false;
    if (isPanning) {
      isPanning = false;
      lastPanPoint = null;
      svg.style.cursor = '';
    }
    if (event?.pointerId != null && svg.hasPointerCapture(event.pointerId)) {
      svg.releasePointerCapture(event.pointerId);
    }
  };

  svg.addEventListener('pointerup', stopPointer);
  svg.addEventListener('pointercancel', stopPointer);
}
