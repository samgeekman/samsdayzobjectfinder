const safeParseImages = (rawImages) => {
  if (Array.isArray(rawImages)) {
    return rawImages.map((item) => String(item || '').trim()).filter(Boolean);
  }
  if (typeof rawImages === 'string' && rawImages.trim()) {
    try {
      const parsed = JSON.parse(rawImages);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item || '').trim()).filter(Boolean);
      }
    } catch (_) {}
  }
  return [];
};

export const createTableRenderers = (deps = {}) => {
  const escapeHtml = deps.escapeHtml || ((value) => String(value || ''));
  const getObjectName = deps.getObjectName || ((row) => String((row && row.objectName) || ''));
  const isPresetRow = deps.isPresetRow || (() => false);
  const getPresetBuilder = deps.getPresetBuilder || (() => '');
  const getPresetImportJsonPath = deps.getPresetImportJsonPath || (() => '');
  const getPresetCopyablePath = deps.getPresetCopyablePath || (() => '');
  const hasPresetEditorJson = deps.hasPresetEditorJson || (() => false);
  const normalizeFilterText = deps.normalizeFilterText || ((value) => String(value || '').toLowerCase());
  const getConsoleFlag = deps.getConsoleFlag || (() => '');
  const getSearchTags = deps.getSearchTags || (() => '');
  const PATH_FILTER_ICON_ENTITY = deps.PATH_FILTER_ICON_ENTITY || '';

  const renderThumbCell = (_data, type, row) => {
    const imageList = safeParseImages(row && row.images);
    const imagePath = imageList.length ? imageList[0] : (row.image || '');
    if (type !== 'display') return imagePath;
    if (imagePath) {
      const safeImg = escapeHtml(imagePath);
      const safeName = escapeHtml(getObjectName(row));
      return '<img class="thumb-img" src="/' + safeImg + '" alt="' + safeName + ' thumbnail" loading="lazy" onerror="this.outerHTML=\'<span class=&quot;thumb-fallback&quot;>-</span>\';">';
    }
    return '<span class="thumb-fallback">-</span>';
  };

  const renderNameCell = (_data, type, row) => {
    const objName = getObjectName(row);
    if (type !== 'display') return objName;
    return (
      '<span class="object-name-cell__value">' +
        '<span class="object-name-cell__text">' + escapeHtml(objName) + '</span>' +
      '</span>' +
      '<span class="cell-action-grid cell-action-grid--classname">' +
        '<button class="copy-btn copy-link-btn icon-action" type="button" title="Copy object link"><span class="ui-icon ui-icon--link" aria-hidden="true"></span></button>' +
        '<button class="copy-btn pin-btn icon-action" type="button" title="Pin object"><span class="ui-icon ui-icon--pin" aria-hidden="true"></span></button>' +
        '<button class="copy-btn copy-name-btn icon-action" type="button" title="Copy object name"><span class="ui-icon ui-icon--copy-name" aria-hidden="true"></span></button>' +
        '<button class="copy-btn editor-copy-btn icon-action" type="button" title="Copy DayZ Editor JSON"><span class="ui-icon ui-icon--editor" aria-hidden="true"></span></button>' +
      '</span>'
    );
  };

  const renderInGameOrBuilderCell = (_data, type, row) => {
    const preset = isPresetRow(row);
    const description = preset ? getPresetBuilder(row) : (row.inGameName || '');
    if (type !== 'display') return description;
    return preset
      ? ('<span class="preset-description">' + escapeHtml(description) + '</span>')
      : escapeHtml(description);
  };

  const renderPathOrPresetActionsCell = (_data, type, row) => {
    const preset = isPresetRow(row);
    if (preset) {
      const importJsonPath = getPresetImportJsonPath(row);
      const copyablePath = getPresetCopyablePath(row);
      const hasEditorJson = hasPresetEditorJson(row);
      const hasCopy = !!copyablePath || !!importJsonPath || hasEditorJson;
      const hasJson = !!importJsonPath || hasEditorJson;
      if (type !== 'display') return 'preset ' + (hasCopy ? 'copy ' : '') + (hasJson ? 'json ' : '');
      return (
        '<div class="preset-actions">' +
          '<button class="preset-action-btn preset-copy-btn ui-action-btn' + (hasCopy ? '' : ' is-disabled') + '" type="button" data-preset-copy-path="' + escapeHtml(copyablePath) + '" data-preset-import-path="' + escapeHtml(importJsonPath) + '" data-preset-object="' + escapeHtml(getObjectName(row)) + '" ' + (hasCopy ? '' : 'disabled ') + 'title="' + (hasCopy ? 'Copy to Editor' : 'Copy source not available') + '"><span class="ui-icon ui-icon--editor" aria-hidden="true"></span><span>Copy to Editor</span></button>' +
          '<button class="preset-action-btn preset-export-btn ui-action-btn' + (hasJson ? '' : ' is-disabled') + '" type="button" data-preset-import-path="' + escapeHtml(importJsonPath) + '" data-preset-object="' + escapeHtml(getObjectName(row)) + '" ' + (hasJson ? '' : 'disabled ') + 'title="' + (hasJson ? 'Download JSON' : 'Import JSON not available') + '">↓ JSON</button>' +
        '</div>'
      );
    }

    const pathValue = row.path || '';
    if (type !== 'display') return pathValue;
    const safePath = escapeHtml(pathValue);
    const isPathTruncated = pathValue.length > 30;
    let shortPath = pathValue;
    if (isPathTruncated) {
      const pathParts = pathValue.split('/').filter((part) => part.length > 0);
      if (pathParts.length >= 2) {
        shortPath = pathParts[0] + '/.../' + pathParts[pathParts.length - 1];
      } else {
        shortPath = pathValue.slice(0, 14) + '…' + pathValue.slice(-15);
      }
    }
    const safeShortPath = escapeHtml(shortPath);
    const pathTextHtml = '<span class="path-cell__value' + (isPathTruncated ? ' is-truncated' : '') + '"'
      + (isPathTruncated ? (' data-full-path="' + safePath + '"') : '')
      + '>'
      + '<span class="path-cell__text path-cell__text--short">' + safeShortPath + '</span>'
      + (isPathTruncated ? ('<span class="path-cell__text path-cell__text--full">' + safePath + '</span>') : '')
      + '</span>';
    const pathActionsHtml = '<span class="cell-action-grid cell-action-grid--path">'
      + '<button class="copy-btn path-action-btn path-copy-link-btn icon-action" type="button" title="Copy path link"><span class="ui-icon ui-icon--link" aria-hidden="true"></span></button>'
      + '<button class="copy-btn path-action-btn path-pin-btn icon-action" type="button" title="Pin path"><span class="ui-icon ui-icon--pin" aria-hidden="true"></span></button>'
      + '<button class="copy-btn path-action-btn path-copy-name-btn icon-action" type="button" title="Copy path"><span class="ui-icon ui-icon--copy-name" aria-hidden="true"></span></button>'
      + '<button class="copy-btn path-action-btn path-filter-btn" type="button" title="Filter to this path">' + PATH_FILTER_ICON_ENTITY + '</button>'
      + '</span>';
    return pathTextHtml + pathActionsHtml;
  };

  const renderInfoChipsCell = (_data, type, row) => {
    const modelType = String(row.modelType || '').toLowerCase();
    const hasConfig = modelType === 'config';
    const hasP3d = modelType === 'raw p3d' || modelType === 'p3d';
    const isPreset = modelType === 'preset' || modelType === 'build';
    const objName = String(getObjectName(row) || '').trim();
    const objNameKey = normalizeFilterText(objName);
    const hasTypesEntry = !!(deps.typesEntryByName && (deps.typesEntryByName[objName] || deps.typesEntryByNameLower[objNameKey]));
    const hasProtoEntry = !!(deps.mapGroupProtoEntryByName && (deps.mapGroupProtoEntryByName[objName] || deps.mapGroupProtoEntryByNameLower[objNameKey]));
    const consoleFlag = getConsoleFlag(row);
    const isConsoleFriendly = consoleFlag === '✅';
    const consoleClass = isConsoleFriendly ? 'info-chip--console-yes' : 'info-chip--console-no';
    const consoleSearchText = isConsoleFriendly ? 'console yes' : 'console no';
    const infoSearchText =
      (hasConfig ? 'config ' : '') +
      (hasP3d ? 'p3d ' : '') +
      (isPreset ? 'preset ' : '') +
      (hasTypesEntry ? 'types ' : '') +
      (hasProtoEntry ? 'proto ' : '') +
      consoleSearchText;
    if (type !== 'display') return infoSearchText;
    let chipsHtml = '<span class="info-chips">';
    chipsHtml += '<span class="info-chip ' + consoleClass + '" data-chip-kind="' + (isConsoleFriendly ? 'console_yes' : 'console_no') + '">Console</span>';
    if (hasConfig) chipsHtml += '<span class="info-chip info-chip--cfg" data-chip-kind="config">Config</span>';
    if (hasP3d) chipsHtml += '<span class="info-chip info-chip--p3d" data-chip-kind="p3d">P3D</span>';
    if (isPreset) chipsHtml += '<span class="info-chip info-chip--preset" data-chip-kind="preset">Build</span>';
    if (hasProtoEntry) chipsHtml += '<span class="info-chip info-chip--proto" data-chip-kind="proto">Proto</span>';
    if (hasTypesEntry) chipsHtml += '<span class="info-chip info-chip--types" data-chip-kind="types">Types</span>';
    chipsHtml += '</span>';
    return chipsHtml;
  };

  const renderTagsCell = (_data, type, row) => {
    const tags = getSearchTags(row) || '';
    if (type !== 'display') return tags;
    return '';
  };

  return {
    renderThumbCell,
    renderNameCell,
    renderInGameOrBuilderCell,
    renderPathOrPresetActionsCell,
    renderInfoChipsCell,
    renderTagsCell
  };
};
