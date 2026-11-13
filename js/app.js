/**
 * MC_HEXA_MAP � entry point
 * Imports all modules, wires UI, bootstraps the app.
 */

import { state }          from './state.js';
import { MapDocument }    from './grid.js';
import { Renderer }       from './renderer.js';
import { ProjectManager } from './storage.js';
import { bindSvgInteraction } from './tools.js';
import { TextureLab } from './texture-lab.js';

// ---------------------------------------------------------------------------
// Project helpers
// ---------------------------------------------------------------------------

function createDefaultProject() {
  const project = new MapDocument({ name: state.projectName, size: state.hexSize });
  const seeds = [
    [0, 0, 'louka'], [1, 0, 'les'],  [0, 1, 'voda'], [-1, 1, 'cesta'],
    [1, 1, 'louka'], [2, 0, 'hory'], [-1, 0, 'les'], [0, -1, 'voda'],
  ];
  seeds.forEach(([q, r, terrain]) => project.grid.ensureTile(q, r, { terrain }));
  return project;
}

// ---------------------------------------------------------------------------
// Properties panel
// ---------------------------------------------------------------------------

function updatePropertiesPanel(tile) {
  const terrainSelect  = document.getElementById('terrain-select');
  const elevationInput = document.getElementById('elevation-input');
  const labelInput     = document.getElementById('label-input');

  if (!tile) {
    elevationInput.value = 0;
    labelInput.value     = '';
    return;
  }
  terrainSelect.value  = tile.terrain;
  elevationInput.value = tile.elevation;
  labelInput.value     = tile.label;
}

function getSelectedTile() {
  if (!state.map || !state.selectedHexId) return null;
  return state.map.grid.tiles.get(state.selectedHexId) ?? null;
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

let renderer = null;
let textureLab = null;

function getImageHref(node) {
  return node.getAttribute('href')
    || node.getAttributeNS('http://www.w3.org/1999/xlink', 'href')
    || '';
}

async function sourceToDataUrl(src) {
  if (!src || src.startsWith('data:')) return src;
  const resolved = new URL(src, window.location.href).href;
  const image = new Image();
  image.decoding = 'sync';
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = () => reject(new Error(`Nepodařilo se načíst texturu: ${src}`));
    image.src = resolved;
  });

  const width = image.naturalWidth || 1;
  const height = image.naturalHeight || 1;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Nepodařilo se připravit canvas pro export textur.');
  ctx.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL('image/png');
}

async function buildEmbeddedSvgMarkup(svgElement) {
  const svgClone = svgElement.cloneNode(true);
  const imageNodes = Array.from(svgClone.querySelectorAll('image'));
  const sources = [...new Set(imageNodes.map(getImageHref).filter(Boolean))];
  const embeddedBySource = new Map();

  for (const src of sources) {
    embeddedBySource.set(src, await sourceToDataUrl(src));
  }

  imageNodes.forEach((node) => {
    const src = getImageHref(node);
    if (!src) return;
    const embedded = embeddedBySource.get(src);
    if (!embedded) return;
    node.setAttribute('href', embedded);
    node.setAttributeNS('http://www.w3.org/1999/xlink', 'href', embedded);
  });

  return svgClone.outerHTML;
}

function toProjectRelativeAssetPath(src) {
  if (!src || src.startsWith('data:')) return '';
  const noFragment = src.split('#')[0];
  const noQuery = noFragment.split('?')[0];
  const resolved = new URL(noQuery, window.location.href);
  const projectRoot = new URL('./', window.location.href);

  if (resolved.origin !== projectRoot.origin) {
    throw new Error(`Externí asset nelze zabalit do ZIP: ${src}`);
  }
  if (!resolved.pathname.startsWith(projectRoot.pathname)) {
    throw new Error(`Asset je mimo projektovou složku: ${src}`);
  }

  return decodeURIComponent(resolved.pathname.slice(projectRoot.pathname.length));
}

function buildLinkedSvgMarkup(svgElement) {
  const svgClone = svgElement.cloneNode(true);
  const imageNodes = Array.from(svgClone.querySelectorAll('image'));
  const assetPaths = new Set();

  imageNodes.forEach((node) => {
    const src = getImageHref(node);
    if (!src || src.startsWith('data:')) return;
    const relativePath = toProjectRelativeAssetPath(src);
    if (!relativePath) return;
    assetPaths.add(relativePath);
    node.setAttribute('href', relativePath);
    node.setAttributeNS('http://www.w3.org/1999/xlink', 'href', relativePath);
  });

  return {
    svgMarkup: svgClone.outerHTML,
    assetPaths: [...assetPaths],
  };
}

