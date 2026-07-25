import '../shared/map-manifest.js';

const MANIFEST = globalThis.FPS_ARENA_MAPS;
export const DEFAULT_MAP_ID = globalThis.FPS_ARENA_DEFAULT_MAP_ID;

// sanitizeMapId が必ず有効な ID を返す前提を守る（solidsForMap にフォールバックは無い）
if (!MANIFEST || !DEFAULT_MAP_ID
    || !Object.prototype.hasOwnProperty.call(MANIFEST, DEFAULT_MAP_ID)) {
  throw new Error(`Invalid map manifest: default=${DEFAULT_MAP_ID}`);
}
export const MAP_IDS = Object.freeze(Object.keys(MANIFEST));

export function sanitizeMapId(id) {
  const value = String(id || DEFAULT_MAP_ID).toLowerCase();
  return Object.prototype.hasOwnProperty.call(MANIFEST, value) ? value : DEFAULT_MAP_ID;
}

export function getMapConfig(id) {
  return MANIFEST[sanitizeMapId(id)];
}
