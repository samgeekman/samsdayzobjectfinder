export const normalizePinnedEntries = (entries) => {
  if (!Array.isArray(entries)) return [];
  return entries.filter((item) => item && typeof item === 'object' && String(item.objName || '').trim());
};

export const addUniquePinnedItem = (entries, item) => {
  const list = normalizePinnedEntries(entries);
  const next = item && typeof item === 'object' ? item : null;
  if (!next || !String(next.objName || '').trim()) return list;
  const key = String(next.objName || '').trim();
  if (list.some((entry) => String(entry.objName || '').trim() === key)) return list;
  return list.concat([next]);
};

export const removePinnedItemByName = (entries, objName) => {
  const list = normalizePinnedEntries(entries);
  const key = String(objName || '').trim();
  if (!key) return list;
  return list.filter((item) => {
    if (item.type === 'path') {
      return item.p3dPath !== key && item.objName !== key;
    }
    return String(item.objName || '').trim() !== key;
  });
};