function slugifyProjectName() {
  return state.projectName.replace(/\s+/g, '_').toLowerCase() || 'map';
}

function setExportFeedback(message, stateName = 'info') {
  const node = document.getElementById('export-feedback');
  if (!node) return;
  node.textContent = message;
  node.setAttribute('data-state', stateName);
}

let currentExportUrl = null;
let currentExportRevokeTimer = null;

function setExportReadyFeedback(message, fileName, url) {
  const node = document.getElementById('export-feedback');
  if (!node) return;
  node.textContent = `${message} `;
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.textContent = 'Stáhnout znovu';
  node.appendChild(link);
  node.setAttribute('data-state', 'success');
}

function setButtonBusy(button, busy, idleLabel, busyLabel) {
  if (!button) return;
  button.disabled = busy;
  button.textContent = busy ? busyLabel : idleLabel;
}

function triggerBlobDownload(blob, fileName) {
  if (currentExportUrl) {
    URL.revokeObjectURL(currentExportUrl);
    currentExportUrl = null;
  }
  if (currentExportRevokeTimer) {
    clearTimeout(currentExportRevokeTimer);
    currentExportRevokeTimer = null;
  }

  const url = URL.createObjectURL(blob);
  currentExportUrl = url;
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();

  currentExportRevokeTimer = window.setTimeout(() => {
    if (currentExportUrl) {
      URL.revokeObjectURL(currentExportUrl);
      currentExportUrl = null;
    }
    currentExportRevokeTimer = null;
  }, 120000);

  return url;
}

async function fetchAssetBlob(relativePath) {
  const response = await fetch(new URL(relativePath, window.location.href));
  if (!response.ok) {
    throw new Error(`Nepodařilo se načíst asset: ${relativePath} (${response.status})`);
  }
  return response.blob();
}

async function exportSvgZipPackage(svgElement, onProgress) {
  const jsZipCtor = window.JSZip;
  if (!jsZipCtor) {
    throw new Error('ZIP export není dostupný (nenačetla se knihovna JSZip).');
  }

  const { svgMarkup, assetPaths } = buildLinkedSvgMarkup(svgElement);
  const zip = new jsZipCtor();
  const projectSlug = slugifyProjectName();
  const packageRoot = `${projectSlug}_svg`;
  onProgress?.(`Připravuji ZIP (assetů: ${assetPaths.length})…`);
  zip.file(`${packageRoot}/map.svg`, svgMarkup);

  for (let i = 0; i < assetPaths.length; i += 1) {
    const relativePath = assetPaths[i];
    onProgress?.(`Stahuji textury ${i + 1}/${assetPaths.length}…`);
    const blob = await fetchAssetBlob(relativePath);
    zip.file(`${packageRoot}/${relativePath}`, blob);
  }

  onProgress?.('Finalizuji ZIP…');
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  return triggerBlobDownload(zipBlob, `${projectSlug}_svg.zip`);
}

function renderMap() {
  if (!renderer) renderer = new Renderer(document.getElementById('map-view'));
  renderer.render(state.map, (tile) => {
    if (state.tool !== 'select') return;
    state.selectedHexId = tile.id;
    updatePropertiesPanel(tile);
    renderMap();
  });
  updatePropertiesPanel(getSelectedTile());
}

// ---------------------------------------------------------------------------
// UI bindings
// ---------------------------------------------------------------------------

