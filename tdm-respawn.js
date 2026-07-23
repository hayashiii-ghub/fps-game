/** TDM リスポーン用: slots に無い拾い武器 activeId はロードアウト主武器へ戻す */
function resolveTdmRespawnWeapon(activeId, slots, loadoutMain) {
  if (activeId && slots && slots[activeId]) return activeId;
  if (loadoutMain && slots && slots[loadoutMain]) return loadoutMain;
  if (slots && slots.pistol) return 'pistol';
  const ids = slots ? Object.keys(slots) : [];
  return ids[0] || 'assault';
}
