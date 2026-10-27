import {
  DIRECTION_NEIGHBORS,
  EDGE_INDEX_TO_DIRECTION,
  OVERLAY_DIRECTIONS,
  TERRAIN_PRIORITY_ORDER,
  getBaseTileAsset,
  getLowerPriorityTerrains,
  getOverlayAsset,
  getTerrainPriority,
} from '../terrains/transitions/index.js';

const TILE_SIZE = 64;
const EDITOR_ZOOM_MIN = 0.5;
const EDITOR_ZOOM_MAX = 8;
const HEX_NEIGHBORS = EDGE_INDEX_TO_DIRECTION.map((dir) => DIRECTION_NEIGHBORS[dir]);
const SCENE_HEXES = [
  { key: 'C', label: 'Stred', q: 0, r: 0 },
  { key: 'E', label: 'Vychod', q: 1, r: 0 },
  { key: 'SE', label: 'Jihovychod', q: 0, r: 1 },
  { key: 'SW', label: 'Jihozapad', q: -1, r: 1 },
  { key: 'W', label: 'Zapad', q: -1, r: 0 },
  { key: 'NW', label: 'Severozapad', q: 0, r: -1 },
  { key: 'NE', label: 'Severovychod', q: 1, r: -1 },
];
const SCENE_HEX_BY_KEY = new Map(SCENE_HEXES.map((entry) => [entry.key, entry]));

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function hexToRgba(hex, alpha = 255) {
  const value = hex.replace('#', '');
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  return [r, g, b, alpha];
}

function rgbaToHex(r, g, b) {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function createLayer(id, name) {
  return {
    id,
    name,
    visible: true,
    opacity: 255,
    pixels: new Uint8ClampedArray(TILE_SIZE * TILE_SIZE * 4),
    mask: new Uint8Array(TILE_SIZE * TILE_SIZE).fill(255),
  };
}

function getHexVertices(cx, cy, size) {
  const points = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i);
    points.push({ x: cx + size * Math.cos(a), y: cy + size * Math.sin(a) });
  }
  return points;
}

