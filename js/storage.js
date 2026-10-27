import { MapDocument } from './grid.js';

/** Handles saving to JSON file and loading from JSON file. */
export class ProjectManager {
  saveProject(project) {
    const data = {
      name: project.name,
      size: project.size,
      tiles: Array.from(project.grid.tiles.values()).map((tile) => ({
        id: tile.id,
        q: tile.q,
        r: tile.r,
        terrain: tile.terrain,
        elevation: tile.elevation,
        label: tile.label,
        meta: tile.meta,
      })),
      savedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.replace(/\s+/g, '_').toLowerCase() || 'mc_hexa_map'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  loadProjectFromFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const raw = JSON.parse(String(event.target.result));
          const project = new MapDocument({ name: raw.name || 'Načtený projekt', size: raw.size || 42 });
          (raw.tiles || []).forEach((tile) => {
            project.grid.ensureTile(tile.q, tile.r, {
              terrain: tile.terrain || 'louka',
              elevation: tile.elevation || 0,
              label: tile.label || '',
              id: tile.id || `${tile.q}:${tile.r}`,
            });
          });
          resolve(project);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error('Chyba při načtení souboru.'));
      reader.readAsText(file);
    });
  }
}
