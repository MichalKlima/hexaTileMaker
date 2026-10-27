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

  document.getElementById('export-svg-btn').addEventListener('click', () => {
    const svgData = document.getElementById('map-view').outerHTML;
    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${state.projectName.replace(/\s+/g, '_').toLowerCase() || 'map'}.svg`;
    a.click();
    URL.revokeObjectURL(url);
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