function getHexCenter(centerX, centerY, radius, q, r) {
  return {
    x: centerX + radius * 1.5 * q,
    y: centerY + radius * Math.sqrt(3) * (r + q / 2),
  };
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Image load failed: ${src}`));
    img.src = `${src}?v=${Date.now()}`;
  });
}

export class TextureLab {
  constructor() {
    this.editorCanvas = document.getElementById('tx-editor-canvas');
    this.previewCanvas = document.getElementById('tx-preview-canvas');
    if (!this.editorCanvas || !this.previewCanvas) return;

    this.editorCtx = this.editorCanvas.getContext('2d', { alpha: true });
    this.previewCtx = this.previewCanvas.getContext('2d', { alpha: true });
    this.editorPickCanvas = document.createElement('canvas');
    this.editorPickCanvas.width = this.editorCanvas.width;
    this.editorPickCanvas.height = this.editorCanvas.height;
    this.editorPickCtx = this.editorPickCanvas.getContext('2d', { alpha: true });
    this.compositeCanvas = document.createElement('canvas');
    this.compositeCanvas.width = TILE_SIZE;
    this.compositeCanvas.height = TILE_SIZE;
    this.compositeCtx = this.compositeCanvas.getContext('2d', { alpha: true });
    this.sampleCanvas = document.createElement('canvas');
    this.sampleCanvas.width = TILE_SIZE;
    this.sampleCanvas.height = TILE_SIZE;
    this.sampleCtx = this.sampleCanvas.getContext('2d', { alpha: true });
    this.backgroundCanvas = document.createElement('canvas');
    this.backgroundCanvas.width = TILE_SIZE;
    this.backgroundCanvas.height = TILE_SIZE;
    this.backgroundCtx = this.backgroundCanvas.getContext('2d', { alpha: true });

    this.baseSelect = document.getElementById('tx-base-select');
    this.overlaySelect = document.getElementById('tx-overlay-select');
    this.directionButtons = Array.from(document.querySelectorAll('.tx-dir-btn'));
    this.colorInput = document.getElementById('tx-color-picker');
    this.alphaInput = document.getElementById('tx-alpha-range');
    this.alphaLabel = document.getElementById('tx-alpha-label');
    this.brushSizeInput = document.getElementById('tx-brush-size');
    this.layerList = document.getElementById('tx-layer-list');
    this.maskToggleBtn = document.getElementById('tx-toggle-mask-btn');
    this.loadInput = document.getElementById('tx-load-png-input');
    this.editorTabBtn = document.getElementById('tx-tab-editor-btn');
    this.previewTabBtn = document.getElementById('tx-tab-preview-btn');
    this.editorPanel = document.getElementById('tx-editor-panel');
    this.previewPanel = document.getElementById('tx-preview-panel');
    this.editGuideWrap = document.getElementById('tx-edit-guide-wrap');
    this.editGuideCanvas = document.getElementById('tx-edit-guide-canvas');
    this.editGuideCtx = this.editGuideCanvas?.getContext('2d', { alpha: true }) || null;
    this.scenePickerWrap = document.getElementById('tx-scene-picker');
    this.scenePickerLabel = document.getElementById('tx-scene-picker-label');
    this.sceneTileSelect = document.getElementById('tx-scene-tile-select');
    this.transitionContextEl = document.getElementById('tx-transition-context');
    this.contextNoteEl = document.getElementById('tx-context-note');
    this.baseCanvas = document.getElementById('tx-base-canvas');
    this.neighborCanvas = document.getElementById('tx-neighbor-canvas');
    this.baseCtx = this.baseCanvas?.getContext('2d', { alpha: true }) || null;
    this.neighborCtx = this.neighborCanvas?.getContext('2d', { alpha: true }) || null;

    this.layers = [];
    this.activeLayerId = null;
    this.nextLayerId = 1;

    this.currentTool = 'brush';
    this.currentColor = '#2f7a3c';
    this.currentAlpha = 255;
    this.brushSize = 1;
    this.editMask = false;
    this.editorZoom = 1;
    this.editorPanX = 0;
    this.editorPanY = 0;
    this.isPanning = false;
    this.lastPanPoint = null;

    this.selection = null;
    this.rectDraft = null;
    this.isDrawing = false;

    this.currentTargetPath = '';
    this.currentTarget = null;
    this.currentBaseTerrain = TERRAIN_PRIORITY_ORDER[0];
    this.currentOverlayTerrain = TERRAIN_PRIORITY_ORDER[1] ?? TERRAIN_PRIORITY_ORDER[0];
    this.currentDirection = OVERLAY_DIRECTIONS[0];
    this.innerTab = 'editor';
    this.ctrlPreviewActive = false;
    this.sceneTiles = Object.fromEntries(SCENE_HEXES.map((entry) => [entry.key, undefined]));
    this.sceneActiveHexKey = 'C';
    this.sceneGuideHitMap = [];
    this.sceneInitialized = false;

    this.imageCache = new Map();

    this.populateTransitionControls();
    this.bindUi();
    this.createBaseLayer();
    this.layoutCanvasDisplays();
    Promise.all(TERRAIN_PRIORITY_ORDER.map((id) => this.getPreviewAsset(getBaseTileAsset(id)))).then(() => this.renderAll());
    this.applyTransitionSelection(true);
  }

  bindUi() {
    this.editorTabBtn.addEventListener('click', () => {
      this.ctrlPreviewActive = false;
      this.setInnerTab('editor');
    });
    this.previewTabBtn.addEventListener('click', () => {
      this.ctrlPreviewActive = false;
      this.setInnerTab('preview');
    });

    window.addEventListener('keydown', (event) => {
      if (event.key !== 'Control' || event.repeat) return;
      if (!document.body.classList.contains('texture-tab-active')) return;
      this.ctrlPreviewActive = true;
      this.setInnerTab('preview');
    });

    window.addEventListener('keyup', (event) => {
      if (event.key !== 'Control') return;
      if (!this.ctrlPreviewActive) return;
      this.ctrlPreviewActive = false;
      this.setInnerTab('editor');
    });

    document.querySelectorAll('.tx-tool-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tx-tool-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentTool = btn.dataset.tool;
      });
    });

    this.baseSelect?.addEventListener('change', () => {
      this.currentBaseTerrain = this.baseSelect.value;
      this.applyTransitionSelection(false);
    });

    this.overlaySelect?.addEventListener('change', () => {
      this.currentOverlayTerrain = this.overlaySelect.value;
      this.rebuildBaseOptions();
      this.applyTransitionSelection(true);
    });

    this.directionButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        this.currentDirection = btn.dataset.dir;
        this.syncDirectionButtons();
        this.applyTransitionSelection(true);
      });
    });

    this.editGuideCanvas?.addEventListener('click', (event) => this.onSceneGuideClick(event));
    this.sceneTileSelect?.addEventListener('change', () => {
      if (!this.sceneActiveHexKey) return;
      const value = this.sceneTileSelect.value || null;
      this.sceneTiles[this.sceneActiveHexKey] = value;
      this.renderAll();
    });

    this.colorInput.addEventListener('input', () => {
      this.currentColor = this.colorInput.value;
    });

    this.alphaInput.addEventListener('input', () => {
      this.currentAlpha = Number(this.alphaInput.value);
      this.alphaLabel.textContent = String(this.currentAlpha);
    });

    this.brushSizeInput.addEventListener('input', () => {
      this.brushSize = clamp(Number(this.brushSizeInput.value) || 1, 1, 16);
      this.brushSizeInput.value = String(this.brushSize);
    });

    document.getElementById('tx-clear-selection-btn').addEventListener('click', () => {
      this.selection = null;
      this.rectDraft = null;
      this.renderAll();
    });

    this.maskToggleBtn.addEventListener('click', () => {
      this.editMask = !this.editMask;
      this.maskToggleBtn.textContent = `Edit masky: ${this.editMask ? 'ON' : 'OFF'}`;
      this.renderAll();
    });

    document.getElementById('tx-add-layer-btn').addEventListener('click', () => {
      const id = this.nextLayerId++;
      this.layers.push(createLayer(id, `Vrstva ${id}`));
      this.activeLayerId = id;
      this.renderLayerList();
      this.renderAll();
    });

    document.getElementById('tx-remove-layer-btn').addEventListener('click', () => {
      if (this.layers.length <= 1) return;
      const idx = this.layers.findIndex((l) => l.id === this.activeLayerId);
      if (idx < 0) return;
      this.layers.splice(idx, 1);
      this.activeLayerId = this.layers[Math.max(0, idx - 1)].id;
      this.renderLayerList();
      this.renderAll();
    });

    document.getElementById('tx-layer-up-btn').addEventListener('click', () => {
      const idx = this.layers.findIndex((l) => l.id === this.activeLayerId);
      if (idx <= 0) return;
      const tmp = this.layers[idx - 1];
      this.layers[idx - 1] = this.layers[idx];
      this.layers[idx] = tmp;
      this.renderLayerList();
      this.renderAll();
    });

    document.getElementById('tx-layer-down-btn').addEventListener('click', () => {
      const idx = this.layers.findIndex((l) => l.id === this.activeLayerId);
      if (idx < 0 || idx >= this.layers.length - 1) return;
      const tmp = this.layers[idx + 1];
      this.layers[idx + 1] = this.layers[idx];
      this.layers[idx] = tmp;
      this.renderLayerList();
      this.renderAll();
    });

    document.getElementById('tx-load-png-btn').addEventListener('click', () => this.loadInput.click());

    this.loadInput.addEventListener('change', async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      await this.importTextureFromFile(file);
      this.loadInput.value = '';
    });

    document.getElementById('tx-save-png-btn').addEventListener('click', () => this.saveCurrentTexture());

    document.getElementById('tx-reset-btn').addEventListener('click', () => {
      this.loadTargetTexture(this.currentTargetPath);
    });

    this.editorCanvas.addEventListener('pointerdown', (event) => this.onPointerDown(event));
    this.editorCanvas.addEventListener('pointermove', (event) => this.onPointerMove(event));
    this.editorCanvas.addEventListener('pointerup', (event) => this.onPointerUp(event));
    this.editorCanvas.addEventListener('pointercancel', (event) => this.onPointerUp(event));
    this.editorCanvas.addEventListener('pointerleave', (event) => {
      if (!this.editorCanvas.hasPointerCapture(event.pointerId)) {
        this.onPointerUp(event);
      }
    });
    this.editorCanvas.addEventListener('wheel', (event) => {
      if (!event.shiftKey) return;
      event.preventDefault();
      const factor = event.deltaY < 0 ? 1.1 : 0.9;
      this.editorZoom = clamp(this.editorZoom * factor, EDITOR_ZOOM_MIN, EDITOR_ZOOM_MAX);
      this.renderEditor();
    }, { passive: false });

    window.addEventListener('resize', () => {
      this.layoutCanvasDisplays();
      this.renderAll();
    });
  }

  populateTransitionControls() {
    if (!this.overlaySelect || !this.baseSelect) return;

    this.overlaySelect.innerHTML = '';
    TERRAIN_PRIORITY_ORDER.forEach((terrainId) => {
      if (getLowerPriorityTerrains(terrainId).length === 0) return;
      const opt = document.createElement('option');
      opt.value = terrainId;
      opt.textContent = terrainId;
      this.overlaySelect.appendChild(opt);
    });

    if (!Array.from(this.overlaySelect.options).some((opt) => opt.value === this.currentOverlayTerrain)) {
      this.currentOverlayTerrain = this.overlaySelect.value;
    }
    this.overlaySelect.value = this.currentOverlayTerrain;

    this.rebuildBaseOptions();
    this.syncDirectionButtons();
  }

  rebuildBaseOptions() {
    if (!this.baseSelect) return;
    const lowers = getLowerPriorityTerrains(this.currentOverlayTerrain);
    this.baseSelect.innerHTML = '';
    lowers.forEach((terrainId) => {
      const opt = document.createElement('option');
      opt.value = terrainId;
      opt.textContent = terrainId;
      this.baseSelect.appendChild(opt);
    });

    if (!lowers.includes(this.currentBaseTerrain)) {
      this.currentBaseTerrain = lowers[lowers.length - 1] || this.currentOverlayTerrain;
    }
    this.baseSelect.value = this.currentBaseTerrain;
  }

  syncDirectionButtons() {
    this.directionButtons.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.dir === this.currentDirection);
    });
  }

  applyTransitionSelection(reloadTexture) {
    this.currentTarget = {
      type: 'overlay',
      terrainId: this.currentOverlayTerrain,
      direction: this.currentDirection,
    };
    this.syncSceneDefaultsWithSelection();
    this.sceneActiveHexKey = this.currentDirection;
    this.currentTargetPath = getOverlayAsset(this.currentOverlayTerrain, this.currentDirection);
    this.editMask = false;
    this.maskToggleBtn.textContent = 'Edit masky: OFF';
    if (this.scenePickerWrap) this.scenePickerWrap.hidden = true;
    if (this.scenePickerLabel) {
      const spec = SCENE_HEX_BY_KEY.get(this.sceneActiveHexKey);
      this.scenePickerLabel.textContent = `Hex ${spec?.label || this.sceneActiveHexKey}`;
    }
    if (this.sceneTileSelect) {
      const value = this.sceneTiles[this.sceneActiveHexKey];
      this.sceneTileSelect.value = value ?? '';
    }

    if (reloadTexture) this.loadTargetTexture(this.currentTargetPath);
    else this.renderAll();
    this.renderTransitionContext();
  }

  fitCanvasToWrap(canvas) {
    if (!canvas) return;
    const wrap = canvas.closest('.tx-canvas-wrap, .tx-edit-guide-wrap');
    if (!wrap) return;
    const title = wrap.querySelector('h3');
    const titleH = title ? title.offsetHeight + 12 : 0;
    const availW = Math.max(120, wrap.clientWidth - 20);
    const availH = Math.max(120, wrap.clientHeight - titleH - 14);
    const ratio = canvas.width / canvas.height;

    let drawW = availW;
    let drawH = drawW / ratio;
    if (drawH > availH) {
      drawH = availH;
      drawW = drawH * ratio;
    }

    canvas.style.width = `${Math.floor(drawW)}px`;
    canvas.style.height = `${Math.floor(drawH)}px`;
  }

  layoutCanvasDisplays() {
    this.fitCanvasToWrap(this.editorCanvas);
    this.fitCanvasToWrap(this.previewCanvas);
    this.fitCanvasToWrap(this.editGuideCanvas);
  }

  setInnerTab(tab) {
    this.innerTab = tab;
    const isEditor = tab === 'editor';
    this.editorTabBtn.classList.toggle('active', isEditor);
    this.previewTabBtn.classList.toggle('active', !isEditor);
    this.editorPanel.classList.toggle('active', isEditor);
    this.previewPanel.classList.toggle('active', !isEditor);
    requestAnimationFrame(() => {
      this.layoutCanvasDisplays();
      this.renderAll();
    });
    if (!isEditor) this.renderPreview();
  }

  getEditorPixelSize() {
    return Math.max(1, Math.floor(Math.min(this.editorCanvas.width, this.editorCanvas.height) / TILE_SIZE));
  }

  getEffectiveTool(event) {
    if (this.currentTool === 'brush' && event?.shiftKey) return 'picker';
    return this.currentTool;
  }

  getEditorDrawMetrics() {
    const pixelSize = this.getEditorPixelSize();
    const unit = Math.max(1, Math.round(pixelSize * this.editorZoom));
    const drawW = TILE_SIZE * unit;
    const drawH = TILE_SIZE * unit;
    const offsetX = (this.editorCanvas.width - drawW) * 0.5 + this.editorPanX;
    const offsetY = (this.editorCanvas.height - drawH) * 0.5 + this.editorPanY;
    return { pixelSize, unit, drawW, drawH, offsetX, offsetY };
  }

  isTransitionScene() {
    return this.currentTarget?.type === 'overlay';
  }

  ensureSceneInitialized() {
    if (this.sceneInitialized) return;
    this.sceneTiles.C = this.currentBaseTerrain;
    this.sceneTiles[this.currentDirection] = this.currentOverlayTerrain;
    this.sceneActiveHexKey = this.currentDirection;
    this.sceneInitialized = true;
    this.populateSceneTileSelect();
  }

  syncSceneDefaultsWithSelection() {
    this.ensureSceneInitialized();
    if (this.sceneTiles.C === undefined) this.sceneTiles.C = this.currentBaseTerrain;
    if (this.sceneTiles[this.currentDirection] === undefined) {
      this.sceneTiles[this.currentDirection] = this.currentOverlayTerrain;
    }
  }

  populateSceneTileSelect() {
    if (!this.sceneTileSelect) return;
    this.sceneTileSelect.innerHTML = '';

    const noneOpt = document.createElement('option');
    noneOpt.value = '';
    noneOpt.textContent = '(nic)';
    this.sceneTileSelect.appendChild(noneOpt);

    TERRAIN_PRIORITY_ORDER.forEach((terrainId) => {
      const opt = document.createElement('option');
      opt.value = terrainId;
      opt.textContent = terrainId;
      this.sceneTileSelect.appendChild(opt);
    });
  }

  getSceneLayout(centerX, centerY, radius) {
    this.ensureSceneInitialized();
    return SCENE_HEXES.map((entry) => ({
      ...entry,
      terrainId: this.sceneTiles[entry.key] ?? null,
      ...getHexCenter(centerX, centerY, radius, entry.q, entry.r),
    }));
  }

  getSceneCenterTerrain() {
    this.ensureSceneInitialized();
    if (this.sceneTiles.C !== undefined) return this.sceneTiles.C;
    return this.currentBaseTerrain;
  }

  getSceneTerrainByDirection(direction) {
    this.ensureSceneInitialized();
    if (!direction) return null;
    const value = this.sceneTiles[direction];
    if (value !== undefined) return value;
    return direction === this.currentDirection ? this.currentOverlayTerrain : null;
  }

  shouldApplyCurrentOverlayOnCenter() {
    const centerTerrain = this.getSceneCenterTerrain();
    const neighborTerrain = this.getSceneTerrainByDirection(this.currentDirection);
    if (!centerTerrain || !neighborTerrain) return false;
    return getTerrainPriority(neighborTerrain) > getTerrainPriority(centerTerrain);
  }

  getOverlayCanvasCached(terrainId, direction) {
    if (!terrainId || !direction) return null;
    if (this.currentTarget?.type === 'overlay'
      && this.currentTarget.terrainId === terrainId
      && this.currentTarget.direction === direction) {
      return this.compositeCanvas;
    }
    const path = getOverlayAsset(terrainId, direction);
    if (!path) return null;
    return this.imageCache.get(path) || null;
  }

  pointInPolygon(x, y, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].x;
      const yi = polygon[i].y;
      const xj = polygon[j].x;
      const yj = polygon[j].y;
      const crosses = yi > y !== yj > y;
      if (!crosses) continue;
      const xCross = ((xj - xi) * (y - yi)) / (yj - yi) + xi;
      if (x < xCross) inside = !inside;
    }
    return inside;
  }

  onSceneGuideClick(event) {
    if (!this.isTransitionScene()) return;
    if (!this.sceneGuideHitMap.length) return;

    const rect = this.editGuideCanvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) * (this.editGuideCanvas.width / rect.width);
    const y = (event.clientY - rect.top) * (this.editGuideCanvas.height / rect.height);

    const hit = this.sceneGuideHitMap.find((entry) => this.pointInPolygon(x, y, entry.polygon));
    if (!hit) return;

    this.sceneActiveHexKey = hit.key;
    const spec = SCENE_HEX_BY_KEY.get(hit.key);
    if (this.scenePickerLabel) {
      const name = spec?.label || hit.key;
      this.scenePickerLabel.textContent = `Hex ${name}`;
    }
    if (this.sceneTileSelect) {
      const value = this.sceneTiles[hit.key] ?? '';
      this.sceneTileSelect.value = value;
      this.sceneTileSelect.focus();
    }
    if (this.scenePickerWrap) this.scenePickerWrap.hidden = false;
    this.drawNeighborGuide();
  }

  async renderTransitionContext() {
    if (!this.transitionContextEl || !this.baseCtx || !this.neighborCtx) return;

    const isTransition = this.isTransitionScene();
    this.transitionContextEl.style.display = isTransition ? 'block' : 'none';
    if (!isTransition) return;

    this.syncSceneDefaultsWithSelection();
    const centerTerrain = this.getSceneCenterTerrain();
    const neighborTerrain = this.getSceneTerrainByDirection(this.currentDirection);
    const base = centerTerrain ? await this.getPreviewAsset(getBaseTileAsset(centerTerrain)) : null;
    const neighbor = neighborTerrain ? await this.getPreviewAsset(getBaseTileAsset(neighborTerrain)) : null;
    this.baseCtx.clearRect(0, 0, TILE_SIZE, TILE_SIZE);
    this.neighborCtx.clearRect(0, 0, TILE_SIZE, TILE_SIZE);
    this.baseCtx.imageSmoothingEnabled = false;
    this.neighborCtx.imageSmoothingEnabled = false;
    if (base) this.baseCtx.drawImage(base, 0, 0, TILE_SIZE, TILE_SIZE);
    if (neighbor) this.neighborCtx.drawImage(neighbor, 0, 0, TILE_SIZE, TILE_SIZE);

    if (this.contextNoteEl) {
      this.contextNoteEl.textContent = `Klikni na hex v panelu napravo a zvol tile. (nic) ho skryje v editoru i nahledu.`;
    }
  }

  drawHexPath(ctx, cx, cy, radius) {
    const verts = getHexVertices(cx, cy, radius);
    ctx.beginPath();
    ctx.moveTo(verts[0].x, verts[0].y);
    for (let i = 1; i < verts.length; i++) ctx.lineTo(verts[i].x, verts[i].y);
    ctx.closePath();
  }

  renderBackgroundSample() {
    const ctx = this.backgroundCtx;
    if (!ctx) return;

    ctx.clearRect(0, 0, TILE_SIZE, TILE_SIZE);
    ctx.imageSmoothingEnabled = false;

    if (!this.isTransitionScene()) {
      ctx.drawImage(this.compositeCanvas, 0, 0, TILE_SIZE, TILE_SIZE);
      return;
    }

    this.syncSceneDefaultsWithSelection();
    const centerTerrain = this.getSceneCenterTerrain();
    if (!centerTerrain) return;

    const centerTexture = this.imageCache.get(getBaseTileAsset(centerTerrain));
    if (centerTexture) ctx.drawImage(centerTexture, 0, 0, TILE_SIZE, TILE_SIZE);

    for (let edgeIdx = 0; edgeIdx < EDGE_INDEX_TO_DIRECTION.length; edgeIdx++) {
      const dir = EDGE_INDEX_TO_DIRECTION[edgeIdx];
      const neighborTerrain = this.getSceneTerrainByDirection(dir);
      if (!neighborTerrain) continue;
      if (getTerrainPriority(neighborTerrain) <= getTerrainPriority(centerTerrain)) continue;
      if (dir === this.currentDirection) continue;
      const overlay = this.getOverlayCanvasCached(neighborTerrain, dir);
      if (!overlay) continue;
      ctx.drawImage(overlay, 0, 0, TILE_SIZE, TILE_SIZE);
    }
  }

  async drawNeighborGuide() {
    if (!this.editGuideCtx || !this.editGuideWrap) return;

    const isTransition = this.isTransitionScene();
    this.editGuideWrap.style.display = isTransition ? 'block' : 'none';
    if (!isTransition) return;

    const ctx = this.editGuideCtx;
    const w = this.editGuideCanvas.width;
    const h = this.editGuideCanvas.height;
    ctx.clearRect(0, 0, w, h);
    this.syncSceneDefaultsWithSelection();

    const center = { x: w * 0.52, y: h * 0.52 };
    const radius = 46;
    const overlaySize = Math.round(radius * 2);
    const layout = this.getSceneLayout(center.x, center.y, radius);
    const byCoord = new Map(layout.map((tile) => [`${tile.q},${tile.r}`, tile]));
    this.sceneGuideHitMap = [];

    for (const tile of layout) {
      const polygon = getHexVertices(tile.x, tile.y, radius);
      this.sceneGuideHitMap.push({ key: tile.key, polygon });
      if (!tile.terrainId) continue;
      const texture = await this.getPreviewAsset(getBaseTileAsset(tile.terrainId));
      this.drawHexWithTexture(ctx, tile.x, tile.y, radius, texture);
    }

    for (const tile of layout) {
      if (!tile.terrainId) continue;
      const tilePriority = getTerrainPriority(tile.terrainId);
      for (let edgeIdx = 0; edgeIdx < HEX_NEIGHBORS.length; edgeIdx++) {
        const neighborOffset = HEX_NEIGHBORS[edgeIdx];
        const neighbor = byCoord.get(`${tile.q + neighborOffset.dq},${tile.r + neighborOffset.dr}`);
        if (!neighbor?.terrainId || neighbor.terrainId === tile.terrainId) continue;
        if (getTerrainPriority(neighbor.terrainId) <= tilePriority) continue;
        const dir = EDGE_INDEX_TO_DIRECTION[edgeIdx];
        const overlay = await this.getOverlayCanvasForDirection(neighbor.terrainId, dir);
        if (!overlay) continue;
        this.drawEdgeOverlay(ctx, tile.x, tile.y, radius, edgeIdx, overlay, overlaySize);
      }
    }

    this.sceneGuideHitMap.forEach((entry) => {
      const active = entry.key === this.sceneActiveHexKey;
      ctx.beginPath();
      ctx.moveTo(entry.polygon[0].x, entry.polygon[0].y);
      for (let i = 1; i < entry.polygon.length; i++) ctx.lineTo(entry.polygon[i].x, entry.polygon[i].y);
      ctx.closePath();
      ctx.strokeStyle = active ? '#fbbf24' : 'rgba(229, 231, 235, 0.55)';
      ctx.lineWidth = active ? 2.2 : 1;
      ctx.stroke();
    });

    this.renderEditor();
  }

  async getOverlayCanvasForDirection(terrainId, direction) {
    if (this.currentTarget?.type === 'overlay'
      && this.currentTarget.terrainId === terrainId
      && this.currentTarget.direction === direction) {
      return this.compositeCanvas;
    }
    return this.getPreviewAsset(getOverlayAsset(terrainId, direction));
  }

  createBaseLayer() {
    const base = createLayer(this.nextLayerId++, 'Base');
    this.layers = [base];
    this.activeLayerId = base.id;
    this.renderLayerList();
  }

  async loadTargetTexture(path) {
    try {
      const img = await loadImage(path);
      const temp = document.createElement('canvas');
      temp.width = TILE_SIZE;
      temp.height = TILE_SIZE;
      const ctx = temp.getContext('2d', { alpha: true });
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, TILE_SIZE, TILE_SIZE);
      ctx.drawImage(img, 0, 0, TILE_SIZE, TILE_SIZE);
      const data = ctx.getImageData(0, 0, TILE_SIZE, TILE_SIZE).data;

      const base = createLayer(1, 'Base');
      base.pixels.set(data);
      this.layers = [base];
      this.activeLayerId = 1;
      this.nextLayerId = 2;
      this.selection = null;
      this.rectDraft = null;
      this.renderLayerList();
      this.renderTransitionContext();
      this.renderAll();
    } catch {
      this.layers = [createLayer(1, 'Base')];
      this.activeLayerId = 1;
      this.nextLayerId = 2;
      this.selection = null;
      this.rectDraft = null;
      this.renderLayerList();
      this.renderTransitionContext();
      this.renderAll();
    }
  }

  async importTextureFromFile(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((resolve, reject) => {
        const element = new Image();
        element.onload = () => resolve(element);
        element.onerror = () => reject(new Error('PNG import failed'));
        element.src = url;
      });

      const temp = document.createElement('canvas');
      temp.width = TILE_SIZE;
      temp.height = TILE_SIZE;
      const ctx = temp.getContext('2d', { alpha: true });
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, TILE_SIZE, TILE_SIZE);

      const scale = Math.min(TILE_SIZE / img.width, TILE_SIZE / img.height);
      const drawW = Math.max(1, Math.floor(img.width * scale));
      const drawH = Math.max(1, Math.floor(img.height * scale));
      const offsetX = Math.floor((TILE_SIZE - drawW) / 2);
      const offsetY = Math.floor((TILE_SIZE - drawH) / 2);
      ctx.drawImage(img, 0, 0, img.width, img.height, offsetX, offsetY, drawW, drawH);

      const data = ctx.getImageData(0, 0, TILE_SIZE, TILE_SIZE).data;
      const layer = this.getActiveLayer();
      layer.pixels.set(data);
      layer.mask.fill(255);
      this.renderAll();
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  saveCurrentTexture() {
    this.rebuildComposite();
    const dataUrl = this.compositeCanvas.toDataURL('image/png');
    const a = document.createElement('a');
    const fileName = this.currentTargetPath.split('/').slice(-1)[0] || 'texture.png';
    a.href = dataUrl;
    a.download = fileName;
    a.click();
  }

  renderLayerList() {
    this.layerList.innerHTML = '';
    this.layers
      .slice()
      .reverse()
      .forEach((layer) => {
        const li = document.createElement('li');
        const row = document.createElement('div');
        row.className = 'tx-layer-row';

        const active = document.createElement('input');
        active.type = 'radio';
        active.name = 'tx-layer-active';
        active.checked = layer.id === this.activeLayerId;
        active.addEventListener('change', () => {
          this.activeLayerId = layer.id;
          this.renderLayerList();
        });

        const visible = document.createElement('input');
        visible.type = 'checkbox';
        visible.checked = layer.visible;
        visible.addEventListener('change', () => {
          layer.visible = visible.checked;
          this.renderAll();
        });

        const name = document.createElement('input');
        name.type = 'text';
        name.value = layer.name;
        name.className = 'tx-layer-name';
        name.addEventListener('input', () => {
          layer.name = name.value || 'Vrstva';
        });

        row.appendChild(active);
        row.appendChild(visible);
        row.appendChild(name);
        li.appendChild(row);

        const opacity = document.createElement('input');
        opacity.type = 'range';
        opacity.min = '0';
        opacity.max = '255';
        opacity.value = String(layer.opacity);
        opacity.addEventListener('input', () => {
          layer.opacity = Number(opacity.value);
          this.renderAll();
        });
        li.appendChild(opacity);

        this.layerList.appendChild(li);
      });
  }

  getActiveLayer() {
    return this.layers.find((l) => l.id === this.activeLayerId) || this.layers[0];
  }

  getPixelFromPointer(event) {
    const coords = this.getCanvasCoordsFromPointer(event);
    if (!coords) return null;
    const { canvasX, canvasY } = coords;
    const { unit, drawW, drawH, offsetX, offsetY } = this.getEditorDrawMetrics();
    if (canvasX < offsetX || canvasY < offsetY || canvasX > offsetX + drawW || canvasY > offsetY + drawH) {
      return null;
    }
    const x = Math.floor((canvasX - offsetX) / unit);
    const y = Math.floor((canvasY - offsetY) / unit);
    return {
      x: clamp(x, 0, TILE_SIZE - 1),
      y: clamp(y, 0, TILE_SIZE - 1),
    };
  }

  getCanvasCoordsFromPointer(event) {
    const rect = this.editorCanvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const canvasX = (event.clientX - rect.left) * (this.editorCanvas.width / rect.width);
    const canvasY = (event.clientY - rect.top) * (this.editorCanvas.height / rect.height);
    return { canvasX, canvasY };
  }

  ensureEditorPickSize() {
    if (!this.editorPickCanvas) return;
    if (
      this.editorPickCanvas.width !== this.editorCanvas.width
      || this.editorPickCanvas.height !== this.editorCanvas.height
    ) {
      this.editorPickCanvas.width = this.editorCanvas.width;
      this.editorPickCanvas.height = this.editorCanvas.height;
    }
  }

  renderEditorPickBuffer() {
    this.ensureEditorPickSize();
    const ctx = this.editorPickCtx;
    if (!ctx) return;

    const w = this.editorPickCanvas.width;
    const h = this.editorPickCanvas.height;
    const { drawW, drawH, offsetX, offsetY } = this.getEditorDrawMetrics();
    ctx.clearRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = false;

    if (this.isTransitionScene()) {
      const cx = offsetX + drawW * 0.5;
      const cy = offsetY + drawH * 0.5;
      const radius = drawW * 0.5;

      this.drawSceneCached(ctx, cx, cy, radius, true);
      ctx.save();
      this.drawHexPath(ctx, cx, cy, radius);
      ctx.clip();
      ctx.drawImage(this.backgroundCanvas, offsetX, offsetY, drawW, drawH);
      if (this.shouldApplyCurrentOverlayOnCenter()) {
        ctx.drawImage(this.compositeCanvas, offsetX, offsetY, drawW, drawH);
      }
      ctx.restore();
      return;
    }

    ctx.drawImage(this.compositeCanvas, offsetX, offsetY, drawW, drawH);
  }

  pickColorFromEditorScene(event) {
    const coords = this.getCanvasCoordsFromPointer(event);
    if (!coords) return;
    this.rebuildComposite();
    this.renderBackgroundSample();
    this.renderEditorPickBuffer();
    const { canvasX, canvasY } = coords;
    const sx = clamp(Math.floor(canvasX), 0, this.editorPickCanvas.width - 1);
    const sy = clamp(Math.floor(canvasY), 0, this.editorPickCanvas.height - 1);
    const data = this.editorPickCtx.getImageData(sx, sy, 1, 1).data;
    this.currentColor = rgbaToHex(data[0], data[1], data[2]);
    this.currentAlpha = data[3];
    this.colorInput.value = this.currentColor;
    this.alphaInput.value = String(this.currentAlpha);
    this.alphaLabel.textContent = String(this.currentAlpha);
  }

  onPointerDown(event) {
    if (event.pointerType === 'touch') return;

    if (event.button === 1) {
      this.isPanning = true;
      this.lastPanPoint = { x: event.clientX, y: event.clientY };
      this.editorCanvas.style.cursor = 'grabbing';
      this.editorCanvas.setPointerCapture(event.pointerId);
      event.preventDefault();
      return;
    }
    if (event.button !== 0) return;

    if (event.pointerId != null) {
      this.editorCanvas.setPointerCapture(event.pointerId);
    }

    const tool = this.getEffectiveTool(event);
    if (tool === 'picker') {
      this.isDrawing = true;
      this.pickColorFromEditorScene(event);
      return;
    }

    const p = this.getPixelFromPointer(event);
    if (!p) return;
    this.isDrawing = true;

    if (tool === 'rect') {
      this.rectDraft = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
      this.renderEditor();
      return;
    }

    this.applyToolAt(p.x, p.y, tool);
  }

  onPointerMove(event) {
    if (event.pointerType === 'touch') return;

    if (this.isPanning && this.lastPanPoint) {
      const rect = this.editorCanvas.getBoundingClientRect();
      const scaleX = this.editorCanvas.width / rect.width;
      const scaleY = this.editorCanvas.height / rect.height;
      this.editorPanX += (event.clientX - this.lastPanPoint.x) * scaleX;
      this.editorPanY += (event.clientY - this.lastPanPoint.y) * scaleY;
      this.lastPanPoint = { x: event.clientX, y: event.clientY };
      this.renderEditor();
      return;
    }

    if (!this.isDrawing) return;
    const tool = this.getEffectiveTool(event);
    if (tool === 'picker') {
      this.pickColorFromEditorScene(event);
      return;
    }

    const p = this.getPixelFromPointer(event);
    if (!p) return;

    if (this.currentTool === 'rect' && tool === 'rect') {
      if (!this.rectDraft) return;
      this.rectDraft.x1 = p.x;
      this.rectDraft.y1 = p.y;
      this.renderEditor();
      return;
    }

    if (tool === 'fill') return;
    this.applyToolAt(p.x, p.y, tool);
  }

  onPointerUp(event) {
    if (event?.pointerType === 'touch') return;

    if (event?.pointerId != null && this.editorCanvas.hasPointerCapture(event.pointerId)) {
      this.editorCanvas.releasePointerCapture(event.pointerId);
    }

    if (this.isPanning) {
      this.isPanning = false;
      this.lastPanPoint = null;
      this.editorCanvas.style.cursor = '';
      return;
    }

    if (this.currentTool === 'rect' && this.rectDraft) {
      this.selection = {
        x0: Math.min(this.rectDraft.x0, this.rectDraft.x1),
        y0: Math.min(this.rectDraft.y0, this.rectDraft.y1),
        x1: Math.max(this.rectDraft.x0, this.rectDraft.x1),
        y1: Math.max(this.rectDraft.y0, this.rectDraft.y1),
      };
      this.rectDraft = null;
      this.renderAll();
    }
    this.isDrawing = false;
  }

  isInsideSelection(x, y) {
    if (!this.selection) return true;
    return x >= this.selection.x0 && x <= this.selection.x1 && y >= this.selection.y0 && y <= this.selection.y1;
  }

  renderVisibleSample() {
    const ctx = this.sampleCtx;
    if (!ctx) return;

    this.renderBackgroundSample();
    ctx.clearRect(0, 0, TILE_SIZE, TILE_SIZE);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.backgroundCanvas, 0, 0, TILE_SIZE, TILE_SIZE);
    ctx.drawImage(this.compositeCanvas, 0, 0, TILE_SIZE, TILE_SIZE);
  }

  transferColorFromSource(x, y, sourceCtx) {
    if (!sourceCtx) return;
    const active = this.getActiveLayer();

    for (let oy = -(this.brushSize - 1); oy <= this.brushSize - 1; oy++) {
      for (let ox = -(this.brushSize - 1); ox <= this.brushSize - 1; ox++) {
        const px = x + ox;
        const py = y + oy;
        if (px < 0 || py < 0 || px >= TILE_SIZE || py >= TILE_SIZE) continue;
        if (!this.isInsideSelection(px, py)) continue;

        const src = sourceCtx.getImageData(px, py, 1, 1).data;
        const idx = (py * TILE_SIZE + px) * 4;
        active.pixels[idx + 0] = src[0];
        active.pixels[idx + 1] = src[1];
        active.pixels[idx + 2] = src[2];
        active.pixels[idx + 3] = src[3];
      }
    }
  }

  applyToolAt(x, y, tool = this.currentTool) {
    if (!this.isInsideSelection(x, y)) return;

    if (tool === 'picker') {
      this.rebuildComposite();
      this.renderVisibleSample();
      const data = this.sampleCtx.getImageData(x, y, 1, 1).data;
      this.currentColor = rgbaToHex(data[0], data[1], data[2]);
      this.currentAlpha = data[3];
      this.colorInput.value = this.currentColor;
      this.alphaInput.value = String(this.currentAlpha);
      this.alphaLabel.textContent = String(this.currentAlpha);
      return;
    }

    if (tool === 'fgpick') {
      if (this.editMask) return;
      this.rebuildComposite();
      this.transferColorFromSource(x, y, this.compositeCtx);
      this.renderAll();
      return;
    }

    if (tool === 'bgpick') {
      if (this.editMask) return;
      this.rebuildComposite();
      this.renderBackgroundSample();
      this.transferColorFromSource(x, y, this.backgroundCtx);
      this.renderAll();
      return;
    }

    if (tool === 'fill') {
      this.floodFill(x, y);
      this.renderAll();
      return;
    }

    const active = this.getActiveLayer();
    for (let oy = -(this.brushSize - 1); oy <= this.brushSize - 1; oy++) {
      for (let ox = -(this.brushSize - 1); ox <= this.brushSize - 1; ox++) {
        const px = x + ox;
        const py = y + oy;
        if (px < 0 || py < 0 || px >= TILE_SIZE || py >= TILE_SIZE) continue;
        if (!this.isInsideSelection(px, py)) continue;

        if (this.editMask) {
          const mIndex = py * TILE_SIZE + px;
          if (tool === 'eraser') active.mask[mIndex] = 0;
          else active.mask[mIndex] = 255;
          continue;
        }

        const idx = (py * TILE_SIZE + px) * 4;
        if (tool === 'eraser') {
          active.pixels[idx + 0] = 0;
          active.pixels[idx + 1] = 0;
          active.pixels[idx + 2] = 0;
          active.pixels[idx + 3] = 0;
        } else {
          const [r, g, b, a] = hexToRgba(this.currentColor, this.currentAlpha);
          active.pixels[idx + 0] = r;
          active.pixels[idx + 1] = g;
          active.pixels[idx + 2] = b;
          active.pixels[idx + 3] = a;
        }
      }
    }

    this.renderAll();
  }

  floodFill(x, y) {
    const layer = this.getActiveLayer();
    const queue = [[x, y]];
    const seen = new Uint8Array(TILE_SIZE * TILE_SIZE);

    if (this.editMask) {
      const target = layer.mask[y * TILE_SIZE + x];
      const replacement = this.currentTool === 'eraser' ? 0 : 255;
      if (target === replacement) return;
      while (queue.length) {
        const [cx, cy] = queue.pop();
        const i = cy * TILE_SIZE + cx;
        if (seen[i]) continue;
        seen[i] = 1;
        if (!this.isInsideSelection(cx, cy)) continue;
        if (layer.mask[i] !== target) continue;
        layer.mask[i] = replacement;
        if (cx > 0) queue.push([cx - 1, cy]);
        if (cx < TILE_SIZE - 1) queue.push([cx + 1, cy]);
        if (cy > 0) queue.push([cx, cy - 1]);
        if (cy < TILE_SIZE - 1) queue.push([cx, cy + 1]);
      }
      return;
    }

    const startIdx = (y * TILE_SIZE + x) * 4;
    const target = [
      layer.pixels[startIdx + 0],
      layer.pixels[startIdx + 1],
      layer.pixels[startIdx + 2],
      layer.pixels[startIdx + 3],
    ];
    const replacement = this.currentTool === 'eraser' ? [0, 0, 0, 0] : hexToRgba(this.currentColor, this.currentAlpha);
    if (target.every((v, i) => v === replacement[i])) return;

    while (queue.length) {
      const [cx, cy] = queue.pop();
      const i = cy * TILE_SIZE + cx;
      if (seen[i]) continue;
      seen[i] = 1;
      if (!this.isInsideSelection(cx, cy)) continue;
      const idx = i * 4;
      if (
        layer.pixels[idx + 0] !== target[0] ||
        layer.pixels[idx + 1] !== target[1] ||
        layer.pixels[idx + 2] !== target[2] ||
        layer.pixels[idx + 3] !== target[3]
      ) {
        continue;
      }
      layer.pixels[idx + 0] = replacement[0];
      layer.pixels[idx + 1] = replacement[1];
      layer.pixels[idx + 2] = replacement[2];
      layer.pixels[idx + 3] = replacement[3];
      if (cx > 0) queue.push([cx - 1, cy]);
      if (cx < TILE_SIZE - 1) queue.push([cx + 1, cy]);
      if (cy > 0) queue.push([cx, cy - 1]);
      if (cy < TILE_SIZE - 1) queue.push([cx, cy + 1]);
    }
  }

  rebuildComposite() {
    const image = this.compositeCtx.createImageData(TILE_SIZE, TILE_SIZE);
    const out = image.data;

    for (let i = 0; i < TILE_SIZE * TILE_SIZE; i++) {
      let or = 0;
      let og = 0;
      let ob = 0;
      let oa = 0;

      this.layers.forEach((layer) => {
        if (!layer.visible) return;
        if (layer.mask[i] === 0) return;

        const idx = i * 4;
        const la = (layer.pixels[idx + 3] / 255) * (layer.opacity / 255);
        if (la <= 0) return;

        const lr = layer.pixels[idx + 0] / 255;
        const lg = layer.pixels[idx + 1] / 255;
        const lb = layer.pixels[idx + 2] / 255;

        const inv = 1 - la;
        or = lr * la + or * inv;
        og = lg * la + og * inv;
        ob = lb * la + ob * inv;
        oa = la + oa * inv;
      });

      const o = i * 4;
      out[o + 0] = Math.round(or * 255);
      out[o + 1] = Math.round(og * 255);
      out[o + 2] = Math.round(ob * 255);
      out[o + 3] = Math.round(oa * 255);
    }

    this.compositeCtx.putImageData(image, 0, 0);
  }

  renderEditor() {
    const ctx = this.editorCtx;
    const w = this.editorCanvas.width;
    const h = this.editorCanvas.height;
    const { unit, drawW, drawH, offsetX, offsetY } = this.getEditorDrawMetrics();
    ctx.clearRect(0, 0, w, h);

    this.rebuildComposite();
    this.renderBackgroundSample();

    ctx.imageSmoothingEnabled = false;
    if (this.isTransitionScene()) {
      const cx = offsetX + drawW * 0.5;
      const cy = offsetY + drawH * 0.5;
      const radius = drawW * 0.5;

      this.drawSceneCached(ctx, cx, cy, radius, true);

      // Overlay editing is shown as pure layering inside one final hex cutout.
      ctx.save();
      this.drawHexPath(ctx, cx, cy, radius);
      ctx.clip();
      ctx.drawImage(this.backgroundCanvas, offsetX, offsetY, drawW, drawH);
      if (this.shouldApplyCurrentOverlayOnCenter()) {
        ctx.drawImage(this.compositeCanvas, offsetX, offsetY, drawW, drawH);
      }
      ctx.restore();

      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      this.drawHexPath(ctx, cx, cy, radius);
      ctx.stroke();
    } else {
      ctx.drawImage(this.compositeCanvas, offsetX, offsetY, drawW, drawH);
    }

    ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= TILE_SIZE; x++) {
      ctx.beginPath();
      ctx.moveTo(offsetX + x * unit + 0.5, offsetY);
      ctx.lineTo(offsetX + x * unit + 0.5, offsetY + drawH);
      ctx.stroke();
    }
    for (let y = 0; y <= TILE_SIZE; y++) {
      ctx.beginPath();
      ctx.moveTo(offsetX, offsetY + y * unit + 0.5);
      ctx.lineTo(offsetX + drawW, offsetY + y * unit + 0.5);
      ctx.stroke();
    }

    const active = this.getActiveLayer();
    if (this.editMask && active) {
      ctx.fillStyle = 'rgba(255, 80, 80, 0.25)';
      for (let y = 0; y < TILE_SIZE; y++) {
        for (let x = 0; x < TILE_SIZE; x++) {
          if (active.mask[y * TILE_SIZE + x] === 0) {
            ctx.fillRect(offsetX + x * unit, offsetY + y * unit, unit, unit);
          }
        }
      }
    }

    const sel = this.rectDraft || this.selection;
    if (sel) {
      const x0 = offsetX + Math.min(sel.x0, sel.x1) * unit;
      const y0 = offsetY + Math.min(sel.y0, sel.y1) * unit;
      const x1 = offsetX + (Math.max(sel.x0, sel.x1) + 1) * unit;
      const y1 = offsetY + (Math.max(sel.y0, sel.y1) + 1) * unit;
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 2;
      ctx.strokeRect(x0 + 1, y0 + 1, x1 - x0 - 2, y1 - y0 - 2);
    }
  }

  async getPreviewAsset(path) {
    if (path === this.currentTargetPath) return this.compositeCanvas;
    if (this.imageCache.has(path)) return this.imageCache.get(path);
    try {
      const img = await loadImage(path);
      const temp = document.createElement('canvas');
      temp.width = TILE_SIZE;
      temp.height = TILE_SIZE;
      const ctx = temp.getContext('2d', { alpha: true });
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, TILE_SIZE, TILE_SIZE);
      this.imageCache.set(path, temp);
      return temp;
    } catch {
      const empty = document.createElement('canvas');
      empty.width = TILE_SIZE;
      empty.height = TILE_SIZE;
      this.imageCache.set(path, empty);
      return empty;
    }
  }

  drawHexWithTexture(ctx, cx, cy, radius, texture) {
    const verts = getHexVertices(cx, cy, radius);

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(verts[0].x, verts[0].y);
    for (let i = 1; i < verts.length; i++) ctx.lineTo(verts[i].x, verts[i].y);
    ctx.closePath();
    ctx.clip();

    if (texture) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(texture, cx - radius, cy - radius, radius * 2, radius * 2);
    } else {
      ctx.fillStyle = '#888';
      ctx.fill();
    }
    ctx.restore();

    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(verts[0].x, verts[0].y);
    for (let i = 1; i < verts.length; i++) ctx.lineTo(verts[i].x, verts[i].y);
    ctx.closePath();
    ctx.stroke();
  }

  drawEdgeOverlay(ctx, cx, cy, radius, edgeIdx, overlayCanvas, overlaySize = TILE_SIZE) {
    const verts = getHexVertices(cx, cy, radius);

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(verts[0].x, verts[0].y);
    for (let i = 1; i < verts.length; i++) ctx.lineTo(verts[i].x, verts[i].y);
    ctx.closePath();
    ctx.clip();

    ctx.drawImage(overlayCanvas, cx - overlaySize / 2, cy - overlaySize / 2, overlaySize, overlaySize);
    ctx.restore();
  }

  drawSceneCached(ctx, centerX, centerY, radius, skipCenterOverlays = false) {
    this.syncSceneDefaultsWithSelection();
    const overlaySize = Math.round(radius * 2);
    const layout = this.getSceneLayout(centerX, centerY, radius);
    const byCoord = new Map(layout.map((tile) => [`${tile.q},${tile.r}`, tile]));

    layout.forEach((tile) => {
      if (!tile.terrainId) return;
      const texture = this.imageCache.get(getBaseTileAsset(tile.terrainId));
      if (!texture) return;
      this.drawHexWithTexture(ctx, tile.x, tile.y, radius, texture);
    });

    layout.forEach((tile) => {
      if (!tile.terrainId) return;
      if (skipCenterOverlays && tile.key === 'C') return;
      const tilePriority = getTerrainPriority(tile.terrainId);
      for (let edgeIdx = 0; edgeIdx < HEX_NEIGHBORS.length; edgeIdx++) {
        const neighborOffset = HEX_NEIGHBORS[edgeIdx];
        const neighbor = byCoord.get(`${tile.q + neighborOffset.dq},${tile.r + neighborOffset.dr}`);
        if (!neighbor?.terrainId || neighbor.terrainId === tile.terrainId) continue;
        if (getTerrainPriority(neighbor.terrainId) <= tilePriority) continue;
        const dir = EDGE_INDEX_TO_DIRECTION[edgeIdx];
        const overlay = this.getOverlayCanvasCached(neighbor.terrainId, dir);
        if (!overlay) continue;
        this.drawEdgeOverlay(ctx, tile.x, tile.y, radius, edgeIdx, overlay, overlaySize);
      }
    });
  }

  async renderPreview() {
    const ctx = this.previewCtx;
    const w = this.previewCanvas.width;
    const h = this.previewCanvas.height;
    ctx.clearRect(0, 0, w, h);

    this.rebuildComposite();

    this.syncSceneDefaultsWithSelection();
    const center = { x: w * 0.5, y: h * 0.5 };
    const radius = 88;
    const overlaySize = Math.round(radius * 2);
    const layout = this.getSceneLayout(center.x, center.y, radius);
    const byCoord = new Map(layout.map((tile) => [`${tile.q},${tile.r}`, tile]));

    for (const tile of layout) {
      if (!tile.terrainId) continue;
      const texture = await this.getPreviewAsset(getBaseTileAsset(tile.terrainId));
      this.drawHexWithTexture(ctx, tile.x, tile.y, radius, texture);
    }

    for (const tile of layout) {
      if (!tile.terrainId) continue;
      const tilePriority = getTerrainPriority(tile.terrainId);
      for (let edgeIdx = 0; edgeIdx < HEX_NEIGHBORS.length; edgeIdx++) {
        const neighborOffset = HEX_NEIGHBORS[edgeIdx];
        const neighbor = byCoord.get(`${tile.q + neighborOffset.dq},${tile.r + neighborOffset.dr}`);
        if (!neighbor?.terrainId || neighbor.terrainId === tile.terrainId) continue;
        if (getTerrainPriority(neighbor.terrainId) <= tilePriority) continue;
        const dir = EDGE_INDEX_TO_DIRECTION[edgeIdx];
        const overlay = await this.getOverlayCanvasForDirection(neighbor.terrainId, dir);
        if (!overlay) continue;
        this.drawEdgeOverlay(ctx, tile.x, tile.y, radius, edgeIdx, overlay, overlaySize);
      }
    }
  }

  renderAll() {
    this.renderEditor();
    this.renderTransitionContext();
    this.drawNeighborGuide();
    this.renderPreview();
  }
}
