(function exposeMapManifest(root) {
  'use strict';

  const maps = {
    desert: {
      id: 'desert',
      name: 'DESERT',
      author: 'Kimi K3',
      descriptionKey: 'map.desert.desc',
      weather: 'hurricane',
      survivalWeapon: 'sr_surv',
    },
    jungle: {
      id: 'jungle',
      name: 'JUNGLE',
      author: 'Kimi K3',
      descriptionKey: 'map.jungle.desc',
      weather: 'squall',
      survivalWeapon: 'sg_surv',
    },
    tokyo: {
      id: 'tokyo',
      name: 'TOKYO',
      author: 'Kimi K3',
      descriptionKey: 'map.tokyo.desc',
      weather: 'night',
      survivalWeapon: 'smg_surv',
    },
  };

  const defaultMapId = 'desert';
  if (!maps[defaultMapId]) throw new Error(`Unknown default map id: ${defaultMapId}`);

  for (const def of Object.values(maps)) Object.freeze(def);
  root.FPS_ARENA_MAPS = Object.freeze(maps);
  root.FPS_ARENA_DEFAULT_MAP_ID = defaultMapId;
})(globalThis);
