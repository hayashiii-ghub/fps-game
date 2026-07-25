import '../shared/map-manifest.js';

const MANIFEST = globalThis.FPS_ARENA_MAPS;
export const DEFAULT_MAP_ID = 'desert';
export const MAP_IDS = Object.freeze(Object.keys(MANIFEST));

export function sanitizeMapId(id) {
  const value = String(id || DEFAULT_MAP_ID).toLowerCase();
  return Object.prototype.hasOwnProperty.call(MANIFEST, value) ? value : DEFAULT_MAP_ID;
}

export function getMapConfig(id) {
  return MANIFEST[sanitizeMapId(id)];
}