function bindUi() {
  bindSvgInteraction(document.getElementById('map-view'), renderMap);

  const mapTabBtn = document.getElementById('tab-map-btn');
  const textureTabBtn = document.getElementById('tab-texture-btn');
  const mapPanel = document.getElementById('map-editor-panel');
  const texturePanel = document.getElementById('texture-lab-panel');
  const rightPanel = document.getElementById('map-right-panel');

  const activateTab = (tab) => {
    const mapActive = tab === 'map';
    mapTabBtn.classList.toggle('active', mapActive);
    textureTabBtn.classList.toggle('active', !mapActive);
    mapPanel.classList.toggle('active', mapActive);
    texturePanel.classList.toggle('active', !mapActive);
    rightPanel.style.display = mapActive ? '' : 'none';
    document.body.classList.toggle('texture-tab-active', !mapActive);

    if (!mapActive && !textureLab) {
      textureLab = new TextureLab();
    }
  };

  mapTabBtn.addEventListener('click', () => activateTab('map'));
  textureTabBtn.addEventListener('click', () => activateTab('texture'));
  activateTab('map');

  const projectNameInput = document.getElementById('project-name-input');
  const hexSizeInput     = document.getElementById('hex-size-input');
  const projectFileInput = document.getElementById('project-file-input');
  const terrainSelect    = document.getElementById('terrain-select');
  const elevationInput   = document.getElementById('elevation-input');
  const labelInput       = document.getElementById('label-input');
  const toolButtons      = document.querySelectorAll('.tool-btn');
  const exportSvgBtn = document.getElementById('export-svg-btn');
  const exportZipBtn = document.getElementById('export-svg-zip-btn');

  projectNameInput.addEventListener('input', (e) => {
    state.projectName = e.target.value || 'Nov� projekt';
    state.map.name    = state.projectName;
  });

  hexSizeInput.addEventListener('input', (e) => {
    state.hexSize        = Math.min(Math.max(Number(e.target.value) || 42, 10), 120);
    state.map.size       = state.hexSize;
    state.map.grid.size  = state.hexSize;
    renderMap();
  });

  document.getElementById('save-project-btn').addEventListener('click', () => {
    new ProjectManager().saveProject(state.map);
  });

  document.getElementById('load-project-btn').addEventListener('click', () => projectFileInput.click());

  projectFileInput.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const loaded = await new ProjectManager().loadProjectFromFile(file);
      state.map          = loaded;
      state.projectName  = loaded.name;
      projectNameInput.value = loaded.name;
      hexSizeInput.value     = String(loaded.size);
      renderMap();
    } catch {
      alert('Soubor se nepoda�ilo nacist.');
    }
  });

  document.getElementById('new-project-btn').addEventListener('click', () => {
    state.map = createDefaultProject();
    projectNameInput.value = state.map.name;
    hexSizeInput.value     = String(state.map.size);
    renderMap();
  });

  exportSvgBtn?.addEventListener('click', async () => {
    setButtonBusy(exportSvgBtn, true, 'Export SVG', 'Exportuji…');
    setExportFeedback('Připravuji SVG export…', 'working');
    let svgData = '';
    try {
      svgData = await buildEmbeddedSvgMarkup(document.getElementById('map-view'));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(err);
      setButtonBusy(exportSvgBtn, false, 'Export SVG', 'Exportuji…');
      setExportFeedback(`Chyba SVG exportu: ${message}`, 'error');
      alert(`Export SVG se nepodařil: ${message}`);
      return;
    }
    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const fileName = `${slugifyProjectName()}.svg`;
    const url = triggerBlobDownload(blob, fileName);
    setButtonBusy(exportSvgBtn, false, 'Export SVG', 'Exportuji…');
    setExportReadyFeedback('SVG export hotový.', fileName, url);
  });

  exportZipBtn?.addEventListener('click', async () => {
    setButtonBusy(exportZipBtn, true, 'Export SVG+ZIP', 'Baluji ZIP…');
    try {
      const url = await exportSvgZipPackage(
        document.getElementById('map-view'),
        (message) => setExportFeedback(message, 'working'),
      );
      setExportReadyFeedback('ZIP export hotový.', `${slugifyProjectName()}_svg.zip`, url);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(err);
      setExportFeedback(`Chyba ZIP exportu: ${message}`, 'error');
      alert(`Export ZIP se nepodařil: ${message}`);
    } finally {
      setButtonBusy(exportZipBtn, false, 'Export SVG+ZIP', 'Baluji ZIP…');
    }
  });

  toolButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      toolButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.tool = btn.dataset.tool;
    });
  });

  terrainSelect.addEventListener('change', (e) => {
    const tile = getSelectedTile();
    if (!tile) return;
    tile.terrain = e.target.value;
    renderMap();
  });

  elevationInput.addEventListener('input', (e) => {
    const tile = getSelectedTile();
    if (!tile) return;
    tile.elevation = Number(e.target.value) || 0;
  });

  labelInput.addEventListener('input', (e) => {
    const tile = getSelectedTile();
    if (!tile) return;
    tile.label = e.target.value;
    renderMap();
  });
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

state.map = createDefaultProject();
bindUi();
renderMap();
