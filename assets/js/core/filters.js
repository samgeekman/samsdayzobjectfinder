export const rowMatchesCollectionWithIndex = (collectionKey, row, typesExplorerIndex, helpers) => {
  if (!collectionKey || !row || !helpers) return true;
  const normalizeFilterText = helpers.normalizeFilterText;
  const getObjectName = helpers.getObjectName;
  const getSearchTags = helpers.getSearchTags;
  const objName = normalizeFilterText(getObjectName(row));
  const inGame = normalizeFilterText(row.inGameName || '');
  const category = normalizeFilterText(row.category || '');
  const path = normalizeFilterText(row.path || '');
  const tags = normalizeFilterText(getSearchTags(row));
  const blob = [objName, inGame, category, path, tags].join(' ');
  const has = (term) => blob.indexOf(term) !== -1;

  if (collectionKey === 'presets') return category.indexOf('preset') !== -1 || category.indexOf('build') !== -1;
  if (collectionKey === 'weapons') return has('weapon') || path.indexOf('/weapons/') !== -1;
  if (collectionKey === 'vehicles') return has('vehicle') || path.indexOf('/vehicles/') !== -1 || has('car') || has('truck');
  if (collectionKey === 'clothing') return has('clothing') || has('apparel') || path.indexOf('/characters/') !== -1 || path.indexOf('/clothes/') !== -1;
  if (collectionKey === 'military_structures') return path.indexOf('/structures/') !== -1 && (has('military') || has('barracks') || has('army') || has('checkpoint') || has('watchtower') || has('guard'));
  if (collectionKey === 'bunkers') return has('bunker');
  if (collectionKey === 'rocks') return path.indexOf('/rocks/') !== -1 || has('rock') || has('boulder');
  if (collectionKey === 'trees') return has('tree') || has('spruce') || has('birch') || has('oak') || has('pine') || has('fir');
  if (collectionKey === 'houses') return has('house') || has('residential') || has('building');
  if (collectionKey === 'types_explorer') return !!(typesExplorerIndex && typesExplorerIndex[objName]);
  return true;
};

export const rowPassesTagFilter = (rowData, filterState, helpers) => {
  if (!rowData || !helpers) return false;
  const getObjectName = helpers.getObjectName;
  const state = filterState || {};
  const typesTagFilter = state.typesTagFilter || null;
  const hasSingleTag = !!(typesTagFilter && typesTagFilter.map && typesTagFilter.kind && typesTagFilter.name);
  const hasExplorerTags = state.collectionFilter === 'types_explorer' && !!state.hasTypesExplorerSelection;
  if (!hasSingleTag && !hasExplorerTags) return true;
  const objKey = String(getObjectName(rowData) || '').trim().toLowerCase();
  if (!objKey) return false;
  if (hasSingleTag && !(state.typesTagMatchByName && state.typesTagMatchByName[objKey])) return false;
  if (hasExplorerTags && !(state.typesExplorerMatchByName && state.typesExplorerMatchByName[objKey])) return false;
  return true;
};

export const rowPassesCollectionFilter = (rowData, filterState, helpers) => {
  if (!rowData || !helpers) return false;
  const state = filterState || {};
  const collectionFilter = String(state.collectionFilter || '');
  const folderFilter = helpers.normalizeFilterText(state.folderFilter || '');
  if (!collectionFilter && helpers.isPresetRow(rowData)) return false;
  if (!collectionFilter && !folderFilter) return true;
  if (collectionFilter && !rowMatchesCollectionWithIndex(collectionFilter, rowData, state.typesExplorerIndex || {}, helpers)) return false;
  if (folderFilter) {
    if (state.ignoreFolderFilter) return true;
    const pathValue = helpers.normalizeFilterText((rowData && rowData.path) || '').replace(/\\/g, '/').replace(/^\/+/, '');
    const matchesPath = pathValue && (pathValue === folderFilter || pathValue.indexOf(folderFilter + '/') === 0);
    if (!matchesPath) return false;
  }
  return true;
};
