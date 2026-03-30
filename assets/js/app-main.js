  var statusMessages = [
    'This project is a work in progress - add feedback on the Discord',
	'There are more than 190 hats in DayZ - Sam’s favourite is the Zimikova',
	'The only P3Ds you can use on console are rocks and plants',
	'Working on console? Filter by console and look for the ✅ mark',
	'You can copy and paste directly into DayZ Editor using the Copy to Editor button',
	'DayZ uses the scientific names for plants and animals - but you can just search for "birch" or "wolf"',
	'There are more than 60 different types of birch tree in DayZ',
	'There are more than 40 different types of armbands in DayZ',
	'The most annoying type of object to categorise was railway tracks',
	'There are several invisible ghost assets used for development - they may also be haunted',
	'There are nine types of mushroom in DayZ',
	'There are 31 different playable Survivors in DayZ',
	'You can add size and colour to your searches for large rocks or green bags',
	'Notice an error? Well done, you get a gold star. Report it on the Discord',
	'Sam spent too long categorising fences',
	'If you keep refreshing the page, you will eventually see all these messages',
	'Put your credit card into this website to unlock the object list WITHOUT the errors',
	'There are more than 90 different types of spruce tree in DayZ',
	'There are 45 different houses in DayZ - each has been tagged with its callouts',
	'This loading message hides many sins'
  ];
  (function() {
    var statusMessageEl = document.getElementById('statusMessage');
    if (!statusMessageEl) return;
    statusMessageEl.textContent = statusMessages[Math.floor(Math.random() * statusMessages.length)];
    statusMessageEl.style.display = 'block';
  })();

  $(document).ready(function() {
    var statusMessageEl = document.getElementById('statusMessage');
    var $tableEl = $('#dayzObjects');
    $('#filters').hide();
    var CoreModules = window.DayzCoreModules || {};
    var requireCoreModule = function(name) {
      if (!CoreModules || typeof CoreModules[name] === 'undefined' || CoreModules[name] === null) {
        throw new Error('Missing core module export: ' + name);
      }
      return CoreModules[name];
    };
    var objectMapContract = requireCoreModule('createObjectMapContract')({
      origin: window.location.origin,
      eventTarget: window
    });
    var objectMapPerformance = requireCoreModule('createObjectMapPerformance')();
    var OBJECT_MAP_MESSAGE_TYPES = requireCoreModule('OBJECT_MAP_MESSAGE_TYPES');
    var OBJECT_MAP_DOM_EVENTS = requireCoreModule('OBJECT_MAP_DOM_EVENTS');

    // --- APPLICATION STATE CONTRACT ---
    // NOTE: Do not rename/remove these state variables lightly.
    // This block documents mutable shared state used across handlers/controllers.
    //
    // Collection/folder mode:
    // - activeCollectionFilter: '' | 'presets' | 'types_explorer' | 'object_map'
    // - activeFolderFilter: normalized folder path, '' means no folder filter
    // - highlightedFolderPath: normalized path highlighted in tree UI
    // - knownFolderPrefixes / filteredFolderPrefixes: folder index + search-filtered subset
    // - ignoreActiveFolderFilterForTree: temporary guard when tree should not enforce folder filter
    // - treatIdListAsSearchFolders: treat URL id-list as search folder scope
    // - folderTreeExpanded: map of expanded folder paths
    // - folderSidebarSearchDebounceTimer: debounce timer id for sidebar search
    // - folderBulkAnimalsTop: cached top offset for tree bulk controls
    // - folderBulkMode: 'animals' | 'search' sticky mode for bulk controls
    //
    // URL-driven filters:
    // - versionParam: active version tag from URL (e.g. 'v1.29')
    // - activeTypesTagFilter: {map, kind, name} | null
    // - activeTypesTagMatchByName: object-name lookup map for activeTypesTagFilter
    // - activeTypesExplorerMatchByName: object-name lookup map for Types Explorer selections
    //
    // Types data:
    // - typesEntryUrl: selected/sourced types entry URL
    // - typesEntryByName / typesEntryByNameLower: types.xml lookups
    // - mapTypesByMap: per-map types index (chernarus/livonia/sakhal)
    // - typesExplorerState: {usage: string[], value: string[]}
    // - typesExplorerMaps: enabled maps in Types Explorer
    // - typesExplorerTags: computed available usage/value tags
    // - typesExplorerByObject: object-name index of types tags
    // - typesExplorerFolderPrefixIndex: folder prefixes visible in Types Explorer context
    // - mapGroupProtoEntryUrl / mapGroupProtoEntryByName / mapGroupProtoEntryByNameLower
    //
    // Object focus selection:
    // - currentObjectName: selected object name | null
    // - currentObjectData: selected object payload | null
    // - currentObjectLocationData: per-map counts/positions for selected object
    // - currentObjectRowEl: currently selected table row element | null
    // - objectFocusSectionExpanded: expanded/collapsed section prefs in focus pane
    //
    // Object map state:
    // - objectMapActiveMapKey: 'chernarus' | 'livonia' | 'sakhal'
    // - objectMapPlacementPathIndex: cache for placement lookup by path
    // - objectMapSummaryText / objectMapSelectedCoordsText: status strings
    // - objectMapRenderToken: render invalidation token
    // - objectMapInteractionRefreshTimer: deferred interaction timer id
    // - useObjectMapV2: toggle for v2 iframe map integration
    // - objectMapV2FrameLoaded / objectMapV2FrameWorldKey: iframe load/world tracking
    // - objectMapExactSearchQuery / objectMapSearchMode: exact-object map search state
    // - objectMapState: map canvas/selection/view cache state
    // - chernarusMapState: lightbox map viewer state + backdrop cache
    // - sakhalMapUiTimer: deferred timer for sakhal map UI updates
    //
    // Object identity/index caches:
    // - objectNameById / objectDataById / objectDataByName / objectDataByMatchKey
    // - objectLinkGraph
    // - objectLocationClusterCache / objectLocationResolutionCache
    //
    // Pinned/image overlay state:
    // - pinnedItems: pinned objects/paths collection
    // - currentObjectImages / currentObjectImageIndex: focus gallery state
    // - imageOverlayImages / imageOverlayIndex: lightbox gallery state
    // - hoverPreviewImages / hoverPreviewIndex / hoverPreviewCell / hoverPreviewTimer
    //
    // UI timers/tooltip state:
    // - sidebarTopOffsetRaf: RAF id for sidebar top offset syncing
    // - chipInfoHideTimer / chipInfoHoverTimer / chipInfoLockUntil
    // ----------------------------------
    /**
     * @typedef {''
     * | 'presets'
     * | 'types_explorer'
     * | 'object_map'} CollectionFilter
     */
    /**
     * @typedef {Object} DayzObjectRow
     * @property {string=} id
     * @property {string=} objectName
     * @property {string=} inGameName
     * @property {string=} category
     * @property {string=} path
     * @property {string=} modelType
     * @property {string=} image
     * @property {string|Array<string>=} images
     * @property {string=} searchTags
     * @property {Object|string=} editorJson
     */
    /**
     * @typedef {Object} AppStateShape
     * @property {CollectionFilter} activeCollectionFilter
     * @property {string} activeFolderFilter
     * @property {Object|null} activeTypesTagFilter
     * @property {string|null} currentObjectName
     * @property {Array<Object>} pinnedItems
     */

    var escapeRegex = function(value) {
      return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    };
    var escapeHtml = function(value) {
      if (value === null || value === undefined) return '';
      return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    };
    var formatNumber = function(value) {
      var parsed = Number(value);
      if (!isFinite(parsed)) return '0';
      return new Intl.NumberFormat().format(parsed);
    };
    var getObjectName = function(row) {
      return row.objectName || row.name || row.Name || '';
    };
    var getObjectId = function(row) {
      return row.id || '';
    };
    var PATH_FILTER_ICON_ENTITY = '&#9776;';
    var PATH_FILTER_ICON_TEXT = '☰';
    var parseLinkedIds = function(value) {
      if (value === null || value === undefined) return [];
      if (Array.isArray(value)) {
        return value.filter(Boolean).map(function(item) { return String(item).trim(); }).filter(Boolean);
      }
      var text = String(value).trim();
      if (!text) return [];
      if (text.charAt(0) === '[') {
        try {
          var parsed = JSON.parse(text);
          if (Array.isArray(parsed)) {
            return parsed.filter(Boolean).map(function(item) { return String(item).trim(); }).filter(Boolean);
          }
        } catch (err) {}
      }
      return [text];
    };
    var parseDimensionsVisual = function(value) {
      if (Array.isArray(value) && value.length >= 3) {
        return value.slice(0, 3).map(function(n) {
          var parsed = parseFloat(n);
          return isFinite(parsed) ? Math.abs(parsed) : 0;
        });
      }
      if (typeof value === 'string') {
        var text = value.trim();
        if (!text) return [];
        try {
          var parsed = JSON.parse(text);
          if (Array.isArray(parsed) && parsed.length >= 3) {
            return parsed.slice(0, 3).map(function(n) {
              var num = parseFloat(n);
              return isFinite(num) ? Math.abs(num) : 0;
            });
          }
        } catch (_) {}
      }
      return [];
    };
    var getConsoleFlag = function(row) {
      return row.usableOnConsole ? '✅' : '❌';
    };
    var getSearchTags = function(row) {
      return row.searchTags || '';
    };
    var normalizeFilterText = function(value) {
      return String(value || '').toLowerCase();
    };
    var extractPathPrefixes = function(pathValue) {
      var normalized = String(pathValue || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
      if (!normalized) return [];
      var parts = normalized.split('/').filter(Boolean);
      var prefixes = [];
      var current = '';
      for (var i = 0; i < parts.length; i += 1) {
        current = current ? (current + '/' + parts[i]) : parts[i];
        prefixes.push(current);
      }
      return prefixes;
    };
    var buildFolderTreeData = function(prefixes) {
      var root = { path: '', name: '', children: {} };
      (Array.isArray(prefixes) ? prefixes : []).forEach(function(prefix) {
        var parts = String(prefix || '').split('/').filter(Boolean);
        var node = root;
        var currentPath = '';
        parts.forEach(function(part) {
          currentPath = currentPath ? (currentPath + '/' + part) : part;
          if (!node.children[part]) {
            node.children[part] = { path: currentPath, name: part, children: {} };
          }
          node = node.children[part];
        });
      });
      return root;
    };
    var getCurrentTableSearchValue = function() {
      if (!table || typeof table.search !== 'function') return '';
      return String(table.search() || '').trim();
    };
    var isFolderTreeInBroadFilterMode = function() {
      var hasActiveTypesExplorerFilter = activeCollectionFilter === AppMode.TYPES_EXPLORER && hasTypesExplorerSelection();
      return getCurrentTableSearchValue().length > 0 || treatIdListAsSearchFolders || !!activeTypesTagFilter || hasActiveTypesExplorerFilter;
    };
    var getDeepestPathPrefix = function(pathValue) {
      var prefixes = extractPathPrefixes(pathValue || '');
      if (!prefixes.length) return '';
      var last = String(prefixes[prefixes.length - 1] || '');
      var leafName = last.split('/').pop() || '';
      if (leafName.indexOf('.') !== -1 && prefixes.length > 1) {
        return normalizeFilterText(prefixes[prefixes.length - 2]);
      }
      return normalizeFilterText(last);
    };
    var expandFolderTreeForPath = function(pathValue) {
      extractPathPrefixes(pathValue || '').forEach(function(prefix) {
        var key = normalizeFilterText(prefix);
        if (key && key !== 'dz') {
          folderTreeExpanded[key] = true;
        }
      });
    };
    var updateFilteredFolderPrefixes = function() {
      if (!table) {
        filteredFolderPrefixes = knownFolderPrefixes.slice();
        return;
      }
      var rows = [];
      ignoreActiveFolderFilterForTree = true;
      try {
        rows = table.rows({ search: 'applied', order: 'applied', page: 'all' }).data().toArray();
      } finally {
        ignoreActiveFolderFilterForTree = false;
      }
      var seen = {};
      var next = [];
      rows.forEach(function(row) {
        if (isPresetRow(row)) return;
        extractPathPrefixes(row && row.path ? row.path : '').forEach(function(prefix) {
          var key = prefix.toLowerCase();
          if (seen[key]) return;
          seen[key] = true;
          next.push(prefix);
        });
      });
      next.sort(function(a, b) { return a.localeCompare(b); });
      filteredFolderPrefixes = next;
    };
    var getFolderTreeSourcePrefixes = function() {
      var hasBroadFilter = isFolderTreeInBroadFilterMode();
      var base = hasBroadFilter ? filteredFolderPrefixes : knownFolderPrefixes;
      var list = Array.isArray(base) ? base.slice() : [];
      if (activeFolderFilter) {
        var hasActive = list.some(function(prefix) {
          return normalizeFilterText(prefix) === activeFolderFilter;
        });
        if (!hasActive) {
          list.push(activeFolderFilter);
        }
      }
      return list;
    };
    var folderIsInActivePath = function(pathKey) {
      if (!activeFolderFilter || !pathKey) return false;
      return activeFolderFilter === pathKey || activeFolderFilter.indexOf(pathKey + '/') === 0;
    };
    var getVisibleFolderBranchKeys = function() {
      var tree = buildFolderTreeData(getFolderTreeSourcePrefixes());
      var treeRoot = (tree && tree.children && tree.children.dz) ? tree.children.dz : tree;
      var branchKeys = [];
      var walk = function(node) {
        var names = Object.keys((node && node.children) || {});
        names.forEach(function(name) {
          var child = node.children[name];
          var pathKey = normalizeFilterText(child.path);
          if (pathKey && pathKey !== 'dz' && Object.keys(child.children || {}).length) {
            branchKeys.push(pathKey);
          }
          walk(child);
        });
      };
      walk(treeRoot);
      return branchKeys;
    };
    var applyObjectMapFolderDimmingToDom = function() {
      if (!folderTreeEl) return;
      var shouldDimMap = activeCollectionFilter === AppMode.OBJECT_MAP;
      var shouldDimTypes = activeCollectionFilter === AppMode.TYPES_EXPLORER && Object.keys(typesExplorerByObject).length > 0;
      var buttons = folderTreeEl.querySelectorAll('[data-folder-path]');
      buttons.forEach(function(btn) {
        var pathKey = normalizeFilterText(btn.getAttribute('data-folder-path') || '');
        var isAppRow = pathKey.indexOf('__') === 0;
        var keepVisibleForMap = pathKey.indexOf('dz/structures') === 0 || pathKey.indexOf('dz/structures_bliss') === 0;
        var dim = false;
        if (shouldDimMap) {
          dim = pathKey && pathKey !== 'dz' && !isAppRow && !keepVisibleForMap;
        } else if (shouldDimTypes) {
          dim = pathKey && pathKey !== 'dz' && !isAppRow && !typesExplorerFolderPrefixIndex[pathKey];
        }
        btn.classList.toggle('is-dim', !!dim);
      });
    };
    var positionFolderBulkWithAnimals = function(forceRecalc) {
      if (!folderSidebarBulkEl || !folderSidebarControlsEl || !folderTreeEl) return;
      if (!forceRecalc && folderBulkAnimalsTop !== null) {
        folderSidebarBulkEl.style.top = folderBulkAnimalsTop + 'px';
        folderSidebarBulkEl.style.marginTop = '0';
        folderBulkMode = 'animals';
        return;
      }
      var firstFolderBtn = folderTreeEl.querySelector('[data-folder-path]:not([data-folder-path^="__"])');
      if (!firstFolderBtn) {
        folderBulkAnimalsTop = null;
        folderSidebarBulkEl.style.top = '100%';
        folderSidebarBulkEl.style.marginTop = '8px';
        folderBulkMode = 'animals';
        return;
      }
      var controlsRect = folderSidebarControlsEl.getBoundingClientRect();
      var rowRect = firstFolderBtn.getBoundingClientRect();
      var bulkRect = folderSidebarBulkEl.getBoundingClientRect();
      var targetTop = rowRect.top - controlsRect.top + ((rowRect.height - bulkRect.height) / 2);
      folderBulkAnimalsTop = Math.max(controlsRect.height + 4, Math.round(targetTop));
      folderSidebarBulkEl.style.top = folderBulkAnimalsTop + 'px';
      folderSidebarBulkEl.style.marginTop = '0';
      folderBulkMode = 'animals';
    };
    var syncFolderBulkStickyMode = function() {
      if (!folderSidebarBulkEl || !folderSidebarControlsEl || !folderTreeEl) return;
      if (folderBulkAnimalsTop === null) {
        positionFolderBulkWithAnimals();
      }
      var animalsBtn = folderTreeEl.querySelector('[data-folder-path]:not([data-folder-path^="__"])');
      if (!animalsBtn || folderBulkAnimalsTop === null) return;
      var controlsRect = folderSidebarControlsEl.getBoundingClientRect();
      var animalsRect = animalsBtn.getBoundingClientRect();
      var animalsStillInNormalZone = animalsRect.top >= controlsRect.bottom - 2;
      if (animalsStillInNormalZone) {
        folderSidebarBulkEl.style.top = folderBulkAnimalsTop + 'px';
        folderSidebarBulkEl.style.marginTop = '0';
        folderBulkMode = 'animals';
        return;
      }
      folderSidebarBulkEl.style.top = (Math.round(controlsRect.height) + 4) + 'px';
      folderSidebarBulkEl.style.marginTop = '0';
      folderBulkMode = 'search';
    };
    var updateFiltersAppTitle = function() {
      if (!filtersAppTitleEl || !filtersAppTitleIconEl || !filtersAppTitleTextEl) return;
      if (activeCollectionFilter === AppMode.TYPES_EXPLORER || activeCollectionFilter === AppMode.OBJECT_MAP) {
        filtersAppTitleEl.hidden = true;
        return;
      }
      var config = {
        label: 'Object Finder',
        src: '/favicon.png',
        colorClass: '',
        iconClass: 'is-logo'
      };
      if (activeCollectionFilter === AppMode.PRESETS) {
        config = {
          label: 'Editor Builds',
          src: '/icons/copy-editor.svg',
          colorClass: '',
          iconClass: ''
        };
      }
      filtersAppTitleTextEl.textContent = config.label;
      filtersAppTitleIconEl.setAttribute('src', config.src);
      filtersAppTitleIconEl.className = 'filters-app-title__icon' + (config.iconClass ? (' ' + config.iconClass) : '');
      filtersAppTitleEl.className = 'filters-app-title';
      filtersAppTitleEl.hidden = false;
      if (filtersEl) {
        var lengthWrap = filtersEl.querySelector('.dataTables_length');
        if (lengthWrap && filtersAppTitleEl.parentNode === filtersEl && filtersAppTitleEl.nextSibling !== lengthWrap) {
          filtersEl.insertBefore(filtersAppTitleEl, lengthWrap);
        }
      }
    };
    var updateFolderSidebarTitle = function() {
      if (!folderSidebarTitleEl) return;
      if (
        activeCollectionFilter === AppMode.OBJECT_MAP &&
        objectMapSearchMode === 'exact_object' &&
        objectMapExactSearchQuery
      ) {
        var resolvedMapKey = objectMapActiveMapKey || 'chernarus';
        var resolvedMap = currentObjectLocationData && currentObjectLocationData[resolvedMapKey];
        var mapCount = resolvedMap && typeof resolvedMap.count === 'number' ? resolvedMap.count : 0;
        folderSidebarTitleEl.textContent = mapCount.toLocaleString() + ' objects';
        return;
      }
      var visibleCount = table ? table.rows({ search: 'applied' }).count() : 0;
      folderSidebarTitleEl.textContent = visibleCount.toLocaleString() + ' objects';
    };
    var renderFolderTree = function() {
      if (!folderTreeEl) return;
      var tree = buildFolderTreeData(getFolderTreeSourcePrefixes());
      var treeRoot = (tree && tree.children && tree.children.dz) ? tree.children.dz : tree;
      var forceExpandForSearch = isFolderTreeInBroadFilterMode();
      var hasVisibleFolders = !!Object.keys((treeRoot && treeRoot.children) || {}).length;
      var databaseActive = activeCollectionFilter === AppMode.DATABASE;
      var presetsActive = activeCollectionFilter === AppMode.PRESETS;
      var renderChildren = function(node) {
        var names = Object.keys(node.children || {}).sort(function(a, b) {
          return a.localeCompare(b);
        });
        if (!names.length) return '';
        var html = '<ul>';
        names.forEach(function(name) {
          var child = node.children[name];
          var pathKey = normalizeFilterText(child.path);
          var childNames = Object.keys(child.children || {});
          var hasChildren = childNames.length > 0;
          var isRootFolder = pathKey === 'dz';
          var isOpen = hasChildren ? (isRootFolder ? true : (forceExpandForSearch ? true : !!folderTreeExpanded[pathKey])) : false;
          var isActive = (activeFolderFilter && activeFolderFilter === pathKey) || (highlightedFolderPath && highlightedFolderPath === pathKey);
          var isDimmedForMap = false;
          html += '<li>';
          html += '<div class="folder-tree__row">';
          if (isRootFolder) {
            html += '<span class="folder-tree__leaf-spacer" aria-hidden="true"></span>';
          } else if (hasChildren) {
            html += '<button class="folder-tree__toggle" type="button" data-folder-toggle="' + escapeHtml(pathKey) + '" aria-expanded="' + (isOpen ? 'true' : 'false') + '">' + (isOpen ? '−' : '+') + '</button>';
          } else {
            html += '<span class="folder-tree__leaf-icon" aria-hidden="true">▸</span>';
          }
          html += '<button class="folder-tree__folder' + (isActive ? ' is-active' : '') + (isDimmedForMap ? ' is-dim' : '') + '" type="button" data-folder-path="' + escapeHtml(pathKey) + '" title="' + escapeHtml(child.path) + '">' + escapeHtml(child.name) + '</button>';
          if (pathKey && pathKey !== 'dz') {
            html += '<button class="folder-tree__pin-link icon-action" type="button" data-folder-pin-link="' + escapeHtml(pathKey) + '" title="Pin folder objects"><span class="ui-icon ui-icon--pin" aria-hidden="true"></span></button>';
            html += '<button class="folder-tree__copy-link icon-action" type="button" data-folder-copy-link="' + escapeHtml(pathKey) + '" title="Copy folder link"><span class="ui-icon ui-icon--link" aria-hidden="true"></span></button>';
          }
          html += '</div>';
          if (hasChildren) {
            html += '<div class="folder-tree__children"' + (isOpen ? '' : ' hidden') + '>' + renderChildren(child) + '</div>';
          }
          html += '</li>';
        });
        html += '</ul>';
        return html;
      };
      var renderGuideHelpBtn = function(appKey, title) {
        return '<button class="folder-tree__folder-help" type="button" data-guide-app="' + appKey + '" title="' + title + '">?</button>';
      };
      var presetsRow = ''
        + '<div class="folder-tree__row folder-tree__row--database">'
        + '<img class="folder-tree__app-logo" src="/favicon.png" alt="Object Finder">'
        + '<button class="folder-tree__folder' + (databaseActive ? ' is-active' : '') + '" type="button" data-folder-path="__database__" title="Object Finder">Object Finder</button>'
        + (databaseActive ? renderGuideHelpBtn('database', 'Show Object Finder help') : '')
        + '</div>'
        + '<div class="folder-tree__row folder-tree__row--object-map">'
        + '<img class="folder-tree__app-icon" src="/icons/object-map.svg" alt="" aria-hidden="true">'
        + '<button class="folder-tree__folder' + (activeCollectionFilter === AppMode.OBJECT_MAP ? ' is-active' : '') + '" type="button" data-folder-path="__object_map__" title="Object Maps">Object Maps</button>'
        + (activeCollectionFilter === AppMode.OBJECT_MAP ? renderGuideHelpBtn('object_map', 'Show Object Maps help') : '')
        + '</div>'
        + '<div class="folder-tree__row folder-tree__row--types-explorer">'
        + '<img class="folder-tree__app-icon" src="/icons/types-explorer.svg" alt="" aria-hidden="true">'
        + '<button class="folder-tree__folder' + (activeCollectionFilter === AppMode.TYPES_EXPLORER ? ' is-active' : '') + '" type="button" data-folder-path="__types_explorer__" title="Types Explorer">Types Explorer</button>'
        + (activeCollectionFilter === AppMode.TYPES_EXPLORER ? renderGuideHelpBtn('types_explorer', 'Show Types Explorer help') : '')
        + '</div>'
        + '<div class="folder-tree__row folder-tree__row--presets">'
        + '<img class="folder-tree__app-icon" src="/icons/copy-editor.svg" alt="" aria-hidden="true">'
        + '<button class="folder-tree__folder' + (presetsActive ? ' is-active' : '') + '" type="button" data-folder-path="__presets__" title="Editor Builds">Editor Builds</button>'
        + (presetsActive ? renderGuideHelpBtn('presets', 'Show Editor Builds help') : '')
        + '</div>'
        + '<div class="folder-tree__apps-divider" aria-hidden="true"></div>'
        + (!hasVisibleFolders && forceExpandForSearch ? '<div class="folder-tree__empty">No matching folders found.</div>' : '');
      var branchKeys = getVisibleFolderBranchKeys();
      var openCount = branchKeys.filter(function(key) { return !!folderTreeExpanded[key]; }).length;
      if (folderSidebarBulkEl) {
        if (branchKeys.length) {
          folderSidebarBulkEl.innerHTML = '<div class="folder-tree__bulk">'
            + '<button class="folder-tree__bulk-btn' + (openCount > 0 ? '' : ' is-hidden') + '" type="button" data-tree-bulk="collapse" title="Collapse all">[-]</button>'
            + '<button class="folder-tree__bulk-btn' + (openCount < branchKeys.length ? '' : ' is-hidden') + '" type="button" data-tree-bulk="expand" title="Expand all">[+]</button>'
            + '</div>';
          folderSidebarBulkEl.setAttribute('aria-hidden', 'false');
        } else {
          folderSidebarBulkEl.innerHTML = '';
          folderSidebarBulkEl.setAttribute('aria-hidden', 'true');
        }
      }
      folderTreeEl.innerHTML = presetsRow + renderChildren(treeRoot);
      updateFolderSidebarTitle();
      updateFiltersAppTitle();
      updateTypesExplorerPanelVisibility();
      updateObjectMapPanelVisibility();
      updatePresetsGuideNotice();
      applyObjectMapFolderDimmingToDom();
      var canRecalcBulk = !folderSidebarEl || (folderSidebarEl.scrollTop <= 1);
      positionFolderBulkWithAnimals(canRecalcBulk);
      syncFolderBulkStickyMode();
    };
    var setActiveFolderFilterValue = function(value) {
      activeFolderFilter = normalizeFilterText(value || '');
    };
    var setActiveFolderFilter = function(value, shouldDraw) {
      setActiveFolderFilterValue(value);
      objectMapExactSearchQuery = '';
      objectMapSearchMode = '';
      highlightedFolderPath = '';
      renderFolderTree();
      dispatchObjectMapV2SearchState();
      if (shouldDraw !== false && table) {
        table.draw();
      }
      updatePathFilterNotice();
    };
    var updatePresetsGuideNotice = function() {
      updateAppGuideNotices();
    };
    var updateTableColumnLabels = function() {
      var headerCells = document.querySelectorAll('#dayzObjects thead th');
      if (!headerCells || headerCells.length < 5) return;
      var isPresetsMode = activeCollectionFilter === AppMode.PRESETS;
      headerCells[3].textContent = isPresetsMode ? 'Builder' : 'In-game name';
      headerCells[4].textContent = isPresetsMode ? 'Export' : 'Path';
    };
    var populateFolderFilter = function(sourceData) {
      var seen = {};
      var folders = [];
      (Array.isArray(sourceData) ? sourceData : []).forEach(function(row) {
        if (isPresetRow(row)) return;
        extractPathPrefixes(row && row.path ? row.path : '').forEach(function(prefix) {
          var key = prefix.toLowerCase();
          if (seen[key]) return;
          seen[key] = true;
          folders.push(prefix);
        });
      });
      folders.sort(function(a, b) { return a.localeCompare(b); });
      knownFolderPrefixes = folders;
      updateFilteredFolderPrefixes();
      renderFolderTree();
    };
    var rowMatchesCollectionWithIndex = function(collectionKey, row, typesExplorerIndex) {
      var coreRowMatchesCollectionWithIndex = requireCoreModule('rowMatchesCollectionWithIndex');
      return coreRowMatchesCollectionWithIndex(collectionKey, row, typesExplorerIndex, {
        normalizeFilterText: normalizeFilterText,
        getObjectName: getObjectName,
        getSearchTags: getSearchTags
      });
    };
    var rowMatchesCollection = function(collectionKey, row) {
      return rowMatchesCollectionWithIndex(collectionKey, row, typesExplorerByObject);
    };
    var isPresetRow = function(row) {
      if (!row) return false;
      var category = normalizeFilterText(row.category || '');
      if (category.indexOf('preset') !== -1 || category.indexOf('build') !== -1) return true;
      var modelType = normalizeFilterText(row.modelType || '');
      return modelType.indexOf('preset') !== -1 || modelType.indexOf('build') !== -1;
    };
    var getPresetBuilder = function(row) {
      if (!row) return 'samgeekman';
      var direct = String(row.builder || '').trim();
      return direct || 'samgeekman';
    };
    var hasPresetEditorJson = function(row) {
      return !!(row && Array.isArray(row.editorJson) && row.editorJson.length > 0);
    };
    var getPresetImportJsonPath = function(row) {
      return row ? String(row.presetImportJsonPath || '').trim() : '';
    };
    var getPresetCopyablePath = function(row) {
      return row ? String(row.presetCopyablePath || '').trim() : '';
    };
    var buildPresetStaticJsonPath = function(rawName) {
      var slug = String(rawName || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
      return slug ? ('presets/' + slug + '.json') : '';
    };
    var presetPayloadCache = {};
    var presetPayloadPending = {};
    var getPresetCandidatePaths = function(copyablePath, importPath, objectName) {
      var objectNamePath = buildPresetStaticJsonPath(objectName);
      var legacyFolderPath = '';
      var legacySourcePath = copyablePath || importPath;
      var legacyMatch = String(legacySourcePath || '').match(/^database\/presets\/([^/]+)\//i);
      if (legacyMatch && legacyMatch[1]) {
        legacyFolderPath = buildPresetStaticJsonPath(legacyMatch[1]);
      }
      return [copyablePath, importPath]
        .concat([objectNamePath, legacyFolderPath])
        .map(function(path) { return String(path || '').trim(); })
        .filter(Boolean)
        .filter(function(path, idx, list) { return list.indexOf(path) === idx; });
    };
    var loadPresetPayloadPath = async function(path) {
      var normalizedPath = String(path || '').replace(/^\/+/, '').trim();
      if (!normalizedPath) return '';
      if (presetPayloadCache.hasOwnProperty(normalizedPath)) {
        return presetPayloadCache[normalizedPath];
      }
      if (presetPayloadPending[normalizedPath]) {
        return presetPayloadPending[normalizedPath];
      }
      presetPayloadPending[normalizedPath] = (async function() {
        try {
          var response = await fetch('/' + encodeURI(normalizedPath), { cache: 'force-cache' });
          if (!response.ok) return '';
          var fetchedText = await response.text();
          if (!fetchedText || !fetchedText.trim()) return '';
          var parsedPreset = JSON.parse(fetchedText);
          return JSON.stringify(normalizePresetClipboardEntries(parsedPreset), null, 4);
        } catch (err) {
          return '';
        }
      })();
      var payload = await presetPayloadPending[normalizedPath];
      presetPayloadCache[normalizedPath] = payload || '';
      delete presetPayloadPending[normalizedPath];
      return presetPayloadCache[normalizedPath];
    };
    var fetchPresetCopyPayloadFromValues = async function(copyablePath, importPath, objectName) {
      var candidatePaths = getPresetCandidatePaths(copyablePath, importPath, objectName);
      for (var p = 0; p < candidatePaths.length; p += 1) {
        var payload = await loadPresetPayloadPath(candidatePaths[p]);
        if (payload) return payload;
      }
      return '';
    };
    var fetchPresetCopyPayload = async function(rowData) {
      return fetchPresetCopyPayloadFromValues(
        getPresetCopyablePath(rowData),
        getPresetImportJsonPath(rowData),
        getObjectName(rowData)
      );
    };
    var warmPresetPayloads = function(rows) {
      (Array.isArray(rows) ? rows : []).forEach(function(row) {
        if (!isPresetRow(row)) return;
        var paths = getPresetCandidatePaths(
          getPresetCopyablePath(row),
          getPresetImportJsonPath(row),
          getObjectName(row)
        );
        if (!paths.length) return;
        paths.forEach(function(p) { loadPresetPayloadPath(p); });
      });
    };
    var showContent = function() {
      $('#dayzObjects, #dayzObjects_wrapper').css('visibility', 'visible');
      $('#loadingIndicator').hide();
      $('#filters').css('display', 'flex');
      if (statusMessageEl) {
        statusMessageEl.style.display = 'none';
      }
      ensureObjectMapV2FrameLoaded();
      syncSidebarTopOffset();
    };
    var syncSidebarTopOffset = function() {
      if (window.matchMedia('(max-width: 1100px)').matches) {
        document.documentElement.style.setProperty('--sidebars-top-offset', '135px');
        return;
      }
      var navEl = document.querySelector('nav');
      var wrapperEl = document.querySelector('.objects-layout #dayzObjects_wrapper');
      var layoutEl = document.querySelector('.objects-layout');
      if (!wrapperEl && !layoutEl) return;
      var navBottom = 0;
      if (navEl && typeof navEl.getBoundingClientRect === 'function') {
        var navRect = navEl.getBoundingClientRect();
        navBottom = Math.max(0, Math.round(navRect.bottom || 0));
      }
      var contentTop = wrapperEl
        ? Math.round(wrapperEl.getBoundingClientRect().top)
        : Math.round(layoutEl.getBoundingClientRect().top);
      var topOffset = Math.max(navBottom + 8, contentTop);
      document.documentElement.style.setProperty('--sidebars-top-offset', topOffset + 'px');
    };
    var sidebarTopOffsetRaf = 0;
    var scheduleSidebarTopOffsetSync = function() {
      if (sidebarTopOffsetRaf) {
        cancelAnimationFrame(sidebarTopOffsetRaf);
      }
      sidebarTopOffsetRaf = requestAnimationFrame(function() {
        sidebarTopOffsetRaf = 0;
        syncSidebarTopOffset();
      });
    };
    window.addEventListener('scroll', scheduleSidebarTopOffsetSync, { passive: true });

    $tableEl.one('init.dt', showContent);

    var tableRenderers = requireCoreModule('createTableRenderers')({
      escapeHtml: escapeHtml,
      getObjectName: getObjectName,
      isPresetRow: isPresetRow,
      getPresetBuilder: getPresetBuilder,
      getPresetImportJsonPath: getPresetImportJsonPath,
      getPresetCopyablePath: getPresetCopyablePath,
      hasPresetEditorJson: hasPresetEditorJson,
      normalizeFilterText: normalizeFilterText,
      getConsoleFlag: getConsoleFlag,
      getSearchTags: getSearchTags,
      PATH_FILTER_ICON_ENTITY: PATH_FILTER_ICON_ENTITY,
      typesEntryByName: typesEntryByName,
      typesEntryByNameLower: typesEntryByNameLower,
      mapGroupProtoEntryByName: mapGroupProtoEntryByName,
      mapGroupProtoEntryByNameLower: mapGroupProtoEntryByNameLower
    });
    var renderThumbCell = tableRenderers.renderThumbCell;
    var renderNameCell = tableRenderers.renderNameCell;
    var renderInGameOrBuilderCell = tableRenderers.renderInGameOrBuilderCell;
    var renderPathOrPresetActionsCell = tableRenderers.renderPathOrPresetActionsCell;
    var renderInfoChipsCell = tableRenderers.renderInfoChipsCell;
    var renderTagsCell = tableRenderers.renderTagsCell;

    var table = $tableEl.DataTable({
      ajax: {
        url: '/data/dayz_objects.json',
        dataSrc: ''
      },
      deferRender: true,
      responsive: {
        breakpoints: [
          { name: 'wide', width: 1360 },
          { name: 'desktop', width: 1133 },
          { name: 'tablet', width: 744 },
          { name: 'mobile', width: 0 }
        ],
        details: {
          type: 'column',
          target: 0,
          renderer: function(api, rowIdx) {
            var $cell = $(api.row(rowIdx).node()).find('.object-name-cell');
            return buildRowDetailsHtml($cell);
          }
        }
      },
      pageLength: 50,
      lengthMenu: [[50,100,200,500],[50,100,200,500]],
      columns: [
        { data: null, defaultContent: '' },
        {
          data: null,
          render: renderThumbCell
        },
        {
          data: null,
          render: renderNameCell
        },
        {
          data: null,
          render: renderInGameOrBuilderCell
        },
        {
          data: null,
          render: renderPathOrPresetActionsCell
        },
        {
          data: null,
          render: renderInfoChipsCell
        },
        {
          data: null,
          render: renderTagsCell
        },
        { data: 'id', defaultContent: '' }
      ],
      columnDefs: [
        { targets: 0, orderable: false, className: 'dtr-control min-desktop' },
        { targets: 1, orderable: false, className: 'all thumb-cell' },
        {
          targets: 2,
          className: 'all object-name-cell',
          createdCell: function(td, cellData, rowData) {
            var objName = getObjectName(rowData);
            var consoleFlag = getConsoleFlag(rowData);
            var editorJson = rowData.editorJson ? JSON.stringify(rowData.editorJson) : '';
            td.setAttribute('data-object', objName);
            td.setAttribute('data-p3d', rowData.path || '');
            td.setAttribute('data-modeltype', rowData.modelType || '');
            td.setAttribute('data-ingame', rowData.inGameName || '');
            td.setAttribute('data-category', rowData.category || '');
            td.setAttribute('data-console', consoleFlag);
            td.setAttribute('data-tags', getSearchTags(rowData));
            var imageList = [];
            var rawImages = rowData && rowData.images;
            if (Array.isArray(rawImages)) {
              imageList = rawImages.map(function(item) { return String(item || '').trim(); }).filter(Boolean);
            } else if (typeof rawImages === 'string' && rawImages.trim()) {
              try {
                var parsed = JSON.parse(rawImages);
                if (Array.isArray(parsed)) {
                  imageList = parsed.map(function(item) { return String(item || '').trim(); }).filter(Boolean);
                }
              } catch (_) {}
            }
            var primaryImage = imageList.length ? imageList[0] : (rowData.image || '');
            if (primaryImage && imageList.indexOf(primaryImage) === -1) {
              imageList.unshift(primaryImage);
            }
            td.setAttribute('data-image', primaryImage);
            td.setAttribute('data-images', JSON.stringify(imageList));
            td.setAttribute('data-objectid', getObjectId(rowData));
            td.setAttribute('data-editorjson', editorJson);
            td.setAttribute('data-preset-import-path', getPresetImportJsonPath(rowData));
            td.setAttribute('data-preset-copy-path', getPresetCopyablePath(rowData));
            td.setAttribute('data-linked-p3d', rowData['linked-p3d'] || '');
            td.setAttribute('data-linked-config', JSON.stringify(parseLinkedIds(rowData['linked-config'])));
            td.setAttribute('data-linked-variant', JSON.stringify(parseLinkedIds(rowData['linked-variant'])));
            td.setAttribute('data-dimensions', JSON.stringify(parseDimensionsVisual(rowData.dimensionsVisual)));
          }
        },
        { targets: 3, className: 'min-desktop' },
        { targets: 4, className: 'min-desktop path-cell' },
        { targets: 5, className: 'min-wide info-cell' },
        { targets: 6, visible: false, searchable: true },
        { targets: 7, visible: false, searchable: true }
      ],
      dom: '<"top-bar"lfr>tip',
      language: {
        lengthMenu: "Show _MENU_ objects",
        search: "Search: ",
        searchPlaceholder: "'large snow rock', '308 rifles'",
        zeroRecords: "No matching objects found."
      }
    });

    var chipInfoHideTimer = null;
    var chipInfoLockUntil = 0;
    var showChipInfoTooltip = function(targetEl, html, autoHideMs) {
      if (!chipInfoTooltipEl || !targetEl || !html) return;
      chipInfoTooltipEl.innerHTML = html;
      var rect = targetEl.getBoundingClientRect();
      var left = rect.left + (rect.width / 2);
      var top = rect.top - 8;
      var safeLeft = Math.max(12, Math.min(left, window.innerWidth - 12));
      var safeTop = Math.max(12, top);
      chipInfoTooltipEl.style.left = safeLeft + 'px';
      chipInfoTooltipEl.style.top = safeTop + 'px';
      chipInfoTooltipEl.classList.add('visible');
      chipInfoLockUntil = Date.now() + 5000;
      if (chipInfoHideTimer) {
        clearTimeout(chipInfoHideTimer);
        chipInfoHideTimer = null;
      }
      var duration = Number(autoHideMs);
      if (!isFinite(duration)) duration = 0;
      if (duration > 0) {
        chipInfoHideTimer = setTimeout(function() {
          chipInfoTooltipEl.classList.remove('visible');
          chipInfoHideTimer = null;
        }, duration);
      }
    };
    var hideChipInfoTooltip = function() {
      if (!chipInfoTooltipEl) return;
      chipInfoTooltipEl.classList.remove('visible');
    };
    var flashIconButton = function($btn) {
      if (!$btn || !$btn.length) return;
      var resetHtml = $btn.html();
      $btn.text('✔');
      setTimeout(function() { $btn.html(resetHtml); }, 900);
    };
    var iconHtml = function(name) {
      return '<span class="ui-icon ui-icon--' + name + '" aria-hidden="true"></span>';
    };
    var iconLabelHtml = function(name, label) {
      return iconHtml(name) + '<span>' + escapeHtml(label) + '</span>';
    };
    var setObjectFocusPinButton = function(isPinnedState) {
      if (!objectFocusPinEl) return;
      objectFocusPinEl.innerHTML = iconLabelHtml('pin', isPinnedState ? 'Unpin' : 'Pin');
    };
    var copyEditorJsonForRow = function(rowData) {
      if (!rowData) return false;
      var editorJsonRaw = rowData.editorJson ? JSON.stringify(rowData.editorJson) : '';
      var jsonText = buildEditorJson(
        editorJsonRaw,
        getObjectName(rowData),
        rowData.modelType || '',
        rowData.path || ''
      );
      if (!jsonText) return false;
      navigator.clipboard.writeText(jsonText);
      return true;
    };
    var copyTextToClipboard = async function(text) {
      var value = String(text || '');
      if (!value) return false;
      try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          await navigator.clipboard.writeText(value);
          return true;
        }
      } catch (err) {}
      try {
        var ta = document.createElement('textarea');
        ta.value = value;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        ta.style.top = '0';
        document.body.appendChild(ta);
        ta.select();
        ta.setSelectionRange(0, ta.value.length);
        var ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return !!ok;
      } catch (err) {
        return false;
      }
    };
    var togglePinnedForRow = function(rowData) {
      if (!rowData) return false;
      var item = buildPinnedItemFromData(rowData);
      if (!item || !item.objName) return false;
      if (isPinned(item.objName)) {
        removePinnedItemByName(item.objName);
      } else {
        addPinnedItem(item);
      }
      return true;
    };
    var applyPathFilterForRow = function(rowData) {
      if (!rowData) return false;
      var rawPath = String(rowData.path || '');
      var targetPath = getDeepestPathPrefix(rawPath);
      if (!targetPath) return false;
      if (table) {
        table.column(7).search('');
      }
      treatIdListAsSearchFolders = false;
      expandFolderTreeForPath(rawPath);
      setActiveCollectionFilter(AppMode.DATABASE);
      setActiveFolderFilter(targetPath, true);
      AppUrl.push({}, { sourceUrl: buildFolderPathUrl(targetPath) });
      updatePathFilterNotice();
      updateTypesTagFilterNotice();
      return true;
    };
    var resolvePathActionTarget = function(rowData) {
      if (!rowData) return null;
      var rawPath = String(rowData.path || '').trim();
      if (!rawPath) return null;
      var targetPath = getDeepestPathPrefix(rawPath);
      if (!targetPath) return null;
      return { rawPath: rawPath, targetPath: targetPath };
    };
    var pinPathForRow = function(rowData) {
      var target = resolvePathActionTarget(rowData);
      if (!target) return false;
      var sourceRows = getDataArray();
      var rows = sourceRows.filter(function(rowItem) {
        var rowPath = normalizeFilterText((rowItem && rowItem.path) || '');
        if (!rowPath) return false;
        return rowPath === target.targetPath || rowPath.indexOf(target.targetPath + '/') === 0;
      });
      if (!rows.length) return false;
      addPinnedPathItem(target.targetPath, rows);
      return true;
    };
    var buildChipSummaryItems = function(rowData) {
      if (!rowData) return [];
      var modelType = String(rowData.modelType || '').toLowerCase();
      var hasConfig = modelType === 'config';
      var hasP3d = modelType === 'raw p3d' || modelType === 'p3d';
      var isPreset = modelType === 'preset' || modelType === 'build';
      var objName = String(getObjectName(rowData) || '').trim();
      var objNameKey = normalizeFilterText(objName);
      var hasTypesEntry = !!typesEntryByName[objName] || !!typesEntryByNameLower[objNameKey];
      var hasProtoEntry = !!mapGroupProtoEntryByName[objName] || !!mapGroupProtoEntryByNameLower[objNameKey];
      var isConsoleFriendly = getConsoleFlag(rowData) === '✅';
      var item = function(label, chipClass, explanation) {
        return { label: label, chipClass: chipClass, explanation: explanation };
      };
      var items = [];
      items.push(isConsoleFriendly
        ? item('Console', 'info-chip--console-yes', 'Will work on console')
        : item('Console', 'info-chip--console-no', 'Will not work on console'));
      if (hasConfig) items.push(item('Config', 'info-chip--cfg', 'Is a classed object'));
      if (hasP3d) items.push(item('P3D', 'info-chip--p3d', 'Raw P3D model'));
      if (isPreset) items.push(item('Build', 'info-chip--preset', 'Copyable build for DayZ Editor'));
      if (hasTypesEntry) items.push(item('Types', 'info-chip--types', 'Has a Types.xml entry'));
      if (hasProtoEntry) items.push(item('Proto', 'info-chip--proto', 'Has a MapGroupProto.xml entry'));
      return items;
    };
    var renderChipSummaryHtml = function(items) {
      if (!Array.isArray(items) || !items.length) return '';
      return items.map(function(entry) {
        return '<div class="chip-info-tooltip__row">'
          + '<span class="info-chip ' + escapeHtml(entry.chipClass || '') + '">' + escapeHtml(entry.label || '') + '</span>'
          + '<span class="chip-info-tooltip__text">' + escapeHtml(entry.explanation || '') + '</span>'
          + '</div>';
      }).join('');
    };
    var chipInfoHoverTimer = null;
    var scheduleHideChipInfoTooltip = function(delayMs) {
      if (chipInfoHideTimer) {
        clearTimeout(chipInfoHideTimer);
        chipInfoHideTimer = null;
      }
      chipInfoHideTimer = setTimeout(function() {
        hideChipInfoTooltip();
      }, Math.max(40, Number(delayMs) || 80));
    };
    $tableEl.on('mouseenter', 'td.info-cell', function() {
      var cellEl = this;
      if (chipInfoHoverTimer) {
        clearTimeout(chipInfoHoverTimer);
      }
      if (chipInfoHideTimer) {
        clearTimeout(chipInfoHideTimer);
        chipInfoHideTimer = null;
      }
      chipInfoHoverTimer = setTimeout(function() {
        var $tr = $(cellEl).closest('tr');
        if ($tr.hasClass('child')) {
          $tr = $tr.prev();
        }
        var rowData = table.row($tr).data();
        var items = buildChipSummaryItems(rowData);
        if (!items.length) return;
        showChipInfoTooltip(cellEl, renderChipSummaryHtml(items));
      }, 500);
    });
    $tableEl.on('mouseleave', 'td.info-cell', function() {
      if (chipInfoHoverTimer) {
        clearTimeout(chipInfoHoverTimer);
        chipInfoHoverTimer = null;
      }
      var now = Date.now();
      var delay = chipInfoLockUntil > now ? (chipInfoLockUntil - now) : 0;
      scheduleHideChipInfoTooltip(delay);
    });
    // Main table path hover uses inline shortened text + CSS tooltip.
    window.addEventListener('scroll', function() {
      hideChipInfoTooltip();
    }, { passive: true });
    
    if (table.settings()[0]._bInitComplete) {
      showContent();
    }
   
    $("#filters").insertBefore("#dayzObjects_wrapper .top-bar");
    $("#dayzObjects_wrapper .dataTables_length").prependTo("#filters");
    $("#objectMapPanel").prependTo("#dayzObjects_wrapper");
    $("#typesExplorerPanel").prependTo("#dayzObjects_wrapper");
    syncSidebarTopOffset();

    $tableEl.addClass('dtr-column');
    $(window).on('resize', function() {
      if (table) {
        table.columns.adjust();
        table.responsive.recalc();
      }
      syncSidebarTopOffset();
      positionFolderBulkWithAnimals(true);
      syncFolderBulkStickyMode();
    });

    var logoLink = document.querySelector('nav a');
    if (logoLink) {
      logoLink.addEventListener('click', function() {
        if (table) {
          table.search('').columns().search('').draw();
        }
        FocusPane.clear();
      });
    }

    var objectFocusEl = document.getElementById('objectFocus');
    var objectsLayoutEl = document.querySelector('.objects-layout');
    var objectFocusNameEl = document.getElementById('objectFocusName');
    var objectFocusPathEl = document.getElementById('objectFocusPath');
    var objectFocusImageEl = document.getElementById('objectFocusImage');
    var objectFocusPreviewImgEl = document.getElementById('objectFocusPreviewImg');
    var objectFocusImageMissingEl = document.getElementById('objectFocusImageMissing');
    var objectFocusLinkEl = document.getElementById('objectFocusLink');
    var objectFocusTypesLinkEl = document.getElementById('objectFocusTypesLink');
    var objectFocusMapGroupProtoLinkEl = document.getElementById('objectFocusMapGroupProtoLink');
    var objectFocusClearEl = document.getElementById('objectFocusClear');
    var objectFocusCopyEl = document.getElementById('objectFocusCopy');
    var objectFocusEditorEl = document.getElementById('objectFocusEditor');
    var objectFocusNameCopyEl = document.getElementById('objectFocusNameCopy');
    var folderSidebarEl = document.getElementById('folderSidebar');
    var folderSidebarControlsEl = folderSidebarEl ? folderSidebarEl.querySelector('.folder-sidebar__controls') : null;
    var folderTreeEl = document.getElementById('folderTree');
    var folderSidebarTitleEl = document.getElementById('folderSidebarTitle');
    var folderSidebarClearEl = document.getElementById('folderSidebarClear');
    var folderSidebarBulkEl = document.getElementById('folderSidebarBulk');
    var folderSidebarSearchEl = document.getElementById('folderSidebarSearch');
    var folderSidebarSearchLinkEl = document.getElementById('folderSidebarSearchLink');
    var folderSidebarSearchClearEl = document.getElementById('folderSidebarSearchClear');
    var filtersEl = document.getElementById('filters');
    var filtersAppTitleEl = document.getElementById('filtersAppTitle');
    var filtersAppTitleIconEl = document.getElementById('filtersAppTitleIcon');
    var filtersAppTitleTextEl = document.getElementById('filtersAppTitleText');
    var filterConsoleEl = document.getElementById('filterConsole');
    var typesExplorerPanelEl = document.getElementById('typesExplorerPanel');
    var typesExplorerUsageTagsEl = document.getElementById('typesExplorerUsageTags');
    var typesExplorerValueTagsEl = document.getElementById('typesExplorerValueTags');
    var typesExplorerScopeEl = document.getElementById('typesExplorerScope');
    var typesExplorerResetEl = document.getElementById('typesExplorerReset');
    var typesExplorerCopyLinkEl = document.getElementById('typesExplorerCopyLink');
    var typesExplorerDownloadCurrentEl = document.getElementById('typesExplorerDownloadCurrent');
    var objectMapPanelEl = document.getElementById('objectMapPanel');
    var objectMapOverlayEl = document.getElementById('objectMapOverlay');
    var objectMapBackdropGroupEl = document.getElementById('objectMapBackdropGroup');
    var objectMapMarkersGroupEl = document.getElementById('objectMapMarkersGroup');
    var objectMapSelectionGroupEl = document.getElementById('objectMapSelectionGroup');
    var objectMapStatusEl = document.getElementById('objectMapStatus');
    var objectMapCopyCoordsEl = document.getElementById('objectMapCopyCoords');
    var objectMapPromptEl = document.getElementById('objectMapPrompt');
    var objectMapTooltipEl = document.getElementById('objectMapTooltip');
    var objectMapV2FrameEl = document.getElementById('objectMapV2Frame');
    var objectMapToggleChernarusEl = document.getElementById('objectMapToggleChernarus');
    var objectMapToggleLivoniaEl = document.getElementById('objectMapToggleLivonia');
    var objectMapToggleSakhalEl = document.getElementById('objectMapToggleSakhal');
    var objectMapExportAccordionEl = document.getElementById('objectMapExportAccordion');
    var objectMapAreaSelectToggleEl = document.getElementById('objectMapAreaSelectToggle');
    var objectMapCopyAreaEl = document.getElementById('objectMapCopyArea');
    var objectMapDownloadAreaEditorEl = document.getElementById('objectMapDownloadAreaEditor');
    var objectMapDownloadAreaMapGroupProtoEl = document.getElementById('objectMapDownloadAreaMapGroupProto');
    var objectMapClearAreaEl = document.getElementById('objectMapClearArea');
    var objectMapExportCurrentEl = document.getElementById('objectMapExportCurrent');
    var objectFocusMetaEl = document.getElementById('objectFocusMeta');
    var objectFocusLocationEl = document.getElementById('objectFocusLocation');
    var objectFocusLinksEl = document.getElementById('objectFocusLinks');
    var objectFocusEmptyEl = document.getElementById('objectFocusEmpty');
    var currentObjectName = null;
    var currentObjectData = null;
    var currentObjectLocationData = {};
    var currentObjectRowEl = null;
    var typesEntryUrl = null;
    var typesEntryByName = {};
    var typesEntryByNameLower = {};
    var mapTypesByMap = {
      chernarus: {},
      livonia: {},
      sakhal: {}
    };
    var activeTypesTagFilter = null;
    var activeTypesTagMatchByName = null;
    var typesExplorerState = {
      usage: [],
      value: []
    };
    var typesExplorerMaps = {
      chernarus: true,
      livonia: true,
      sakhal: true
    };
    var typesExplorerTags = {
      usage: [],
      value: []
    };
    var typesExplorerByObject = {};
    var activeTypesExplorerMatchByName = null;
    var mapGroupProtoEntryUrl = null;
    var mapGroupProtoEntryByName = {};
    var mapGroupProtoEntryByNameLower = {};
    var AppMode = requireCoreModule('AppMode');
    var activeCollectionFilter = AppMode.DATABASE;
    var typesExplorerFolderPrefixIndex = {};
    var folderSidebarSearchDebounceTimer = null;
    var objectMapActiveMapKey = 'chernarus';
    var objectMapPlacementPathIndex = {};
    var objectMapSummaryText = '';
    var objectMapSelectedCoordsText = '';
    var objectMapRenderToken = 0;
    var objectMapInteractionRefreshTimer = null;
    var useObjectMapV2 = true;
    var objectMapV2FrameLoaded = false;
    var objectMapV2FrameWorldKey = '';
    var objectMapExactSearchQuery = '';
    var objectMapSearchMode = '';
    var objectMapState = {
      data: null,
      view: null,
      dragStart: null,
      dragMoved: false,
      placementsCache: null,
      areaMode: false,
      areaDrag: null,
      areaBounds: null,
      areaPlacements: []
    };
    var folderBulkAnimalsTop = null;
    var folderBulkMode = 'animals';
    var activeFolderFilter = '';
    var highlightedFolderPath = '';
    var knownFolderPrefixes = [];
    var filteredFolderPrefixes = [];
    var ignoreActiveFolderFilterForTree = false;
    var treatIdListAsSearchFolders = false;
    var folderTreeExpanded = { dz: true };
    var objectNameById = {};
    var objectDataById = {};
    var objectDataByName = {};
    var objectDataByMatchKey = {};
    var objectLinkGraph = {};
    var objectLocationClusterCache = {};
    var objectLocationResolutionCache = {};
    var objectFocusSectionExpanded = {
      details: true,
      types: true,
      location: true,
      links: true
    };
    var objectFocusSectionPrefsKey = 'dayzObjectFocusSections';
    var loadObjectFocusSectionPrefs = function() {
      try {
        var raw = localStorage.getItem(objectFocusSectionPrefsKey);
        if (!raw) return;
        var parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return;
        ['details', 'types', 'location', 'links'].forEach(function(key) {
          if (typeof parsed[key] === 'boolean') {
            objectFocusSectionExpanded[key] = parsed[key];
          }
        });
      } catch (_) {}
    };
    var saveObjectFocusSectionPrefs = function() {
      try {
        localStorage.setItem(objectFocusSectionPrefsKey, JSON.stringify(objectFocusSectionExpanded));
      } catch (_) {}
    };
    loadObjectFocusSectionPrefs();
    var sakhalMapUiTimer = null;
    var locationMapConfigs = {
      chernarus: {
        label: 'Chernarus',
        dataFile: 'chernarus-viewer-data.json',
        backdropDir: 'chernarus-backdrop-tiles'
      },
      livonia: {
        label: 'Livonia',
        dataFile: 'livonia-viewer-data.json',
        backdropDir: 'livonia-backdrop-tiles'
      },
      sakhal: {
        label: 'Sakhal',
        dataFile: 'sakhal-viewer-data.json',
        backdropDir: 'sakhal-backdrop-tiles'
      }
    };
    var pinnedObjectsEl = document.getElementById('pinnedObjects');
    var pinnedListEl = document.getElementById('pinnedList');
    var pinnedClearAllEl = document.getElementById('pinnedClearAll');
    var pinnedCopyAllEl = document.getElementById('pinnedCopyAll');
    var pinnedCopyAllLayoutEl = document.getElementById('pinnedCopyAllLayout');
    var pinnedCopyAllLayoutRowEl = document.getElementById('pinnedCopyAllLayoutRow');
    var pinnedCopyNamesEl = document.getElementById('pinnedCopyNames');
    var pinnedCopyLinkEl = document.getElementById('pinnedCopyLink');
    var pinnedDownloadAllEl = document.getElementById('pinnedDownloadAll');
    var pinnedDownloadTypesAllEl = document.getElementById('pinnedDownloadTypesAll');
    var pinnedIncludePathsEl = document.getElementById('pinnedIncludePaths');
    var pinnedBulkPanelEl = document.getElementById('pinnedBulkPanel');
    var pinnedBulkCopyConfirmEl = document.getElementById('pinnedBulkCopyConfirm');
    var pinnedBulkLayoutButtons = document.querySelectorAll('.pinned-bulk-layout');
    var pinnedBulkSpacingButtons = document.querySelectorAll('.pinned-bulk-spacing');
    var isMobileView = window.matchMedia('(max-width: 768px)').matches;
    var objectFocusPinEl = document.getElementById('objectFocusPin');
    var objectFocusMarkdownCopyEl = document.getElementById('objectFocusMarkdownCopy');
    var objectFocusCollapseEl = document.getElementById('objectFocusCollapse');
    var imageOverlayEl = document.getElementById('imageOverlay');
    var imageOverlayImgEl = document.getElementById('imageOverlayImg');
    var imageOverlayPrevEl = document.getElementById('imageOverlayPrev');
    var imageOverlayNextEl = document.getElementById('imageOverlayNext');
    var imageOverlayCloseEl = document.getElementById('imageOverlayClose');
    var imageOverlayDownloadEl = document.getElementById('imageOverlayDownload');
    var chernarusMapLightboxEl = document.getElementById('chernarusMapLightbox');
    var chernarusMapOverlayEl = document.getElementById('chernarusMapOverlay');
    var chernarusMapBackdropGroupEl = document.getElementById('chernarusMapBackdropGroup');
    var chernarusMapSelectionGroupEl = document.getElementById('chernarusMapSelectionGroup');
    var chernarusMapCloseEl = document.getElementById('chernarusMapClose');
    var chernarusMapResetEl = document.getElementById('chernarusMapReset');
    var chernarusMapOpenObjectMapEl = document.getElementById('chernarusMapOpenObjectMap');
    var chernarusMapLabelEl = document.getElementById('chernarusMapLabel');
    var chernarusMapMetaEl = document.getElementById('chernarusMapMeta');
    var chernarusMapStatusEl = document.getElementById('chernarusMapStatus');
    var chernarusMapToastEl = document.getElementById('chernarusMapToast');
    var objectFocusImagePrevEl = document.getElementById('objectFocusImagePrev');
    var objectFocusImageNextEl = document.getElementById('objectFocusImageNext');
    var chernarusMapState = {
      activeMapKey: '',
      viewers: {
        chernarus: {
          data: null,
          error: null,
          promise: null,
          dataUrl: '',
          backdropBaseUrl: ''
        },
        livonia: {
          data: null,
          error: null,
          promise: null,
          dataUrl: '',
          backdropBaseUrl: ''
        },
        sakhal: {
          data: null,
          error: null,
          promise: null,
          dataUrl: '',
          backdropBaseUrl: ''
        }
      },
      data: null,
      backdropBaseUrl: '',
      selection: null,
      view: null,
      dragStart: null,
      backdropLevelId: '',
      backdropTileNodes: new Map(),
      toastTimer: null,
      markerPathCache: {
        key: '',
        haloPath: '',
        fillPath: ''
      }
    };
    var pinnedItems = [];
    var setActiveCollectionFilter = function(value) {
      activeCollectionFilter = value;
    };
    var setActiveTypesTagFilter = function(value) {
      activeTypesTagFilter = value;
    };
    var setPinnedItems = function(items) {
      pinnedItems = requireCoreModule('normalizePinnedEntries')(items);
    };
    var currentObjectImages = [];
    var currentObjectImageIndex = 0;
    var imageOverlayImages = [];
    var imageOverlayIndex = 0;
    var hoverPreviewTimer = null;
    var hoverPreviewImages = [];
    var hoverPreviewIndex = 0;
    var hoverPreviewCell = null;
    var isPinned = function(objName) {
      return pinnedItems.some(function(item) { return item.objName === objName; });
    };
    var updateCollapseButtonLabel = function() {
      if (!objectFocusCollapseEl || !objectFocusEl) return;
      var isCollapsed = objectFocusEl.classList.contains('collapsed');
      var isViewerActive = !isCollapsed;
      var actionLabel = isCollapsed ? 'Expand sidebar' : 'Collapse sidebar';
      objectFocusCollapseEl.setAttribute('aria-label', actionLabel);
      objectFocusCollapseEl.setAttribute('title', actionLabel);
      objectFocusCollapseEl.setAttribute('aria-pressed', (!isCollapsed).toString());
      objectFocusCollapseEl.classList.toggle('is-active', isViewerActive);
    };
    var updateEmptyState = function() {
      if (!objectFocusEl || !objectFocusEmptyEl) return;
      var hasSelection = Boolean(currentObjectName);
      var isCollapsed = objectFocusEl.classList.contains('collapsed');
      objectFocusEl.classList.toggle('empty-state', !hasSelection && !isCollapsed);
      objectFocusEl.classList.toggle('no-selection', !hasSelection);
      if (objectFocusClearEl) {
        objectFocusClearEl.style.display = (hasSelection && !isCollapsed) ? 'inline-flex' : 'none';
      }
      updateCollapseButtonLabel();
    };
    var updateLayoutForSidebar = function() {
      if (!objectsLayoutEl || !objectFocusEl) return;
      objectsLayoutEl.classList.toggle('sidebar-collapsed', objectFocusEl.classList.contains('collapsed'));
    };
    var getImageDownloadName = function(src, altText) {
      if (!src) return 'object-image.jpg';
      try {
        var parsed = new URL(src, window.location.origin);
        var rawPath = parsed.pathname || '';
        var base = rawPath.split('/').pop() || '';
        if (base) return base;
      } catch (_) {}
      var safeBase = (altText || 'object-image').toString().trim().replace(/[^\w.-]+/g, '_');
      return safeBase + '.jpg';
    };
    var syncPortraitImageClass = function(imgEl) {
      if (!imgEl) return;
      var apply = function() {
        var naturalWidth = Number(imgEl.naturalWidth || 0);
        var naturalHeight = Number(imgEl.naturalHeight || 0);
        var isPortrait = naturalHeight > naturalWidth * 1.12;
        imgEl.classList.toggle('is-portrait', isPortrait);
      };
      imgEl.onload = apply;
      if (imgEl.complete && imgEl.naturalWidth) {
        apply();
      } else {
        imgEl.classList.remove('is-portrait');
      }
    };
    var parseImageList = function(value) {
      if (Array.isArray(value)) {
        return value.map(function(item) { return String(item || '').trim(); }).filter(Boolean);
      }
      if (typeof value === 'string') {
        var text = value.trim();
        if (!text) return [];
        try {
          var parsed = JSON.parse(text);
          if (Array.isArray(parsed)) {
            return parsed.map(function(item) { return String(item || '').trim(); }).filter(Boolean);
          }
        } catch (_) {}
      }
      return [];
    };
    var resolveRowImageList = function(rowData, fallbackImage) {
      var list = parseImageList(rowData && rowData.images);
      var fallback = String(fallbackImage || (rowData && rowData.image) || '').trim();
      if (fallback && list.indexOf(fallback) === -1) {
        list.unshift(fallback);
      }
      return list.filter(Boolean);
    };
    var setObjectFocusImageByIndex = function(index) {
      if (!objectFocusPreviewImgEl) return;
      if (!Array.isArray(currentObjectImages) || !currentObjectImages.length) {
        objectFocusPreviewImgEl.hidden = true;
        objectFocusPreviewImgEl.src = '';
        objectFocusPreviewImgEl.alt = '';
        if (objectFocusLinkEl) {
          objectFocusLinkEl.style.display = 'none';
        }
        if (objectFocusImagePrevEl) objectFocusImagePrevEl.classList.remove('is-visible');
        if (objectFocusImageNextEl) objectFocusImageNextEl.classList.remove('is-visible');
        return;
      }
      var len = currentObjectImages.length;
      currentObjectImageIndex = ((Number(index) || 0) % len + len) % len;
      var imagePath = currentObjectImages[currentObjectImageIndex];
      var src = '/' + String(imagePath || '').replace(/^\/+/, '');
      objectFocusPreviewImgEl.src = src;
      objectFocusPreviewImgEl.alt = (currentObjectName || 'Object') + ' preview';
      objectFocusPreviewImgEl.hidden = false;
      syncPortraitImageClass(objectFocusPreviewImgEl);
      if (objectFocusLinkEl) {
        objectFocusLinkEl.href = src;
        objectFocusLinkEl.setAttribute('download', getImageDownloadName(src, currentObjectName || 'object'));
        objectFocusLinkEl.style.display = 'inline-flex';
      }
      var showGalleryNav = len > 1;
      if (objectFocusImagePrevEl) objectFocusImagePrevEl.classList.toggle('is-visible', showGalleryNav);
      if (objectFocusImageNextEl) objectFocusImageNextEl.classList.toggle('is-visible', showGalleryNav);
    };
    var stepObjectFocusImage = function(delta) {
      if (!Array.isArray(currentObjectImages) || !currentObjectImages.length) return;
      setObjectFocusImageByIndex(currentObjectImageIndex + (Number(delta) || 0));
    };
    var refreshImageOverlay = function() {
      if (!imageOverlayImgEl) return;
      if (!Array.isArray(imageOverlayImages) || !imageOverlayImages.length) {
        closeImageOverlay();
        return;
      }
      var len = imageOverlayImages.length;
      imageOverlayIndex = ((Number(imageOverlayIndex) || 0) % len + len) % len;
      var src = imageOverlayImages[imageOverlayIndex];
      imageOverlayImgEl.src = src;
      imageOverlayImgEl.alt = currentObjectName || 'Object image';
      if (imageOverlayDownloadEl) {
        imageOverlayDownloadEl.href = src;
        imageOverlayDownloadEl.setAttribute('download', getImageDownloadName(src, currentObjectName || 'object'));
      }
      var hasMultiple = len > 1;
      if (imageOverlayPrevEl) imageOverlayPrevEl.classList.toggle('is-visible', hasMultiple);
      if (imageOverlayNextEl) imageOverlayNextEl.classList.toggle('is-visible', hasMultiple);
    };
    var stepImageOverlay = function(delta) {
      if (!Array.isArray(imageOverlayImages) || !imageOverlayImages.length) return;
      imageOverlayIndex += (Number(delta) || 0);
      refreshImageOverlay();
    };
    var openImageOverlay = function(src, altText, images, index) {
      if (!imageOverlayEl || !imageOverlayImgEl) return;
      if (!src) return;
      var list = parseImageList(images).map(function(item) {
        return '/' + String(item || '').replace(/^\/+/, '');
      }).filter(Boolean);
      if (!list.length) {
        list = [src];
      } else if (list.indexOf(src) === -1) {
        list.unshift(src);
      }
      imageOverlayImages = list;
      imageOverlayIndex = isFinite(Number(index)) ? Number(index) : Math.max(0, list.indexOf(src));
      refreshImageOverlay();
      imageOverlayEl.classList.add('is-open');
      imageOverlayEl.setAttribute('aria-hidden', 'false');
    };
    var closeImageOverlay = function() {
      if (!imageOverlayEl || !imageOverlayImgEl) return;
      imageOverlayEl.classList.remove('is-open');
      imageOverlayEl.setAttribute('aria-hidden', 'true');
      imageOverlayImgEl.src = '';
      imageOverlayImgEl.alt = '';
      imageOverlayImages = [];
      imageOverlayIndex = 0;
      if (imageOverlayDownloadEl) {
        imageOverlayDownloadEl.href = '#';
        imageOverlayDownloadEl.removeAttribute('download');
      }
      if (imageOverlayPrevEl) imageOverlayPrevEl.classList.remove('is-visible');
      if (imageOverlayNextEl) imageOverlayNextEl.classList.remove('is-visible');
    };
    var updateMobileView = function() {
      isMobileView = window.matchMedia('(max-width: 768px)').matches;
      if (isMobileView) {
        $('#imgPreview').remove();
      }
    };

    var setTypesEntry = function(objName) {
      if (!objectFocusTypesLinkEl) return;
      if (typesEntryUrl) {
        URL.revokeObjectURL(typesEntryUrl);
        typesEntryUrl = null;
      }
      if (!objName) {
        objectFocusTypesLinkEl.style.display = 'none';
        objectFocusTypesLinkEl.removeAttribute('download');
        return;
      }
      var normalizedName = String(objName || '').trim();
      var entry = typesEntryByName[normalizedName] || typesEntryByNameLower[normalizedName.toLowerCase()];
      if (!entry) {
        objectFocusTypesLinkEl.style.display = 'none';
        objectFocusTypesLinkEl.removeAttribute('download');
        return;
      }
      var blob = new Blob([entry + '\n'], { type: 'application/xml;charset=utf-8' });
      typesEntryUrl = URL.createObjectURL(blob);
      objectFocusTypesLinkEl.href = typesEntryUrl;
      objectFocusTypesLinkEl.setAttribute('download', objName + '.xml');
      objectFocusTypesLinkEl.style.display = 'inline-flex';
    };

    var setMapGroupProtoEntry = function(objName) {
      if (!objectFocusMapGroupProtoLinkEl) return;
      if (mapGroupProtoEntryUrl) {
        URL.revokeObjectURL(mapGroupProtoEntryUrl);
        mapGroupProtoEntryUrl = null;
      }
      if (!objName) {
        objectFocusMapGroupProtoLinkEl.style.display = 'none';
        objectFocusMapGroupProtoLinkEl.removeAttribute('download');
        return;
      }
      var entry = mapGroupProtoEntryByName[objName];
      if (!entry) {
        objectFocusMapGroupProtoLinkEl.style.display = 'none';
        objectFocusMapGroupProtoLinkEl.removeAttribute('download');
        return;
      }
      var blob = new Blob([entry + '\n'], { type: 'application/xml;charset=utf-8' });
      mapGroupProtoEntryUrl = URL.createObjectURL(blob);
      objectFocusMapGroupProtoLinkEl.href = mapGroupProtoEntryUrl;
      objectFocusMapGroupProtoLinkEl.setAttribute('download', objName + '-mapgroupproto.xml');
      objectFocusMapGroupProtoLinkEl.style.display = 'inline-flex';
    };
    var buildMapLootMetaHtml = function(objName) {
      var key = String(objName || '').trim().toLowerCase();
      if (!key) return '';
      var hasTypesEntry = !!typesEntryByName[objName] || !!typesEntryByNameLower[key];
      if (!hasTypesEntry || !objectFocusTypesLinkEl || !objectFocusTypesLinkEl.getAttribute('href')) return '';
      var typesExpanded = objectFocusSectionExpanded.types !== false;
      var typesActionHtml =
        '<a class="object-focus__link-pill object-focus__section-action" href="' + escapeHtml(objectFocusTypesLinkEl.getAttribute('href') || '#') + '" download="' + escapeHtml(objectFocusTypesLinkEl.getAttribute('download') || '') + '">↓ Types.xml entry</a>';
      var rows = [
        { map: 'chernarus', label: 'Chernarus' },
        { map: 'livonia', label: 'Livonia' },
        { map: 'sakhal', label: 'Sakhal' }
      ].map(function(def) {
        var info = mapTypesByMap[def.map] && mapTypesByMap[def.map][key];
        var usage = info && Array.isArray(info.usage) ? info.usage : [];
        var value = info && Array.isArray(info.value) ? info.value : [];
        var usageHtml = usage.length
          ? usage.map(function(name) {
              var safeName = escapeHtml(name);
              return '<button class="object-focus__link-pill object-focus__types-pill" type="button" data-types-map="' + escapeHtml(def.map) + '" data-types-kind="usage" data-types-name="' + safeName + '">' + safeName + '</button>';
            }).join(' ')
          : '—';
        var valueHtml = value.length
          ? value.map(function(name) {
              var safeName = escapeHtml(name);
              return '<button class="object-focus__link-pill object-focus__types-pill" type="button" data-types-map="' + escapeHtml(def.map) + '" data-types-kind="value" data-types-name="' + safeName + '">' + safeName + '</button>';
            }).join(' ')
          : '—';
        var detailsHtml = '—';
        if (usage.length && value.length) {
          detailsHtml = usageHtml + ' - ' + valueHtml;
        } else if (usage.length) {
          detailsHtml = usageHtml;
        } else if (value.length) {
          detailsHtml = valueHtml;
        }
        return '' +
          '<div class="object-focus__types-row">' +
            '<span class="object-focus__types-map">' + def.label + ':</span>' +
            detailsHtml +
          '</div>';
      });
      return '' +
        '<div class="object-focus__section object-focus__section-accordion object-focus__types-section' + (typesExpanded ? ' is-open' : '') + '">' +
          '<div class="object-focus__section-header">' +
            '<button class="object-focus__section-title object-focus__section-toggle" type="button" data-section-toggle="types" data-section-title="Types Explorer" aria-expanded="' + (typesExpanded ? 'true' : 'false') + '">' + (typesExpanded ? '▴ ' : '▾ ') + '<span class="object-focus__types-title-icon ui-icon ui-icon--types" aria-hidden="true"></span>Types Explorer</button>' +
            typesActionHtml +
          '</div>' +
          '<div class="object-focus__section-body object-focus__types">' + rows.join('') + '</div>' +
        '</div>';
    };
    var buildObjectFocusSectionToggleHtml = function(sectionKey, sectionTitle, isExpanded) {
      var arrow = isExpanded ? '▴ ' : '▾ ';
      var safeTitle = escapeHtml(sectionTitle || '');
      if (sectionKey === 'types') {
        return arrow + '<span class="object-focus__types-title-icon ui-icon ui-icon--types" aria-hidden="true"></span>' + safeTitle;
      }
      if (sectionKey === 'location') {
        return arrow + '<span class="object-focus__section-title-icon object-focus__section-title-icon--map ui-icon ui-icon--map" aria-hidden="true"></span>' + safeTitle;
      }
      return arrow + safeTitle;
    };
    var updateObjectFocusMeta = function(objData) {
      if (!objectFocusMetaEl || !objData) return;
      var objectId = objData.id || '';
      var inGame = objData.inGame || '';
      var modelType = objData.modelType || '';
      var consoleFlag = objData.consoleFlag || '';
      var tags = objData.tags || '';
      var objName = objData.objName || '';
      var p3dPath = objData.p3dPath || '';
      var detailsExpanded = objectFocusSectionExpanded.details !== false;
      var detailsRows = [
        { label: 'Path', value: p3dPath || '—' },
        { label: 'In-game name', value: inGame || '—' },
        { label: 'Model type', value: modelType || '—' },
        { label: 'Console', value: consoleFlag || '—' },
        { label: 'Object ID', value: objectId || '—' },
        { label: 'Tags', value: tags || '—' }
      ].map(function(row) {
        var valueHtml = escapeHtml(row.value);
        var labelHtml = escapeHtml(row.label) + ':';
        var rowClass = 'object-focus__meta-row';
        if (row.label === 'Path' && p3dPath) {
          valueHtml = ''
            + '<span class="object-focus__meta-path-wrap">'
            + '<button class="object-focus__meta-path" type="button" data-action="focus-folder-path" data-folder-path="' + escapeHtml(p3dPath) + '" title="Open folder in tree">' + escapeHtml(p3dPath) + '</button>'
            + '</span>';
        }
        if (row.label === 'Object ID') {
          valueHtml = ''
            + '<span class="object-focus__meta-value--with-info">'
            + escapeHtml(row.value)
            + '<button class="object-focus__meta-info" type="button" data-action="object-id-info" aria-label="Object ID info">'
            + '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">'
            + '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"></circle>'
            + '<path d="M12 10.4v6.3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path>'
            + '<circle cx="12" cy="7.2" r="1.1" fill="currentColor"></circle>'
            + '</svg>'
            + '</button>'
            + '</span>';
        }
        return '' +
          '<div class="' + rowClass + '">' +
            '<span class="object-focus__meta-label">' + labelHtml + '</span>' +
            '<span class="object-focus__meta-value">' + valueHtml + '</span>' +
          '</div>';
      }).join('');
      objectFocusMetaEl.innerHTML =
        '<div class="object-focus__section object-focus__section-accordion object-focus__meta-section' + (detailsExpanded ? ' is-open' : '') + '">' +
          '<div class="object-focus__section-header">' +
            '<button class="object-focus__section-title object-focus__section-toggle" type="button" data-section-toggle="details" data-section-title="Object details" aria-expanded="' + (detailsExpanded ? 'true' : 'false') + '">' + (detailsExpanded ? '▴ ' : '▾ ') + 'Object details</button>' +
          '</div>' +
          '<div class="object-focus__section-body object-focus__meta-list">' + detailsRows + '</div>' +
        '</div>' +
        buildMapLootMetaHtml(objName);
      var objectIdInfoBtn = objectFocusMetaEl.querySelector('[data-action="object-id-info"]');
      if (objectIdInfoBtn) {
        objectIdInfoBtn.addEventListener('mouseenter', function() {
          showChipInfoTooltip(
            objectIdInfoBtn,
            '<span class="chip-info-tooltip__plain">Each object on the database has a unique ID - these are not used in the game itself.</span>',
            0
          );
        });
        objectIdInfoBtn.addEventListener('mouseleave', function() {
          hideChipInfoTooltip();
        });
      }
    };
    var loadMapTypes = function(mapKey, url) {
      return fetch(url)
        .then(function(resp) { return resp.ok ? resp.text() : ''; })
        .then(function(text) {
          if (!text) return;
          var parser = new DOMParser();
          var xml = parser.parseFromString(text, 'application/xml');
          var nodes = xml.getElementsByTagName('type');
          var next = {};
          for (var i = 0; i < nodes.length; i++) {
            var node = nodes[i];
            var nameAttr = node.getAttribute('name');
            if (!nameAttr) continue;
            var nameKey = String(nameAttr).trim().toLowerCase();
            if (!nameKey) continue;
            var usageNodes = node.getElementsByTagName('usage');
            var valueNodes = node.getElementsByTagName('value');
            var usage = [];
            var value = [];
            var uSeen = {};
            var vSeen = {};
            for (var u = 0; u < usageNodes.length; u++) {
              var uName = String(usageNodes[u].getAttribute('name') || '').trim();
              if (!uName || uSeen[uName]) continue;
              uSeen[uName] = true;
              usage.push(uName);
            }
            for (var v = 0; v < valueNodes.length; v++) {
              var vName = String(valueNodes[v].getAttribute('name') || '').trim();
              if (!vName || vSeen[vName]) continue;
              vSeen[vName] = true;
              value.push(vName);
            }
            next[nameKey] = { usage: usage, value: value };
          }
          mapTypesByMap[mapKey] = next;
          rebuildTypesExplorerData();
          renderTypesExplorerTags();
          if (currentObjectData && currentObjectData.objName) {
            updateObjectFocusMeta(currentObjectData);
          }
          var didDrawForTypesState = false;
          if (activeTypesTagFilter && activeTypesTagFilter.map === mapKey) {
            activeTypesTagMatchByName = buildTypesTagMatchIndex(activeTypesTagFilter);
            if (table) {
              table.draw(false);
              didDrawForTypesState = true;
            }
          }
          if (hasTypesExplorerSelection()) {
            activeTypesExplorerMatchByName = buildTypesExplorerMatchIndex();
            if (table) {
              table.draw(false);
              didDrawForTypesState = true;
            }
          } else if (activeCollectionFilter === AppMode.TYPES_EXPLORER && table) {
            table.draw(false);
            didDrawForTypesState = true;
          }
          if (table && !didDrawForTypesState) {
            table.draw(false);
          }
        })
        .catch(function() {});
    };
    var buildTypesTagMatchIndex = function(filter) {
      if (!filter || !filter.map || !filter.kind || !filter.name) return null;
      var mapData = mapTypesByMap[filter.map];
      if (!mapData) return null;
      var needle = String(filter.name).trim().toLowerCase();
      if (!needle) return null;
      var match = {};
      Object.keys(mapData).forEach(function(objKey) {
        var info = mapData[objKey];
        if (!info) return;
        var list = filter.kind === 'value' ? info.value : info.usage;
        if (!Array.isArray(list) || !list.length) return;
        for (var i = 0; i < list.length; i++) {
          if (String(list[i] || '').trim().toLowerCase() === needle) {
            match[objKey] = true;
            break;
          }
        }
      });
      return match;
    };
    var hasTypesExplorerSelection = function() {
      return (typesExplorerState.usage && typesExplorerState.usage.length) || (typesExplorerState.value && typesExplorerState.value.length);
    };
    var rebuildTypesExplorerFolderPrefixIndex = function() {
      var next = {};
      var sourceIndex = null;
      if (hasTypesExplorerSelection()) {
        sourceIndex = activeTypesExplorerMatchByName || buildTypesExplorerMatchIndex() || {};
      }
      if (sourceIndex) {
        Object.keys(sourceIndex).forEach(function(objKey) {
          if (!sourceIndex[objKey]) return;
          var row = objectDataByName[objKey];
          if (!row) return;
          extractPathPrefixes(row.path || '').forEach(function(prefix) {
            var key = normalizeFilterText(prefix);
            if (key) next[key] = true;
          });
        });
      } else {
        Object.keys(typesExplorerByObject).forEach(function(objKey) {
          var row = objectDataByName[objKey];
          if (!row) return;
          extractPathPrefixes(row.path || '').forEach(function(prefix) {
            var key = normalizeFilterText(prefix);
            if (key) next[key] = true;
          });
        });
      }
      typesExplorerFolderPrefixIndex = next;
    };
    var rebuildTypesExplorerData = function() {
      var usageSeen = {};
      var valueSeen = {};
      var byObject = {};
      ['chernarus', 'livonia', 'sakhal'].forEach(function(mapKey) {
        if (!typesExplorerMaps[mapKey]) return;
        var mapData = mapTypesByMap[mapKey] || {};
        Object.keys(mapData).forEach(function(objKey) {
          var info = mapData[objKey] || {};
          var bucket = byObject[objKey];
          if (!bucket) {
            bucket = { usage: {}, value: {} };
            byObject[objKey] = bucket;
          }
          (Array.isArray(info.usage) ? info.usage : []).forEach(function(tag) {
            var key = String(tag || '').trim();
            if (!key) return;
            usageSeen[key] = true;
            bucket.usage[key] = true;
          });
          (Array.isArray(info.value) ? info.value : []).forEach(function(tag) {
            var key = String(tag || '').trim();
            if (!key) return;
            valueSeen[key] = true;
            bucket.value[key] = true;
          });
        });
      });
      typesExplorerByObject = byObject;
      typesExplorerTags.usage = Object.keys(usageSeen).sort(function(a, b) { return a.localeCompare(b); });
      typesExplorerTags.value = Object.keys(valueSeen).sort(function(a, b) { return a.localeCompare(b); });
      typesExplorerState.usage = (typesExplorerState.usage || []).filter(function(tag) {
        return usageSeen[tag];
      });
      typesExplorerState.value = (typesExplorerState.value || []).filter(function(tag) {
        return valueSeen[tag];
      });
      rebuildTypesExplorerFolderPrefixIndex();
    };
    var updateTypesExplorerScopeButtons = function() {
      if (!typesExplorerScopeEl) return;
      var buttons = typesExplorerScopeEl.querySelectorAll('[data-types-scope]');
      buttons.forEach(function(btn) {
        var key = String(btn.getAttribute('data-types-scope') || '').toLowerCase();
        btn.classList.toggle('is-active', !!typesExplorerMaps[key]);
      });
    };
    var toggleTypesExplorerMap = function(mapKey) {
      var key = String(mapKey || '').trim().toLowerCase();
      if (!typesExplorerMaps.hasOwnProperty(key)) return;
      var activeCount = Object.keys(typesExplorerMaps).filter(function(name) { return !!typesExplorerMaps[name]; }).length;
      if (typesExplorerMaps[key] && activeCount <= 1) return;
      typesExplorerMaps[key] = !typesExplorerMaps[key];
      rebuildTypesExplorerData();
      activeTypesExplorerMatchByName = buildTypesExplorerMatchIndex();
      renderTypesExplorerTags();
      updateTypesExplorerScopeButtons();
      if (table) {
        table.draw();
      }
      syncTypesExplorerPath();
    };
    var buildTypesExplorerMatchIndex = function() {
      if (!hasTypesExplorerSelection()) return null;
      var requiredUsage = {};
      var requiredValue = {};
      (typesExplorerState.usage || []).forEach(function(tag) {
        requiredUsage[String(tag)] = true;
      });
      (typesExplorerState.value || []).forEach(function(tag) {
        requiredValue[String(tag)] = true;
      });
      var match = {};
      Object.keys(typesExplorerByObject).forEach(function(objKey) {
        var info = typesExplorerByObject[objKey];
        if (!info) return;
        var ok = true;
        var usageKeys = Object.keys(requiredUsage);
        for (var i = 0; i < usageKeys.length; i += 1) {
          if (!info.usage[usageKeys[i]]) {
            ok = false;
            break;
          }
        }
        if (!ok) return;
        var valueKeys = Object.keys(requiredValue);
        for (var j = 0; j < valueKeys.length; j += 1) {
          if (!info.value[valueKeys[j]]) {
            ok = false;
            break;
          }
        }
        if (ok) {
          match[objKey] = true;
        }
      });
      return match;
    };
    var toggleTypesExplorerTag = function(kind, tagName) {
      var key = kind === 'value' ? 'value' : 'usage';
      var current = Array.isArray(typesExplorerState[key]) ? typesExplorerState[key].slice() : [];
      var index = current.indexOf(tagName);
      if (index >= 0) {
        current.splice(index, 1);
      } else {
        current.push(tagName);
      }
      current.sort(function(a, b) { return a.localeCompare(b); });
      typesExplorerState[key] = current;
      activeTypesExplorerMatchByName = buildTypesExplorerMatchIndex();
      rebuildTypesExplorerFolderPrefixIndex();
      if (activeTypesTagFilter) {
        setActiveTypesTagFilter(null);
        activeTypesTagMatchByName = null;
        AppUrl.push({}, { sourceUrl: buildTypesTagFilterUrl(null) });
      }
      if (table) {
        table.draw();
      }
      syncTypesExplorerPath();
    };
    var updateTypesExplorerPanelVisibility = function() {
      if (!typesExplorerPanelEl) return;
      var visible = activeCollectionFilter === AppMode.TYPES_EXPLORER;
      typesExplorerPanelEl.classList.toggle('visible', !!visible);
      updateFiltersAppTitle();
    };
    var updateObjectMapPanelVisibility = function() {
      if (!objectMapPanelEl) return;
      var visible = activeCollectionFilter === AppMode.OBJECT_MAP;
      objectMapPanelEl.classList.toggle('visible', !!visible);
      objectMapContract.dispatchDomEvent(OBJECT_MAP_DOM_EVENTS.PANEL_VISIBILITY, {
        visible: !!visible,
        world: normalizeObjectMapKey(objectMapActiveMapKey)
      });
      if ($('#dayzObjects_wrapper').length) {
        $('#dayzObjects_wrapper').toggleClass('object-map-mode', !!visible);
      }
      if (filtersEl) {
        filtersEl.classList.toggle('object-map-mode', !!visible);
      }
      updateFiltersAppTitle();
      if (visible) {
        updateObjectMapToggleButtons();
        updateFolderSidebarTitle();
        ensureObjectMapV2FrameLoaded(objectMapV2FrameWorldKey !== normalizeObjectMapKey(objectMapActiveMapKey));
        dispatchObjectMapV2SearchState();
        setTimeout(function() {
          dispatchObjectMapV2SearchState();
        }, objectMapPerformance.profile.interactionRefreshDelayMs + 20);
      }
      if (!visible) {
        if (objectMapInteractionRefreshTimer) {
          clearTimeout(objectMapInteractionRefreshTimer);
          objectMapInteractionRefreshTimer = null;
        }
        objectMapRenderToken += 1;
        objectMapPlacementPathIndex = {};
        objectMapSummaryText = '';
        objectMapState.dragStart = null;
        objectMapState.dragMoved = false;
        objectMapState.placementsCache = null;
        objectMapState.areaMode = false;
        clearObjectMapAreaSelection();
        if (objectMapOverlayEl) {
          objectMapOverlayEl.classList.remove('dragging');
        }
        if (objectMapExportAccordionEl) {
          objectMapExportAccordionEl.open = false;
        }
        hideObjectMapTooltip();
        setObjectMapPromptVisible(false);
        setObjectMapStatus('');
        applyObjectMapFolderDimmingToDom();
      } else {
        updateObjectMapAreaControls();
      }
    };
    var normalizeObjectMapKey = function(value) {
      var normalized = String(value || '').trim().toLowerCase();
      return (normalized === 'chernarus' || normalized === 'livonia' || normalized === 'sakhal') ? normalized : 'chernarus';
    };
    var buildObjectMapV2FrameSrc = function() {
      if (!objectMapV2FrameEl) return '';
      var mapPath = objectMapV2FrameEl.getAttribute('data-map-path') || '';
      if (!mapPath) return '';
      try {
        var url = new URL(mapPath, window.location.origin);
        url.searchParams.set('world', normalizeObjectMapKey(objectMapActiveMapKey));
        return url.toString();
      } catch (error) {
        return mapPath;
      }
    };
    var ensureObjectMapV2FrameLoaded = function(forceReload) {
      if (!objectMapV2FrameEl) return;
      var src = buildObjectMapV2FrameSrc();
      if (!src) return;
      if (forceReload || objectMapV2FrameEl.getAttribute('src') !== src) {
        objectMapV2FrameEl.classList.add('is-loading');
        objectMapV2FrameEl.setAttribute('src', src);
        objectMapV2FrameWorldKey = normalizeObjectMapKey(objectMapActiveMapKey);
      }
      objectMapV2FrameLoaded = objectMapV2FrameEl.getAttribute('src') !== 'about:blank';
    };
    var applyObjectMapExactSearch = function(objectName) {
      var normalized = String(objectName || '').trim();
      objectMapExactSearchQuery = normalized;
      objectMapSearchMode = normalized ? 'exact_object' : '';
      if (folderSidebarSearchEl) {
        folderSidebarSearchEl.value = normalized;
      }
      if (!table) return;
      table.search(normalized);
      table.columns().search('');
      if (normalized) {
        table.column(2).search('^' + escapeRegex(normalized) + '$', true, false).draw();
      } else {
        table.draw();
      }
    };
    var dispatchObjectMapV2SearchState = function() {
      if (!objectMapV2FrameEl || !objectMapV2FrameLoaded || !objectMapV2FrameEl.contentWindow || !table) return;
      var searchQuery = objectMapExactSearchQuery || '';
      var activePathFilter = '';
      var searchMode = objectMapSearchMode || '';
      if (!searchQuery && table && typeof table.search === 'function') {
        searchQuery = String(table.search() || '').trim();
      }
      if (!searchQuery && folderSidebarSearchEl) {
        searchQuery = String(folderSidebarSearchEl.value || '').trim();
      }
      if (typeof activeFolderFilter === 'string') {
        activePathFilter = String(activeFolderFilter || '').trim();
      }
      if (!searchQuery && !activePathFilter) {
        objectMapContract.postToFrame(objectMapV2FrameEl, {
          type: OBJECT_MAP_MESSAGE_TYPES.SEARCH_STATE,
          world: normalizeObjectMapKey(objectMapActiveMapKey),
          query: '',
          pathFilter: '',
          mode: '',
          rows: [],
          perf: objectMapPerformance.profile.v2Hints
        });
        objectMapContract.dispatchDomEvent(OBJECT_MAP_DOM_EVENTS.SEARCH_STATE_DISPATCHED, {
          world: normalizeObjectMapKey(objectMapActiveMapKey),
          query: '',
          pathFilter: ''
        });
        return;
      }
      var rowsApi = table.rows({ filter: 'applied' });
      var rows = rowsApi && typeof rowsApi.data === 'function'
        ? rowsApi.data().toArray().map(function(row) {
            return {
              objectName: row && row.objectName ? String(row.objectName) : '',
              path: row && row.path ? String(row.path) : ''
            };
          })
        : [];
      objectMapContract.postToFrame(objectMapV2FrameEl, {
        type: OBJECT_MAP_MESSAGE_TYPES.SEARCH_STATE,
        world: normalizeObjectMapKey(objectMapActiveMapKey),
        query: searchQuery,
        pathFilter: activePathFilter,
        mode: searchMode,
        rows: rows,
        perf: objectMapPerformance.profile.v2Hints
      });
      objectMapContract.dispatchDomEvent(OBJECT_MAP_DOM_EVENTS.SEARCH_STATE_DISPATCHED, {
        world: normalizeObjectMapKey(objectMapActiveMapKey),
        query: searchQuery,
        pathFilter: activePathFilter,
        rows: rows.length
      });
    };
    var clearObjectMapV2SelectionState = function() {
      if (!objectMapV2FrameEl || !objectMapV2FrameLoaded || !objectMapV2FrameEl.contentWindow) return;
      objectMapContract.postToFrame(objectMapV2FrameEl, {
        type: OBJECT_MAP_MESSAGE_TYPES.CLEAR_SELECTION
      });
    };
    if (objectMapV2FrameEl) {
      objectMapV2FrameEl.addEventListener('load', function() {
        objectMapV2FrameEl.classList.remove('is-loading');
        dispatchObjectMapV2SearchState();
      });
    }
    var updateObjectMapToggleButtons = function() {
      if (objectMapToggleChernarusEl) {
        objectMapToggleChernarusEl.classList.toggle('is-active', objectMapActiveMapKey === 'chernarus');
      }
      if (objectMapToggleLivoniaEl) {
        objectMapToggleLivoniaEl.classList.toggle('is-active', objectMapActiveMapKey === 'livonia');
      }
      if (objectMapToggleSakhalEl) {
        objectMapToggleSakhalEl.classList.toggle('is-active', objectMapActiveMapKey === 'sakhal');
      }
    };
    var setObjectMapStatus = function(text) {
      if (!objectMapStatusEl) return;
      objectMapStatusEl.textContent = text || '';
    };
    var updateObjectMapAreaControls = function() {
      if (objectMapAreaSelectToggleEl) {
        objectMapAreaSelectToggleEl.classList.toggle('is-active', !!objectMapState.areaMode);
      }
      var hasSelection = !!(objectMapState.areaBounds && Array.isArray(objectMapState.areaPlacements) && objectMapState.areaPlacements.length);
      if (objectMapCopyAreaEl) {
        objectMapCopyAreaEl.disabled = !hasSelection;
      }
      if (objectMapClearAreaEl) {
        objectMapClearAreaEl.disabled = !objectMapState.areaBounds;
      }
      if (objectMapDownloadAreaEditorEl) {
        objectMapDownloadAreaEditorEl.disabled = !hasSelection;
      }
      if (objectMapDownloadAreaMapGroupProtoEl) {
        objectMapDownloadAreaMapGroupProtoEl.disabled = !hasSelection;
      }
      if (objectMapOverlayEl) {
        objectMapOverlayEl.classList.toggle('area-select', !!objectMapState.areaMode);
      }
    };
    var renderObjectMapAreaRect = function() {
      if (!objectMapSelectionGroupEl) return;
      objectMapSelectionGroupEl.replaceChildren();
      var bounds = objectMapState.areaBounds;
      if (!bounds) return;
      var width = Math.max(0, Number(bounds.maxX || 0) - Number(bounds.minX || 0));
      var height = Math.max(0, Number(bounds.maxY || 0) - Number(bounds.minY || 0));
      if (width <= 0 || height <= 0) return;
      var rect = createLocationMapSvgElement('rect');
      rect.setAttribute('class', 'object-map__area-rect');
      rect.setAttribute('x', Number(bounds.minX || 0));
      rect.setAttribute('y', Number(bounds.minY || 0));
      rect.setAttribute('width', width);
      rect.setAttribute('height', height);
      objectMapSelectionGroupEl.appendChild(rect);
    };
    var clearObjectMapAreaSelection = function() {
      objectMapState.areaDrag = null;
      objectMapState.areaBounds = null;
      objectMapState.areaPlacements = [];
      renderObjectMapAreaRect();
      updateObjectMapAreaControls();
    };
    var getObjectMapBoundsFromPoints = function(a, b) {
      if (!a || !b) return null;
      var minX = Math.min(Number(a.x || 0), Number(b.x || 0));
      var maxX = Math.max(Number(a.x || 0), Number(b.x || 0));
      var minY = Math.min(Number(a.y || 0), Number(b.y || 0));
      var maxY = Math.max(Number(a.y || 0), Number(b.y || 0));
      if (!isFinite(minX) || !isFinite(maxX) || !isFinite(minY) || !isFinite(maxY)) return null;
      if ((maxX - minX) <= 0.5 || (maxY - minY) <= 0.5) return null;
      return { minX: minX, minY: minY, maxX: maxX, maxY: maxY };
    };
    var filterObjectMapPlacementsByBounds = function(placements, bounds) {
      if (!Array.isArray(placements) || !placements.length || !bounds) return [];
      var minX = Number(bounds.minX || 0);
      var maxX = Number(bounds.maxX || 0);
      var minY = Number(bounds.minY || 0);
      var maxY = Number(bounds.maxY || 0);
      return placements.filter(function(point) {
        var x = Number(point && point.x);
        var y = Number(point && point.y);
        if (!isFinite(x) || !isFinite(y)) return false;
        return x >= minX && x <= maxX && y >= minY && y <= maxY;
      });
    };
    var resolveObjectMapGatheredPlacements = function() {
      var mapKey = objectMapActiveMapKey || 'chernarus';
      var cached = objectMapState.placementsCache;
      if (cached && cached.mapKey === mapKey && cached.gathered) {
        return Promise.resolve(cached.gathered);
      }
      if (!table || !shouldRenderObjectMapPlacements()) {
        return Promise.resolve(null);
      }
      var rows = getObjectMapRows();
      if (!rows.length) return Promise.resolve(null);
      return ensureLocationMapData(mapKey).then(function(viewerData) {
        return gatherObjectMapPlacementsAsync(rows, viewerData, mapKey, null);
      }).then(function(gathered) {
        if (gathered) {
          objectMapState.placementsCache = {
            mapKey: mapKey,
            gathered: gathered
          };
        }
        return gathered;
      });
    };
    var applyObjectMapAreaBounds = function(bounds) {
      objectMapState.areaBounds = bounds || null;
      renderObjectMapAreaRect();
      if (!bounds) {
        objectMapState.areaPlacements = [];
        updateObjectMapAreaControls();
        return Promise.resolve([]);
      }
      return resolveObjectMapGatheredPlacements().then(function(gathered) {
        var placements = gathered && Array.isArray(gathered.placements) ? gathered.placements : [];
        objectMapState.areaPlacements = filterObjectMapPlacementsByBounds(placements, bounds);
        updateObjectMapAreaControls();
        if (objectMapState.areaPlacements.length) {
          setObjectMapStatus(formatNumber(objectMapState.areaPlacements.length) + ' placements selected in area.');
        } else {
          setObjectMapStatus('No placements inside selected area.');
        }
        return objectMapState.areaPlacements.slice();
      });
    };
    var getObjectMapAreaPlacementsForExport = function() {
      if (!objectMapState.areaBounds) {
        return Promise.resolve([]);
      }
      if (Array.isArray(objectMapState.areaPlacements) && objectMapState.areaPlacements.length) {
        return Promise.resolve(objectMapState.areaPlacements.slice());
      }
      return applyObjectMapAreaBounds(objectMapState.areaBounds);
    };
    var collectUniqueAreaObjectNames = function(placements) {
      var seen = {};
      var names = [];
      (Array.isArray(placements) ? placements : []).forEach(function(point) {
        var name = String(point && point.objName || '').trim();
        if (!name) return;
        var key = name.toLowerCase();
        if (seen[key]) return;
        seen[key] = true;
        names.push(name);
      });
      return names;
    };
    var buildMapGroupLookupKeys = function(name) {
      var raw = String(name || '').trim();
      if (!raw) return [];
      var lower = raw.toLowerCase();
      var keys = [];
      var seen = {};
      var push = function(value) {
        var key = String(value || '').trim();
        if (!key) return;
        var n = key.toLowerCase();
        if (seen[n]) return;
        seen[n] = true;
        keys.push(key);
      };
      push(raw);
      push(lower);
      if (lower.indexOf('staticobj_') === 0) {
        push('Land_' + raw.slice(10));
        push('land_' + lower.slice(10));
      }
      if (lower.indexOf('land_') === 0) {
        push(raw.slice(5));
        push(lower.slice(5));
      }
      if (lower.slice(-4) === '.p3d') {
        var stemRaw = raw.slice(0, -4);
        var stemLower = lower.slice(0, -4);
        push(stemRaw);
        push(stemLower);
        push('Land_' + stemRaw);
        push('land_' + stemLower);
      }
      return keys;
    };
    var buildAreaMapGroupProtoEntries = function(placements) {
      var names = collectUniqueAreaObjectNames(placements);
      var entries = [];
      names.forEach(function(name) {
        var entry = null;
        var keys = buildMapGroupLookupKeys(name);
        for (var i = 0; i < keys.length; i += 1) {
          var key = keys[i];
          entry = mapGroupProtoEntryByName[key] || mapGroupProtoEntryByNameLower[key.toLowerCase()];
          if (entry) break;
        }
        if (!entry) return;
        entries.push(entry.trim());
      });
      return entries;
    };
    var buildObjectMapAreaEditorObjects = function(placements) {
      var output = [];
      (Array.isArray(placements) ? placements : []).forEach(function(point) {
        var objName = String(point && point.objName || '').trim();
        if (!objName) return;
        var rowData = null;
        var objId = normalizeObjectId(point && point.objId || '');
        if (objId) {
          rowData = objectDataById[objId] || null;
        }
        if (!rowData) {
          rowData = objectDataByName[objName.toLowerCase()] || null;
        }
        var item = {
          editorJsonRaw: String(point && point.editorJsonRaw || (rowData && rowData.editorJson) || ''),
          objName: objName,
          modelType: String(point && point.modelType || (rowData && rowData.modelType) || 'Config'),
          p3dPath: String(point && point.p3dPath || (rowData && rowData.path) || '')
        };
        var objects = buildEditorJsonArray(item);
        if (!Array.isArray(objects) || !objects.length) return;
        var mapX = Number(point && point.x);
        var mapZ = Number(point && point.y);
        if (!isFinite(mapX) || !isFinite(mapZ)) return;
        objects.forEach(function(entry) {
          if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return;
          var cloned = Object.assign({}, entry);
          var posY = 0;
          if (Array.isArray(entry.Position) && entry.Position.length >= 2) {
            var existingY = Number(entry.Position[1]);
            if (isFinite(existingY)) posY = existingY;
          }
          cloned.Position = [mapX, posY, mapZ];
          if (!Array.isArray(cloned.Orientation) || cloned.Orientation.length < 3) {
            cloned.Orientation = [0, 0, 0];
          }
          if (typeof cloned.Scale !== 'number' || !isFinite(cloned.Scale) || cloned.Scale <= 0) {
            cloned.Scale = 1.0;
          }
          if (!cloned.AttachmentMap || typeof cloned.AttachmentMap !== 'object' || Array.isArray(cloned.AttachmentMap)) {
            cloned.AttachmentMap = {};
          }
          if (typeof cloned.Model !== 'string') {
            cloned.Model = '';
          }
          if (!isFinite(Number(cloned.Flags))) {
            cloned.Flags = 30;
          }
          if (!isFinite(Number(cloned.m_LowBits))) {
            cloned.m_LowBits = 0;
          }
          if (!isFinite(Number(cloned.m_HighBits))) {
            cloned.m_HighBits = 0;
          }
          output.push(cloned);
        });
      });
      return normalizeEditorJsonEntries(output);
    };
    var copyObjectMapAreaSelection = function() {
      var bounds = objectMapState.areaBounds;
      if (!bounds) {
        setObjectMapStatus('Select an area on the map first.');
        return;
      }
      var doCopy = function(placements) {
        if (!Array.isArray(placements) || !placements.length) {
          setObjectMapStatus('No placements inside selected area.');
          return;
        }
        var editorObjects = buildObjectMapAreaEditorObjects(placements);
        if (!editorObjects.length) {
          setObjectMapStatus('No valid editor objects inside selected area.');
          return;
        }
        navigator.clipboard.writeText(JSON.stringify(editorObjects, null, 4));
        if (objectMapCopyAreaEl) {
          var original = objectMapCopyAreaEl.textContent;
          objectMapCopyAreaEl.textContent = 'Copied';
          setTimeout(function() {
            objectMapCopyAreaEl.textContent = original;
          }, 1000);
        }
        setObjectMapStatus(formatNumber(editorObjects.length) + ' editor objects copied from selected area.');
      };
      var existing = Array.isArray(objectMapState.areaPlacements) ? objectMapState.areaPlacements.slice() : [];
      if (existing.length) {
        doCopy(existing);
        return;
      }
      applyObjectMapAreaBounds(bounds).then(doCopy).catch(function(error) {
        setObjectMapStatus(error && error.message ? error.message : 'Unable to copy selected area.');
      });
    };
    var buildExportTimestamp = function() {
      return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    };
    var downloadObjectMapAreaEditorJson = function() {
      if (!objectMapState.areaBounds) {
        setObjectMapStatus('Select an area on the map first.');
        return;
      }
      getObjectMapAreaPlacementsForExport().then(function(placements) {
        var editorObjects = buildObjectMapAreaEditorObjects(placements);
        if (!editorObjects.length) {
          setObjectMapStatus('No valid editor objects inside selected area.');
          return;
        }
        var mapKey = objectMapActiveMapKey || 'chernarus';
        var filename = 'object_map_area_editor_' + mapKey + '_' + buildExportTimestamp() + '.json';
        downloadTextFile(JSON.stringify(editorObjects, null, 4), filename, 'application/json;charset=utf-8');
        setObjectMapStatus(formatNumber(editorObjects.length) + ' editor objects downloaded from selected area.');
      }).catch(function(error) {
        setObjectMapStatus(error && error.message ? error.message : 'Unable to download area editor JSON.');
      });
    };
    var downloadObjectMapAreaMapGroupProto = function() {
      if (!objectMapState.areaBounds) {
        setObjectMapStatus('Select an area on the map first.');
        return;
      }
      getObjectMapAreaPlacementsForExport().then(function(placements) {
        var entries = buildAreaMapGroupProtoEntries(placements);
        if (!entries.length) {
          setObjectMapStatus('No MapGroupProto entries found for selected area objects.');
          return;
        }
        var xml = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>', '<prototype>']
          .concat(entries.map(function(entry) { return '  ' + entry; }))
          .concat(['</prototype>', ''])
          .join('\n');
        var mapKey = objectMapActiveMapKey || 'chernarus';
        var filename = 'object_map_area_mapgroupproto_' + mapKey + '_' + buildExportTimestamp() + '.xml';
        downloadTextFile(xml, filename, 'application/xml;charset=utf-8');
        setObjectMapStatus(formatNumber(entries.length) + ' MapGroupProto entries downloaded.');
      }).catch(function(error) {
        setObjectMapStatus(error && error.message ? error.message : 'Unable to download MapGroupProto entries.');
      });
    };
    var formatObjectMapCoord = function(value) {
      var num = Number(value);
      if (!isFinite(num)) return '0';
      var rounded = Math.round(num * 100) / 100;
      if (Math.abs(rounded - Math.round(rounded)) < 0.0001) {
        return String(Math.round(rounded));
      }
      return rounded.toFixed(2).replace(/\.?0+$/, '');
    };
    var clearObjectMapSelectedCoords = function() {
      objectMapSelectedCoordsText = '';
      if (!objectMapCopyCoordsEl) return;
      objectMapCopyCoordsEl.classList.remove('visible');
      objectMapCopyCoordsEl.textContent = 'Copy coordinates';
    };
    var setObjectMapSelectedCoords = function(x, y) {
      objectMapSelectedCoordsText = formatObjectMapCoord(x) + ', ' + formatObjectMapCoord(y);
      if (!objectMapCopyCoordsEl) return;
      objectMapCopyCoordsEl.textContent = 'Copy coordinates';
      objectMapCopyCoordsEl.classList.add('visible');
    };
    var hideObjectMapTooltip = function() {
      if (!objectMapTooltipEl) return;
      objectMapTooltipEl.classList.remove('visible');
      objectMapTooltipEl.setAttribute('aria-hidden', 'true');
      objectMapTooltipEl.textContent = '';
    };
    var setObjectMapPromptVisible = function(visible, text) {
      if (!objectMapPromptEl) return;
      objectMapPromptEl.classList.toggle('visible', !!visible);
      if (text) {
        objectMapPromptEl.textContent = text;
      }
    };
    var showObjectMapTooltip = function(text, clientX, clientY) {
      if (!objectMapTooltipEl || !objectMapPanelEl || !text) return;
      var frame = objectMapPanelEl.querySelector('.object-map__frame');
      if (!frame) return;
      var frameRect = frame.getBoundingClientRect();
      objectMapTooltipEl.textContent = text;
      objectMapTooltipEl.style.left = (clientX - frameRect.left) + 'px';
      objectMapTooltipEl.style.top = (clientY - frameRect.top) + 'px';
      objectMapTooltipEl.classList.add('visible');
      objectMapTooltipEl.setAttribute('aria-hidden', 'false');
    };
    var setObjectMapActiveMap = function(mapKey) {
      var normalized = normalizeObjectMapKey(mapKey);
      if (objectMapActiveMapKey !== normalized) {
        objectMapActiveMapKey = normalized;
        objectMapState.view = null;
        objectMapState.placementsCache = null;
        clearObjectMapAreaSelection();
      }
      updateObjectMapToggleButtons();
      updateFolderSidebarTitle();
      if (activeCollectionFilter === AppMode.OBJECT_MAP) {
        syncTypesExplorerPath();
      }
      if (useObjectMapV2) {
        ensureObjectMapV2FrameLoaded(objectMapV2FrameWorldKey !== normalized);
        dispatchObjectMapV2SearchState();
        return;
      }
      renderObjectMapFromTable();
    };
    var clearObjectMapSvg = function() {
      if (objectMapBackdropGroupEl) {
        objectMapBackdropGroupEl.replaceChildren();
      }
      if (objectMapMarkersGroupEl) {
        objectMapMarkersGroupEl.replaceChildren();
      }
      clearObjectMapSelectedCoords();
      hideObjectMapTooltip();
    };
    var objectMapViewportRect = function() {
      return objectMapOverlayEl ? objectMapOverlayEl.getBoundingClientRect() : { width: 1, height: 1, left: 0, top: 0 };
    };
    var canMeasureObjectMap = function() {
      var rect = objectMapViewportRect();
      return !!(rect && rect.width > 40 && rect.height > 40);
    };
    var objectMapViewportAspect = function() {
      var rect = objectMapViewportRect();
      return (rect.width || 1) / (rect.height || 1);
    };
    var fitObjectMapToBounds = function() {
      if (!objectMapState.data || !objectMapState.data.bounds || !canMeasureObjectMap()) return;
      var bounds = objectMapState.data.bounds;
      var padding = 0.04;
      var width = (bounds.width || 1) * (1 + padding * 2);
      var height = (bounds.height || 1) * (1 + padding * 2);
      var viewportAspect = objectMapViewportAspect();
      var worldAspect = width / height;
      if (worldAspect > viewportAspect) {
        height = width / viewportAspect;
      } else {
        width = height * viewportAspect;
      }
      var centerX = (bounds.minX + bounds.maxX) / 2;
      var centerY = (bounds.minY + bounds.maxY) / 2;
      objectMapState.view = {
        minX: centerX - width / 2,
        maxX: centerX + width / 2,
        minY: centerY - height / 2,
        maxY: centerY + height / 2
      };
    };
    var normalizeObjectMapViewAspect = function(view) {
      if (!view || !canMeasureObjectMap()) return view;
      var width = Math.max(view.maxX - view.minX, 1);
      var height = Math.max(view.maxY - view.minY, 1);
      var viewportAspect = objectMapViewportAspect();
      var centerX = (view.minX + view.maxX) / 2;
      var centerY = (view.minY + view.maxY) / 2;
      if (width / height > viewportAspect) {
        height = width / viewportAspect;
      } else {
        width = height * viewportAspect;
      }
      return {
        minX: centerX - width / 2,
        maxX: centerX + width / 2,
        minY: centerY - height / 2,
        maxY: centerY + height / 2
      };
    };
    var syncObjectMapViewBox = function() {
      if (!objectMapOverlayEl || !objectMapState.view) return;
      objectMapState.view = normalizeObjectMapViewAspect(objectMapState.view);
      var viewWidth = objectMapState.view.maxX - objectMapState.view.minX;
      var viewHeight = objectMapState.view.maxY - objectMapState.view.minY;
      objectMapOverlayEl.setAttribute(
        'viewBox',
        objectMapState.view.minX + ' ' + (-objectMapState.view.maxY) + ' ' + viewWidth + ' ' + viewHeight
      );
    };
    var screenToObjectMapWorld = function(view, screenX, screenY) {
      var rect = objectMapViewportRect();
      return {
        x: view.minX + (screenX / (rect.width || 1)) * (view.maxX - view.minX),
        y: view.maxY - (screenY / (rect.height || 1)) * (view.maxY - view.minY)
      };
    };
    var zoomObjectMapViewAt = function(view, screenX, screenY, factor) {
      if (!objectMapState.data || !objectMapState.data.bounds) return view;
      var anchor = screenToObjectMapWorld(view, screenX, screenY);
      var currentWidth = view.maxX - view.minX;
      var currentHeight = view.maxY - view.minY;
      var viewportAspect = objectMapViewportAspect();
      var newWidth = currentWidth * factor;
      var xRatio = (anchor.x - view.minX) / currentWidth;
      var yRatio = (anchor.y - view.minY) / currentHeight;
      var bounds = objectMapState.data.bounds;
      var minimumWidth = Math.max(bounds.width * 0.02, bounds.height * 0.02 * viewportAspect);
      var maximumWidth = Math.min(bounds.width * 1.8, bounds.height * 1.8 * viewportAspect);
      var clampedWidth = clampNumber(newWidth, minimumWidth, maximumWidth);
      var clampedHeight = clampedWidth / viewportAspect;
      return normalizeObjectMapViewAspect({
        minX: anchor.x - clampedWidth * xRatio,
        maxX: anchor.x - clampedWidth * xRatio + clampedWidth,
        minY: anchor.y - clampedHeight * yRatio,
        maxY: anchor.y - clampedHeight * yRatio + clampedHeight
      });
    };
    var renderObjectMapBackdrop = function(data, mapKey) {
      if (!objectMapBackdropGroupEl || !data || !data.backdrop || !Array.isArray(data.backdrop.levels) || !data.backdrop.levels.length) return;
      var bounds = data.bounds;
      if (!bounds) return;
      var tileSize = Number(data.backdrop.tileSize || 512);
      var level = data.backdrop.levels[0];
      var baseUrl = deriveLocationBackdropBaseUrl('', mapKey);
      for (var row = 0; row < level.rows; row += 1) {
        for (var col = 0; col < level.cols; col += 1) {
          var pixelX = col * tileSize;
          var pixelY = row * tileSize;
          var pixelWidth = Math.min(tileSize, level.width - pixelX);
          var pixelHeight = Math.min(tileSize, level.height - pixelY);
          var rect = {
            x: bounds.minX + (pixelX / level.width) * bounds.width,
            y: bounds.minY + (pixelY / level.height) * bounds.height,
            width: (pixelWidth / level.width) * bounds.width,
            height: (pixelHeight / level.height) * bounds.height
          };
          var tile = createLocationMapSvgElement('image');
          tile.setAttribute('href', baseUrl + level.id + '/r' + row + '-c' + col + '.png');
          tile.setAttribute('x', rect.x);
          tile.setAttribute('y', rect.y);
          tile.setAttribute('width', rect.width);
          tile.setAttribute('height', rect.height);
          tile.setAttribute('preserveAspectRatio', 'none');
          objectMapBackdropGroupEl.appendChild(tile);
        }
      }
      updatePathFilterNotice();
    };
    var getObjectMapRows = function() {
      if (!table) return [];
      return table.rows({ search: 'applied', order: 'applied', page: 'all' }).data().toArray();
    };
    var shouldRenderObjectMapPlacements = function() {
      if (!table) return false;
      var hasSearch = getCurrentTableSearchValue().length > 0;
      var hasFolder = !!activeFolderFilter;
      if (hasSearch) return true;
      if (!hasFolder) return false;
      var hasChildFolders = knownFolderPrefixes.some(function(prefix) {
        var normalized = normalizeFilterText(prefix);
        return normalized.indexOf(activeFolderFilter + '/') === 0;
      });
      return !hasChildFolders;
    };
    var OBJECT_MAP_MAX_MARKERS = 100000;
    var OBJECT_MAP_CLUSTERING_ENABLED = false;
    var objectMapYieldToMain = function() {
      return new Promise(function(resolve) {
        if (typeof requestAnimationFrame === 'function') {
          requestAnimationFrame(function() { resolve(); });
          return;
        }
        setTimeout(resolve, 0);
      });
    };
    var gatherObjectMapPlacementsAsync = function(rows, viewerData, mapKey, token) {
      return new Promise(function(resolve) {
        var gatherStartTime = (window.performance && typeof window.performance.now === 'function')
          ? window.performance.now()
          : Date.now();
        var placements = [];
        var nextPathIndex = {};
        var pointSeen = {};
        var representedPlacements = 0;
        var rowIndex = 0;
        var chunkSize = Math.max(8, Number(objectMapPerformance.profile.gatherRowChunkSize) || 24);
        var hasToken = token !== null && token !== undefined;
        var processChunk = function() {
          if (hasToken && token !== objectMapRenderToken) {
            resolve(null);
            return;
          }
          var end = Math.min(rowIndex + chunkSize, rows.length);
          for (; rowIndex < end; rowIndex += 1) {
            var row = rows[rowIndex];
            var objName = String(getObjectName(row) || '').trim();
            if (!objName) continue;
            var resolved = buildResolvedLocationData({
              id: getObjectId(row),
              objName: objName,
              p3dPath: row.path || '',
              modelType: row.modelType || '',
              linkedP3D: row['linked-p3d'] || '',
              linkedConfig: row['linked-config'] || [],
              linkedVariant: row['linked-variant'] || []
            }, viewerData, mapKey || objectMapActiveMapKey);
            if (!resolved || !resolved.count || !Array.isArray(resolved.points) || resolved.points.length < 2) continue;
            var objId = normalizeObjectId(getObjectId(row));
            representedPlacements += Math.floor(resolved.points.length / 2);
            extractPathPrefixes(row.path || '').forEach(function(prefix) {
              var key = normalizeFilterText(prefix);
              if (key) nextPathIndex[key] = true;
            });
            for (var pointIndex = 0; pointIndex < resolved.points.length; pointIndex += 2) {
              var x = resolved.points[pointIndex];
              var y = resolved.points[pointIndex + 1];
              var pointKey = objName + '|' + x + ',' + y;
              if (pointSeen[pointKey]) continue;
              pointSeen[pointKey] = true;
              placements.push({
                x: x,
                y: y,
                objName: objName,
                objId: objId,
                modelType: String(row.modelType || ''),
                p3dPath: String(row.path || ''),
                editorJsonRaw: String(row.editorJson || '')
              });
            }
          }
          if (rowIndex >= rows.length) {
            var gatherEndTime = (window.performance && typeof window.performance.now === 'function')
              ? window.performance.now()
              : Date.now();
            objectMapPerformance.markGather(gatherEndTime - gatherStartTime);
            resolve({
              placements: placements,
              representedPlacements: representedPlacements,
              pathIndex: nextPathIndex
            });
            return;
          }
          objectMapYieldToMain().then(processChunk);
        };
        processChunk();
      });
    };
    var objectMapWorldRadiusForPixels = function(radiusPx, viewerData) {
      var rect = objectMapViewportRect();
      var view = objectMapState.view || (viewerData ? viewerData.bounds : null);
      if (!view || !rect.width) return Math.max(radiusPx, 1);
      var viewWidth = Math.max((view.maxX || 0) - (view.minX || 0), 1);
      return Math.max((radiusPx * viewWidth) / (rect.width || 1), 1);
    };
    var objectMapCurrentZoomFactor = function(viewerData) {
      if (!viewerData || !viewerData.bounds) return 1;
      var view = objectMapState.view || viewerData.bounds;
      var bounds = viewerData.bounds;
      var viewWidth = Math.max((view.maxX || 0) - (view.minX || 0), 1);
      var viewHeight = Math.max((view.maxY || 0) - (view.minY || 0), 1);
      return Math.max(bounds.width / viewWidth, bounds.height / viewHeight);
    };
    var objectMapScaledMarkerPixels = function(basePixels, viewerData) {
      var zoom = objectMapCurrentZoomFactor(viewerData);
      var zoomScale = Math.pow(Math.max(zoom, 0.12), 0.55);
      return basePixels * Math.max(0.38, Math.min(2.8, zoomScale));
    };
    var appendObjectMapMarker = function(x, y, radiusPx, label, clickTarget, viewerData) {
      var radius = objectMapWorldRadiusForPixels(radiusPx, viewerData);
      var markerGroup = createLocationMapSvgElement('g');
      markerGroup.setAttribute('class', 'object-map__marker');
      var halo = createLocationMapSvgElement('circle');
      halo.setAttribute('class', 'object-map__marker-halo');
      halo.setAttribute('cx', x);
      halo.setAttribute('cy', y);
      halo.setAttribute('r', radius * 1.45);
      markerGroup.appendChild(halo);
      var fill = createLocationMapSvgElement('circle');
      fill.setAttribute('class', 'object-map__marker-fill');
      fill.setAttribute('cx', x);
      fill.setAttribute('cy', y);
      fill.setAttribute('r', radius);
      markerGroup.appendChild(fill);
      var hit = createLocationMapSvgElement('circle');
      hit.setAttribute('class', 'object-map__marker-hit');
      hit.setAttribute('cx', x);
      hit.setAttribute('cy', y);
      hit.setAttribute('r', radius * 2.1);
      hit.setAttribute('tabindex', '0');
      hit.setAttribute('role', 'button');
      hit.setAttribute('aria-label', label);
      hit.setAttribute('title', label);
      hit.addEventListener('mouseenter', function(event) {
        showObjectMapTooltip(label, event.clientX, event.clientY);
      });
      hit.addEventListener('mousemove', function(event) {
        showObjectMapTooltip(label, event.clientX, event.clientY);
      });
      hit.addEventListener('mouseleave', function() {
        hideObjectMapTooltip();
      });
      hit.addEventListener('focus', function(event) {
        var rect = event.target.getBoundingClientRect();
        showObjectMapTooltip(label, rect.left + (rect.width / 2), rect.top);
      });
      hit.addEventListener('blur', function() {
        hideObjectMapTooltip();
      });
      hit.addEventListener('pointerdown', function(event) {
        event.stopPropagation();
      });
      if (clickTarget && (clickTarget.id || clickTarget.name)) {
        var openedByPointerAt = 0;
        var openFocus = function() {
          if (objectMapState.areaMode) return;
          if (objectMapInteractionRefreshTimer) {
            clearTimeout(objectMapInteractionRefreshTimer);
            objectMapInteractionRefreshTimer = null;
          }
          objectMapRenderToken += 1;
          setObjectMapSelectedCoords(x, y);
          var resolvedId = normalizeObjectId(clickTarget.id || '');
          var resolvedName = String(clickTarget.name || '').trim();
          if (resolvedId && focusSidebarById(resolvedId)) {
            return;
          }
          if (resolvedName && focusSidebarByName(resolvedName)) {
            return;
          }
          if (resolvedId) {
            focusById(resolvedId);
            return;
          }
          if (resolvedName) {
            focusByName(resolvedName);
          }
        };
        hit.addEventListener('pointerup', function(event) {
          event.preventDefault();
          event.stopPropagation();
          openedByPointerAt = Date.now();
          openFocus();
        });
        hit.addEventListener('click', function(event) {
          if (Date.now() - openedByPointerAt < 450) return;
          event.preventDefault();
          event.stopPropagation();
          openFocus();
        });
        hit.addEventListener('keydown', function(event) {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          event.stopPropagation();
          openFocus();
        });
      }
      markerGroup.appendChild(hit);
      objectMapMarkersGroupEl.appendChild(markerGroup);
    };
    var renderObjectMapMarkersRawAsync = function(placements, viewerData, token) {
      return new Promise(function(resolve) {
        var renderStartTime = (window.performance && typeof window.performance.now === 'function')
          ? window.performance.now()
          : Date.now();
        var radiusPx = objectMapScaledMarkerPixels(4.8, viewerData);
        var rendered = 0;
        var index = 0;
        var chunkSize = Math.max(50, Number(objectMapPerformance.profile.renderMarkerChunkSize) || 220);
        var processChunk = function() {
          if (token !== objectMapRenderToken) {
            resolve(null);
            return;
          }
          var end = Math.min(index + chunkSize, placements.length);
          for (; index < end; index += 1) {
            if (rendered >= OBJECT_MAP_MAX_MARKERS) break;
            var point = placements[index];
            appendObjectMapMarker(
              point.x,
              point.y,
              radiusPx,
              point.objName,
              { id: point.objId || '', name: point.objName || '' },
              viewerData
            );
            rendered += 1;
          }
          if (rendered >= OBJECT_MAP_MAX_MARKERS || index >= placements.length) {
            var renderEndTime = (window.performance && typeof window.performance.now === 'function')
              ? window.performance.now()
              : Date.now();
            objectMapPerformance.markRender(renderEndTime - renderStartTime, placements.length);
            resolve({
              rendered: rendered,
              clustered: false,
              truncated: placements.length > rendered
            });
            return;
          }
          objectMapYieldToMain().then(processChunk);
        };
        processChunk();
      });
    };
    var renderObjectMapMarkersClustered = function(placements, viewerData) {
      var view = objectMapState.view || viewerData.bounds;
      var rect = objectMapViewportRect();
      var viewWidth = Math.max((view.maxX || 0) - (view.minX || 0), 1);
      var viewHeight = Math.max((view.maxY || 0) - (view.minY || 0), 1);
      var cellPx = 14;
      var cellW = (viewWidth / Math.max(rect.width || 1, 1)) * cellPx;
      var cellH = (viewHeight / Math.max(rect.height || 1, 1)) * cellPx;
      var buckets = {};
      placements.forEach(function(point) {
        var col = Math.floor((point.x - view.minX) / Math.max(cellW, 1e-9));
        var row = Math.floor((point.y - view.minY) / Math.max(cellH, 1e-9));
        var key = col + ':' + row;
        var bucket = buckets[key];
        if (!bucket) {
          bucket = { count: 0, sumX: 0, sumY: 0, names: {} };
          buckets[key] = bucket;
        }
        bucket.count += 1;
        bucket.sumX += point.x;
        bucket.sumY += point.y;
        bucket.names[point.objName] = (bucket.names[point.objName] || 0) + 1;
      });
      var bucketList = Object.keys(buckets).map(function(key) { return buckets[key]; });
      bucketList.sort(function(a, b) { return b.count - a.count; });
      var rendered = 0;
      for (var i = 0; i < bucketList.length; i += 1) {
        if (rendered >= OBJECT_MAP_MAX_MARKERS) break;
        var bucket = bucketList[i];
        var x = bucket.sumX / Math.max(bucket.count, 1);
        var y = bucket.sumY / Math.max(bucket.count, 1);
        var topName = '';
        var topCount = 0;
        Object.keys(bucket.names).forEach(function(name) {
          var nameCount = bucket.names[name];
          if (nameCount > topCount) {
            topCount = nameCount;
            topName = name;
          }
        });
        var distinct = Object.keys(bucket.names).length;
        var label = bucket.count === 1
          ? topName
          : (formatNumber(bucket.count) + ' placements' + (distinct > 1 ? (' (' + distinct + ' objects)') : (' (' + topName + ')')));
        var clickTarget = bucket.count === 1 ? { id: '', name: topName } : { id: '', name: topName || '' };
        var radiusPx = objectMapScaledMarkerPixels(4.4, viewerData) + Math.min(6, Math.sqrt(bucket.count) * 0.45);
        appendObjectMapMarker(x, y, radiusPx, label, clickTarget, viewerData);
        rendered += 1;
      }
      return {
        rendered: rendered,
        clustered: true,
        totalBuckets: bucketList.length,
        truncated: bucketList.length > rendered
      };
    };
    var renderObjectMapMarkers = function(rows, viewerData, gatheredOverride, token, mapKey) {
      if (!objectMapMarkersGroupEl || !viewerData || !viewerData.bounds) return Promise.resolve(null);
      var resolvedMapKey = mapKey || objectMapActiveMapKey;
      var gatheredPromise = gatheredOverride
        ? Promise.resolve(gatheredOverride)
        : gatherObjectMapPlacementsAsync(rows, viewerData, resolvedMapKey, token);
      return gatheredPromise.then(function(gathered) {
        if (!gathered || token !== objectMapRenderToken) return null;
        objectMapPlacementPathIndex = gathered.pathIndex;
        var resultPromise = OBJECT_MAP_CLUSTERING_ENABLED
          ? Promise.resolve(renderObjectMapMarkersClustered(gathered.placements, viewerData))
          : renderObjectMapMarkersRawAsync(gathered.placements, viewerData, token);
        return resultPromise.then(function(result) {
          if (!result || token !== objectMapRenderToken) return null;
          if (result.clustered) {
            objectMapSummaryText = formatNumber(result.rendered) + ' clusters shown on ' + getLocationMapLabel(resolvedMapKey)
              + ' from ' + formatNumber(gathered.placements.length) + ' placements';
          } else {
            objectMapSummaryText = formatNumber(result.rendered) + ' placements shown on ' + getLocationMapLabel(resolvedMapKey);
          }
          if (result.truncated) {
            objectMapSummaryText += ' (capped at ' + formatNumber(OBJECT_MAP_MAX_MARKERS) + ')';
          }
          setObjectMapStatus(objectMapSummaryText);
          return gathered;
        });
      });
    };
    var renderObjectMapFromTable = function(reuseCachedPlacements) {
      if (useObjectMapV2) return;
      if (!objectMapPanelEl || !objectMapPanelEl.classList.contains('visible')) return;
      var renderToken = ++objectMapRenderToken;
      var mapKey = objectMapActiveMapKey;
      updateObjectMapAreaControls();
      updateObjectMapToggleButtons();
      clearObjectMapSvg();
      var rows = getObjectMapRows();
      if (!rows.length) {
        objectMapPlacementPathIndex = {};
        objectMapState.placementsCache = null;
        clearObjectMapAreaSelection();
        setObjectMapPromptVisible(true, 'Search or select folders to show on map');
        setObjectMapStatus('No objects in current view.');
        applyObjectMapFolderDimmingToDom();
        return;
      }
      ensureLocationMapData(mapKey).then(function(viewerData) {
        if (renderToken !== objectMapRenderToken) return;
        if (!objectMapPanelEl || !objectMapPanelEl.classList.contains('visible')) return;
        objectMapState.data = viewerData;
        if (!objectMapState.view) {
          fitObjectMapToBounds();
        }
        syncObjectMapViewBox();
        renderObjectMapBackdrop(viewerData, mapKey);
        if (!shouldRenderObjectMapPlacements()) {
          objectMapPlacementPathIndex = {};
          objectMapState.placementsCache = null;
          objectMapSummaryText = '';
          clearObjectMapAreaSelection();
          setObjectMapPromptVisible(true, 'Search or select folders to show on map');
          setObjectMapStatus('');
          applyObjectMapFolderDimmingToDom();
          return;
        }
        var gathered = null;
        var cache = objectMapState.placementsCache;
        if (reuseCachedPlacements && cache && cache.mapKey === mapKey) {
          gathered = cache.gathered;
        }
        setObjectMapPromptVisible(false);
        setObjectMapStatus('Loading placements...');
        renderObjectMapMarkers(rows, viewerData, gathered, renderToken, mapKey).then(function(finalGathered) {
          if (!finalGathered || renderToken !== objectMapRenderToken) return;
          if (!gathered) {
            objectMapState.placementsCache = {
              mapKey: mapKey,
              gathered: finalGathered
            };
          }
          if (objectMapState.areaBounds) {
            applyObjectMapAreaBounds(objectMapState.areaBounds).catch(function() {});
          } else {
            updateObjectMapAreaControls();
          }
          applyObjectMapFolderDimmingToDom();
        });
      }).catch(function(error) {
        if (renderToken !== objectMapRenderToken) return;
        objectMapPlacementPathIndex = {};
        objectMapState.placementsCache = null;
        clearObjectMapAreaSelection();
        clearObjectMapSvg();
        setObjectMapStatus(error && error.message ? error.message : ('Unable to load ' + getLocationMapLabel(mapKey) + ' map.'));
        applyObjectMapFolderDimmingToDom();
      });
    };
    var scheduleObjectMapInteractionRefresh = function(delayMs) {
      if (objectMapInteractionRefreshTimer) {
        clearTimeout(objectMapInteractionRefreshTimer);
        objectMapInteractionRefreshTimer = null;
      }
      objectMapInteractionRefreshTimer = setTimeout(function() {
        objectMapInteractionRefreshTimer = null;
        renderObjectMapFromTable(true);
      }, Math.max(0, Number(delayMs) || objectMapPerformance.profile.interactionRefreshDelayMs));
    };
    var renderTypesExplorerTags = function() {
      if (!typesExplorerUsageTagsEl || !typesExplorerValueTagsEl) return;
      var usageSelected = {};
      var valueSelected = {};
      (typesExplorerState.usage || []).forEach(function(tag) { usageSelected[tag] = true; });
      (typesExplorerState.value || []).forEach(function(tag) { valueSelected[tag] = true; });
      typesExplorerUsageTagsEl.innerHTML = typesExplorerTags.usage.map(function(tag) {
        var active = usageSelected[tag] ? ' is-active' : '';
        return '<button class="types-explorer__tag ui-action-btn' + active + '" type="button" data-types-explorer-kind="usage" data-types-explorer-tag="' + escapeHtml(tag) + '">' + escapeHtml(tag) + '</button>';
      }).join('');
      typesExplorerValueTagsEl.innerHTML = typesExplorerTags.value.map(function(tag) {
        var active = valueSelected[tag] ? ' is-active' : '';
        return '<button class="types-explorer__tag ui-action-btn' + active + '" type="button" data-types-explorer-kind="value" data-types-explorer-tag="' + escapeHtml(tag) + '">' + escapeHtml(tag) + '</button>';
      }).join('');
      updateTypesExplorerScopeButtons();
      updateTypesExplorerPanelVisibility();
    };
    var resetTypesExplorerFilter = function() {
      typesExplorerMaps.chernarus = true;
      typesExplorerMaps.livonia = true;
      typesExplorerMaps.sakhal = true;
      typesExplorerState.usage = [];
      typesExplorerState.value = [];
      activeTypesExplorerMatchByName = null;
      rebuildTypesExplorerData();
      if (activeTypesTagFilter) {
        setActiveTypesTagFilter(null);
        activeTypesTagMatchByName = null;
        AppUrl.push({}, { sourceUrl: buildTypesTagFilterUrl(null) });
      }
      if (table) {
        table.draw();
      }
      updateTypesTagFilterNotice();
      renderTypesExplorerTags();
      syncTypesExplorerPath();
    };
    var clearTypesExplorerSelections = function() {
      typesExplorerState.usage = [];
      typesExplorerState.value = [];
      activeTypesExplorerMatchByName = null;
      rebuildTypesExplorerData();
      renderTypesExplorerTags();
    };
    var updateTypesTagFilterNotice = function() {
      if (typeof updateNotices === 'function') {
        updateNotices();
      }
    };
    var updatePathFilterNotice = function() {
      if (typeof updateNotices === 'function') {
        updateNotices();
      }
    };
    var getDataTableRowData = function(settings, dataIndex) {
      var rowData = settings && settings.aoData && settings.aoData[dataIndex] ? settings.aoData[dataIndex]._aData : null;
      if (!rowData && table) {
        rowData = table.row(dataIndex).data();
      }
      return rowData || null;
    };
    var rowPassesTagFilter = function(rowData, filterState) {
      return requireCoreModule('rowPassesTagFilter')(rowData, filterState, {
        getObjectName: getObjectName
      });
    };
    var rowPassesCollectionFilter = function(rowData, filterState) {
      return requireCoreModule('rowPassesCollectionFilter')(rowData, filterState, {
        normalizeFilterText: normalizeFilterText,
        isPresetRow: isPresetRow,
        getObjectName: getObjectName,
        getSearchTags: getSearchTags
      });
    };
    var URL_STATE_PARAMS = ['id', 'path', 'version', 'maps', 'types_map', 'types_kind', 'types_tag', 'q', 'world', 'object', 'types', 'types_maps', 'types_usage', 'types_value', 'presets', 'pinned', 'pinned_ids'];
    var AppUrl = requireCoreModule('createAppUrl')({
      managedParams: URL_STATE_PARAMS,
      onPush: function() {
        if (typeof updateNotices === 'function') {
          updateNotices();
        }
      }
    });
    var buildVersionFilterUrl = function(version) {
      return AppUrl.build({
        id: null,
        object: null,
        world: null,
        types_map: null,
        types_kind: null,
        types_tag: null,
        version: version ? version : null
      });
    };
    var buildIdFilterUrl = function(ids) {
      return AppUrl.build({
        version: null,
        world: null,
        types_map: null,
        types_kind: null,
        types_tag: null,
        object: null,
        id: Array.isArray(ids) ? ids : []
      });
    };
    var buildTypesTagFilterUrl = function(filter) {
      var overrides = {
        id: null,
        object: null,
        version: null,
        world: null,
        types_map: null,
        types_kind: null,
        types_tag: null
      };
      if (filter && filter.map && filter.kind && filter.name) {
        overrides.types_map = filter.map;
        overrides.types_kind = filter.kind;
        overrides.types_tag = filter.name;
      }
      return AppUrl.build(overrides);
    };
    var parseTypesExplorerList = function(rawValue) {
      if (!rawValue) return [];
      var seen = {};
      return String(rawValue)
        .split(',')
        .map(function(part) { return part.trim(); })
        .filter(function(part) {
          if (!part) return false;
          var key = part.toLowerCase();
          if (seen[key]) return false;
          seen[key] = true;
          return true;
        });
    };
    var buildTypesExplorerUrl = function() {
      var overrides = {
        id: null,
        object: null,
        version: null,
        path: null,
        maps: null,
        world: null,
        presets: null,
        types_map: null,
        types_kind: null,
        types_tag: null,
        types: null,
        types_maps: null,
        types_usage: null,
        types_value: null
      };
      if (activeCollectionFilter === AppMode.OBJECT_MAP) {
        var currentMapObjectParam = String(AppUrl.read().get('object') || '').trim();
        overrides.maps = '1';
        overrides.world = normalizeObjectMapKey(objectMapActiveMapKey);
        if (currentMapObjectParam && objectMapSearchMode === 'exact_object' && objectMapExactSearchQuery) {
          overrides.object = objectMapExactSearchQuery;
        }
        return AppUrl.build(overrides, { pathname: '/' });
      }
      if (activeCollectionFilter === AppMode.PRESETS) {
        overrides.presets = '1';
        return AppUrl.build(overrides, { pathname: '/' });
      }
      var hasTypesExplorer = activeCollectionFilter === AppMode.TYPES_EXPLORER;
      if (!hasTypesExplorer) {
        return AppUrl.build(overrides, { pathname: '/' });
      }
      overrides.types = '1';
      var activeMaps = Object.keys(typesExplorerMaps).filter(function(key) { return !!typesExplorerMaps[key]; });
      if (activeMaps.length && activeMaps.length < 3) {
        overrides.types_maps = activeMaps.join(',');
      }
      if (typesExplorerState.usage && typesExplorerState.usage.length) {
        overrides.types_usage = typesExplorerState.usage.join(',');
      }
      if (typesExplorerState.value && typesExplorerState.value.length) {
        overrides.types_value = typesExplorerState.value.join(',');
      }
      return AppUrl.build(overrides, { pathname: '/' });
    };
    var buildSearchShareUrl = function(queryValue) {
      var query = String(queryValue || '').trim();
      return AppUrl.build({ q: query || null }, { sourceUrl: buildTypesExplorerUrl() });
    };
    var updateSearchShareLinkVisibility = function() {
      if (!folderSidebarSearchLinkEl && !folderSidebarSearchClearEl) return;
      var hasQuery = false;
      if (folderSidebarSearchEl && folderSidebarSearchEl.value) {
        hasQuery = String(folderSidebarSearchEl.value || '').trim().length > 0;
      } else if (table && typeof table.search === 'function') {
        hasQuery = String(table.search() || '').trim().length > 0;
      }
      if (folderSidebarSearchLinkEl) {
        folderSidebarSearchLinkEl.classList.toggle('visible', hasQuery);
      }
      if (folderSidebarSearchClearEl) {
        folderSidebarSearchClearEl.classList.toggle('visible', hasQuery);
      }
    };
    var buildFolderPathUrl = function(pathValue) {
      var normalizedPath = normalizeFilterText(pathValue || '');
      return AppUrl.build({
        id: null,
        object: null,
        version: null,
        maps: null,
        world: null,
        presets: null,
        types: null,
        types_maps: null,
        types_usage: null,
        types_value: null,
        types_map: null,
        types_kind: null,
        types_tag: null,
        path: normalizedPath || null
      }, { pathname: '/' });
    };
    var normalizePathname = function(pathname) {
      var path = String(pathname || '/').trim();
      if (!path) path = '/';
      if (path.length > 1) {
        path = path.replace(/\/+$/, '');
      }
      return path;
    };
    var syncTypesExplorerPath = function() {
      AppUrl.push({}, { sourceUrl: buildTypesExplorerUrl() });
    };
    var snapToTopOfMainView = function() {
      window.scrollTo({ top: 0, behavior: 'auto' });
    };
    var setTypesTagFilter = function(mapKey, tagKind, tagName, shouldSnapToTop) {
      var map = String(mapKey || '').trim().toLowerCase();
      var kind = String(tagKind || '').trim().toLowerCase();
      var name = String(tagName || '').trim();
      if (!map || !kind || !name) return;
      if (kind !== 'usage' && kind !== 'value') return;
      if (activeTypesTagFilter && activeTypesTagFilter.map === map && activeTypesTagFilter.kind === kind && activeTypesTagFilter.name === name) {
        setActiveTypesTagFilter(null);
        activeTypesTagMatchByName = null;
        AppUrl.push({}, { sourceUrl: buildTypesTagFilterUrl(null) });
      } else {
        if (hasTypesExplorerSelection()) {
          typesExplorerState.usage = [];
          typesExplorerState.value = [];
          activeTypesExplorerMatchByName = null;
          renderTypesExplorerTags();
        }
        setActiveTypesTagFilter({ map: map, kind: kind, name: name });
        activeTypesTagMatchByName = buildTypesTagMatchIndex(activeTypesTagFilter);
        if (table) {
          table.search('').columns().search('');
        }
        $('#filterConsole').val('all');
        AppUrl.push({}, { sourceUrl: buildTypesTagFilterUrl(activeTypesTagFilter) });
      }
      if (shouldSnapToTop) {
        snapToTopOfMainView();
      }
      if (table) {
        table.draw();
      }
      updateTypesTagFilterNotice();
    };
    var openTypesExplorerFromTag = function(mapKey, tagKind, tagName, shouldSnapToTop) {
      var map = String(mapKey || '').trim().toLowerCase();
      var kind = String(tagKind || '').trim().toLowerCase();
      var name = String(tagName || '').trim();
      if (!map || !name) return;
      if (kind !== 'usage' && kind !== 'value') return;
      setActiveTypesTagFilter(null);
      activeTypesTagMatchByName = null;
      AppUrl.push({}, { sourceUrl: buildTypesTagFilterUrl(null) });
      setActiveCollectionFilter(AppMode.TYPES_EXPLORER);
      setActiveFolderFilter('', false);
      Object.keys(typesExplorerMaps).forEach(function(key) {
        typesExplorerMaps[key] = key === map;
      });
      rebuildTypesExplorerData();
      typesExplorerState.usage = kind === 'usage' ? [name] : [];
      typesExplorerState.value = kind === 'value' ? [name] : [];
      activeTypesExplorerMatchByName = buildTypesExplorerMatchIndex();
      renderTypesExplorerTags();
      syncTypesExplorerPath();
      if (shouldSnapToTop) {
        snapToTopOfMainView();
      }
      if (table) {
        table.draw();
      }
      updateTypesTagFilterNotice();
    };
    $.fn.dataTable.ext.search.push(function(settings, _data, dataIndex) {
      if (!table || settings.nTable !== $tableEl.get(0)) return true;
      var rowData = getDataTableRowData(settings, dataIndex);
      var hasExplorerTags = activeCollectionFilter === AppMode.TYPES_EXPLORER && hasTypesExplorerSelection();
      if (activeTypesTagFilter && !activeTypesTagMatchByName) {
        activeTypesTagMatchByName = buildTypesTagMatchIndex(activeTypesTagFilter) || {};
      }
      if (hasExplorerTags && !activeTypesExplorerMatchByName) {
        activeTypesExplorerMatchByName = buildTypesExplorerMatchIndex() || {};
      }
      return rowPassesTagFilter(rowData, {
        collectionFilter: activeCollectionFilter,
        typesTagFilter: activeTypesTagFilter,
        hasTypesExplorerSelection: hasExplorerTags,
        typesTagMatchByName: activeTypesTagMatchByName || {},
        typesExplorerMatchByName: activeTypesExplorerMatchByName || {}
      });
    });
    $.fn.dataTable.ext.search.push(function(settings, _data, dataIndex) {
      if (!table || settings.nTable !== $tableEl.get(0)) return true;
      var rowData = getDataTableRowData(settings, dataIndex);
      return rowPassesCollectionFilter(rowData, {
        collectionFilter: activeCollectionFilter,
        folderFilter: activeFolderFilter,
        ignoreFolderFilter: ignoreActiveFolderFilterForTree,
        typesExplorerIndex: typesExplorerByObject
      });
    });
    if (objectFocusEl) {
      objectFocusEl.classList.add('visible', 'collapsed');
      updateCollapseButtonLabel();
      updateEmptyState();
      updateLayoutForSidebar();
    }
    if (imageOverlayCloseEl) {
      imageOverlayCloseEl.addEventListener('click', function(e) {
        e.stopPropagation();
        closeImageOverlay();
      });
    }
    if (imageOverlayEl) {
      imageOverlayEl.addEventListener('click', function(e) {
        if (e.target === imageOverlayEl) {
          closeImageOverlay();
        }
      });
    }
    if (objectFocusImageEl) {
      objectFocusImageEl.addEventListener('click', function(e) {
        var imgEl = e.target.closest('img');
        if (!imgEl || !currentObjectData || !Array.isArray(currentObjectImages) || !currentObjectImages.length) return;
        var openSrc = imgEl.getAttribute('src') || ('/' + String(currentObjectImages[currentObjectImageIndex] || '').replace(/^\/+/, ''));
        openImageOverlay(openSrc, currentObjectData.objName, currentObjectImages, currentObjectImageIndex);
      });
    }
    if (objectFocusImagePrevEl) {
      objectFocusImagePrevEl.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        stepObjectFocusImage(-1);
      });
    }
    if (objectFocusImageNextEl) {
      objectFocusImageNextEl.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        stepObjectFocusImage(1);
      });
    }
    if (imageOverlayPrevEl) {
      imageOverlayPrevEl.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        stepImageOverlay(-1);
      });
    }
    if (imageOverlayNextEl) {
      imageOverlayNextEl.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        stepImageOverlay(1);
      });
    }
    if (objectFocusLinksEl) {
      objectFocusLinksEl.addEventListener('click', function(e) {
        var toggle = e.target.closest('.object-focus__links-toggle');
        if (toggle) {
          e.preventDefault();
          e.stopPropagation();
          objectFocusSectionExpanded.links = !objectFocusSectionExpanded.links;
          saveObjectFocusSectionPrefs();
          objectFocusLinksEl.classList.toggle('is-open', objectFocusSectionExpanded.links);
          toggle.setAttribute('aria-expanded', objectFocusSectionExpanded.links ? 'true' : 'false');
          toggle.textContent = (objectFocusSectionExpanded.links ? '▴ ' : '▾ ') + 'Linked objects';
          return;
        }
        var pill = e.target.closest('.object-focus__link-pill');
        if (!pill) return;
        var linkedName = pill.getAttribute('data-linked-name') || '';
        if (!focusSidebarByName(linkedName)) {
          var linkedId = normalizeObjectId(pill.getAttribute('data-linked-id') || '');
          if (linkedId) {
            var directName = getLinkedDisplayName(linkedId);
            focusSidebarByName(directName);
          }
        }
      });
    }
    if (objectFocusMetaEl) {
      objectFocusMetaEl.addEventListener('click', function(e) {
        var sectionToggle = e.target.closest('.object-focus__section-toggle');
        if (sectionToggle) {
          e.preventDefault();
          e.stopPropagation();
          var sectionKey = sectionToggle.getAttribute('data-section-toggle') || '';
          if (!sectionKey) return;
          objectFocusSectionExpanded[sectionKey] = !(objectFocusSectionExpanded[sectionKey] !== false);
          saveObjectFocusSectionPrefs();
          var sectionEl = sectionToggle.closest('.object-focus__section-accordion');
          if (sectionEl) {
            sectionEl.classList.toggle('is-open', objectFocusSectionExpanded[sectionKey]);
          }
          var sectionTitle = sectionToggle.getAttribute('data-section-title') || '';
          var sectionTitlePrefix = '';
          if (sectionKey === 'types') {
            sectionTitlePrefix = '';
          }
          sectionToggle.setAttribute('aria-expanded', objectFocusSectionExpanded[sectionKey] ? 'true' : 'false');
          sectionToggle.innerHTML = buildObjectFocusSectionToggleHtml(
            sectionKey,
            sectionTitlePrefix + sectionTitle,
            objectFocusSectionExpanded[sectionKey]
          );
          return;
        }
        var typesPill = e.target.closest('.object-focus__types-pill');
        if (typesPill) {
          e.preventDefault();
          e.stopPropagation();
          openTypesExplorerFromTag(
            typesPill.getAttribute('data-types-map') || '',
            typesPill.getAttribute('data-types-kind') || '',
            typesPill.getAttribute('data-types-name') || '',
            true
          );
          return;
        }
        var pathTrigger = e.target.closest('[data-action="focus-folder-path"]');
        if (pathTrigger) {
          e.preventDefault();
          e.stopPropagation();
          var rawPath = String(pathTrigger.getAttribute('data-folder-path') || '');
          var targetPath = getDeepestPathPrefix(rawPath);
          if (!targetPath) return;
          expandFolderTreeForPath(rawPath);
          setActiveCollectionFilter(AppMode.DATABASE);
          setActiveFolderFilter(targetPath, true);
        }
      });
    }
    if (objectFocusLocationEl) {
      objectFocusLocationEl.addEventListener('click', function(e) {
        var sectionToggle = e.target.closest('.object-focus__section-toggle');
        if (sectionToggle) {
          e.preventDefault();
          e.stopPropagation();
          objectFocusSectionExpanded.location = !objectFocusSectionExpanded.location;
          saveObjectFocusSectionPrefs();
          objectFocusLocationEl.classList.toggle('is-open', objectFocusSectionExpanded.location);
          sectionToggle.setAttribute('aria-expanded', objectFocusSectionExpanded.location ? 'true' : 'false');
          sectionToggle.innerHTML = buildObjectFocusSectionToggleHtml('location', 'Object Maps', objectFocusSectionExpanded.location);
          return;
        }
        var unavailableTrigger = e.target.closest('[data-action="view-location-map-unavailable"]');
        if (unavailableTrigger) {
          e.preventDefault();
          e.stopPropagation();
          if (sakhalMapUiTimer) {
            window.clearTimeout(sakhalMapUiTimer);
            sakhalMapUiTimer = null;
          }
          var defaultLabel = unavailableTrigger.getAttribute('data-default-label') || unavailableTrigger.textContent || '';
          unavailableTrigger.textContent = 'No map yet';
          unavailableTrigger.classList.add('is-flashing');
          sakhalMapUiTimer = window.setTimeout(function() {
            unavailableTrigger.textContent = defaultLabel;
            unavailableTrigger.classList.remove('is-flashing');
            sakhalMapUiTimer = null;
          }, 1100);
          return;
        }
        var trigger = e.target.closest('[data-action="view-location-map"]');
        if (!trigger || !currentObjectData || !currentObjectLocationData) return;
        var mapKey = trigger.getAttribute('data-map-key') || '';
        var resolved = currentObjectLocationData[mapKey];
        if (!mapKey || !resolved || !resolved.count) return;
        e.preventDefault();
        e.stopPropagation();
        openObjectInObjectMapView(
          currentObjectData.id || '',
          currentObjectData.objName || '',
          mapKey
        );
      });
    }
    if (chernarusMapCloseEl) {
      chernarusMapCloseEl.addEventListener('click', function(e) {
        e.stopPropagation();
        closeChernarusMapLightbox();
      });
    }
    if (chernarusMapLightboxEl) {
      chernarusMapLightboxEl.addEventListener('click', function(e) {
        if (e.target === chernarusMapLightboxEl) {
          closeChernarusMapLightbox();
        }
      });
    }
    if (chernarusMapResetEl) {
      chernarusMapResetEl.addEventListener('click', function() {
        scheduleLocationMapLayout(true);
      });
    }
    if (chernarusMapOpenObjectMapEl) {
      chernarusMapOpenObjectMapEl.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        var selection = chernarusMapState.selection || {};
        var preferredMapKey = selection.mapKey || chernarusMapState.activeMapKey || '';
        var objId = (currentObjectData && currentObjectData.id) ? currentObjectData.id : '';
        var objName = (currentObjectData && currentObjectData.objName) ? currentObjectData.objName : (selection.name || '');
        closeChernarusMapLightbox();
        openObjectInObjectMapView(objId, objName, preferredMapKey);
      });
    }
    if (chernarusMapOverlayEl) {
      chernarusMapOverlayEl.addEventListener('wheel', function(event) {
        if (!chernarusMapLightboxEl || !chernarusMapLightboxEl.classList.contains('is-open') || !chernarusMapState.data || !chernarusMapState.view) return;
        event.preventDefault();
        var rect = locationMapViewportRect();
        var factor = event.deltaY > 0 ? 1.12 : 0.88;
        chernarusMapState.view = zoomLocationMapViewAt(
          cloneLocationMapView(chernarusMapState.view),
          event.clientX - rect.left,
          event.clientY - rect.top,
          factor
        );
        drawLocationMapFrame();
      }, { passive: false });
      chernarusMapOverlayEl.addEventListener('pointerdown', function(event) {
        if (!chernarusMapLightboxEl || !chernarusMapLightboxEl.classList.contains('is-open') || !chernarusMapState.view) return;
        chernarusMapState.dragStart = {
          x: event.clientX,
          y: event.clientY,
          view: cloneLocationMapView(chernarusMapState.view)
        };
        chernarusMapOverlayEl.classList.add('dragging');
        chernarusMapOverlayEl.setPointerCapture(event.pointerId);
      });
      chernarusMapOverlayEl.addEventListener('pointermove', function(event) {
        if (!chernarusMapState.dragStart || !chernarusMapState.view) return;
        var rect = locationMapViewportRect();
        var dx = ((event.clientX - chernarusMapState.dragStart.x) / (rect.width || 1)) *
          (chernarusMapState.dragStart.view.maxX - chernarusMapState.dragStart.view.minX);
        var dy = ((event.clientY - chernarusMapState.dragStart.y) / (rect.height || 1)) *
          (chernarusMapState.dragStart.view.maxY - chernarusMapState.dragStart.view.minY);
        chernarusMapState.view.minX = chernarusMapState.dragStart.view.minX - dx;
        chernarusMapState.view.maxX = chernarusMapState.dragStart.view.maxX - dx;
        chernarusMapState.view.minY = chernarusMapState.dragStart.view.minY + dy;
        chernarusMapState.view.maxY = chernarusMapState.dragStart.view.maxY + dy;
        drawLocationMapFrame();
      });
      var endLocationMapDrag = function(event) {
        if (chernarusMapState.dragStart && chernarusMapOverlayEl.hasPointerCapture(event.pointerId)) {
          chernarusMapOverlayEl.releasePointerCapture(event.pointerId);
        }
        chernarusMapState.dragStart = null;
        chernarusMapOverlayEl.classList.remove('dragging');
      };
      chernarusMapOverlayEl.addEventListener('pointerup', endLocationMapDrag);
      chernarusMapOverlayEl.addEventListener('pointercancel', endLocationMapDrag);
    }
    window.addEventListener('keydown', function(event) {
      if (imageOverlayEl && imageOverlayEl.classList.contains('is-open')) {
        if (event.key === 'Escape') {
          closeImageOverlay();
          return;
        }
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          stepImageOverlay(-1);
          return;
        }
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          stepImageOverlay(1);
          return;
        }
      }
      if (event.key === 'Escape' && chernarusMapLightboxEl && chernarusMapLightboxEl.classList.contains('is-open')) {
        closeChernarusMapLightbox();
      }
    });
    window.addEventListener('resize', updateMobileView);
    window.addEventListener('resize', function() {
      if (chernarusMapLightboxEl && chernarusMapLightboxEl.classList.contains('is-open') && chernarusMapState.data) {
        scheduleLocationMapLayout(true);
      }
    });
    updateMobileView();

    var buildRowDetailsHtml = function($cell) {
      var objName = $cell.data('object') || '';
      var objectId = $cell.data('objectid') || '';
      var imgPath = $cell.data('image') || '';
      var p3dPath = $cell.data('p3d') || '';
      var inGame = $cell.data('ingame') || '';
      var category = $cell.data('category') || '';
      var modelType = $cell.data('modeltype') || '';
      var consoleFlag = $cell.data('console') || '';
      var tags = $cell.data('tags') || '';
      var imgHtml = imgPath ? '<img class="row-detail__image" src="/' + escapeHtml(imgPath) + '" alt="' + escapeHtml(objName) + ' preview">' : '';
      return (
        '<div class="row-detail" data-object="' + escapeHtml(objName) + '">' +
          '<div class="row-detail__title">' + escapeHtml(objName) + '</div>' +
          '<div class="row-detail__actions">' +
            '<button class="row-detail__action ui-action-btn" data-action="pin"><span class="ui-icon ui-icon--pin" aria-hidden="true"></span><span>Pin</span></button>' +
            '<button class="row-detail__action ui-action-btn" data-action="link"><span class="ui-icon ui-icon--link" aria-hidden="true"></span><span>Copy link</span></button>' +
            '<button class="row-detail__action ui-action-btn" data-action="editor"><span class="ui-icon ui-icon--editor" aria-hidden="true"></span><span>Copy to Editor</span></button>' +
            '<button class="row-detail__action ui-action-btn" data-action="name"><span class="ui-icon ui-icon--copy-name" aria-hidden="true"></span><span>Copy name</span></button>' +
          '</div>' +
          (imgHtml ? imgHtml : '') +
          '<div class="row-detail__meta">' +
            '<div>Object ID: ' + escapeHtml(objectId || '—') + '</div>' +
            '<div>Path: ' + escapeHtml(p3dPath || '—') + '</div>' +
            '<div>In-game name: ' + escapeHtml(inGame || '—') + '</div>' +
            '<div>Category: ' + escapeHtml(category || '—') + '</div>' +
            '<div>Model type: ' + escapeHtml(modelType || '—') + '</div>' +
            '<div>Console: ' + escapeHtml(consoleFlag || '—') + '</div>' +
            '<div>Tags: ' + escapeHtml(tags || '—') + '</div>' +
          '</div>' +
          '<div class="row-detail__actions">' +
            (imgPath ? '<a class="row-detail__action" data-action="download" href="/' + escapeHtml(imgPath) + '" download>↓ Download image</a>' : '') +
            '<button class="row-detail__action" data-action="close">🆇 Deselect object</button>' +
          '</div>' +
        '</div>'
      );
    };

    var objectIdPattern = /^dzobj_[a-z0-9]{10}$/;
    var normalizeObjectId = function(value) {
      if (value === null || value === undefined) return '';
      var id = String(value).trim();
      return objectIdPattern.test(id) ? id : '';
    };
    var normalizeViewerPath = function(value) {
      return String(value || '')
        .trim()
        .replace(/\\/g, '/')
        .replace(/^\/+/, '')
        .replace(/\/+/g, '/')
        .replace(/\/+$/, '')
        .toLowerCase();
    };
    var getObjectLocationCacheKey = function(objData) {
      if (!objData) return '';
      return normalizeObjectId(objData.id || '') || String(objData.objName || '').trim().toLowerCase();
    };
    var resetObjectLocationGraph = function() {
      objectDataById = {};
      objectDataByName = {};
      objectDataByMatchKey = {};
      objectNameById = {};
      objectLinkGraph = {};
      objectLocationClusterCache = {};
      objectLocationResolutionCache = {};
    };
    var ensureObjectGraphNode = function(id) {
      if (!id) return;
      if (!objectLinkGraph[id]) {
        objectLinkGraph[id] = {};
      }
    };
    var addObjectLink = function(sourceId, targetId) {
      var source = normalizeObjectId(sourceId);
      var target = normalizeObjectId(targetId);
      if (!source || !target || source === target) return;
      ensureObjectGraphNode(source);
      ensureObjectGraphNode(target);
      objectLinkGraph[source][target] = true;
      objectLinkGraph[target][source] = true;
    };
    var getLocationClusterIds = function(rootId) {
      var normalizedRoot = normalizeObjectId(rootId);
      if (!normalizedRoot) return [];
      if (objectLocationClusterCache[normalizedRoot]) {
        return objectLocationClusterCache[normalizedRoot].slice();
      }
      var seen = {};
      var queue = [normalizedRoot];
      var out = [];
      while (queue.length) {
        var currentId = queue.shift();
        if (!currentId || seen[currentId]) continue;
        seen[currentId] = true;
        out.push(currentId);
        var neighbors = objectLinkGraph[currentId] ? Object.keys(objectLinkGraph[currentId]) : [];
        neighbors.forEach(function(nextId) {
          if (!seen[nextId]) {
            queue.push(nextId);
          }
        });
      }
      objectLocationClusterCache[normalizedRoot] = out.slice();
      return out;
    };
    var buildViewerMatchKeysForRow = function(row) {
      if (!row) return [];
      var keys = [];
      var seen = {};
      var pushKey = function(value) {
        var normalized = normalizeViewerPath(value || '');
        if (!normalized || seen[normalized]) return;
        seen[normalized] = true;
        keys.push(normalized);
      };
      var objName = String(getObjectName(row) || '').trim().toLowerCase();
      var folder = normalizeViewerPath(row.path || '');
      if (!objName) return keys;
      pushKey(objName);
      if (folder) {
        pushKey(folder + '/' + objName);
      }
      if (objName.slice(-4) === '.p3d') {
        var stem = objName.slice(0, -4);
        pushKey(stem);
        pushKey('land_' + stem);
        if (folder) {
          pushKey(folder + '/' + stem);
          pushKey(folder + '/' + stem + '.p3d');
          pushKey(folder + '/land_' + stem);
        }
      }
      if (objName.indexOf('land_') === 0) {
        var landStem = objName.slice(5);
        pushKey(landStem);
        pushKey(landStem + '.p3d');
        if (folder) {
          pushKey(folder + '/' + landStem);
          pushKey(folder + '/' + landStem + '.p3d');
        }
      }
      return keys;
    };
    var getViewerTypesForRow = function(row, viewerData) {
      if (!row || !viewerData) return [];
      var matches = [];
      var seen = {};
      buildViewerMatchKeysForRow(row).forEach(function(matchKey) {
        var type = viewerData.typesByMatchKey ? viewerData.typesByMatchKey[matchKey] : null;
        if (!type || seen[type.id]) return;
        seen[type.id] = true;
        matches.push(type);
      });
      return matches;
    };
    var buildResolvedLocationData = function(objData, viewerData, mapKey) {
      var objectCacheKey = getObjectLocationCacheKey(objData);
      var cacheKey = (mapKey || 'map') + ':' + objectCacheKey;
      if (!objectCacheKey || !viewerData) return null;
      if (objectLocationResolutionCache[cacheKey]) {
        return objectLocationResolutionCache[cacheKey];
      }
      var sourceRows = [];
      var seenRowKey = {};
      var addRow = function(row) {
        if (!row) return;
        var rowKey = normalizeObjectId(getObjectId(row)) || String(getObjectName(row) || '').trim().toLowerCase();
        if (!rowKey || seenRowKey[rowKey]) return;
        seenRowKey[rowKey] = true;
        sourceRows.push(row);
      };
      addRow(objectDataById[normalizeObjectId(objData.id || '')] || null);
      addRow(objectDataByName[String(objData.objName || '').trim().toLowerCase()] || null);
      addRow({
        id: objData.id || '',
        objectName: objData.objName || '',
        path: objData.p3dPath || '',
        modelType: objData.modelType || '',
        'linked-p3d': objData.linkedP3D || '',
        'linked-config': objData.linkedConfig || [],
        'linked-variant': objData.linkedVariant || []
      });
      var rootId = normalizeObjectId(objData.id || '');
      if (rootId) {
        getLocationClusterIds(rootId).forEach(function(linkedId) {
          addRow(objectDataById[linkedId] || null);
        });
      }
      var types = [];
      var typeSeen = {};
      var pointSeen = {};
      var dedupedPoints = [];
      sourceRows.forEach(function(row) {
        getViewerTypesForRow(row, viewerData).forEach(function(type) {
          if (!typeSeen[type.id]) {
            typeSeen[type.id] = true;
            types.push(type);
          }
          for (var pointIndex = 0; pointIndex < type.points.length; pointIndex += 2) {
            var x = type.points[pointIndex];
            var y = type.points[pointIndex + 1];
            var pointKey = x + ',' + y;
            if (pointSeen[pointKey]) continue;
            pointSeen[pointKey] = true;
            dedupedPoints.push(x, y);
          }
        });
      });
      var resolved = {
        count: dedupedPoints.length / 2,
        points: dedupedPoints,
        types: types,
        typeCount: types.length
      };
      objectLocationResolutionCache[cacheKey] = resolved;
      return resolved;
    };
    var updateObjectFocusLocation = function(objData) {
      if (!objectFocusLocationEl) return;
      var locationExpanded = objectFocusSectionExpanded.location !== false;
      if (!objData || !objData.objName) {
        currentObjectLocationData = {};
        objectFocusLocationEl.innerHTML = '';
        objectFocusLocationEl.classList.remove('visible');
        updateFolderSidebarTitle();
        return;
      }
      var requestKey = getObjectLocationCacheKey(objData);
      currentObjectLocationData = {};
      objectFocusLocationEl.classList.add('visible');
      objectFocusLocationEl.innerHTML =
        '<div class="object-focus__section-header">' +
          '<button class="object-focus__section-title object-focus__section-toggle object-focus__location-heading" type="button" data-section-toggle="location" data-section-title="Object Maps" aria-expanded="' + (locationExpanded ? 'true' : 'false') + '">' + buildObjectFocusSectionToggleHtml('location', 'Object Maps', locationExpanded) + '</button>' +
        '</div>' +
        '<div class="object-focus__section-body">' +
          '<div class="object-focus__location-row">' +
            '<span class="object-focus__location-status">Checking locations...</span>' +
          '</div>' +
        '</div>';
      objectFocusLocationEl.classList.toggle('is-open', locationExpanded);
      Promise.allSettled(Object.keys(locationMapConfigs).map(function(mapKey) {
        return ensureLocationMapData(mapKey).then(function(viewerData) {
          return {
            mapKey: mapKey,
            resolved: buildResolvedLocationData(objData, viewerData, mapKey)
          };
        });
      }))
        .then(function(results) {
          if (!currentObjectData || getObjectLocationCacheKey(currentObjectData) !== requestKey) return;
          currentObjectLocationData = {};
          results.forEach(function(result) {
            if (result.status !== 'fulfilled' || !result.value) return;
            var mapKey = result.value.mapKey;
            var resolved = result.value.resolved;
            if (!mapKey || !resolved || !resolved.count) return;
            currentObjectLocationData[mapKey] = resolved;
          });
          var availableMapKeys = Object.keys(currentObjectLocationData);
          if (!availableMapKeys.length) {
            currentObjectLocationData = {};
            objectFocusLocationEl.innerHTML = '';
            objectFocusLocationEl.classList.remove('visible', 'is-open');
            updateFolderSidebarTitle();
            return;
          }
          var mapGroupActionHtml = '';
          if (objectFocusMapGroupProtoLinkEl && objectFocusMapGroupProtoLinkEl.getAttribute('href')) {
            mapGroupActionHtml =
              '<a class="object-focus__link-pill object-focus__section-action" href="' + escapeHtml(objectFocusMapGroupProtoLinkEl.getAttribute('href') || '#') + '" download="' + escapeHtml(objectFocusMapGroupProtoLinkEl.getAttribute('download') || '') + '">↓ MapGroupProto</a>';
          }
          var orderedMapKeys = Object.keys(locationMapConfigs).filter(function(mapKey) {
            return !!currentObjectLocationData[mapKey];
          });
          var locationRowsHtml = orderedMapKeys.map(function(mapKey, index) {
            var resolved = currentObjectLocationData[mapKey];
            var config = locationMapConfigs[mapKey] || {};
            var linkedText = resolved.typeCount > 1 ? ('Across ' + formatNumber(resolved.typeCount) + ' linked types') : '';
            var iconPrefix = '';
            if (mapKey === 'chernarus') {
              iconPrefix = '🍂 ';
            } else if (mapKey === 'livonia') {
              iconPrefix = '🌲 ';
            } else if (mapKey === 'sakhal') {
              iconPrefix = '❄️ ';
            } else {
              iconPrefix = '🗺️ ';
            }
            var pillLabel = iconPrefix + formatNumber(resolved.count) + ' on ' + escapeHtml(config.label || mapKey);
            return (
              '<div class="object-focus__location-entry' + (index > 0 ? ' object-focus__location-entry--push' : '') + '">' +
                '<button class="object-focus__link-pill object-focus__location-pill" type="button" data-action="view-location-map" data-map-key="' + escapeHtml(mapKey) + '" data-default-label="' + escapeHtml(pillLabel) + '">' + pillLabel + '</button>' +
                (linkedText ? ('<span class="object-focus__location-status">' + escapeHtml(linkedText) + '</span>') : '') +
              '</div>'
            );
          }).join('');
          objectFocusLocationEl.innerHTML =
            '<div class="object-focus__section-header">' +
              '<button class="object-focus__section-title object-focus__section-toggle object-focus__location-heading" type="button" data-section-toggle="location" data-section-title="Object Maps" aria-expanded="' + (locationExpanded ? 'true' : 'false') + '">' + buildObjectFocusSectionToggleHtml('location', 'Object Maps', locationExpanded) + '</button>' +
              mapGroupActionHtml +
            '</div>' +
            '<div class="object-focus__section-body"><div class="object-focus__location-actions">' + locationRowsHtml + '</div></div>';
          objectFocusLocationEl.classList.toggle('is-open', locationExpanded);
          updateFolderSidebarTitle();
        })
        .catch(function(error) {
          if (!currentObjectData || getObjectLocationCacheKey(currentObjectData) !== requestKey) return;
          currentObjectLocationData = {};
          objectFocusLocationEl.innerHTML = '';
          objectFocusLocationEl.classList.remove('visible', 'is-open');
          updateFolderSidebarTitle();
        });
    };
    var getLocationMapConfig = function(mapKey) {
      return locationMapConfigs[mapKey] || null;
    };
    var getLocationMapLabel = function(mapKey) {
      var config = getLocationMapConfig(mapKey);
      return config && config.label ? config.label : 'Map';
    };
    var buildLocationAssetCandidates = function(fileName) {
      var candidates = [];
      var seen = {};
      var pushCandidate = function(value) {
        if (!value || seen[value]) return;
        seen[value] = true;
        candidates.push(value);
      };
      try {
        pushCandidate(new URL('data/' + fileName, window.location.href).toString());
      } catch (_) {}
      try {
        pushCandidate(new URL('./data/' + fileName, window.location.href).toString());
      } catch (_) {}
      try {
        pushCandidate(new URL('/data/' + fileName, window.location.origin).toString());
      } catch (_) {}
      pushCandidate('/data/' + fileName);
      return candidates;
    };
    var deriveLocationBackdropBaseUrl = function(dataUrl, mapKey) {
      var config = getLocationMapConfig(mapKey);
      var backdropDir = config && config.backdropDir ? config.backdropDir : '';
      try {
        return new URL(backdropDir + '/', dataUrl).toString();
      } catch (_) {
        return backdropDir ? ('/data/' + backdropDir + '/') : '/data/';
      }
    };
    var fetchFirstAvailableLocationJson = function(urls, index, mapKey) {
      if (index >= urls.length) {
        return Promise.reject(new Error('Unable to load ' + getLocationMapLabel(mapKey) + ' map data asset.'));
      }
      var candidate = urls[index];
      return fetch(candidate, { cache: 'no-store' })
        .then(function(resp) {
          if (!resp.ok) {
            throw new Error('HTTP ' + resp.status + ' for ' + candidate);
          }
          return resp.json().then(function(data) {
            return { data: data, url: candidate };
          });
        })
        .catch(function() {
          return fetchFirstAvailableLocationJson(urls, index + 1, mapKey);
        });
    };
    var getLocationViewerState = function(mapKey) {
      return chernarusMapState.viewers[mapKey] || null;
    };
    var ensureLocationMapData = function(mapKey) {
      var config = getLocationMapConfig(mapKey);
      var viewerState = getLocationViewerState(mapKey);
      if (!config || !viewerState) {
        return Promise.reject(new Error('Unknown map viewer: ' + mapKey));
      }
      if (viewerState.data) {
        return Promise.resolve(viewerState.data);
      }
      if (viewerState.promise) {
        return viewerState.promise;
      }
      viewerState.promise = fetchFirstAvailableLocationJson(buildLocationAssetCandidates(config.dataFile), 0, mapKey)
        .then(function(result) {
          var data = result.data;
          data.typesByPath = {};
          data.typesByFileName = {};
          data.typesByMatchKey = {};
          (Array.isArray(data.types) ? data.types : []).forEach(function(type) {
            var pathKey = normalizeViewerPath(type.path || '');
            var fileKey = pathKey.split('/').pop() || '';
            var registerKey = function(key) {
              var normalizedKey = normalizeViewerPath(key || '');
              if (!normalizedKey || data.typesByMatchKey[normalizedKey]) return;
              data.typesByMatchKey[normalizedKey] = type;
            };
            if (pathKey && !data.typesByPath[pathKey]) {
              data.typesByPath[pathKey] = type;
            }
            if (fileKey && !data.typesByFileName[fileKey]) {
              data.typesByFileName[fileKey] = type;
            }
            registerKey(pathKey);
            registerKey(fileKey);
            (Array.isArray(type.matchKeys) ? type.matchKeys : []).forEach(registerKey);
          });
          viewerState.data = data;
          viewerState.dataUrl = result.url;
          viewerState.backdropBaseUrl = deriveLocationBackdropBaseUrl(result.url, mapKey);
          viewerState.error = null;
          return data;
        })
        .catch(function(error) {
          viewerState.promise = null;
          viewerState.error = error;
          throw error;
        });
      return viewerState.promise;
    };
    var activateLocationMapData = function(mapKey, data) {
      var viewerState = getLocationViewerState(mapKey);
      chernarusMapState.activeMapKey = mapKey || '';
      chernarusMapState.data = data || (viewerState ? viewerState.data : null);
      chernarusMapState.backdropBaseUrl = viewerState ? viewerState.backdropBaseUrl : '';
    };
    var createLocationMapSvgElement = function(tagName) {
      return document.createElementNS('http://www.w3.org/2000/svg', tagName);
    };
    var locationMapViewportRect = function() {
      return chernarusMapOverlayEl ? chernarusMapOverlayEl.getBoundingClientRect() : { width: 1, height: 1, left: 0, top: 0 };
    };
    var canMeasureLocationMap = function() {
      var rect = locationMapViewportRect();
      return !!(rect && rect.width > 40 && rect.height > 40);
    };
    var locationMapViewportAspect = function() {
      var rect = locationMapViewportRect();
      return (rect.width || 1) / (rect.height || 1);
    };
    var clampNumber = function(value, minimum, maximum) {
      return Math.max(minimum, Math.min(maximum, value));
    };
    var cloneLocationMapView = function(view) {
      return {
        minX: view.minX,
        maxX: view.maxX,
        minY: view.minY,
        maxY: view.maxY
      };
    };
    var fitLocationMapToBounds = function() {
      if (!chernarusMapState.data || !chernarusMapOverlayEl || !canMeasureLocationMap()) return;
      var bounds = chernarusMapState.data.bounds;
      var padding = 0.06;
      var rect = locationMapViewportRect();
      var viewportAspect = (rect.width || 1) / (rect.height || 1);
      var width = (bounds.width || 1) * (1 + padding * 2);
      var height = (bounds.height || 1) * (1 + padding * 2);
      var worldAspect = width / height;
      if (worldAspect > viewportAspect) {
        height = width / viewportAspect;
      } else {
        width = height * viewportAspect;
      }
      var centerX = (bounds.minX + bounds.maxX) / 2;
      var centerY = (bounds.minY + bounds.maxY) / 2;
      chernarusMapState.view = {
        minX: centerX - width / 2,
        maxX: centerX + width / 2,
        minY: centerY - height / 2,
        maxY: centerY + height / 2
      };
    };
    var normalizeLocationMapViewAspect = function(view) {
      if (!view || !canMeasureLocationMap()) return view;
      var width = Math.max(view.maxX - view.minX, 1);
      var height = Math.max(view.maxY - view.minY, 1);
      var viewportAspect = locationMapViewportAspect();
      var centerX = (view.minX + view.maxX) / 2;
      var centerY = (view.minY + view.maxY) / 2;
      if (width / height > viewportAspect) {
        height = width / viewportAspect;
      } else {
        width = height * viewportAspect;
      }
      return {
        minX: centerX - width / 2,
        maxX: centerX + width / 2,
        minY: centerY - height / 2,
        maxY: centerY + height / 2
      };
    };
    var syncLocationMapViewBox = function() {
      if (!chernarusMapOverlayEl || !chernarusMapState.view) return;
      var viewWidth = chernarusMapState.view.maxX - chernarusMapState.view.minX;
      var viewHeight = chernarusMapState.view.maxY - chernarusMapState.view.minY;
      chernarusMapOverlayEl.setAttribute(
        'viewBox',
        chernarusMapState.view.minX + ' ' + (-chernarusMapState.view.maxY) + ' ' + viewWidth + ' ' + viewHeight
      );
    };
    var locationMapMarkerWorldSize = function(targetPixels) {
      var rect = locationMapViewportRect();
      if (!rect.width || !rect.height) {
        return {
          halfWidth: 0,
          halfHeight: 0
        };
      }
      var worldWidth = chernarusMapState.view.maxX - chernarusMapState.view.minX;
      var worldHeight = chernarusMapState.view.maxY - chernarusMapState.view.minY;
      return {
        halfWidth: (targetPixels * worldWidth) / (rect.width || 1) / 2,
        halfHeight: (targetPixels * worldHeight) / (rect.height || 1) / 2
      };
    };
    var currentLocationMapZoomFactor = function() {
      if (!chernarusMapState.data || !chernarusMapState.view) return 1;
      var bounds = chernarusMapState.data.bounds;
      var viewWidth = chernarusMapState.view.maxX - chernarusMapState.view.minX;
      var viewHeight = chernarusMapState.view.maxY - chernarusMapState.view.minY;
      return Math.max(bounds.width / viewWidth, bounds.height / viewHeight);
    };
    var scaledLocationMarkerPixels = function(basePixels) {
      var zoom = currentLocationMapZoomFactor();
      var zoomScale = Math.pow(Math.max(zoom, 0.12), 0.55);
      return basePixels * Math.max(0.38, Math.min(2.8, zoomScale));
    };
    var locationMapMinimumViewRatio = 0.04;
    var formatLocationCoordinateValue = function(value) {
      var rounded = Math.round(Number(value || 0) * 10) / 10;
      return Math.abs(rounded - Math.round(rounded)) < 0.001 ? String(Math.round(rounded)) : rounded.toFixed(1);
    };
    var formatLocationCoordinatePair = function(x, y) {
      return '[' + formatLocationCoordinateValue(x) + ', ' + formatLocationCoordinateValue(y) + ']';
    };
    var updateLocationMapStatusText = function(text) {
      if (!chernarusMapStatusEl) return;
      chernarusMapStatusEl.textContent = text || '';
    };
    var showLocationMapToast = function(text) {
      if (!chernarusMapToastEl) return;
      if (chernarusMapState.toastTimer) {
        window.clearTimeout(chernarusMapState.toastTimer);
      }
      chernarusMapToastEl.textContent = text || '';
      chernarusMapToastEl.classList.toggle('visible', !!text);
      if (!text) return;
      chernarusMapState.toastTimer = window.setTimeout(function() {
        chernarusMapToastEl.classList.remove('visible');
        chernarusMapState.toastTimer = null;
      }, 1800);
    };
    var hideLocationMapToast = function() {
      if (!chernarusMapToastEl) return;
      if (chernarusMapState.toastTimer) {
        window.clearTimeout(chernarusMapState.toastTimer);
        chernarusMapState.toastTimer = null;
      }
      chernarusMapToastEl.classList.remove('visible');
      chernarusMapToastEl.textContent = '';
    };
    var copyLocationCoordinatesToClipboard = function(x, y) {
      var text = formatLocationCoordinatePair(x, y);
      if (!navigator.clipboard || !navigator.clipboard.writeText) {
        showLocationMapToast('Clipboard unavailable');
        return;
      }
      navigator.clipboard.writeText(text).then(function() {
        showLocationMapToast('Copied ' + text + ' to clipboard');
      }).catch(function() {
        showLocationMapToast('Unable to copy ' + text);
      });
    };
    var buildLocationMarkerPath = function(points, targetPixels) {
      if (!Array.isArray(points) || !points.length) return '';
      var size = locationMapMarkerWorldSize(targetPixels);
      var parts = [];
      for (var index = 0; index < points.length; index += 2) {
        var x = points[index];
        var y = points[index + 1];
        var left = x - size.halfWidth;
        var right = x + size.halfWidth;
        parts.push(
          'M' + left + ' ' + y +
          'A' + size.halfWidth + ' ' + size.halfHeight + ' 0 1 0 ' + right + ' ' + y +
          'A' + size.halfWidth + ' ' + size.halfHeight + ' 0 1 0 ' + left + ' ' + y + 'Z'
        );
      }
      return parts.join('');
    };
    var getLocationMarkerPaths = function(points, markerSize, haloSize, cacheKey) {
      if (chernarusMapState.markerPathCache.key === cacheKey) {
        return chernarusMapState.markerPathCache;
      }
      chernarusMapState.markerPathCache = {
        key: cacheKey,
        haloPath: buildLocationMarkerPath(points, haloSize),
        fillPath: buildLocationMarkerPath(points, markerSize)
      };
      return chernarusMapState.markerPathCache;
    };
    var locationMapTileWorldRect = function(level, row, col) {
      var bounds = chernarusMapState.data.bounds;
      var tileSize = chernarusMapState.data.backdrop.tileSize;
      var pixelX = col * tileSize;
      var pixelY = row * tileSize;
      var pixelWidth = Math.min(tileSize, level.width - pixelX);
      var pixelHeight = Math.min(tileSize, level.height - pixelY);
      return {
        x: bounds.minX + (pixelX / level.width) * bounds.width,
        y: bounds.minY + (pixelY / level.height) * bounds.height,
        width: (pixelWidth / level.width) * bounds.width,
        height: (pixelHeight / level.height) * bounds.height
      };
    };
    var getLocationMapBackdropLevel = function() {
      if (!canMeasureLocationMap()) return null;
      var levels = chernarusMapState.data.backdrop.levels;
      var rect = locationMapViewportRect();
      var viewWidth = chernarusMapState.view.maxX - chernarusMapState.view.minX;
      var viewHeight = chernarusMapState.view.maxY - chernarusMapState.view.minY;
      var screenDensity = Math.max((rect.width || 1) / viewWidth, (rect.height || 1) / viewHeight);
      var bounds = chernarusMapState.data.bounds;
      for (var index = 0; index < levels.length; index += 1) {
        var level = levels[index];
        var levelDensity = Math.max(level.width / bounds.width, level.height / bounds.height);
        if (levelDensity >= screenDensity * 1.1) {
          return level;
        }
      }
      return levels[levels.length - 1];
    };
    var syncLocationMapBackdropTiles = function() {
      if (!chernarusMapBackdropGroupEl || !chernarusMapState.data || !chernarusMapState.view) return;
      var bounds = chernarusMapState.data.bounds;
      var tileSize = chernarusMapState.data.backdrop.tileSize;
      var level = getLocationMapBackdropLevel();
      if (!level) return;
      if (chernarusMapState.backdropLevelId !== level.id) {
        chernarusMapBackdropGroupEl.replaceChildren();
        chernarusMapState.backdropTileNodes.clear();
        chernarusMapState.backdropLevelId = level.id;
      }
      var minPixelX = ((Math.max(chernarusMapState.view.minX, bounds.minX) - bounds.minX) / bounds.width) * level.width;
      var maxPixelX = ((Math.min(chernarusMapState.view.maxX, bounds.maxX) - bounds.minX) / bounds.width) * level.width;
      var minPixelY = ((Math.max(chernarusMapState.view.minY, bounds.minY) - bounds.minY) / bounds.height) * level.height;
      var maxPixelY = ((Math.min(chernarusMapState.view.maxY, bounds.maxY) - bounds.minY) / bounds.height) * level.height;
      var minCol = clampNumber(Math.floor(minPixelX / tileSize) - 1, 0, level.cols - 1);
      var maxCol = clampNumber(Math.floor(maxPixelX / tileSize) + 1, 0, level.cols - 1);
      var minRow = clampNumber(Math.floor(minPixelY / tileSize) - 1, 0, level.rows - 1);
      var maxRow = clampNumber(Math.floor(maxPixelY / tileSize) + 1, 0, level.rows - 1);
      var visibleKeys = {};
      for (var row = minRow; row <= maxRow; row += 1) {
        for (var col = minCol; col <= maxCol; col += 1) {
          var key = level.id + ':' + row + ':' + col;
          visibleKeys[key] = true;
          if (chernarusMapState.backdropTileNodes.has(key)) continue;
          var tile = createLocationMapSvgElement('image');
          var rect = locationMapTileWorldRect(level, row, col);
          var tileHref = (chernarusMapState.backdropBaseUrl || deriveLocationBackdropBaseUrl('', chernarusMapState.activeMapKey)) + level.id + '/r' + row + '-c' + col + '.png';
          tile.setAttribute('href', tileHref);
          tile.setAttribute('x', rect.x);
          tile.setAttribute('y', rect.y);
          tile.setAttribute('width', rect.width);
          tile.setAttribute('height', rect.height);
          tile.setAttribute('preserveAspectRatio', 'none');
          chernarusMapBackdropGroupEl.appendChild(tile);
          chernarusMapState.backdropTileNodes.set(key, tile);
        }
      }
      chernarusMapState.backdropTileNodes.forEach(function(node, key) {
        if (visibleKeys[key]) return;
        node.remove();
        chernarusMapState.backdropTileNodes.delete(key);
      });
    };
    var renderLocationMapSelection = function() {
      if (!chernarusMapSelectionGroupEl) return;
      chernarusMapSelectionGroupEl.replaceChildren();
      var selection = chernarusMapState.selection;
      if (!selection || !Array.isArray(selection.points) || !selection.points.length) {
        chernarusMapState.markerPathCache = { key: '', haloPath: '', fillPath: '' };
        return;
      }
      var markerSize = scaledLocationMarkerPixels(5.6);
      var haloSize = scaledLocationMarkerPixels(9.6);
      var hitSize = scaledLocationMarkerPixels(18);
      var markerRadius = locationMapMarkerWorldSize(markerSize);
      var haloRadius = locationMapMarkerWorldSize(haloSize);
      var hitRadius = locationMapMarkerWorldSize(hitSize);
      for (var index = 0; index < selection.points.length; index += 2) {
        var x = selection.points[index];
        var y = selection.points[index + 1];
        var markerGroup = createLocationMapSvgElement('g');
        markerGroup.setAttribute('class', 'map-lightbox__marker');
        var haloEl = createLocationMapSvgElement('ellipse');
        haloEl.setAttribute('cx', x);
        haloEl.setAttribute('cy', y);
        haloEl.setAttribute('rx', haloRadius.halfWidth);
        haloEl.setAttribute('ry', haloRadius.halfHeight);
        haloEl.setAttribute('fill', 'var(--card)');
        haloEl.setAttribute('opacity', '0.94');
        markerGroup.appendChild(haloEl);
        var fillEl = createLocationMapSvgElement('ellipse');
        fillEl.setAttribute('cx', x);
        fillEl.setAttribute('cy', y);
        fillEl.setAttribute('rx', markerRadius.halfWidth);
        fillEl.setAttribute('ry', markerRadius.halfHeight);
        fillEl.setAttribute('fill', 'var(--accent)');
        markerGroup.appendChild(fillEl);
        var hitEl = createLocationMapSvgElement('ellipse');
        hitEl.setAttribute('cx', x);
        hitEl.setAttribute('cy', y);
        hitEl.setAttribute('rx', hitRadius.halfWidth);
        hitEl.setAttribute('ry', hitRadius.halfHeight);
        hitEl.setAttribute('fill', 'rgba(0, 0, 0, 0.001)');
        hitEl.setAttribute('class', 'map-lightbox__marker-hit');
        hitEl.setAttribute('tabindex', '0');
        hitEl.setAttribute('role', 'button');
        hitEl.setAttribute('aria-label', 'Copy location ' + formatLocationCoordinatePair(x, y));
        hitEl.addEventListener('pointerdown', function(event) {
          event.stopPropagation();
        });
        hitEl.addEventListener('mouseenter', (function(pointX, pointY) {
          return function() {
            updateLocationMapStatusText('Click to copy ' + formatLocationCoordinatePair(pointX, pointY));
          };
        })(x, y));
        hitEl.addEventListener('mouseleave', function() {
          updateLocationMapStatusText('');
        });
        hitEl.addEventListener('focus', (function(pointX, pointY) {
          return function() {
            updateLocationMapStatusText('Press Enter to copy ' + formatLocationCoordinatePair(pointX, pointY));
          };
        })(x, y));
        hitEl.addEventListener('blur', function() {
          updateLocationMapStatusText('');
        });
        hitEl.addEventListener('click', (function(pointX, pointY) {
          return function(event) {
            event.stopPropagation();
            copyLocationCoordinatesToClipboard(pointX, pointY);
          };
        })(x, y));
        hitEl.addEventListener('keydown', (function(pointX, pointY) {
          return function(event) {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            event.stopPropagation();
            copyLocationCoordinatesToClipboard(pointX, pointY);
          };
        })(x, y));
        markerGroup.appendChild(hitEl);
        chernarusMapSelectionGroupEl.appendChild(markerGroup);
      }
    };
    var drawLocationMapFrame = function() {
      if (!chernarusMapState.data || !chernarusMapState.view || !canMeasureLocationMap()) return;
      chernarusMapState.view = normalizeLocationMapViewAspect(chernarusMapState.view);
      syncLocationMapViewBox();
      syncLocationMapBackdropTiles();
      renderLocationMapSelection();
    };
    var scheduleLocationMapLayout = function(resetView) {
      if (!chernarusMapLightboxEl || !chernarusMapLightboxEl.classList.contains('is-open')) return;
      var run = function() {
        if (!chernarusMapLightboxEl || !chernarusMapLightboxEl.classList.contains('is-open')) return;
        if (!canMeasureLocationMap()) {
          window.requestAnimationFrame(run);
          return;
        }
        if (resetView || !chernarusMapState.view) {
          fitLocationMapToBounds();
        }
        drawLocationMapFrame();
      };
      window.requestAnimationFrame(function() {
        window.requestAnimationFrame(run);
      });
    };
    var updateLocationMapCopy = function() {
      var selection = chernarusMapState.selection;
      var mapLabel = getLocationMapLabel(selection && selection.mapKey ? selection.mapKey : chernarusMapState.activeMapKey);
      if (!chernarusMapLabelEl || !chernarusMapMetaEl || !chernarusMapStatusEl) return;
      if (chernarusMapOpenObjectMapEl) {
        chernarusMapOpenObjectMapEl.hidden = !(selection && String(selection.mapKey || '').toLowerCase() === 'chernarus');
      }
      if (!selection) {
        chernarusMapLabelEl.textContent = mapLabel + ' map';
        chernarusMapMetaEl.textContent = '';
        updateLocationMapStatusText('');
        return;
      }
      chernarusMapLabelEl.textContent = selection.name || (mapLabel + ' map');
      chernarusMapMetaEl.textContent =
        formatNumber(selection.count || 0) + ' placements on ' + mapLabel +
        (selection.typeCount > 1 ? (' across ' + selection.typeCount + ' linked types') : '');
      updateLocationMapStatusText('');
    };
    var closeChernarusMapLightbox = function() {
      if (!chernarusMapLightboxEl) return;
      chernarusMapLightboxEl.classList.remove('is-open');
      chernarusMapLightboxEl.setAttribute('aria-hidden', 'true');
      objectMapContract.dispatchDomEvent(OBJECT_MAP_DOM_EVENTS.LIGHTBOX_CLOSED, {
        world: chernarusMapState.activeMapKey || ''
      });
      chernarusMapState.dragStart = null;
      hideLocationMapToast();
      updateLocationMapStatusText('');
      if (chernarusMapOverlayEl) {
        chernarusMapOverlayEl.classList.remove('dragging');
      }
    };
    var openLocationMapLightbox = function(mapKey, objData, resolved) {
      if (!chernarusMapLightboxEl || !resolved || !resolved.count) return;
      ensureLocationMapData(mapKey).then(function(data) {
        activateLocationMapData(mapKey, data);
        chernarusMapState.selection = {
          mapKey: mapKey,
          name: objData.objName || (getLocationMapLabel(mapKey) + ' map'),
          count: resolved.count,
          points: resolved.points.slice(),
          typeCount: resolved.typeCount || 0,
          cacheKey: mapKey + ':' + (getObjectLocationCacheKey(objData) || 'selection') + ':' + resolved.count
        };
        updateLocationMapCopy();
        chernarusMapState.view = null;
        chernarusMapState.backdropLevelId = '';
        chernarusMapState.markerPathCache = { key: '', haloPath: '', fillPath: '' };
        if (chernarusMapBackdropGroupEl) {
          chernarusMapBackdropGroupEl.replaceChildren();
        }
        chernarusMapState.backdropTileNodes.clear();
        chernarusMapLightboxEl.classList.add('is-open');
        chernarusMapLightboxEl.setAttribute('aria-hidden', 'false');
        objectMapContract.dispatchDomEvent(OBJECT_MAP_DOM_EVENTS.LIGHTBOX_OPENED, {
          world: mapKey,
          count: resolved.count || 0
        });
        scheduleLocationMapLayout(true);
      }).catch(function(error) {
        chernarusMapState.selection = null;
        activateLocationMapData(mapKey, null);
        updateLocationMapCopy();
        hideLocationMapToast();
        if (chernarusMapStatusEl) {
          chernarusMapStatusEl.textContent = error && error.message ? error.message : ('Unable to load ' + getLocationMapLabel(mapKey) + ' map.');
        }
      });
    };
    var screenToLocationWorld = function(view, screenX, screenY) {
      var rect = locationMapViewportRect();
      return {
        x: view.minX + (screenX / (rect.width || 1)) * (view.maxX - view.minX),
        y: view.maxY - (screenY / (rect.height || 1)) * (view.maxY - view.minY)
      };
    };
    var zoomLocationMapViewAt = function(view, screenX, screenY, factor) {
      var anchor = screenToLocationWorld(view, screenX, screenY);
      var currentWidth = view.maxX - view.minX;
      var currentHeight = view.maxY - view.minY;
      var viewportAspect = locationMapViewportAspect();
      var newWidth = currentWidth * factor;
      var xRatio = (anchor.x - view.minX) / currentWidth;
      var yRatio = (anchor.y - view.minY) / currentHeight;
      var bounds = chernarusMapState.data.bounds;
      var minimumWidth = Math.max(bounds.width * locationMapMinimumViewRatio, bounds.height * locationMapMinimumViewRatio * viewportAspect);
      var maximumWidth = Math.min(bounds.width * 1.6, bounds.height * 1.6 * viewportAspect);
      var clampedWidth = clampNumber(newWidth, minimumWidth, maximumWidth);
      var clampedHeight = clampedWidth / viewportAspect;
      return normalizeLocationMapViewAspect({
        minX: anchor.x - clampedWidth * xRatio,
        maxX: anchor.x - clampedWidth * xRatio + clampedWidth,
        minY: anchor.y - clampedHeight * yRatio,
        maxY: anchor.y - clampedHeight * yRatio + clampedHeight
      });
    };
    var updateObjectNameLookup = function(sourceData) {
      if (!Array.isArray(sourceData)) return;
      resetObjectLocationGraph();
      sourceData.forEach(function(row) {
        var id = normalizeObjectId(getObjectId(row));
        var name = getObjectName(row);
        if (id && name) {
          objectNameById[id] = name;
          objectDataById[id] = row;
          ensureObjectGraphNode(id);
        }
        if (name) {
          var key = String(name).toLowerCase();
          if (!objectDataByName[key]) {
            objectDataByName[key] = row;
          }
        }
        buildViewerMatchKeysForRow(row).forEach(function(matchKey) {
          if (!objectDataByMatchKey[matchKey]) {
            objectDataByMatchKey[matchKey] = row;
          }
        });
      });
      sourceData.forEach(function(row) {
        var id = normalizeObjectId(getObjectId(row));
        if (!id) return;
        addObjectLink(id, row['linked-p3d'] || '');
        parseLinkedIds(row['linked-config']).forEach(function(targetId) {
          addObjectLink(id, targetId);
        });
        parseLinkedIds(row['linked-variant']).forEach(function(targetId) {
          addObjectLink(id, targetId);
        });
      });
      rebuildTypesExplorerFolderPrefixIndex();
    };
    var getLinkedDisplayName = function(id) {
      var normalizedId = normalizeObjectId(id);
      if (!normalizedId) return String(id || '').trim();
      return objectNameById[normalizedId] || normalizedId;
    };
    var focusSidebarById = function(objectId) {
      var normalizedId = normalizeObjectId(objectId);
      if (!normalizedId) return false;
      var rowData = objectDataById[normalizedId] || null;
      if (!rowData) return false;
      return focusSidebarByName(getObjectName(rowData));
    };
    var focusSidebarByName = function(objName) {
      if (!objName) return false;
      var rowData = objectDataByName[String(objName).toLowerCase()] || null;
      if (!rowData) return false;
      if (currentObjectRowEl) {
        currentObjectRowEl.classList.remove('object-selected');
        currentObjectRowEl = null;
      }
      FocusPane.show({
        objName: getObjectName(rowData),
        id: getObjectId(rowData),
        imgPath: rowData.image || '',
        p3dPath: rowData.path || '',
        modelType: rowData.modelType || '',
        category: rowData.category || '',
        inGame: rowData.inGameName || '',
        consoleFlag: getConsoleFlag(rowData),
        tags: rowData.searchTags || '',
        dimensionsVisual: parseDimensionsVisual(rowData.dimensionsVisual),
        editorJsonRaw: rowData.editorJson ? JSON.stringify(rowData.editorJson) : '',
        linkedP3D: normalizeObjectId(rowData['linked-p3d']),
        linkedConfig: parseLinkedIds(rowData['linked-config']),
        linkedVariant: parseLinkedIds(rowData['linked-variant'])
      }, { updateUrl: false });
      return true;
    };
    var resolveSidebarRowByMatch = function(objName, shapePath) {
      var candidates = [];
      var pushCandidate = function(value) {
        var normalized = normalizeViewerPath(value || '');
        if (!normalized) return;
        if (candidates.indexOf(normalized) === -1) {
          candidates.push(normalized);
        }
      };
      pushCandidate(objName);
      pushCandidate(shapePath);
      if (objName) {
        var loweredName = String(objName).trim().toLowerCase();
        if (loweredName.slice(-4) === '.p3d') {
          pushCandidate(loweredName.slice(0, -4));
          pushCandidate('land_' + loweredName.slice(0, -4));
        } else if (loweredName.indexOf('land_') === 0) {
          pushCandidate(loweredName.slice(5));
          pushCandidate(loweredName.slice(5) + '.p3d');
        }
      }
      if (shapePath) {
        var normalizedPath = normalizeViewerPath(shapePath);
        var pathStem = normalizedPath.split('/').pop() || '';
        pushCandidate(pathStem);
        if (pathStem.slice(-4) === '.p3d') {
          pushCandidate(pathStem.slice(0, -4));
          pushCandidate('land_' + pathStem.slice(0, -4));
        }
      }
      for (var i = 0; i < candidates.length; i += 1) {
        var rowData = objectDataByMatchKey[candidates[i]] || null;
        if (rowData) return rowData;
      }
      return null;
    };
    var focusSidebarByMatch = function(objName, shapePath) {
      var rowData = resolveSidebarRowByMatch(objName, shapePath);
      if (!rowData) return false;
      return focusSidebarByName(getObjectName(rowData));
    };

    var buildObjectUrl = function(objectId, legacyObjectName) {
      var normalizedId = normalizeObjectId(objectId);
      var overrides = {
        path: null,
        maps: null,
        world: null,
        presets: null,
        types: null,
        types_maps: null,
        types_usage: null,
        types_value: null,
        types_map: null,
        types_kind: null,
        types_tag: null,
        q: null,
        id: null,
        object: null
      };
      if (normalizedId) {
        overrides.id = [normalizedId];
      } else if (legacyObjectName) {
        overrides.object = legacyObjectName;
      }
      return AppUrl.build(overrides);
    };
    var buildObjectMapObjectUrl = function(objectName, mapKey) {
      var normalizedName = String(objectName || '').trim();
      return AppUrl.build({
        id: null,
        object: normalizedName || null,
        version: null,
        path: null,
        presets: null,
        types: null,
        types_maps: null,
        types_usage: null,
        types_value: null,
        types_map: null,
        types_kind: null,
        types_tag: null,
        q: null,
        maps: '1',
        world: normalizeObjectMapKey(mapKey)
      }, { pathname: '/' });
    };
    var buildObjectMarkdownLink = function(objectId, objectName) {
      var normalizedId = normalizeObjectId(objectId);
      var label = String(objectName || '').trim();
      if (!normalizedId || !label) return '';
      return '[' + label + '](https://samsobjectfinder.com/?id=' + normalizedId + ')';
    };
    var buildPinnedUrl = function(entries) {
      var ids = [];
      var seenIds = {};
      if (Array.isArray(entries) && entries.length) {
        entries.forEach(function(item) {
          var normalizedId = normalizeObjectId(item && item.id);
          if (normalizedId && !seenIds[normalizedId]) {
            seenIds[normalizedId] = true;
            ids.push(normalizedId);
          }
        });
      }
      return AppUrl.build({
        id: ids,
        object: null,
        pinned: null,
        pinned_ids: null
      });
    };

    var normalizeEditorJsonEntries = function(entries) {
      var list = Array.isArray(entries) ? entries : [entries];
      return list.map(function(entry) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
          return entry;
        }
        var next = Object.assign({}, entry);
        var typeValue = String(next.Type || '').trim();
        var displayName = String(next.DisplayName || '').trim();
        var modelValue = String(next.Model || '').trim();
        var isConfigEntry = !!typeValue && !modelValue && typeValue.indexOf('\\') === -1;
        if (isConfigEntry && !displayName) {
          next.DisplayName = typeValue;
        }
        return next;
      });
    };
    var normalizePresetClipboardEntries = function(entries) {
      var list = normalizeEditorJsonEntries(entries);
      return list.map(function(entry) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
          return entry;
        }
        var next = Object.assign({}, entry);
        if (!Array.isArray(next.Position) || next.Position.length < 3) {
          next.Position = [0, 0, 0];
        }
        if (!Array.isArray(next.Orientation) || next.Orientation.length < 3) {
          next.Orientation = [0, 0, 0];
        }
        if (typeof next.Scale !== 'number' || !isFinite(next.Scale) || next.Scale <= 0) {
          next.Scale = 1;
        }
        if (!next.AttachmentMap || typeof next.AttachmentMap !== 'object' || Array.isArray(next.AttachmentMap)) {
          next.AttachmentMap = {};
        }
        next.DisplayName = '';
        next.Model = '';
        if (!isFinite(Number(next.Flags))) {
          next.Flags = 30;
        }
        if (!isFinite(Number(next.m_LowBits))) {
          next.m_LowBits = 0;
        }
        if (!isFinite(Number(next.m_HighBits))) {
          next.m_HighBits = 0;
        }
        return next;
      });
    };

    var buildEditorJson = function(editorJsonRaw, objName, modelType, p3dPath) {
      if (editorJsonRaw && editorJsonRaw.trim() !== "") {
        try {
          var parsed = JSON.parse(editorJsonRaw);
          return JSON.stringify(normalizeEditorJsonEntries(parsed), null, 4);
        } catch (err) {
          console.error("Invalid editorJson for row:", err);
        }
      }

      var typeValue = (modelType === "Config")
        ? objName
        : p3dPath.replace(/\//g, "\\") + "\\" + objName;

      var json = [{
        Type: typeValue,
        DisplayName: modelType === "Config" ? typeValue : "",
        Position: [0, 0, 0],
        Orientation: [0, 0, 0],
        Scale: 1.0,
        AttachmentMap: {},
        Model: "",
        Flags: 30,
        m_LowBits: 0,
        m_HighBits: 0
      }];

      return JSON.stringify(json, null, 4);
    };
    var buildPresetObjectPackage = function(editorJsonRaw, objName, modelType, p3dPath) {
      var editorJsonText = buildEditorJson(editorJsonRaw, objName, modelType, p3dPath);
      var entries = [];
      try {
        var parsed = JSON.parse(editorJsonText);
        if (Array.isArray(parsed)) {
          entries = parsed;
        }
      } catch (_) {}
      var toNum = function(value, fallback) {
        var n = Number(value);
        return isFinite(n) ? n : fallback;
      };
      var toVec3 = function(value, fallback) {
        if (!Array.isArray(value) || value.length < 3) return fallback.slice();
        return [
          toNum(value[0], fallback[0]),
          toNum(value[1], fallback[1]),
          toNum(value[2], fallback[2])
        ];
      };
      var objects = entries.map(function(entry) {
        var item = entry && typeof entry === 'object' ? entry : {};
        return {
          name: String(item.Type || objName || '').trim(),
          pos: toVec3(item.Position, [0, 0, 0]),
          ypr: toVec3(item.Orientation, [0, 0, 0]),
          scale: toNum(item.Scale, 1),
          enableCEPersistency: 0,
          customString: ''
        };
      }).filter(function(item) {
        return !!item.name;
      });
      return JSON.stringify({
        createLocation: '',
        Objects: objects
      }, null, 2);
    };

    var hideFocusDetails = function() {
      if (objectFocusEl) {
        objectFocusEl.classList.add('visible');
        objectFocusEl.classList.remove('focus-empty');
      }
      if (objectFocusNameEl) {
        objectFocusNameEl.textContent = '';
      }
      if (objectFocusPathEl) {
        objectFocusPathEl.textContent = '';
      }
      if (objectFocusMetaEl) {
        objectFocusMetaEl.innerHTML = '';
      }
      if (objectFocusLocationEl) {
        objectFocusLocationEl.innerHTML = '';
        objectFocusLocationEl.classList.remove('visible');
      }
      if (objectFocusLinksEl) {
        objectFocusLinksEl.innerHTML = '';
        objectFocusLinksEl.classList.remove('visible', 'is-open');
      }
      if (objectFocusPreviewImgEl) {
        objectFocusPreviewImgEl.hidden = true;
        objectFocusPreviewImgEl.src = '';
        objectFocusPreviewImgEl.alt = '';
      }
      if (objectFocusImageMissingEl) {
        objectFocusImageMissingEl.textContent = 'Select an object to preview its image.';
        objectFocusImageMissingEl.hidden = false;
      }
      if (objectFocusLinkEl) {
        objectFocusLinkEl.style.display = 'none';
        objectFocusLinkEl.href = '#';
        objectFocusLinkEl.removeAttribute('download');
      }
      currentObjectImages = [];
      currentObjectImageIndex = 0;
      if (objectFocusImagePrevEl) objectFocusImagePrevEl.classList.remove('is-visible');
      if (objectFocusImageNextEl) objectFocusImageNextEl.classList.remove('is-visible');
      if (objectFocusTypesLinkEl) {
        objectFocusTypesLinkEl.style.display = 'none';
        objectFocusTypesLinkEl.removeAttribute('download');
      }
      if (objectFocusMapGroupProtoLinkEl) {
        objectFocusMapGroupProtoLinkEl.style.display = 'none';
        objectFocusMapGroupProtoLinkEl.removeAttribute('download');
      }
      currentObjectName = null;
      currentObjectData = null;
      currentObjectLocationData = {};
      if (currentObjectRowEl) {
        currentObjectRowEl.classList.remove('object-selected');
        currentObjectRowEl = null;
      }
      updateEmptyState();
    };

    var setObjectFocusData = function(objData, updateUrl) {
      if (!objectFocusEl || !objData) return;
      objectFocusEl.classList.remove('collapsed');
      objectFocusEl.classList.add('expanded');
      objectFocusEl.classList.remove('focus-empty');
      updateLayoutForSidebar();
      var objName = objData.objName || '';
      var objectId = objData.id || '';
      var imgPath = objData.imgPath;
      var p3dPath = objData.p3dPath;
      var modelType = objData.modelType;
      var category = objData.category;
      var inGame = objData.inGame;
      var consoleFlag = objData.consoleFlag;
      var tags = objData.tags;
      var dimensionsVisual = parseDimensionsVisual(objData.dimensionsVisual);
      var editorJsonRaw = objData.editorJsonRaw;
      var presetImportJsonPath = String(objData.presetImportJsonPath || '').trim();
      var presetCopyablePath = String(objData.presetCopyablePath || '').trim();
      var isPresetObject = isPresetRow({ category: category, modelType: modelType });
      if (isPresetObject) {
        if (!presetImportJsonPath) {
          presetImportJsonPath = buildPresetStaticJsonPath(objName);
        }
        if (!presetCopyablePath) {
          presetCopyablePath = presetImportJsonPath;
        }
      }
      var imageList = resolveRowImageList(objData, imgPath);
      var linkedP3D = normalizeObjectId(objData.linkedP3D);
      var linkedConfig = parseLinkedIds(objData.linkedConfig).map(normalizeObjectId).filter(Boolean);
      var linkedVariant = parseLinkedIds(objData.linkedVariant).map(normalizeObjectId).filter(Boolean);

      currentObjectName = objName;
      currentObjectData = {
        objName: objName,
        id: objectId,
        imgPath: imgPath,
        p3dPath: p3dPath,
        modelType: modelType,
        editorJsonRaw: editorJsonRaw,
        category: category,
        inGame: inGame,
        consoleFlag: consoleFlag,
        tags: tags,
        dimensionsVisual: dimensionsVisual,
        presetImportJsonPath: presetImportJsonPath,
        presetCopyablePath: presetCopyablePath,
        images: imageList,
        linkedP3D: linkedP3D,
        linkedConfig: linkedConfig,
        linkedVariant: linkedVariant
      };
      currentObjectLocationData = {};
      objectFocusNameEl.textContent = objName;
      objectFocusPathEl.textContent = '';
      setTypesEntry(objName);
      setMapGroupProtoEntry(objName);
      updateObjectFocusMeta(currentObjectData);
      updateObjectFocusLocation(currentObjectData);
      if (objectFocusLinksEl) {
        var buildLinkedButtons = function(ids, maxVisible) {
          var limit = typeof maxVisible === 'number' ? maxVisible : 5;
          var safeIds = (Array.isArray(ids) ? ids : []).map(normalizeObjectId).filter(Boolean);
          var visible = safeIds.slice(0, limit);
          var buttonsHtml = visible.map(function(id) {
            var name = getLinkedDisplayName(id);
            return '<button class="object-focus__link-pill" type="button" title="' + escapeHtml(id) + '" data-linked-id="' + escapeHtml(id) + '" data-linked-name="' + escapeHtml(name) + '">' + escapeHtml(name) + '</button>';
          }).join('');
          var remainder = safeIds.length - visible.length;
          var moreHtml = remainder > 0 ? ('<span class="object-focus__links-more">+' + remainder + ' others</span>') : '';
          return buttonsHtml + moreHtml;
        };
        var linkRows = [];
        if (linkedP3D) {
          var linkedP3DName = getLinkedDisplayName(linkedP3D);
          linkRows.push(
            '<div class="object-focus__links-row">' +
              '<span class="object-focus__links-label">Linked P3D:</span>' +
              '<button class="object-focus__link-pill" type="button" title="' + escapeHtml(linkedP3D) + '" data-linked-id="' + escapeHtml(linkedP3D) + '" data-linked-name="' + escapeHtml(linkedP3DName) + '">' + escapeHtml(linkedP3DName) + '</button>' +
            '</div>'
          );
        }
        if (linkedConfig.length) {
          linkRows.push(
            '<div class="object-focus__links-row">' +
              '<span class="object-focus__links-label">Linked config:</span>' +
              buildLinkedButtons(linkedConfig, 5) +
            '</div>'
          );
        }
        if (linkedVariant.length) {
          linkRows.push(
            '<div class="object-focus__links-row">' +
              '<span class="object-focus__links-label">Linked variant:</span>' +
              buildLinkedButtons(linkedVariant, 5) +
            '</div>'
          );
        }
        var linksExpanded = objectFocusSectionExpanded.links !== false;
        if (linkRows.length) {
          objectFocusLinksEl.innerHTML =
            '<div class="object-focus__section-header">' +
              '<button class="object-focus__links-toggle object-focus__section-title object-focus__section-toggle" type="button" data-section-toggle="links" data-section-title="Linked objects" aria-expanded="' + (linksExpanded ? 'true' : 'false') + '">' + (linksExpanded ? '▴ ' : '▾ ') + 'Linked objects</button>' +
            '</div>' +
            '<div class="object-focus__links-body object-focus__section-body">' + linkRows.join('') + '</div>';
          objectFocusLinksEl.classList.add('visible');
          objectFocusLinksEl.classList.toggle('is-open', linksExpanded);
          var toggleBtn = objectFocusLinksEl.querySelector('.object-focus__links-toggle');
          if (toggleBtn) {
            toggleBtn.setAttribute('aria-expanded', linksExpanded ? 'true' : 'false');
            toggleBtn.textContent = (linksExpanded ? '▴ ' : '▾ ') + 'Linked objects';
          }
        } else {
          objectFocusLinksEl.innerHTML = '';
          objectFocusLinksEl.classList.remove('visible', 'is-open');
        }
      }

      currentObjectImages = imageList.slice();
      currentObjectImageIndex = 0;
      if (currentObjectImages.length) {
        setObjectFocusImageByIndex(0);
        if (objectFocusImageMissingEl) {
          objectFocusImageMissingEl.hidden = true;
        }
      } else {
        if (objectFocusPreviewImgEl) {
          objectFocusPreviewImgEl.hidden = true;
          objectFocusPreviewImgEl.src = '';
          objectFocusPreviewImgEl.alt = '';
        }
        if (objectFocusImageMissingEl) {
          objectFocusImageMissingEl.textContent = 'No image available for this object.';
          objectFocusImageMissingEl.hidden = false;
        }
        objectFocusLinkEl.style.display = 'none';
        if (objectFocusImagePrevEl) objectFocusImagePrevEl.classList.remove('is-visible');
        if (objectFocusImageNextEl) objectFocusImageNextEl.classList.remove('is-visible');
      }

      objectFocusEl.classList.add('visible');
      setObjectFocusPinButton(isPinned(objName));
      updateEmptyState();

      if (updateUrl) {
        AppUrl.push({}, { sourceUrl: buildObjectUrl(objectId, objName) });
      }
    };
    var FocusPane = requireCoreModule('createFocusPane')({
      getContainer: function() { return objectFocusEl; },
      setSelectedRow: function(rowEl) {
        if (currentObjectRowEl && currentObjectRowEl !== rowEl) {
          currentObjectRowEl.classList.remove('object-selected');
        }
        currentObjectRowEl = rowEl;
        if (currentObjectRowEl) {
          currentObjectRowEl.classList.add('object-selected');
        }
      },
      clearPane: function() {
        hideFocusDetails();
      },
      renderData: function(focusData, updateUrl) {
        setObjectFocusData(focusData, !!updateUrl);
      },
      syncCollapse: function() {
        updateCollapseButtonLabel();
        updateEmptyState();
        updateLayoutForSidebar();
      }
    });

    fetch('/data/types_aggregated.xml')
      .then(function(resp) { return resp.ok ? resp.text() : ''; })
      .then(function(text) {
        if (!text) return;
        var parser = new DOMParser();
        var xml = parser.parseFromString(text, 'application/xml');
        var nodes = xml.getElementsByTagName('type');
        for (var i = 0; i < nodes.length; i++) {
          var node = nodes[i];
          var nameAttr = node.getAttribute('name');
          if (!nameAttr) continue;
          var key = nameAttr.trim();
          if (!key) continue;
          typesEntryByName[key] = node.outerHTML;
          typesEntryByNameLower[key.toLowerCase()] = node.outerHTML;
        }
        if (table) {
          table.draw(false);
        }
      })
        .catch(function() {});

    fetch('/data/mapgroupproto-merged.xml')
      .then(function(resp) { return resp.ok ? resp.text() : ''; })
      .then(function(text) {
        if (!text) return;
        var parser = new DOMParser();
        var xml = parser.parseFromString(text, 'application/xml');
        var nodes = xml.getElementsByTagName('group');
        for (var i = 0; i < nodes.length; i++) {
          var node = nodes[i];
          var nameAttr = node.getAttribute('name');
          if (!nameAttr) continue;
          var key = nameAttr.trim();
          if (!key || mapGroupProtoEntryByName[key]) continue;
          mapGroupProtoEntryByName[key] = node.outerHTML;
          mapGroupProtoEntryByNameLower[key.toLowerCase()] = node.outerHTML;
        }
        if (table) {
          table.draw(false);
        }
      })
      .catch(function() {});
    loadMapTypes('chernarus', '/data/types/types_chernarus.xml');
    loadMapTypes('livonia', '/data/types/types_livonia.xml');
    loadMapTypes('sakhal', '/data/types/types_sakhal.xml');
    renderTypesExplorerTags();
    updateObjectMapToggleButtons();

    var buildPinnedItemFromCell = function($td) {
      var cellImages = parseImageList($td.attr('data-images'));
      var primaryImage = String($td.data('image') || '').trim();
      if (primaryImage && cellImages.indexOf(primaryImage) === -1) {
        cellImages.unshift(primaryImage);
      }
      return {
        type: 'object',
        objName: $td.data('object') || '',
        id: $td.data('objectid') || '',
        imgPath: primaryImage,
        images: cellImages,
        p3dPath: $td.data('p3d'),
        modelType: $td.data('modeltype'),
        editorJsonRaw: $td.attr('data-editorjson'),
        category: $td.data('category'),
        inGame: $td.data('ingame'),
        consoleFlag: $td.data('console'),
        tags: $td.data('tags'),
        dimensionsVisual: parseDimensionsVisual($td.attr('data-dimensions')),
        linkedP3D: normalizeObjectId($td.attr('data-linked-p3d') || ''),
        linkedConfig: parseLinkedIds($td.attr('data-linked-config')),
        linkedVariant: parseLinkedIds($td.attr('data-linked-variant'))
      };
    };
    var buildPinnedItemFromData = function(rowData) {
      if (!rowData) return null;
      var objName = getObjectName(rowData);
      if (!objName) return null;
      var rowImages = resolveRowImageList(rowData, rowData.image || '');
      return {
        type: 'object',
        objName: objName,
        id: getObjectId(rowData),
        imgPath: rowImages.length ? rowImages[0] : '',
        images: rowImages,
        p3dPath: rowData.path || '',
        modelType: rowData.modelType || '',
        editorJsonRaw: rowData.editorJson ? JSON.stringify(rowData.editorJson) : '',
        category: rowData.category || '',
        inGame: rowData.inGameName || '',
        consoleFlag: getConsoleFlag(rowData),
        tags: rowData.searchTags || '',
        dimensionsVisual: parseDimensionsVisual(rowData.dimensionsVisual),
        linkedP3D: normalizeObjectId(rowData['linked-p3d']),
        linkedConfig: parseLinkedIds(rowData['linked-config']),
        linkedVariant: parseLinkedIds(rowData['linked-variant'])
      };
    };

    var buildPinnedItemFromRow = function(rowEl) {
      var cell = rowEl ? rowEl.querySelector('.object-name-cell') : null;
      if (!cell) return null;
      return buildPinnedItemFromCell($(cell));
    };

    var addPinnedItem = function(item) {
      if (!item || !item.objName) return;
      var mergedPinned = requireCoreModule('addUniquePinnedItem')(pinnedItems, item);
      if (mergedPinned.length === pinnedItems.length) return;
      setPinnedItems(mergedPinned);
      updatePinnedUI();
    };

    var addPinnedPathItem = function(pathValue, rows) {
      if (!pathValue) return;
      var exists = pinnedItems.some(function(item) {
        return item.type === 'path' && item.p3dPath === pathValue;
      });
      if (exists) {
        setPinnedItems(pinnedItems.filter(function(item) {
          return item.type !== 'path' || item.p3dPath !== pathValue;
        }));
        updatePinnedUI();
        return;
      }
      var items = rows.map(function(rowEntry) {
        var item = null;
        if (rowEntry && rowEntry.nodeType === 1) {
          item = buildPinnedItemFromRow(rowEntry);
        } else if (rowEntry && typeof rowEntry === 'object') {
          item = buildPinnedItemFromData(rowEntry);
        }
        if (item) {
          item.sourcePath = pathValue;
        }
        return item;
      }).filter(Boolean);
      setPinnedItems(pinnedItems.concat([{
        type: 'path',
        objName: pathValue,
        p3dPath: pathValue,
        items: items,
        count: items.length,
        layout: 'line',
        spacing: 'auto',
        mode: 'P3D',
        expanded: false
      }]));
      updatePinnedUI();
    };

    var removePinnedItemByName = function(objName) {
      if (!objName) return;
      setPinnedItems(requireCoreModule('removePinnedItemByName')(pinnedItems, objName));
      updatePinnedUI();
    };

    var getPinnedEntries = function() {
      var entries = [];
      pinnedItems.forEach(function(item) {
        if (item.type === 'path') {
          if (Array.isArray(item.items)) {
            entries = entries.concat(item.items);
          }
        } else {
          entries.push(item);
        }
      });
      return entries;
    };
    var getPinnedObjectEntries = function(includePaths) {
      var entries = [];
      pinnedItems.forEach(function(item) {
        if (item.type === 'path') {
          if (includePaths && Array.isArray(item.items)) {
            entries = entries.concat(item.items);
          }
        } else {
          entries.push(item);
        }
      });
      return entries;
    };

    var savePinnedItems = function() {
      try {
        localStorage.setItem('dayzPinnedObjects', JSON.stringify(pinnedItems));
      } catch (err) {
        console.warn('Unable to save pinned objects:', err);
      }
    };

    var loadPinnedItems = function() {
      try {
        var stored = localStorage.getItem('dayzPinnedObjects');
        if (!stored) return [];
        var parsed = JSON.parse(stored);
        return Array.isArray(parsed) ? parsed : [];
      } catch (err) {
        console.warn('Unable to load pinned objects:', err);
        return [];
      }
    };

    var getSpacingValue = function(label) {
      if (label === 'auto') return 'auto';
      if (label === 'small') return 1;
      if (label === 'medium') return 10;
      if (label === 'large') return 25;
      return 'auto';
    };

    var updatePinnedUI = function() {
      if (!pinnedObjectsEl || !pinnedListEl || !objectFocusEl) return;
      pinnedListEl.innerHTML = '';

      pinnedItems.forEach(function(item) {
        if (item.type === 'path' && !item.count && Array.isArray(item.items)) {
          item.count = item.items.length;
        }
        if (item.type === 'path') {
          var spacingValue = item.spacing;
          var numericSpacing = parseFloat(spacingValue);
          var validSpacing = spacingValue === 'auto' || numericSpacing === 1 || numericSpacing === 10 || numericSpacing === 25;
          if (!validSpacing) {
            item.spacing = 'auto';
          }
        }
        var wrapper = document.createElement('div');
        wrapper.className = 'pinned-item';
        wrapper.setAttribute('data-object', item.objName || '');

        var thumb = document.createElement('div');
        thumb.className = 'pinned-thumb';
        if (item.imgPath && item.type !== 'path') {
          var img = document.createElement('img');
          img.src = '/' + item.imgPath;
          img.alt = (item.objName || 'Object') + ' preview';
          thumb.appendChild(img);
        } else {
          thumb.textContent = item.type === 'path' ? 'Path' : 'No image';
        }

        var name = document.createElement('div');
        name.className = 'pinned-name';
        if (item.type === 'path') {
          var pathLabel = (item.p3dPath || item.objName || 'Path') + ' (' + (item.count || 0) + ' objects)';
          var arrow = document.createElement('span');
          arrow.className = 'pinned-path-arrow';
          arrow.textContent = item.expanded ? '▾' : '▸';
          name.appendChild(arrow);
          name.appendChild(document.createTextNode(pathLabel));
        } else {
          name.textContent = item.objName || 'Unknown';
        }

        var actions = document.createElement('div');
        actions.className = 'pinned-actions';

        var removeBtn = document.createElement('button');
        removeBtn.className = 'pinned-remove';
        removeBtn.type = 'button';
        removeBtn.textContent = '🆇';
        removeBtn.addEventListener('click', function(e) {
          e.stopPropagation();
          setPinnedItems(pinnedItems.filter(function(pinned) {
            if (item.type === 'path') {
              return pinned.type !== 'path' || pinned.p3dPath !== item.p3dPath;
            }
            return pinned.objName !== item.objName;
          }));
          updatePinnedUI();
        });

        if (item.type === 'path') {
          var linkBadge = document.createElement('button');
          linkBadge.className = 'pinned-remove-link';
          linkBadge.type = 'button';
          linkBadge.title = 'Copy link to this path';
          linkBadge.innerHTML = iconHtml('link');
          linkBadge.addEventListener('click', function(e) {
            e.stopPropagation();
            if (!Array.isArray(item.items) || !item.items.length) return;
            var entries = item.items.map(function(entry) {
              return {
                id: entry.id || '',
                objName: entry.objName || ''
              };
            }).filter(function(entry) { return entry.objName; });
            if (!entries.length) return;
            navigator.clipboard.writeText(buildPinnedUrl(entries));
            var original = linkBadge.innerHTML;
            linkBadge.textContent = '✔';
            setTimeout(function() { linkBadge.innerHTML = original; }, 900);
          });
          actions.appendChild(linkBadge);
        }

        if (item.type !== 'path') {
          var editorBtn = document.createElement('button');
          editorBtn.className = 'pinned-action-btn';
          editorBtn.type = 'button';
          editorBtn.title = 'Copy to Editor';
          editorBtn.innerHTML = iconHtml('editor');
          editorBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            var jsonText = buildEditorJson(
              item.editorJsonRaw,
              item.objName,
              item.modelType,
              item.p3dPath
            );
            navigator.clipboard.writeText(jsonText);
            var original = editorBtn.innerHTML;
            editorBtn.textContent = '✔';
            setTimeout(function() { editorBtn.innerHTML = original; }, 900);
          });

          var nameBtn = document.createElement('button');
          nameBtn.className = 'pinned-action-btn';
          nameBtn.type = 'button';
          nameBtn.title = 'Copy name';
          nameBtn.innerHTML = iconHtml('copy-name');
          nameBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            if (!item.objName) return;
            navigator.clipboard.writeText(item.objName);
            var original = nameBtn.innerHTML;
            nameBtn.textContent = '✔';
            setTimeout(function() { nameBtn.innerHTML = original; }, 900);
          });

          actions.appendChild(editorBtn);
          actions.appendChild(nameBtn);
        }

        wrapper.addEventListener('click', function(e) {
          if (e.target.closest('.pinned-remove')) return;
          if (objectFocusEl && objectFocusEl.classList.contains('collapsed')) {
            FocusPane.setCollapsed(false);
          }
          if (item.type === 'path') {
            item.expanded = !item.expanded;
            updatePinnedUI();
            return;
          }
          if (objectFocusEl && objectFocusEl.classList.contains('visible') && currentObjectName === item.objName) {
            FocusPane.clear();
            return;
          }
          FocusPane.show({
            objName: item.objName,
            id: item.id,
            imgPath: item.imgPath,
            images: Array.isArray(item.images) ? item.images.slice() : [],
            p3dPath: item.p3dPath,
            modelType: item.modelType,
            editorJsonRaw: item.editorJsonRaw,
            category: item.category,
            inGame: item.inGame,
            consoleFlag: item.consoleFlag,
            tags: item.tags,
            linkedP3D: item.linkedP3D,
            linkedConfig: item.linkedConfig,
            linkedVariant: item.linkedVariant
          }, { updateUrl: false });
        });

        wrapper.appendChild(thumb);
        actions.appendChild(removeBtn);
        wrapper.appendChild(name);
        wrapper.appendChild(actions);

        if (item.type === 'path') {
          wrapper.classList.toggle('expanded', !!item.expanded);

          var panel = document.createElement('div');
          panel.className = 'pinned-path-panel';

          var rowActions = document.createElement('div');
          rowActions.className = 'pinned-path-row pinned-path-row--actions';
          var copyBtn = document.createElement('button');
          copyBtn.className = 'pinned-path-btn pinned-path-cta';
          copyBtn.innerHTML = iconLabelHtml('editor', 'Copy as...');
          copyBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            copyPinnedPath(item);
            var originalText = copyBtn.innerHTML;
            copyBtn.textContent = '✔';
            setTimeout(function() { copyBtn.innerHTML = originalText; }, 900);
          });
          var downloadBtn = document.createElement('button');
          downloadBtn.className = 'pinned-path-btn pinned-path-cta pinned-path-btn--push-right';
          downloadBtn.textContent = '↓ All data';
          downloadBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            downloadPinnedPath(item);
            var originalText = downloadBtn.textContent;
            downloadBtn.textContent = '✔';
            setTimeout(function() { downloadBtn.textContent = originalText; }, 900);
          });
          var downloadTypesBtn = document.createElement('button');
          downloadTypesBtn.className = 'pinned-path-btn pinned-path-cta';
          downloadTypesBtn.textContent = '↓ Types';
          downloadTypesBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            var downloaded = downloadTypesEntries(item.items, sanitizePathFolder(item.p3dPath || item.objName || 'path') + '_types.txt');
            if (!downloaded) return;
            var originalText = downloadTypesBtn.textContent;
            downloadTypesBtn.textContent = '✔';
            setTimeout(function() { downloadTypesBtn.textContent = originalText; }, 900);
          });
          rowActions.appendChild(copyBtn);
          rowActions.appendChild(downloadBtn);
          rowActions.appendChild(downloadTypesBtn);

          var rowLayout = document.createElement('div');
          rowLayout.className = 'pinned-path-row';
          var layoutLabel = document.createElement('span');
          layoutLabel.className = 'pinned-path-label';
          layoutLabel.textContent = 'Layout:';
          rowLayout.appendChild(layoutLabel);
          ['grid', 'line', 'stacked', 'random'].forEach(function(mode) {
            var btn = document.createElement('button');
            btn.className = 'pinned-path-btn' + (item.layout === mode ? ' active' : '');
            btn.textContent = mode === 'grid'
              ? 'As grid'
              : mode === 'line'
                ? 'In line'
                : mode === 'stacked'
                  ? 'Stacked'
                  : 'Random';
            btn.addEventListener('click', function(e) {
              e.stopPropagation();
              item.layout = mode;
              item.expanded = true;
              updatePinnedUI();
            });
            rowLayout.appendChild(btn);
          });

          var rowSpacing = document.createElement('div');
          rowSpacing.className = 'pinned-path-row';
          var spacingLabel = document.createElement('span');
          spacingLabel.className = 'pinned-path-label';
          spacingLabel.textContent = 'Spacing:';
          rowSpacing.appendChild(spacingLabel);
          [
            { label: 'auto', text: 'Auto' },
            { label: 'small', text: 'Small (1m)' },
            { label: 'medium', text: 'Medium (10m)' },
            { label: 'large', text: 'Large (25m)' }
          ].forEach(function(opt) {
            var btn = document.createElement('button');
            btn.className = 'pinned-path-btn' + (item.spacing === getSpacingValue(opt.label) ? ' active' : '');
            btn.textContent = opt.text;
            btn.addEventListener('click', function(e) {
              e.stopPropagation();
              item.spacing = getSpacingValue(opt.label);
              item.expanded = true;
              updatePinnedUI();
            });
            rowSpacing.appendChild(btn);
          });

          var rowMode = document.createElement('div');
          rowMode.className = 'pinned-path-row';
          var modeLabel = document.createElement('span');
          modeLabel.className = 'pinned-path-label';
          modeLabel.textContent = 'Type:';
          rowMode.appendChild(modeLabel);
          ['Config', 'P3D', 'Both'].forEach(function(mode) {
            var btn = document.createElement('button');
            btn.className = 'pinned-path-btn' + (item.mode === mode ? ' active' : '');
            btn.textContent = mode;
            btn.addEventListener('click', function(e) {
              e.stopPropagation();
              item.mode = mode;
              item.expanded = true;
              updatePinnedUI();
            });
            rowMode.appendChild(btn);
          });

          panel.appendChild(rowActions);
          panel.appendChild(rowLayout);
          panel.appendChild(rowSpacing);
          panel.appendChild(rowMode);
          wrapper.appendChild(panel);
        }
        pinnedListEl.appendChild(wrapper);
      });

      if (pinnedItems.length > 0) {
        pinnedObjectsEl.classList.remove('is-empty');
        objectFocusEl.classList.add('has-pins');
      } else {
        pinnedObjectsEl.classList.add('is-empty');
        objectFocusEl.classList.remove('has-pins');
      }

      var hasPins = pinnedItems.length > 0;
      if (!hasPins) {
        pinnedBulkExpanded = false;
      }
      if (pinnedCopyAllEl) {
        pinnedCopyAllEl.classList.toggle('visible', hasPins);
      }

      if (pinnedCopyNamesEl) {
        pinnedCopyNamesEl.classList.toggle('visible', hasPins);
      }

      if (pinnedCopyLinkEl) {
        pinnedCopyLinkEl.classList.toggle('visible', hasPins);
      }

      if (pinnedCopyAllLayoutEl) {
        pinnedCopyAllLayoutEl.classList.toggle('visible', hasPins);
      }

      if (pinnedCopyAllLayoutRowEl) {
        pinnedCopyAllLayoutRowEl.classList.toggle('visible', hasPins);
      }

      if (pinnedBulkPanelEl) {
        pinnedBulkPanelEl.classList.toggle('visible', hasPins && pinnedBulkExpanded);
      }

      if (pinnedDownloadAllEl) {
        pinnedDownloadAllEl.classList.toggle('visible', hasPins);
      }
      if (pinnedDownloadTypesAllEl) {
        pinnedDownloadTypesAllEl.classList.toggle('visible', hasPins);
      }

      if (pinnedClearAllEl) {
        pinnedClearAllEl.classList.toggle('visible', hasPins);
      }

      savePinnedItems();
      updateEmptyState();
    };

    var pinnedBulkLayout = 'line';
    var pinnedBulkSpacing = 'auto';
    var pinnedBulkExpanded = false;

    setPinnedItems(loadPinnedItems());
    updatePinnedUI();

    var updatePinnedBulkButtons = function() {
      if (pinnedBulkLayoutButtons && pinnedBulkLayoutButtons.length) {
        pinnedBulkLayoutButtons.forEach(function(btn) {
          btn.classList.toggle('active', btn.getAttribute('data-layout') === pinnedBulkLayout);
        });
      }
      if (pinnedBulkSpacingButtons && pinnedBulkSpacingButtons.length) {
        pinnedBulkSpacingButtons.forEach(function(btn) {
          btn.classList.toggle('active', getSpacingValue(btn.getAttribute('data-spacing')) === pinnedBulkSpacing);
        });
      }
      if (pinnedCopyAllLayoutEl) {
        pinnedCopyAllLayoutEl.classList.toggle('active', pinnedBulkExpanded);
      }
    };

    if (pinnedBulkLayoutButtons && pinnedBulkLayoutButtons.length) {
      pinnedBulkLayoutButtons.forEach(function(btn) {
        btn.addEventListener('click', function() {
          pinnedBulkLayout = btn.getAttribute('data-layout') || 'line';
          updatePinnedBulkButtons();
        });
      });
    }

    if (pinnedBulkSpacingButtons && pinnedBulkSpacingButtons.length) {
      pinnedBulkSpacingButtons.forEach(function(btn) {
        btn.addEventListener('click', function() {
          pinnedBulkSpacing = getSpacingValue(btn.getAttribute('data-spacing'));
          updatePinnedBulkButtons();
        });
      });
    }

    updatePinnedBulkButtons();

    var buildEditorJsonArray = function(item) {
      var jsonText = buildEditorJson(
        item.editorJsonRaw,
        item.objName,
        item.modelType,
        item.p3dPath
      );
      try {
        var parsed = JSON.parse(jsonText);
        return Array.isArray(parsed) ? parsed : [parsed];
      } catch (err) {
        console.error('Invalid editor JSON for pinned item:', err);
        return [];
      }
    };

    var buildFocusDataFromCell = function($td) {
      if (!$td || !$td.length) return null;
      return {
        objName: $td.data('object') || '',
        id: $td.data('objectid') || '',
        imgPath: $td.data('image'),
        images: parseImageList($td.attr('data-images')),
        p3dPath: $td.data('p3d'),
        modelType: $td.data('modeltype'),
        category: $td.data('category'),
        inGame: $td.data('ingame'),
        consoleFlag: $td.data('console'),
        tags: $td.data('tags'),
        dimensionsVisual: parseDimensionsVisual($td.attr('data-dimensions')),
        editorJsonRaw: $td.attr('data-editorjson'),
        linkedP3D: normalizeObjectId($td.attr('data-linked-p3d') || ''),
        linkedConfig: parseLinkedIds($td.attr('data-linked-config')),
        linkedVariant: parseLinkedIds($td.attr('data-linked-variant'))
      };
    };
    var showObjectFocus = function($td, updateUrl) {
      if (!objectFocusEl || !$td || !$td.length) return;
      FocusPane.show(buildFocusDataFromCell($td), {
        updateUrl: !!updateUrl,
        rowEl: $td.closest('tr').get(0)
      });
    };

    var showMissingObject = function(objName) {
      if (!objectFocusEl) return;
      currentObjectName = objName;
      objectFocusNameEl.textContent = objName;
      objectFocusPathEl.textContent = 'No exact match found.';
      if (objectFocusMetaEl) {
        objectFocusMetaEl.innerHTML = '';
      }
      if (objectFocusLocationEl) {
        objectFocusLocationEl.innerHTML =
          '<span class="object-focus__location-text">0 on Chernarus</span>';
        objectFocusLocationEl.classList.add('visible');
      }
      currentObjectLocationData = {};
      if (objectFocusPreviewImgEl) {
        objectFocusPreviewImgEl.hidden = true;
        objectFocusPreviewImgEl.src = '';
        objectFocusPreviewImgEl.alt = '';
      }
      if (objectFocusImageMissingEl) {
        objectFocusImageMissingEl.textContent = 'No image available for this object.';
        objectFocusImageMissingEl.hidden = false;
      }
      objectFocusLinkEl.style.display = 'none';
      objectFocusEl.classList.add('visible');
      updateEmptyState();
    };

    var focusByName = function(objName) {
      if (!objName) return;
      var normalized = objName.trim();
      if (!normalized) return;
      table.one('draw', function() {
        var $cell = $tableEl.find('tbody .object-name-cell').filter(function() {
          var value = $(this).data('object');
          return value && String(value).toLowerCase() === normalized.toLowerCase();
        }).first();

        if ($cell.length) {
          showObjectFocus($cell, true);
          var rowEl = $cell.closest('tr').get(0);
          if (rowEl && rowEl.scrollIntoView) {
            rowEl.classList.add('flash');
            rowEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setTimeout(function() { rowEl.classList.remove('flash'); }, 1200);
          }
        } else {
          showMissingObject(normalized);
        }
      });
      table.column(2).search('^' + escapeRegex(normalized), true, false).draw();
    };

    var focusById = function(objectId) {
      var normalizedId = normalizeObjectId(objectId);
      if (!normalizedId) return;
      table.one('draw', function() {
        var $cell = $tableEl.find('tbody .object-name-cell').filter(function() {
          var value = $(this).data('objectid');
          return value && String(value).trim() === normalizedId;
        }).first();
        if ($cell.length) {
          showObjectFocus($cell, false);
          var rowEl = $cell.closest('tr').get(0);
          if (rowEl && rowEl.scrollIntoView) {
            rowEl.classList.add('flash');
            rowEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setTimeout(function() { rowEl.classList.remove('flash'); }, 1200);
          }
        } else {
          if (!focusSidebarById(normalizedId)) {
            showMissingObject(normalizedId);
          }
        }
      });
      table.column(7).search('^' + escapeRegex(normalizedId) + '$', true, false).draw();
    };
    var openObjectInObjectMapView = function(objectId, objectName, preferredMapKey) {
      if (!table) return;
      var normalizedId = normalizeObjectId(objectId);
      var normalizedName = String(objectName || '').trim();
      if (!normalizedName && normalizedId) {
        normalizedName = String(resolveObjectNameById(normalizedId) || '').trim();
      }
      var preferredMap = String(preferredMapKey || '').trim().toLowerCase();
      objectMapExactSearchQuery = normalizedName;
      objectMapSearchMode = normalizedName ? 'exact_object' : '';
      setActiveCollectionFilter(AppMode.OBJECT_MAP);
      setObjectMapActiveMap(preferredMap || objectMapActiveMapKey);
      setActiveFolderFilter('', false);
      updateTypesExplorerPanelVisibility();
      updateObjectMapPanelVisibility();
      updatePresetsGuideNotice();
      renderFolderTree();
      table.columns().search('');
      if (normalizedName) {
        table.search(normalizedName).draw();
        return;
      }
      if (normalizedId) {
        var matchedName = '';
        var data = table.rows().data().toArray();
        for (var i = 0; i < data.length; i += 1) {
          if (normalizeObjectId(getObjectId(data[i])) === normalizedId) {
            matchedName = String(getObjectName(data[i]) || '').trim();
            break;
          }
        }
        objectMapExactSearchQuery = matchedName || normalizedId;
        objectMapSearchMode = objectMapExactSearchQuery ? 'exact_object' : '';
        table.search(matchedName || normalizedId).draw();
        return;
      }
      objectMapExactSearchQuery = '';
      objectMapSearchMode = '';
      table.search('').draw();
    };

    if (objectFocusClearEl) {
      objectFocusClearEl.addEventListener('click', function() {
        if (typeof runResetView === 'function') {
          runResetView();
        }
      });
    }

    if (objectFocusCopyEl) {
      objectFocusCopyEl.addEventListener('click', function() {
        var link = buildObjectUrl(
          currentObjectData ? currentObjectData.id : '',
          currentObjectName || objectFocusNameEl.textContent || ''
        );
        navigator.clipboard.writeText(link);
        var original = objectFocusCopyEl.innerHTML;
        objectFocusCopyEl.textContent = 'Copied';
        setTimeout(function() { objectFocusCopyEl.innerHTML = original; }, 1200);
      });
    }

    if (objectFocusEditorEl) {
      objectFocusEditorEl.addEventListener('click', async function() {
        if (!currentObjectData) return;
        var jsonText = '';
        if (isPresetRow(currentObjectData)) {
          jsonText = await fetchPresetCopyPayload(currentObjectData);
          if (!jsonText) return;
        } else {
          jsonText = buildEditorJson(
            currentObjectData.editorJsonRaw,
            currentObjectData.objName,
            currentObjectData.modelType,
            currentObjectData.p3dPath
          );
        }
        navigator.clipboard.writeText(jsonText);
        var original = objectFocusEditorEl.innerHTML;
        objectFocusEditorEl.textContent = 'Copied';
        setTimeout(function() { objectFocusEditorEl.innerHTML = original; }, 1200);
      });
    }

    if (objectFocusNameCopyEl) {
      objectFocusNameCopyEl.addEventListener('click', function() {
        var nameText = currentObjectName || objectFocusNameEl.textContent || '';
        if (!nameText) return;
        navigator.clipboard.writeText(nameText);
        var original = objectFocusNameCopyEl.innerHTML;
        objectFocusNameCopyEl.textContent = 'Copied';
        setTimeout(function() { objectFocusNameCopyEl.innerHTML = original; }, 1200);
      });
    }

    if (objectFocusMarkdownCopyEl) {
      objectFocusMarkdownCopyEl.addEventListener('click', function() {
        var markdownLink = buildObjectMarkdownLink(
          currentObjectData ? currentObjectData.id : '',
          currentObjectName || objectFocusNameEl.textContent || ''
        );
        if (!markdownLink) return;
        navigator.clipboard.writeText(markdownLink);
        var original = objectFocusMarkdownCopyEl.innerHTML;
        objectFocusMarkdownCopyEl.textContent = '✔';
        setTimeout(function() { objectFocusMarkdownCopyEl.innerHTML = original; }, 1200);
      });
    }

    if (objectFocusPinEl) {
      objectFocusPinEl.addEventListener('click', function() {
        if (!currentObjectData || !currentObjectData.objName) return;
        var exists = isPinned(currentObjectData.objName);
        if (exists) {
          removePinnedItemByName(currentObjectData.objName);
          setObjectFocusPinButton(false);
          return;
        }
        addPinnedItem({
          id: currentObjectData.id,
          objName: currentObjectData.objName,
          imgPath: currentObjectData.imgPath,
          p3dPath: currentObjectData.p3dPath,
          modelType: currentObjectData.modelType,
          editorJsonRaw: currentObjectData.editorJsonRaw,
          category: currentObjectData.category,
          inGame: currentObjectData.inGame,
          consoleFlag: currentObjectData.consoleFlag,
          tags: currentObjectData.tags,
          dimensionsVisual: parseDimensionsVisual(currentObjectData.dimensionsVisual),
          linkedP3D: currentObjectData.linkedP3D,
          linkedConfig: currentObjectData.linkedConfig,
          linkedVariant: currentObjectData.linkedVariant
        });
        setObjectFocusPinButton(true);
      });
    }

    if (pinnedCopyNamesEl) {
      pinnedCopyNamesEl.addEventListener('click', function() {
        var entries = getPinnedEntries();
        if (!entries.length) return;
        var names = entries.map(function(item) { return item.objName; }).filter(Boolean);
        if (!names.length) return;
        navigator.clipboard.writeText(names.join('\n'));
        var restorePinnedNamesHtml = pinnedCopyNamesEl.innerHTML;
        pinnedCopyNamesEl.textContent = '✔';
        setTimeout(function() { pinnedCopyNamesEl.innerHTML = restorePinnedNamesHtml; }, 900);
      });
    }

    if (pinnedCopyLinkEl) {
      pinnedCopyLinkEl.addEventListener('click', function() {
        var entries = getPinnedEntries();
        if (!entries.length) return;
        var link = buildPinnedUrl(entries);
        navigator.clipboard.writeText(link);
        var original = pinnedCopyLinkEl.innerHTML;
        pinnedCopyLinkEl.textContent = 'Copied';
        setTimeout(function() { pinnedCopyLinkEl.innerHTML = original; }, 1200);
      });
    }

    if (objectFocusCollapseEl) {
      objectFocusCollapseEl.addEventListener('click', function() {
        if (!objectFocusEl) return;
        FocusPane.setCollapsed(!objectFocusEl.classList.contains('collapsed'));
      });
    }

    if (pinnedCopyAllEl) {
      pinnedCopyAllEl.addEventListener('click', function() {
        var entries = getPinnedEntries();
        if (!entries.length) return;
        var combined = [];
        var cursor = 0;
        var spacingBase = 10;
        entries.forEach(function(item) {
          var objects = buildEditorJsonArray(item);
          objects.forEach(function(obj) {
            var scale = 1;
            if (obj && obj.Scale !== undefined && obj.Scale !== null) {
              var parsedScale = parseFloat(obj.Scale);
              if (!isNaN(parsedScale) && isFinite(parsedScale)) {
                scale = parsedScale;
              }
            }
            if (!obj.Position || obj.Position.length < 3) {
              obj.Position = [0, 0, 0];
            }
            obj.Position[0] = cursor;
            cursor += spacingBase * scale;
            combined.push(obj);
          });
        });
        if (!combined.length) return;
        navigator.clipboard.writeText(JSON.stringify(combined, null, 4));
        var restorePinnedAllHtml = pinnedCopyAllEl.innerHTML;
        pinnedCopyAllEl.textContent = '✔';
        setTimeout(function() { pinnedCopyAllEl.innerHTML = restorePinnedAllHtml; }, 900);
      });
    }

    if (pinnedCopyAllLayoutEl) {
      pinnedCopyAllLayoutEl.addEventListener('click', function() {
        pinnedBulkExpanded = !pinnedBulkExpanded;
        updatePinnedUI();
        updatePinnedBulkButtons();
      });
    }

    if (pinnedBulkCopyConfirmEl) {
      pinnedBulkCopyConfirmEl.addEventListener('click', function() {
        var includePaths = pinnedIncludePathsEl ? pinnedIncludePathsEl.checked : false;
        var entries = getPinnedObjectEntries(includePaths);
        if (!entries.length) return;
        var spacing = resolveSpacingValue(entries, pinnedBulkLayout, pinnedBulkSpacing);
        var layoutContext = buildLayoutContext(entries.length, pinnedBulkLayout);
        var combined = [];
        entries.forEach(function(item, index) {
          var objects = buildEditorJsonArray(item);
          applyLayoutOffsets(objects, index, entries.length, pinnedBulkLayout, spacing, layoutContext);
          combined = combined.concat(objects);
        });
        if (!combined.length) return;
        navigator.clipboard.writeText(JSON.stringify(combined, null, 4));
        var originalText = pinnedBulkCopyConfirmEl.textContent;
        pinnedBulkCopyConfirmEl.textContent = '✔';
        setTimeout(function() { pinnedBulkCopyConfirmEl.textContent = originalText; }, 1200);
      });
    }

    if (pinnedClearAllEl) {
      pinnedClearAllEl.addEventListener('click', function() {
        if (!pinnedItems.length) return;
        setPinnedItems([]);
        updatePinnedUI();
        if (currentObjectName) {
          setObjectFocusPinButton(false);
        }
      });
    }

    var csvEscape = function(value) {
      if (value === null || value === undefined) return '';
      var str = String(value);
      if (str.indexOf('"') !== -1 || str.indexOf(',') !== -1 || str.indexOf('\n') !== -1 || str.indexOf('\r') !== -1) {
        return '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    };
    var sanitizePathFolder = function(value) {
      if (!value) return 'unknown';
      return String(value)
        .replace(/[\\\/]+/g, '_')
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .slice(0, 80);
    };
    var buildEditorJsonArrayWithMode = function(item, mode) {
      if (!item) return [];
      var originalModelType = item.modelType;
      if (mode === 'Config') {
        item.modelType = 'Config';
        var configItems = buildEditorJsonArray(item);
        item.modelType = originalModelType;
        return configItems;
      }
      if (mode === 'P3D') {
        item.modelType = 'P3D';
        var p3dItems = buildEditorJsonArray(item);
        item.modelType = originalModelType;
        return p3dItems;
      }
      if (mode === 'Both') {
        item.modelType = 'Config';
        var configItems = buildEditorJsonArray(item);
        item.modelType = 'P3D';
        var p3dItems = buildEditorJsonArray(item);
        item.modelType = originalModelType;
        return configItems.concat(p3dItems);
      }
      return buildEditorJsonArray(item);
    };
    var buildLayoutContext = function(count, layout) {
      if (layout !== 'random') return null;
      var total = Math.max(0, Number(count) || 0);
      var randomPositions = [];
      if (!total) return { randomPositions: randomPositions };
      var minDistance = 1;
      var radiusStep = 1;
      // Use rejection sampling in an expanding square so items are genuinely random
      // while still respecting spacing as a minimum distance.
      for (var i = 0; i < total; i += 1) {
        var placed = false;
        var radius = Math.max(1, Math.ceil(Math.sqrt(total)) * radiusStep);
        for (var pass = 0; pass < 8 && !placed; pass += 1) {
          var attempts = Math.max(30, total * 8);
          for (var attempt = 0; attempt < attempts; attempt += 1) {
            var px = (Math.random() * 2 - 1) * radius;
            var pz = (Math.random() * 2 - 1) * radius;
            var ok = true;
            for (var k = 0; k < randomPositions.length; k += 1) {
              var dx = px - randomPositions[k].x;
              var dz = pz - randomPositions[k].z;
              if (Math.hypot(dx, dz) < minDistance) {
                ok = false;
                break;
              }
            }
            if (!ok) continue;
            randomPositions.push({ x: px, z: pz });
            placed = true;
            break;
          }
          radius += Math.max(1, Math.ceil(Math.sqrt(total)) * radiusStep);
        }
        if (!placed) {
          // Guaranteed fallback if rejection sampling gets crowded.
          randomPositions.push({ x: i * minDistance, z: 0 });
        }
      }
      return { randomPositions: randomPositions };
    };
    var applyLayoutOffsets = function(objects, index, count, layout, spacing, context) {
      if (!objects || !objects.length) return;
      var offsetX = 0;
      var offsetZ = 0;
      var offsetY = 0;
      if (layout === 'line') {
        offsetX = index * spacing;
      } else if (layout === 'grid') {
        var cols = Math.max(1, Math.ceil(Math.sqrt(count)));
        var col = index % cols;
        var row = Math.floor(index / cols);
        offsetX = col * spacing;
        offsetZ = row * spacing;
      } else if (layout === 'stacked') {
        offsetY = index * spacing;
      } else if (layout === 'random') {
        var randomPositions = context && Array.isArray(context.randomPositions) ? context.randomPositions : null;
        var position = randomPositions && randomPositions.length > index ? randomPositions[index] : { x: index, z: 0 };
        offsetX = position.x * spacing;
        offsetZ = position.z * spacing;
      }
      objects.forEach(function(obj) {
        if (!obj.Position || obj.Position.length < 3) {
          obj.Position = [0, 0, 0];
        }
        obj.Position[0] += offsetX;
        obj.Position[1] += offsetY;
        obj.Position[2] += offsetZ;
      });
    };
    var getDimensionAxisValue = function(item, axis) {
      var dims = parseDimensionsVisual(item && item.dimensionsVisual);
      if (!dims.length) return 1;
      var idx = axis === 'y' ? 1 : axis === 'z' ? 2 : 0;
      var value = parseFloat(dims[idx]);
      if (!isFinite(value) || value <= 0) return 1;
      return value;
    };
    var resolveAutoSpacingValue = function(entries, layout) {
      if (!Array.isArray(entries) || !entries.length) return 5;
      var maxSpan = 1;
      entries.forEach(function(item) {
        var x = getDimensionAxisValue(item, 'x');
        var y = getDimensionAxisValue(item, 'y');
        var z = getDimensionAxisValue(item, 'z');
        var span = layout === 'stacked' ? y : Math.max(x, z);
        if (span > maxSpan) {
          maxSpan = span;
        }
      });
      return Math.max(1, Math.ceil(maxSpan + 1));
    };
    var resolveSpacingValue = function(entries, layout, spacingOption) {
      if (spacingOption === 'auto') {
        return resolveAutoSpacingValue(entries, layout);
      }
      var spacing = parseFloat(spacingOption);
      if (!isFinite(spacing) || spacing <= 0) {
        return resolveAutoSpacingValue(entries, layout);
      }
      return spacing;
    };
    var getUniqueTypeNames = function(items) {
      if (!Array.isArray(items) || !items.length) return [];
      var seen = {};
      var names = [];
      items.forEach(function(item) {
        if (!item || !item.objName) return;
        var key = String(item.objName).trim();
        if (!key || seen[key]) return;
        seen[key] = true;
        names.push(key);
      });
      return names;
    };
    var buildTypesEntriesText = function(items) {
      var names = getUniqueTypeNames(items);
      if (!names.length) return '';
      var entries = [];
      names.forEach(function(name) {
        var normalized = String(name || '').trim();
        var entry = typesEntryByName[normalized] || typesEntryByNameLower[normalized.toLowerCase()];
        if (entry) {
          entries.push(entry);
        }
      });
      return entries.join('\n\n');
    };
    var downloadTypesEntries = function(items, filename) {
      if (typeof saveAs === 'undefined') return false;
      var text = buildTypesEntriesText(items);
      if (!text) return false;
      var blob = new Blob([text + '\n'], { type: 'text/plain;charset=utf-8' });
      saveAs(blob, filename || 'pinned_types.txt');
      return true;
    };

    if (pinnedDownloadAllEl) {
      pinnedDownloadAllEl.addEventListener('click', function() {
        var entries = getPinnedEntries();
        if (!entries.length) return;
        if (typeof JSZip === 'undefined' || typeof saveAs === 'undefined') return;

        var zip = new JSZip();
        var csvRows = [];
        csvRows.push([
          'id',
          'className',
          'inGameName',
          'category',
          'path',
          'console',
          'type',
          'tags',
          'image',
          'imageFound'
        ].join(','));

        var imagePromises = entries.map(function(item) {
          var imageFound = item.imgPath ? 'Yes' : 'No';
          csvRows.push([
            csvEscape(item.id || ''),
            csvEscape(item.objName),
            csvEscape(item.inGame),
            csvEscape(item.category),
            csvEscape(item.p3dPath),
            csvEscape(item.consoleFlag === '✅' ? 'Yes' : item.consoleFlag === '❌' ? 'No' : item.consoleFlag),
            csvEscape(item.modelType),
            csvEscape(item.tags),
            csvEscape(item.imgPath),
            csvEscape(imageFound)
          ].join(','));

          if (!item.imgPath) return Promise.resolve();
          return fetch('/' + item.imgPath)
            .then(function(response) {
              if (!response.ok) throw new Error('Image fetch failed');
              return response.blob();
            })
            .then(function(blob) {
              var name = item.objName ? (item.objName + '.png') : item.imgPath.split('/').pop();
              if (item.sourcePath) {
                zip.file('images/' + sanitizePathFolder(item.sourcePath) + '/' + name, blob);
              } else {
                zip.file('images/' + name, blob);
              }
            })
            .catch(function() {});
        });

        zip.file('objects.csv', csvRows.join('\n'));

        Promise.all(imagePromises).then(function() {
          return zip.generateAsync({ type: 'blob' });
        }).then(function(content) {
          saveAs(content, 'dayz_objects.zip');
        }).catch(function() {});
      });
    }
    if (pinnedDownloadTypesAllEl) {
      pinnedDownloadTypesAllEl.addEventListener('click', function() {
        var entries = getPinnedEntries();
        if (!entries.length) return;
        var downloaded = downloadTypesEntries(entries, 'pinned_types.txt');
        if (!downloaded) return;
        var originalText = pinnedDownloadTypesAllEl.textContent;
        pinnedDownloadTypesAllEl.textContent = '✔';
        setTimeout(function() { pinnedDownloadTypesAllEl.textContent = originalText; }, 900);
      });
    }

    var copyPinnedPath = function(pathItem) {
      if (!pathItem || !Array.isArray(pathItem.items) || !pathItem.items.length) return;
      var entries = pathItem.items;
      var combined = [];
      var layout = pathItem.layout || 'line';
      var mode = pathItem.mode || 'P3D';
      var spacing = resolveSpacingValue(entries, layout, pathItem.spacing);
      var layoutContext = buildLayoutContext(entries.length, layout);
      entries.forEach(function(item, index) {
        var objects = buildEditorJsonArrayWithMode(item, mode);
        applyLayoutOffsets(objects, index, entries.length, layout, spacing, layoutContext);
        combined = combined.concat(objects);
      });
      if (!combined.length) return;
      navigator.clipboard.writeText(JSON.stringify(combined, null, 4));
    };

    var downloadPinnedPath = function(pathItem) {
      if (!pathItem || !Array.isArray(pathItem.items) || !pathItem.items.length) return;
      if (typeof JSZip === 'undefined' || typeof saveAs === 'undefined') return;
      var entries = pathItem.items;
      var zip = new JSZip();
      var csvRows = [];
      csvRows.push([
        'id',
        'className',
        'inGameName',
        'category',
        'path',
        'console',
        'type',
        'tags',
        'image',
        'imageFound'
      ].join(','));

      var imagePromises = entries.map(function(item) {
        var imageFound = item.imgPath ? 'Yes' : 'No';
        csvRows.push([
          csvEscape(item.id || ''),
          csvEscape(item.objName),
          csvEscape(item.inGame),
          csvEscape(item.category),
          csvEscape(item.p3dPath),
          csvEscape(item.consoleFlag === '✅' ? 'Yes' : item.consoleFlag === '❌' ? 'No' : item.consoleFlag),
          csvEscape(item.modelType),
          csvEscape(item.tags),
          csvEscape(item.imgPath),
          csvEscape(imageFound)
        ].join(','));

        if (!item.imgPath) return Promise.resolve();
        return fetch('/' + item.imgPath)
          .then(function(response) {
            if (!response.ok) throw new Error('Image fetch failed');
            return response.blob();
          })
          .then(function(blob) {
            var name = item.objName ? (item.objName + '.png') : item.imgPath.split('/').pop();
            var folder = sanitizePathFolder(pathItem.p3dPath || pathItem.objName);
            zip.file('images/' + folder + '/' + name, blob);
          })
          .catch(function() {});
      });

      zip.file('objects.csv', csvRows.join('\n'));

      Promise.all(imagePromises).then(function() {
        return zip.generateAsync({ type: 'blob' });
      }).then(function(content) {
        var folder = sanitizePathFolder(pathItem.p3dPath || 'path');
        saveAs(content, folder + '_objects.zip');
      }).catch(function() {});
    };

    var parsePinnedParam = function(value) {
      if (!value) return [];
      return value.split('|').map(function(item) {
        try {
          return decodeURIComponent(item.replace(/\+/g, ' '));
        } catch (err) {
          return item.replace(/\+/g, ' ');
        }
      }).map(function(name) { return name.trim(); }).filter(Boolean);
    };

    var findObjectCellByName = function(objName) {
      if (!objName) return null;
      var normalized = objName.trim();
      if (!normalized) return null;
      var matchCell = $(table.rows().nodes()).find('.object-name-cell').filter(function() {
        var value = $(this).data('object');
        return value && String(value).toLowerCase() === normalized.toLowerCase();
      }).first();
      return matchCell.length ? matchCell : null;
    };
    var handleObjectMapFocusMessage = function(payload) {
      var focusObjectName = String((payload && payload.objectName) || '').trim();
      var focusShapePath = String((payload && payload.shapePath) || '').trim();
      if (!focusObjectName && !focusShapePath) return;
      var matchedRow = typeof resolveSidebarRowByMatch === 'function'
        ? resolveSidebarRowByMatch(focusObjectName, focusShapePath)
        : null;
      if (
        matchedRow &&
        payload && payload.toggle &&
        objectFocusEl &&
        objectFocusEl.classList.contains('visible') &&
        currentObjectName &&
        String(getObjectName(matchedRow) || '').trim().toLowerCase() === String(currentObjectName || '').trim().toLowerCase()
      ) {
        FocusPane.clear();
        return;
      }
      if (matchedRow && typeof focusSidebarByName === 'function' && focusSidebarByName(getObjectName(matchedRow))) {
        return;
      }
      if (typeof focusByName === 'function') {
        focusByName(focusObjectName);
      }
    };
    var handleObjectMapActionMessage = function(payload) {
      var actionObjectName = String((payload && payload.objectName) || '').trim();
      var actionShapePath = String((payload && payload.shapePath) || '').trim();
      var actionName = String((payload && payload.action) || '').trim();
      var actionRow = typeof resolveSidebarRowByMatch === 'function'
        ? resolveSidebarRowByMatch(actionObjectName, actionShapePath)
        : null;
      if (!actionRow || !actionName) return;
      if (actionName === 'link') {
        navigator.clipboard.writeText(buildObjectMapObjectUrl(getObjectName(actionRow), objectMapActiveMapKey));
        return;
      }
      if (actionName === 'name') {
        navigator.clipboard.writeText(String(getObjectName(actionRow) || '').trim());
        return;
      }
      if (actionName === 'editor') {
        navigator.clipboard.writeText(buildEditorJson(
          actionRow.editorJson ? JSON.stringify(actionRow.editorJson) : '',
          getObjectName(actionRow),
          actionRow.modelType || '',
          actionRow.path || ''
        ));
        return;
      }
      if (actionName === 'pin') {
        togglePinnedForRow(actionRow);
      }
    };
    var handleObjectMapFilterMessage = function(payload) {
      var filterObjectName = String((payload && payload.objectName) || '').trim();
      applyObjectMapExactSearch(filterObjectName);
    };
    requireCoreModule('createMapBridge')({
      origin: window.location.origin,
      onFocusObject: handleObjectMapFocusMessage,
      onObjectAction: handleObjectMapActionMessage,
      onFilterObject: handleObjectMapFilterMessage
    }).attach();
    var applyIdListFilter = function(ids) {
      if (!table) return;
      var normalized = (Array.isArray(ids) ? ids : []).map(function(value) {
        return normalizeObjectId(value);
      }).filter(Boolean);
      if (!normalized.length) {
      table.column(7).search('').draw();
        return;
      }
      var seen = {};
      var unique = normalized.filter(function(id) {
        if (seen[id]) return false;
        seen[id] = true;
        return true;
      });
      var regex = '^(' + unique.map(function(id) { return escapeRegex(id); }).join('|') + ')$';
      table.column(7).search(regex, true, false).draw();
    };

    var getDataArray = function(sourceData) {
      if (Array.isArray(sourceData)) return sourceData;
      if (sourceData && typeof sourceData.toArray === 'function') return sourceData.toArray();
      return table ? table.rows().data().toArray() : [];
    };
    var normalizeVersionParam = function(value) {
      if (value === null || value === undefined) return '';
      var normalized = String(value).trim().toLowerCase();
      if (!normalized) return '';
      if (/^v1\.\d+$/.test(normalized)) return normalized;
      if (/^1\.\d+$/.test(normalized)) return 'v' + normalized;
      if (/^1\d{2}$/.test(normalized)) {
        return 'v1.' + normalized.slice(1);
      }
      return '';
    };
    var rowHasVersionTag = function(row, versionKey) {
      if (!versionKey) return false;
      var rawTags = String((row && row.searchTags) || '');
      if (!rawTags) return false;
      var parts = rawTags.split(',');
      for (var i = 0; i < parts.length; i++) {
        var token = normalizeVersionParam(parts[i]);
        if (token && token === versionKey) return true;
      }
      return false;
    };

    var initialUrl = AppUrl.read();
    var typesExplorerMapsParam = parseTypesExplorerList(initialUrl.get('types_maps'));
    var typesExplorerUsageParam = parseTypesExplorerList(initialUrl.get('types_usage'));
    var typesExplorerValueParam = parseTypesExplorerList(initialUrl.get('types_value'));
    var isTypesExplorerPath = initialUrl.has('types')
      || typesExplorerMapsParam.length > 0
      || typesExplorerUsageParam.length > 0
      || typesExplorerValueParam.length > 0
      || normalizePathname(initialUrl.pathname) === '/types-explorer';
    var normalizeTypesMapParam = function(value) {
      var key = String(value || '').trim().toLowerCase();
      return (key === 'chernarus' || key === 'livonia' || key === 'sakhal') ? key : '';
    };
    var normalizeTypesKindParam = function(value) {
      var key = String(value || '').trim().toLowerCase();
      return (key === 'usage' || key === 'value') ? key : '';
    };
    var normalizeObjectMapParam = function(value) {
      var key = String(value || '').trim().toLowerCase();
      return (key === 'chernarus' || key === 'livonia' || key === 'sakhal') ? key : '';
    };
    var objectIdParams = initialUrl.getAll('id').map(function(value) {
      return normalizeObjectId(value);
    }).filter(Boolean);
    var folderPathParam = normalizeFilterText(initialUrl.get('path') || '');
    var mapsAppParam = ['1', 'true', 'yes'].indexOf(String(initialUrl.get('maps') || '').trim().toLowerCase()) !== -1;
    var presetsAppParam = ['1', 'true', 'yes'].indexOf(String(initialUrl.get('presets') || '').trim().toLowerCase()) !== -1;
    var objectParam = initialUrl.get('object');
    var searchQueryParam = String(initialUrl.get('q') || '').trim();
    var versionParam = normalizeVersionParam(initialUrl.get('version'));
    var objectMapWorldParam = normalizeObjectMapParam(initialUrl.get('world'));
    var typesMapParam = normalizeTypesMapParam(initialUrl.get('types_map'));
    var typesKindParam = normalizeTypesKindParam(initialUrl.get('types_kind'));
    var typesTagParam = String(initialUrl.get('types_tag') || '').trim();
    var updateToggleEl = document.getElementById('updateToggle');
    var versionFilterNoticeEl = document.getElementById('versionFilterNotice');
    var versionFilterNoticeTextEl = document.getElementById('versionFilterNoticeText');
    var versionFilterResetLinkEl = document.getElementById('versionFilterResetLink');
    var versionFilterCopyLinkEl = document.getElementById('versionFilterCopyLink');
    var linkedFilterNoticeEl = document.getElementById('linkedFilterNotice');
    var linkedFilterNoticeTextEl = document.getElementById('linkedFilterNoticeText');
    var linkedFilterResetLinkEl = document.getElementById('linkedFilterResetLink');
    var linkedFilterCopyLinkEl = document.getElementById('linkedFilterCopyLink');
    var pathFilterNoticeEl = document.getElementById('pathFilterNotice');
    var pathFilterNoticeTextEl = document.getElementById('pathFilterNoticeText');
    var pathFilterResetLinkEl = document.getElementById('pathFilterResetLink');
    var pathFilterCopyLinkEl = document.getElementById('pathFilterCopyLink');
    var searchFilterNoticeEl = document.getElementById('searchFilterNotice');
    var searchFilterNoticeTextEl = document.getElementById('searchFilterNoticeText');
    var presetsGuideCloseEl = document.getElementById('presetsGuideClose');
    var objectFinderGuideNoticeEl = document.getElementById('objectFinderGuideNotice');
    var objectFinderGuideCloseEl = document.getElementById('objectFinderGuideClose');
    var typesExplorerGuideNoticeEl = document.getElementById('typesExplorerGuideNotice');
    var typesExplorerGuideCloseEl = document.getElementById('typesExplorerGuideClose');
    var objectMapGuideNoticeEl = document.getElementById('objectMapGuideNotice');
    var objectMapGuideCloseEl = document.getElementById('objectMapGuideClose');
    var searchFilterResetLinkEl = document.getElementById('searchFilterResetLink');
    var searchFilterCopyLinkEl = document.getElementById('searchFilterCopyLink');
    var chipInfoTooltipEl = document.getElementById('chipInfoTooltip');
    var presetsGuideNoticeEl = document.getElementById('presetsGuideNotice');
    var appGuideCookiePrefix = 'samsobjectfinder_guide_';
    var scheduleGuideLayoutSync = function() {
      if (typeof scheduleSidebarTopOffsetSync !== 'function') return;
      scheduleSidebarTopOffsetSync();
      setTimeout(function() {
        scheduleSidebarTopOffsetSync();
      }, 40);
      setTimeout(function() {
        scheduleSidebarTopOffsetSync();
      }, 220);
    };
    var setNoticeVisibility = function(noticeEl, textEl, visible, textValue) {
      if (!noticeEl) return;
      if (textEl && typeof textValue === 'string') {
        textEl.textContent = textValue;
      }
      noticeEl.classList.toggle('visible', !!visible);
    };
    var isUpdateToggleActive = function() {
      return versionParam === 'v1.29';
    };
    var updateVersionToggleState = function() {
      if (!updateToggleEl) return;
      var isActive = isUpdateToggleActive();
      updateToggleEl.classList.toggle('is-active', isActive);
      updateToggleEl.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    };
    var updateNotices = function() {
      var urlState = AppUrl.read();
      var urlVersion = normalizeVersionParam(urlState.get('version'));
      versionParam = urlVersion;
      var urlPath = normalizeFilterText(urlState.get('path') || '');
      var urlSearch = String(urlState.get('q') || '').trim();
      var urlIds = urlState.getAll('id').map(function(value) {
        return normalizeObjectId(value);
      }).filter(Boolean);
      var hasLegacyObject = !!String(urlState.get('object') || '').trim();

      setNoticeVisibility(
        versionFilterNoticeEl,
        versionFilterNoticeTextEl,
        !!urlVersion,
        urlVersion ? ('Filtering ' + urlVersion + ' objects.') : null
      );

      if (activeTypesTagFilter && activeTypesTagFilter.name && activeTypesTagFilter.kind && activeTypesTagFilter.map) {
        var kindLabel = activeTypesTagFilter.kind === 'value' ? 'Value' : 'Usage';
        setNoticeVisibility(
          linkedFilterNoticeEl,
          linkedFilterNoticeTextEl,
          true,
          "Filtering Types.xml " + kindLabel + " tag '" + activeTypesTagFilter.name + "' loot -"
        );
      } else {
        var hasLinked = urlIds.length > 0 || hasLegacyObject;
        setNoticeVisibility(
          linkedFilterNoticeEl,
          linkedFilterNoticeTextEl,
          hasLinked,
          hasLinked ? (urlIds.length > 1 ? 'Filtering linked objects.' : 'Filtering linked object.') : null
        );
      }

      setNoticeVisibility(
        pathFilterNoticeEl,
        pathFilterNoticeTextEl,
        !!urlPath,
        urlPath ? 'Filtering linked paths -' : null
      );

      setNoticeVisibility(
        searchFilterNoticeEl,
        searchFilterNoticeTextEl,
        !!urlSearch,
        urlSearch ? ("Linked to search term '" + urlSearch + "'.") : null
      );
      updateVersionToggleState();
    };

    var readCookie = function(name) {
      var escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      var match = document.cookie.match(new RegExp('(?:^|; )' + escaped + '=([^;]*)'));
      return match ? decodeURIComponent(match[1]) : '';
    };
    var writeCookie = function(name, value, days) {
      var maxAge = Math.max(1, Number(days) || 365) * 24 * 60 * 60;
      document.cookie = name + '=' + encodeURIComponent(String(value)) + '; path=/; max-age=' + maxAge + '; SameSite=Lax';
    };
    var isGuideDismissed = function(appKey) {
      return readCookie(appGuideCookiePrefix + appKey) === '1';
    };
    var setGuideDismissed = function(appKey, dismissed) {
      writeCookie(appGuideCookiePrefix + appKey, dismissed ? '1' : '0', 365);
    };
    var showGuideNotice = function(appKey) {
      setGuideDismissed(appKey, false);
      updateAppGuideNotices();
    };
    var toggleGuideNotice = function(appKey) {
      if (!appKey) return;
      setGuideDismissed(appKey, !isGuideDismissed(appKey));
      updateAppGuideNotices();
    };
    var updateAppGuideNotices = function() {
      if (presetsGuideNoticeEl) {
        presetsGuideNoticeEl.classList.toggle('visible', activeCollectionFilter === AppMode.PRESETS && !isGuideDismissed('presets'));
      }
      if (objectFinderGuideNoticeEl) {
        objectFinderGuideNoticeEl.classList.toggle('visible', activeCollectionFilter === AppMode.DATABASE && !isGuideDismissed('database'));
      }
      if (typesExplorerGuideNoticeEl) {
        typesExplorerGuideNoticeEl.classList.toggle('visible', activeCollectionFilter === AppMode.TYPES_EXPLORER && !isGuideDismissed('types_explorer'));
      }
      if (objectMapGuideNoticeEl) {
        objectMapGuideNoticeEl.classList.toggle('visible', activeCollectionFilter === AppMode.OBJECT_MAP && !isGuideDismissed('object_map'));
      }
      scheduleGuideLayoutSync();
    };
    var appliedUrlState = false;

    if (typesMapParam && typesKindParam && typesTagParam) {
      setActiveTypesTagFilter({
        map: typesMapParam,
        kind: typesKindParam,
        name: typesTagParam
      });
    }
    updateNotices();

    var applyUrlState = function(sourceData) {
      if (appliedUrlState) return;
      appliedUrlState = true;

      if (!objectIdParams.length && !objectParam && versionParam) {
        var dataForVersion = getDataArray(sourceData);
        var versionMatches = dataForVersion.filter(function(row) {
          return rowHasVersionTag(row, versionParam);
        });
        if (versionMatches.length) {
          var versionIds = versionMatches.map(function(row) {
            return normalizeObjectId(getObjectId(row));
          }).filter(Boolean);
          applyIdListFilter(versionIds);
          setPinnedItems([]);
          var versionSeen = {};
          versionMatches.forEach(function(versionRow) {
            var normalizedVersionId = normalizeObjectId(getObjectId(versionRow));
            if (normalizedVersionId && versionSeen[normalizedVersionId]) return;
            if (normalizedVersionId) {
              versionSeen[normalizedVersionId] = true;
            }
            var versionItem = buildPinnedItemFromData(versionRow);
            if (versionItem && versionItem.objName && !isPinned(versionItem.objName)) {
              setPinnedItems(pinnedItems.concat([versionItem]));
            }
          });

          if (pinnedItems.length) {
            updatePinnedUI();
          }
        }
      }

      if (objectIdParams.length > 1) {
        treatIdListAsSearchFolders = true;
        highlightedFolderPath = '';
        setActiveFolderFilterValue('');
        applyIdListFilter(objectIdParams);
        setPinnedItems([]);
        var data = Array.isArray(sourceData) ? sourceData : table.rows().data();
        var seenById = {};
        objectIdParams.forEach(function(id) {
          if (seenById[id]) return;
          seenById[id] = true;
          var match = null;
          for (var i = 0; i < data.length; i++) {
            var row = data[i];
            if (normalizeObjectId(getObjectId(row)) === id) {
              match = row;
              break;
            }
          }
          var item = buildPinnedItemFromData(match);
          if (item && item.objName && !isPinned(item.objName)) {
            setPinnedItems(pinnedItems.concat([item]));
          }
          if (match && match.path) {
            expandFolderTreeForPath(match.path);
          }
        });

        if (pinnedItems.length) {
          updatePinnedUI();
        }
      }

      if (objectIdParams.length === 1) {
        treatIdListAsSearchFolders = false;
        var singleData = getDataArray(sourceData);
        var singleMatch = null;
        for (var si = 0; si < singleData.length; si += 1) {
          var singleRow = singleData[si];
          if (normalizeObjectId(getObjectId(singleRow)) === objectIdParams[0]) {
            singleMatch = singleRow;
            highlightedFolderPath = getDeepestPathPrefix(singleRow.path || '');
            expandFolderTreeForPath(singleRow.path || '');
            break;
          }
        }
        if (singleMatch && isPresetRow(singleMatch)) {
          setActiveCollectionFilter(AppMode.PRESETS);
          setActiveFolderFilter('', false);
          updateTypesExplorerPanelVisibility();
          updateObjectMapPanelVisibility();
        }
        renderFolderTree();
        focusById(objectIdParams[0]);
        if (mapsAppParam && singleMatch && !isPresetRow(singleMatch)) {
          openObjectInObjectMapView(
            objectIdParams[0],
            getObjectName(singleMatch) || '',
            objectMapWorldParam || 'chernarus'
          );
        }
      } else if (objectIdParams.length > 1) {
      } else if (folderPathParam) {
        treatIdListAsSearchFolders = false;
        setActiveCollectionFilter(AppMode.DATABASE);
        highlightedFolderPath = folderPathParam;
        expandFolderTreeForPath(folderPathParam);
        setActiveFolderFilter(folderPathParam, true);
      } else if (objectParam) {
        treatIdListAsSearchFolders = false;
        highlightedFolderPath = '';
        if (mapsAppParam) {
          openObjectInObjectMapView('', objectParam, objectMapWorldParam || 'chernarus');
        } else {
          var legacyAsId = normalizeObjectId(objectParam);
          if (legacyAsId) {
            focusById(legacyAsId);
          } else {
            focusByName(objectParam);
          }
        }
      } else {
        treatIdListAsSearchFolders = false;
        highlightedFolderPath = '';
        if (mapsAppParam) {
          setActiveCollectionFilter(AppMode.OBJECT_MAP);
          setObjectMapActiveMap(objectMapWorldParam || 'chernarus');
          setActiveFolderFilter('', false);
          updateObjectMapPanelVisibility();
        } else if (presetsAppParam) {
          setActiveCollectionFilter(AppMode.PRESETS);
          setActiveFolderFilter('', false);
          updateTypesExplorerPanelVisibility();
          updateObjectMapPanelVisibility();
        } else if (isTypesExplorerPath) {
          setActiveCollectionFilter(AppMode.TYPES_EXPLORER);
          if (typesExplorerMapsParam.length) {
            Object.keys(typesExplorerMaps).forEach(function(key) {
              typesExplorerMaps[key] = typesExplorerMapsParam.indexOf(key) !== -1;
            });
            if (!Object.keys(typesExplorerMaps).some(function(key) { return !!typesExplorerMaps[key]; })) {
              typesExplorerMaps.chernarus = true;
              typesExplorerMaps.livonia = true;
              typesExplorerMaps.sakhal = true;
            }
          }
          if (typesExplorerUsageParam.length || typesExplorerValueParam.length) {
            typesExplorerState.usage = typesExplorerUsageParam.slice();
            typesExplorerState.value = typesExplorerValueParam.slice();
          }
          rebuildTypesExplorerData();
          activeTypesExplorerMatchByName = buildTypesExplorerMatchIndex();
          renderTypesExplorerTags();
          setActiveFolderFilter('', false);
          updateTypesExplorerPanelVisibility();
          syncTypesExplorerPath();
        }
      }
      if (searchQueryParam && table) {
        if (folderSidebarSearchEl) {
          folderSidebarSearchEl.value = searchQueryParam;
        }
        table.search(searchQueryParam).draw();
      }
      updateSearchShareLinkVisibility();
    };

    var bootstrapDataAndUrlState = function(sourceData) {
      if (!Array.isArray(sourceData) || !sourceData.length) return;
      warmPresetPayloads(sourceData);
      updateObjectNameLookup(sourceData);
      populateFolderFilter(sourceData);
      applyUrlState(sourceData);
    };
    table.on('xhr.dt', function(e, settings, json) {
      bootstrapDataAndUrlState(json);
    });
    table.on('init.dt', function() {
      if (appliedUrlState) return;
      var ajaxJson = table && table.ajax && typeof table.ajax.json === 'function'
        ? table.ajax.json()
        : null;
      if (Array.isArray(ajaxJson) && ajaxJson.length) {
        bootstrapDataAndUrlState(ajaxJson);
        return;
      }
      var currentRows = getDataArray();
      if (Array.isArray(currentRows) && currentRows.length) {
        bootstrapDataAndUrlState(currentRows);
      }
    });
    table.on('draw.dt', function() {
      updateTableColumnLabels();
      var keepBroadSearchFolders = isFolderTreeInBroadFilterMode() && !!activeFolderFilter && filteredFolderPrefixes.length > 0;
      if (!keepBroadSearchFolders) {
        updateFilteredFolderPrefixes();
      }
      renderFolderTree();
      objectMapState.placementsCache = null;
      renderObjectMapFromTable();
      if (folderSidebarSearchEl) {
        var desiredSearchValue = objectMapExactSearchQuery || table.search();
        if (folderSidebarSearchEl.value !== desiredSearchValue) {
          folderSidebarSearchEl.value = desiredSearchValue;
        }
      }
      dispatchObjectMapV2SearchState();
      updateSearchShareLinkVisibility();
      scheduleSidebarTopOffsetSync();
    });
    updateTableColumnLabels();
    var mapConsoleFilterValue = function(value) {
      var key = String(value || '').toLowerCase();
      if (key === 'yes') return 'console yes';
      if (key === 'no') return 'console no';
      return '';
    };
    $('#filterConsole').on('change', function() {
      table.column(5).search(mapConsoleFilterValue(this.value)).draw();
    });
    if (folderTreeEl) {
      folderTreeEl.addEventListener('click', function(e) {
        var guideBtn = e.target.closest('[data-guide-app]');
        if (guideBtn) {
          e.preventDefault();
          e.stopPropagation();
          toggleGuideNotice(String(guideBtn.getAttribute('data-guide-app') || ''));
          return;
        }
        var pinLinkBtn = e.target.closest('[data-folder-pin-link]');
        if (pinLinkBtn) {
          e.preventDefault();
          e.stopPropagation();
          var pinPath = normalizeFilterText(pinLinkBtn.getAttribute('data-folder-pin-link') || '');
          if (!pinPath || pinPath === 'dz') return;
          var sourceRows = getDataArray();
          var rows = sourceRows.filter(function(rowData) {
            var rowPath = normalizeFilterText((rowData && rowData.path) || '');
            if (!rowPath) return;
            return rowPath === pinPath || rowPath.indexOf(pinPath + '/') === 0;
          });
          if (!rows.length) return;
          addPinnedPathItem(pinPath, rows);
          var originalPin = pinLinkBtn.textContent;
          pinLinkBtn.textContent = '✔';
          setTimeout(function() { pinLinkBtn.textContent = originalPin; }, 900);
          return;
        }
        var copyLinkBtn = e.target.closest('[data-folder-copy-link]');
        if (copyLinkBtn) {
          e.preventDefault();
          e.stopPropagation();
          var copyPath = normalizeFilterText(copyLinkBtn.getAttribute('data-folder-copy-link') || '');
          if (!copyPath) return;
          navigator.clipboard.writeText(buildFolderPathUrl(copyPath));
          var original = copyLinkBtn.textContent;
          copyLinkBtn.textContent = '✔';
          setTimeout(function() { copyLinkBtn.textContent = original; }, 900);
          return;
        }
        var toggleBtn = e.target.closest('[data-folder-toggle]');
        if (toggleBtn) {
          e.preventDefault();
          var pathKey = normalizeFilterText(toggleBtn.getAttribute('data-folder-toggle') || '');
          if (!pathKey) return;
          folderTreeExpanded[pathKey] = !folderTreeExpanded[pathKey];
          renderFolderTree();
          return;
        }
        var folderBtn = e.target.closest('[data-folder-path]');
        if (!folderBtn) return;
        e.preventDefault();
        var nextPath = normalizeFilterText(folderBtn.getAttribute('data-folder-path') || '');
        if (nextPath === '__presets__') {
          if (activeCollectionFilter === AppMode.TYPES_EXPLORER) {
            clearTypesExplorerSelections();
          }
          setActiveCollectionFilter(activeCollectionFilter === AppMode.PRESETS ? AppMode.DATABASE : AppMode.PRESETS);
          setActiveFolderFilter('', true);
          updateTypesExplorerPanelVisibility();
          syncTypesExplorerPath();
          return;
        }
        if (nextPath === '__database__') {
          if (activeCollectionFilter === AppMode.TYPES_EXPLORER) {
            clearTypesExplorerSelections();
          }
          setActiveCollectionFilter(AppMode.DATABASE);
          setActiveFolderFilter('', true);
          syncTypesExplorerPath();
          updateObjectMapPanelVisibility();
          return;
        }
        if (nextPath === '__types_explorer__') {
          if (activeCollectionFilter === AppMode.TYPES_EXPLORER) {
            clearTypesExplorerSelections();
          }
          setActiveCollectionFilter(activeCollectionFilter === AppMode.TYPES_EXPLORER ? AppMode.DATABASE : AppMode.TYPES_EXPLORER);
          setActiveFolderFilter('', true);
          updateTypesExplorerPanelVisibility();
          syncTypesExplorerPath();
          return;
        }
        if (nextPath === '__object_map__') {
          if (activeCollectionFilter === AppMode.TYPES_EXPLORER) {
            clearTypesExplorerSelections();
          }
          setActiveCollectionFilter(activeCollectionFilter === AppMode.OBJECT_MAP ? AppMode.DATABASE : AppMode.OBJECT_MAP);
          setActiveFolderFilter('', true);
          syncTypesExplorerPath();
          updateObjectMapPanelVisibility();
          return;
        }
        if (activeCollectionFilter === AppMode.TYPES_EXPLORER) {
          clearTypesExplorerSelections();
          setActiveCollectionFilter(AppMode.DATABASE);
        }
        if (activeCollectionFilter !== AppMode.OBJECT_MAP && activeCollectionFilter !== AppMode.TYPES_EXPLORER) {
          setActiveCollectionFilter(AppMode.DATABASE);
        }
        syncTypesExplorerPath();
        setActiveFolderFilter(nextPath, true);
      });
    }
    if (folderSidebarBulkEl) {
      folderSidebarBulkEl.addEventListener('click', function(e) {
        var bulkBtn = e.target.closest('[data-tree-bulk]');
        if (!bulkBtn) return;
        e.preventDefault();
        var action = String(bulkBtn.getAttribute('data-tree-bulk') || '');
        if (action === 'expand') {
          getVisibleFolderBranchKeys().forEach(function(key) {
            folderTreeExpanded[key] = true;
          });
        } else if (action === 'collapse') {
          getVisibleFolderBranchKeys().forEach(function(key) {
            folderTreeExpanded[key] = false;
          });
        }
        renderFolderTree();
      });
    }
    if (folderSidebarEl) {
      folderSidebarEl.addEventListener('scroll', function() {
        syncFolderBulkStickyMode();
      }, { passive: true });
    }
    if (presetsGuideCloseEl) {
      presetsGuideCloseEl.addEventListener('click', function() {
        setGuideDismissed('presets', true);
        updateAppGuideNotices();
      });
    }
    if (objectFinderGuideCloseEl) {
      objectFinderGuideCloseEl.addEventListener('click', function() {
        setGuideDismissed('database', true);
        updateAppGuideNotices();
      });
    }
    if (typesExplorerGuideCloseEl) {
      typesExplorerGuideCloseEl.addEventListener('click', function() {
        setGuideDismissed('types_explorer', true);
        updateAppGuideNotices();
      });
    }
    if (objectMapGuideCloseEl) {
      objectMapGuideCloseEl.addEventListener('click', function() {
        setGuideDismissed('object_map', true);
        updateAppGuideNotices();
      });
    }
    var runResetView = function() {
      var currentAppCollection = activeCollectionFilter;
      var keepAppCollection = currentAppCollection === AppMode.PRESETS || currentAppCollection === AppMode.TYPES_EXPLORER || currentAppCollection === AppMode.OBJECT_MAP;
      setActiveCollectionFilter(keepAppCollection ? currentAppCollection : AppMode.DATABASE);
      setActiveFolderFilterValue('');
      highlightedFolderPath = '';
      folderTreeExpanded = { dz: true };
      treatIdListAsSearchFolders = false;
      setActiveTypesTagFilter(null);
      activeTypesTagMatchByName = null;
      typesExplorerState.usage = [];
      typesExplorerState.value = [];
      activeTypesExplorerMatchByName = null;
      rebuildTypesExplorerData();
      renderTypesExplorerTags();
      if (folderSidebarSearchEl) {
        folderSidebarSearchEl.value = '';
      }
      if (filterConsoleEl) {
        filterConsoleEl.value = 'all';
      }
      if (table) {
        objectMapExactSearchQuery = '';
        objectMapSearchMode = '';
        table.search('');
        table.columns().search('');
        table.draw();
      }
      AppUrl.push({}, { clearAllParams: true });
      syncTypesExplorerPath();
      updateNotices();
      updateObjectMapPanelVisibility();
      if (activeCollectionFilter === AppMode.OBJECT_MAP) {
        objectMapState.areaMode = false;
        clearObjectMapAreaSelection();
        updateObjectMapAreaControls();
      }
      updateSearchShareLinkVisibility();
      scheduleSidebarTopOffsetSync();
    };
    var applyVersionFilterByTag = function(versionKey) {
      var normalizedVersion = normalizeVersionParam(versionKey);
      if (!normalizedVersion || !table) return;
      runResetView();
      var allRows = getDataArray(table.rows().data());
      var versionMatches = allRows.filter(function(row) {
        return rowHasVersionTag(row, normalizedVersion);
      });
      var versionIds = versionMatches.map(function(row) {
        return normalizeObjectId(getObjectId(row));
      }).filter(Boolean);
      applyIdListFilter(versionIds);
      versionParam = normalizedVersion;
      AppUrl.push({}, { sourceUrl: buildVersionFilterUrl(normalizedVersion) });
      updateNotices();
      updateSearchShareLinkVisibility();
    };
    if (updateToggleEl) {
      updateToggleEl.addEventListener('click', function(e) {
        e.preventDefault();
        if (isUpdateToggleActive()) {
          runResetView();
          return;
        }
        applyVersionFilterByTag('v1.29');
      });
      updateVersionToggleState();
    }
    if (folderSidebarClearEl) {
      folderSidebarClearEl.addEventListener('click', function() {
        runResetView();
      });
    }
    if (folderSidebarSearchEl) {
      var applyFolderSidebarSearch = function(options) {
        var opts = options || {};
        var runSearch = function() {
          folderSidebarSearchDebounceTimer = null;
          if (!table) return;
          objectMapExactSearchQuery = '';
          objectMapSearchMode = '';
          var query = String(folderSidebarSearchEl.value || '');
          var queryTrimmed = query.trim();
          if (!queryTrimmed && typeof runResetView === 'function') {
            runResetView();
            return;
          }
          if (!queryTrimmed && (activeFolderFilter || activeCollectionFilter)) {
            var keepAppCollection = activeCollectionFilter === AppMode.PRESETS || activeCollectionFilter === AppMode.TYPES_EXPLORER || activeCollectionFilter === AppMode.OBJECT_MAP;
            if (!keepAppCollection) {
              setActiveCollectionFilter(AppMode.DATABASE);
            }
            syncTypesExplorerPath();
            setActiveFolderFilter('', false);
          }
          table.search(query).draw();
        };
        var shouldDebounceForMap = activeCollectionFilter === AppMode.OBJECT_MAP && !opts.forceImmediate;
        if (shouldDebounceForMap) {
          if (folderSidebarSearchDebounceTimer) {
            clearTimeout(folderSidebarSearchDebounceTimer);
          }
          folderSidebarSearchDebounceTimer = setTimeout(runSearch, 220);
          return;
        }
        if (folderSidebarSearchDebounceTimer) {
          clearTimeout(folderSidebarSearchDebounceTimer);
          folderSidebarSearchDebounceTimer = null;
        }
        runSearch();
      };
      folderSidebarSearchEl.addEventListener('input', applyFolderSidebarSearch);
      folderSidebarSearchEl.addEventListener('input', updateSearchShareLinkVisibility);
      folderSidebarSearchEl.addEventListener('search', function() {
        applyFolderSidebarSearch({ forceImmediate: true });
      });
    }
    if (folderSidebarSearchLinkEl) {
      folderSidebarSearchLinkEl.addEventListener('click', function(e) {
        e.preventDefault();
        var query = folderSidebarSearchEl ? String(folderSidebarSearchEl.value || '').trim() : '';
        if (!query) return;
        navigator.clipboard.writeText(buildSearchShareUrl(query));
        var originalSearchLinkHtml = folderSidebarSearchLinkEl.innerHTML;
        folderSidebarSearchLinkEl.textContent = '✔';
        setTimeout(function() { folderSidebarSearchLinkEl.innerHTML = originalSearchLinkHtml; }, 1000);
      });
    }
    if (folderSidebarSearchClearEl && folderSidebarSearchEl) {
      folderSidebarSearchClearEl.addEventListener('click', function(e) {
        e.preventDefault();
        folderSidebarSearchEl.value = '';
        if (typeof runResetView === 'function') {
          runResetView();
        } else if (table) {
          table.search('');
          table.columns().search('');
          table.draw();
        }
        updateSearchShareLinkVisibility();
        folderSidebarSearchEl.focus();
      });
    }
    if (typesExplorerPanelEl) {
      typesExplorerPanelEl.addEventListener('click', function(e) {
        var scopeBtn = e.target.closest('[data-types-scope]');
        if (scopeBtn) {
          e.preventDefault();
          var mapKey = String(scopeBtn.getAttribute('data-types-scope') || '').toLowerCase();
          toggleTypesExplorerMap(mapKey);
          return;
        }
        var tagBtn = e.target.closest('[data-types-explorer-kind][data-types-explorer-tag]');
        if (!tagBtn) return;
        e.preventDefault();
        var kind = String(tagBtn.getAttribute('data-types-explorer-kind') || '').toLowerCase();
        var tagName = String(tagBtn.getAttribute('data-types-explorer-tag') || '').trim();
        if (!tagName) return;
        if (activeCollectionFilter !== AppMode.TYPES_EXPLORER) {
          setActiveCollectionFilter(AppMode.TYPES_EXPLORER);
          setActiveFolderFilter('', false);
          syncTypesExplorerPath();
        }
        toggleTypesExplorerTag(kind, tagName);
        renderTypesExplorerTags();
      });
    }
    if (typesExplorerResetEl) {
      typesExplorerResetEl.addEventListener('click', function(e) {
        e.preventDefault();
        resetTypesExplorerFilter();
      });
    }
    if (typesExplorerCopyLinkEl) {
      typesExplorerCopyLinkEl.addEventListener('click', function(e) {
        e.preventDefault();
        syncTypesExplorerPath();
        navigator.clipboard.writeText(buildTypesExplorerUrl());
        var original = typesExplorerCopyLinkEl.textContent;
        typesExplorerCopyLinkEl.textContent = 'Copied';
        setTimeout(function() { typesExplorerCopyLinkEl.textContent = original; }, 1200);
      });
    }
    if (typesExplorerDownloadCurrentEl) {
      typesExplorerDownloadCurrentEl.addEventListener('click', function(e) {
        e.preventDefault();
        var downloaded = downloadCurrentViewTypesEntries();
        var original = typesExplorerDownloadCurrentEl.textContent;
        typesExplorerDownloadCurrentEl.textContent = downloaded ? 'Downloaded' : 'No types in view';
        setTimeout(function() { typesExplorerDownloadCurrentEl.textContent = original; }, 1200);
      });
    }
    if (objectMapCopyCoordsEl) {
      objectMapCopyCoordsEl.addEventListener('click', function(e) {
        e.preventDefault();
        if (!objectMapSelectedCoordsText) return;
        navigator.clipboard.writeText(objectMapSelectedCoordsText);
        var original = objectMapCopyCoordsEl.textContent;
        objectMapCopyCoordsEl.textContent = 'Copied';
        setTimeout(function() {
          objectMapCopyCoordsEl.textContent = original;
        }, 1200);
      });
    }
    if (objectMapExportCurrentEl) {
      objectMapExportCurrentEl.addEventListener('click', function(e) {
        e.preventDefault();
        exportObjectMapCurrentView();
      });
    }
    if (objectMapDownloadAreaEditorEl) {
      objectMapDownloadAreaEditorEl.addEventListener('click', function(e) {
        e.preventDefault();
        downloadObjectMapAreaEditorJson();
      });
    }
    if (objectMapDownloadAreaMapGroupProtoEl) {
      objectMapDownloadAreaMapGroupProtoEl.addEventListener('click', function(e) {
        e.preventDefault();
        downloadObjectMapAreaMapGroupProto();
      });
    }
    if (objectMapAreaSelectToggleEl) {
      objectMapAreaSelectToggleEl.addEventListener('click', function(e) {
        e.preventDefault();
        objectMapState.areaMode = !objectMapState.areaMode;
        objectMapState.areaDrag = null;
        if (objectMapOverlayEl) {
          objectMapOverlayEl.classList.remove('dragging');
        }
        updateObjectMapAreaControls();
        if (objectMapState.areaMode) {
          setObjectMapStatus('Area select enabled. Drag on the map to select a region.');
        } else if (objectMapState.areaBounds && objectMapState.areaPlacements.length) {
          setObjectMapStatus(formatNumber(objectMapState.areaPlacements.length) + ' placements selected in area.');
        } else {
          setObjectMapStatus(objectMapSummaryText || '');
        }
      });
    }
    if (objectMapCopyAreaEl) {
      objectMapCopyAreaEl.addEventListener('click', function(e) {
        e.preventDefault();
        copyObjectMapAreaSelection();
      });
    }
    if (objectMapExportAccordionEl) {
      document.addEventListener('click', function(event) {
        if (!objectMapExportAccordionEl.open) return;
        if (objectMapExportAccordionEl.contains(event.target)) return;
        objectMapExportAccordionEl.open = false;
      });
    }
    if (objectMapClearAreaEl) {
      objectMapClearAreaEl.addEventListener('click', function(e) {
        e.preventDefault();
        clearObjectMapAreaSelection();
        setObjectMapStatus(objectMapSummaryText || 'Area selection cleared.');
      });
    }
    if (objectMapPanelEl) {
      objectMapPanelEl.addEventListener('click', function(e) {
        var toggle = e.target.closest('[data-object-map]');
        if (toggle) {
          e.preventDefault();
          setObjectMapActiveMap(toggle.getAttribute('data-object-map') || 'chernarus');
          return;
        }
        var control = e.target.closest('[data-object-map-control]');
        if (!control) return;
        e.preventDefault();
        var action = String(control.getAttribute('data-object-map-control') || '');
        if (action === 'reset') {
          objectMapState.view = null;
          fitObjectMapToBounds();
          syncObjectMapViewBox();
          renderObjectMapFromTable(true);
          return;
        }
        if (!objectMapState.view) {
          fitObjectMapToBounds();
        }
        if (!objectMapState.view) return;
        var rect = objectMapViewportRect();
        var centerX = (rect.width || 1) / 2;
        var centerY = (rect.height || 1) / 2;
        if (action === 'zoom-in') {
          objectMapState.view = zoomObjectMapViewAt(objectMapState.view, centerX, centerY, 0.84);
          syncObjectMapViewBox();
          scheduleObjectMapInteractionRefresh(140);
          return;
        }
        if (action === 'zoom-out') {
          objectMapState.view = zoomObjectMapViewAt(objectMapState.view, centerX, centerY, 1.16);
          syncObjectMapViewBox();
          scheduleObjectMapInteractionRefresh(140);
        }
      });
    }
    if (objectMapOverlayEl) {
      objectMapOverlayEl.addEventListener('wheel', function(event) {
        if (!objectMapPanelEl || !objectMapPanelEl.classList.contains('visible') || !objectMapState.data || !objectMapState.view) return;
        if (objectMapState.areaMode) return;
        event.preventDefault();
        hideObjectMapTooltip();
        var rect = objectMapViewportRect();
        var factor = event.deltaY > 0 ? 1.12 : 0.88;
        objectMapState.view = zoomObjectMapViewAt(
          objectMapState.view,
          event.clientX - rect.left,
          event.clientY - rect.top,
          factor
        );
        syncObjectMapViewBox();
        scheduleObjectMapInteractionRefresh(160);
      }, { passive: false });
      objectMapOverlayEl.addEventListener('pointerdown', function(event) {
        if (!objectMapPanelEl || !objectMapPanelEl.classList.contains('visible') || !objectMapState.view) return;
        hideObjectMapTooltip();
        if (objectMapState.areaMode) {
          var rect = objectMapViewportRect();
          var start = screenToObjectMapWorld(
            objectMapState.view,
            event.clientX - rect.left,
            event.clientY - rect.top
          );
          objectMapState.areaDrag = {
            start: start,
            current: start
          };
          objectMapState.dragStart = null;
          objectMapState.dragMoved = false;
          applyObjectMapAreaBounds(getObjectMapBoundsFromPoints(start, start));
          objectMapOverlayEl.classList.add('dragging');
          objectMapOverlayEl.setPointerCapture(event.pointerId);
          return;
        }
        objectMapState.dragStart = {
          x: event.clientX,
          y: event.clientY,
          view: {
            minX: objectMapState.view.minX,
            maxX: objectMapState.view.maxX,
            minY: objectMapState.view.minY,
            maxY: objectMapState.view.maxY
          }
        };
        objectMapState.dragMoved = false;
        objectMapOverlayEl.classList.add('dragging');
        objectMapOverlayEl.setPointerCapture(event.pointerId);
      });
      objectMapOverlayEl.addEventListener('pointermove', function(event) {
        if (objectMapState.areaMode && objectMapState.areaDrag && objectMapState.view) {
          var rect = objectMapViewportRect();
          var current = screenToObjectMapWorld(
            objectMapState.view,
            event.clientX - rect.left,
            event.clientY - rect.top
          );
          objectMapState.areaDrag.current = current;
          objectMapState.areaBounds = getObjectMapBoundsFromPoints(objectMapState.areaDrag.start, current);
          renderObjectMapAreaRect();
          updateObjectMapAreaControls();
          return;
        }
        if (!objectMapState.dragStart || !objectMapState.view) return;
        if (!objectMapState.dragMoved) {
          var travelX = Math.abs(event.clientX - objectMapState.dragStart.x);
          var travelY = Math.abs(event.clientY - objectMapState.dragStart.y);
          if (travelX > 2 || travelY > 2) {
            objectMapState.dragMoved = true;
          }
        }
        var rect = objectMapViewportRect();
        var dx = ((event.clientX - objectMapState.dragStart.x) / (rect.width || 1)) *
          (objectMapState.dragStart.view.maxX - objectMapState.dragStart.view.minX);
        var dy = ((event.clientY - objectMapState.dragStart.y) / (rect.height || 1)) *
          (objectMapState.dragStart.view.maxY - objectMapState.dragStart.view.minY);
        objectMapState.view.minX = objectMapState.dragStart.view.minX - dx;
        objectMapState.view.maxX = objectMapState.dragStart.view.maxX - dx;
        objectMapState.view.minY = objectMapState.dragStart.view.minY + dy;
        objectMapState.view.maxY = objectMapState.dragStart.view.maxY + dy;
        syncObjectMapViewBox();
      });
      var endObjectMapDrag = function(event) {
        if (objectMapState.areaMode && objectMapState.areaDrag) {
          if (objectMapOverlayEl.hasPointerCapture(event.pointerId)) {
            objectMapOverlayEl.releasePointerCapture(event.pointerId);
          }
          var bounds = getObjectMapBoundsFromPoints(
            objectMapState.areaDrag.start,
            objectMapState.areaDrag.current
          );
          objectMapState.areaDrag = null;
          objectMapOverlayEl.classList.remove('dragging');
          applyObjectMapAreaBounds(bounds).catch(function(error) {
            setObjectMapStatus(error && error.message ? error.message : 'Unable to apply area selection.');
          });
          return;
        }
        if (!objectMapState.dragStart) return;
        var shouldRefresh = !!objectMapState.dragMoved;
        if (objectMapState.dragStart && objectMapOverlayEl.hasPointerCapture(event.pointerId)) {
          objectMapOverlayEl.releasePointerCapture(event.pointerId);
        }
        objectMapState.dragStart = null;
        objectMapState.dragMoved = false;
        objectMapOverlayEl.classList.remove('dragging');
        if (shouldRefresh) {
          scheduleObjectMapInteractionRefresh(80);
        }
      };
      objectMapOverlayEl.addEventListener('pointerup', endObjectMapDrag);
      objectMapOverlayEl.addEventListener('pointercancel', endObjectMapDrag);
    }
    updateObjectMapAreaControls();

    if (versionFilterResetLinkEl) {
      versionFilterResetLinkEl.addEventListener('click', function(e) {
        e.preventDefault();
        runResetView();
      });
    }
    if (versionFilterCopyLinkEl) {
      versionFilterCopyLinkEl.addEventListener('click', function(e) {
        e.preventDefault();
        var link = buildVersionFilterUrl(versionParam);
        navigator.clipboard.writeText(link);
        var original = versionFilterCopyLinkEl.textContent;
        versionFilterCopyLinkEl.textContent = 'Copied';
        setTimeout(function() { versionFilterCopyLinkEl.textContent = original; }, 1200);
      });
    }
    if (linkedFilterResetLinkEl) {
      linkedFilterResetLinkEl.addEventListener('click', function(e) {
        e.preventDefault();
        runResetView();
      });
    }
    if (linkedFilterCopyLinkEl) {
      linkedFilterCopyLinkEl.addEventListener('click', function(e) {
        e.preventDefault();
        var link = AppUrl.build({});
        if (activeTypesTagFilter) {
          link = buildTypesTagFilterUrl(activeTypesTagFilter);
        } else if (objectIdParams.length) {
          link = buildIdFilterUrl(objectIdParams);
        }
        navigator.clipboard.writeText(link);
        var original = linkedFilterCopyLinkEl.textContent;
        linkedFilterCopyLinkEl.textContent = 'Copied';
        setTimeout(function() { linkedFilterCopyLinkEl.textContent = original; }, 1200);
      });
    }
    if (pathFilterResetLinkEl) {
      pathFilterResetLinkEl.addEventListener('click', function(e) {
        e.preventDefault();
        runResetView();
      });
    }
    if (pathFilterCopyLinkEl) {
      pathFilterCopyLinkEl.addEventListener('click', function(e) {
        e.preventDefault();
        var link = buildFolderPathUrl(activeFolderFilter);
        navigator.clipboard.writeText(link);
        var original = pathFilterCopyLinkEl.textContent;
        pathFilterCopyLinkEl.textContent = 'Copied';
        setTimeout(function() { pathFilterCopyLinkEl.textContent = original; }, 1200);
      });
    }
    if (searchFilterResetLinkEl) {
      searchFilterResetLinkEl.addEventListener('click', function(e) {
        e.preventDefault();
        runResetView();
      });
    }
    if (searchFilterCopyLinkEl) {
      searchFilterCopyLinkEl.addEventListener('click', function(e) {
        e.preventDefault();
        var query = searchQueryParam;
        if (!query && table && typeof table.search === 'function') {
          query = String(table.search() || '').trim();
        }
        if (!query) return;
        navigator.clipboard.writeText(buildSearchShareUrl(query));
        var original = searchFilterCopyLinkEl.textContent;
        searchFilterCopyLinkEl.textContent = 'Copied';
        setTimeout(function() { searchFilterCopyLinkEl.textContent = original; }, 1200);
      });
    }

    var exportPanelEl = document.getElementById('exportPanel');
    var exportToggleEl = document.getElementById('exportToggle');

    var setExportPanelState = function(isOpen) {
      if (!exportPanelEl || !exportToggleEl) return;
      exportPanelEl.classList.toggle('is-open', isOpen);
      exportPanelEl.setAttribute('aria-hidden', String(!isOpen));
      exportToggleEl.setAttribute('aria-expanded', String(isOpen));
    };

    if (exportToggleEl) {
      exportToggleEl.addEventListener('click', function() {
        var isOpen = exportPanelEl && exportPanelEl.classList.contains('is-open');
        setExportPanelState(!isOpen);
      });
    }

    var getCurrentViewRows = function() {
      if (!table) return [];
      return table
        .rows({ search: 'applied', order: 'applied', page: 'all' })
        .data()
        .toArray()
        .map(function(row) {
          return {
            id: getObjectId(row) || '',
            className: getObjectName(row) || '',
            inGameName: row && row.inGameName ? row.inGameName : '',
            category: row && row.category ? row.category : '',
            path: row && row.path ? row.path : '',
            console: getConsoleFlag(row),
            type: row && row.modelType ? row.modelType : '',
            tags: getSearchTags(row)
          };
        });
    };
    var downloadCurrentViewTypesEntries = function() {
      if (!table) return false;
      var seen = {};
      var items = table
        .rows({ search: 'applied', order: 'applied', page: 'all' })
        .data()
        .toArray()
        .reduce(function(acc, row) {
          var objName = String(getObjectName(row) || '').trim();
          if (!objName || seen[objName]) return acc;
          seen[objName] = true;
          acc.push({ objName: objName });
          return acc;
        }, []);
      return downloadTypesEntries(items, 'types_current_view.xml');
    };

    var downloadTextFile = function(content, filename, mimeType) {
      var blob = new Blob([content], { type: mimeType || 'text/plain;charset=utf-8' });
      if (typeof saveAs !== 'undefined') {
        saveAs(blob, filename);
        return;
      }
      var link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(function() { URL.revokeObjectURL(link.href); }, 500);
    };

    var exportCurrentViewCsv = function() {
      var rows = getCurrentViewRows();
      if (!rows.length) return;
      var csvRows = [];
      csvRows.push([
        'id',
        'className',
        'inGameName',
        'category',
        'path',
        'console',
        'type',
        'tags'
      ].join(','));
      rows.forEach(function(item) {
        csvRows.push([
          csvEscape(item.id),
          csvEscape(item.className),
          csvEscape(item.inGameName),
          csvEscape(item.category),
          csvEscape(item.path),
          csvEscape(item.console === '✅' ? 'Yes' : item.console === '❌' ? 'No' : item.console),
          csvEscape(item.type),
          csvEscape(item.tags)
        ].join(','));
      });
      var csvContent = '\ufeff' + csvRows.join('\r\n');
      downloadTextFile(csvContent, 'dayz_objects_view.csv', 'text/csv;charset=utf-8');
    };

    var exportCurrentViewXlsx = function() {
      if (typeof XLSX === 'undefined') return;
      var rows = getCurrentViewRows();
      if (!rows.length) return;
      var data = rows.map(function(item) {
        return {
          id: item.id,
          className: item.className,
          inGameName: item.inGameName,
          category: item.category,
          path: item.path,
          console: item.console === '✅' ? 'Yes' : item.console === '❌' ? 'No' : item.console,
          type: item.type,
          tags: item.tags
        };
      });
      var worksheet = XLSX.utils.json_to_sheet(data);
      var workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Objects');
      var arrayBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      var blob = new Blob([arrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      if (typeof saveAs !== 'undefined') {
        saveAs(blob, 'dayz_objects_view.xlsx');
      }
    };

    var exportCurrentViewJson = function() {
      var rows = getCurrentViewRows();
      if (!rows.length) return;
      downloadTextFile(JSON.stringify(rows, null, 2), 'dayz_objects_view.json', 'application/json;charset=utf-8');
    };
    var getCurrentViewClassNames = function() {
      var rows = getCurrentViewRows();
      if (!rows.length) return [];
      var seen = {};
      var names = [];
      rows.forEach(function(row) {
        var className = row && row.className ? String(row.className).trim() : '';
        if (!className || seen[className]) return;
        seen[className] = true;
        names.push(className);
      });
      return names;
    };
    var collectEntriesByName = function(names, entryMap) {
      if (!Array.isArray(names) || !names.length || !entryMap) return [];
      var entries = [];
      names.forEach(function(name) {
        var entry = entryMap[name];
        if (entry) entries.push(entry);
      });
      return entries;
    };
    var exportCurrentViewTypes = function() {
      var names = getCurrentViewClassNames();
      if (!names.length) return false;
      var entries = collectEntriesByName(names, typesEntryByName);
      if (!entries.length) return false;
      downloadTextFile(entries.join('\n\n') + '\n', 'dayz_objects_view_types.txt', 'text/plain;charset=utf-8');
      return true;
    };
    var exportCurrentViewMapGroupPos = function() {
      var names = getCurrentViewClassNames();
      if (!names.length) return false;
      var entries = collectEntriesByName(names, mapGroupProtoEntryByName);
      if (!entries.length) return false;
      downloadTextFile(entries.join('\n\n') + '\n', 'dayz_objects_view_mapgrouppos.txt', 'text/plain;charset=utf-8');
      return true;
    };
    var exportObjectMapCurrentView = function() {
      if (!table) return;
      var mapKey = objectMapActiveMapKey || 'chernarus';
      var rows = getObjectMapRows();
      if (!rows.length) {
        setObjectMapStatus('No objects in current view.');
        return;
      }
      if (!shouldRenderObjectMapPlacements()) {
        setObjectMapStatus('Search or select folders to show on map before exporting.');
        return;
      }
      var finishExport = function(gathered) {
        if (!gathered || !Array.isArray(gathered.placements) || !gathered.placements.length) {
          setObjectMapStatus('No map placements in current view.');
          return;
        }
        var payload = {
          map: mapKey,
          mapLabel: getLocationMapLabel(mapKey),
          generatedAt: new Date().toISOString(),
          objectCountInView: rows.length,
          placementCount: gathered.placements.length,
          placements: gathered.placements.map(function(point) {
            return {
              id: point.objId || '',
              name: point.objName || '',
              x: point.x,
              y: point.y
            };
          })
        };
        var stamp = payload.generatedAt.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
        downloadTextFile(
          JSON.stringify(payload, null, 2),
          'object_map_' + mapKey + '_' + stamp + '.json',
          'application/json;charset=utf-8'
        );
        setObjectMapStatus(formatNumber(payload.placementCount) + ' placements exported from ' + payload.mapLabel + '.');
      };
      var cached = objectMapState.placementsCache;
      if (cached && cached.mapKey === mapKey && cached.gathered) {
        finishExport(cached.gathered);
        return;
      }
      setObjectMapStatus('Preparing export...');
      ensureLocationMapData(mapKey).then(function(viewerData) {
        return gatherObjectMapPlacementsAsync(rows, viewerData, mapKey, null);
      }).then(function(gathered) {
        finishExport(gathered);
      }).catch(function(error) {
        setObjectMapStatus(error && error.message ? error.message : 'Unable to export current map view.');
      });
    };
    var flashNoEntriesButton = function(buttonEl) {
      if (!buttonEl) return;
      if (!buttonEl.dataset.originalText) {
        buttonEl.dataset.originalText = buttonEl.textContent || '';
      }
      if (buttonEl._noEntriesTimer) {
        clearTimeout(buttonEl._noEntriesTimer);
      }
      buttonEl.textContent = 'No entries in current view';
      buttonEl.classList.remove('export-empty-flash');
      void buttonEl.offsetWidth;
      buttonEl.classList.add('export-empty-flash');
      buttonEl._noEntriesTimer = setTimeout(function() {
        buttonEl.classList.remove('export-empty-flash');
        buttonEl.textContent = buttonEl.dataset.originalText || buttonEl.textContent;
        buttonEl._noEntriesTimer = null;
      }, 3000);
    };

    $(document).on('click', '#exportCsv', function() {
      exportCurrentViewCsv();
    });

    $(document).on('click', '#exportXlsx', function() {
      exportCurrentViewXlsx();
    });

    $(document).on('click', '#exportJson', function() {
      exportCurrentViewJson();
    });
    $(document).on('click', '#exportTypes', function() {
      var ok = exportCurrentViewTypes();
      if (!ok) {
        flashNoEntriesButton(this);
      }
    });
    $(document).on('click', '#exportMapGroupPos', function() {
      var ok = exportCurrentViewMapGroupPos();
      if (!ok) {
        flashNoEntriesButton(this);
      }
    });

    var positionHoverPreview = function(clientX, clientY) {
      var previewEl = document.getElementById('imgPreview');
      if (!previewEl) return;
      var offset = 14;
      var margin = 12;
      var rect = previewEl.getBoundingClientRect();
      var maxLeft = window.innerWidth - rect.width - margin;
      var maxTop = window.innerHeight - rect.height - margin;
      var left = Math.min(Math.max(margin, clientX + offset), Math.max(margin, maxLeft));
      var top = Math.min(Math.max(margin, clientY + offset), Math.max(margin, maxTop));
      previewEl.style.left = left + 'px';
      previewEl.style.top = top + 'px';
    };
    var getHoverPreviewList = function(cellEl) {
      if (!cellEl) return [];
      var $cell = $(cellEl);
      var imagesAttr = $cell.attr('data-images');
      var parsed = parseImageList(imagesAttr);
      if (parsed.length) {
        var direct = String($cell.data('image') || '').trim();
        if (direct && parsed.indexOf(direct) === -1) parsed.unshift(direct);
        return parsed;
      }
      var directImage = String($cell.data('image') || '').trim();
      if (directImage) return [directImage];
      if (!table) return [];
      var rowData = table.row($cell.closest('tr')).data();
      return resolveRowImageList(rowData, rowData && rowData.image);
    };
    var removeHoverPreview = function() {
      if (hoverPreviewTimer) {
        clearInterval(hoverPreviewTimer);
        hoverPreviewTimer = null;
      }
      hoverPreviewImages = [];
      hoverPreviewIndex = 0;
      hoverPreviewCell = null;
      $('#imgPreview').remove();
    };

    $('#dayzObjects tbody')
      .on('mouseenter', '.object-name-cell, .thumb-cell', function(e) {
        if (isMobileView) return;
        var imgList = getHoverPreviewList(this);
        if (!Array.isArray(imgList) || !imgList.length) return;
        var isSameCell = hoverPreviewCell === this && document.getElementById('imgPreview');
        hoverPreviewImages = imgList;
        if (isSameCell) {
          if (!hoverPreviewTimer && hoverPreviewImages.length > 1) {
            hoverPreviewTimer = setInterval(function() {
              var previewImg = document.querySelector('#imgPreview img');
              if (!previewImg || !hoverPreviewImages.length) return;
              hoverPreviewIndex = (hoverPreviewIndex + 1) % hoverPreviewImages.length;
              previewImg.src = '/' + hoverPreviewImages[hoverPreviewIndex];
              syncPortraitImageClass(previewImg);
            }, 900);
          }
          positionHoverPreview(e.clientX, e.clientY);
          return;
        }
        removeHoverPreview();
        hoverPreviewCell = this;
        hoverPreviewImages = imgList.slice();
        hoverPreviewIndex = 0;

        $('body').append(
          '<div id="imgPreview" class="preview-card">' +
            '<img src="/' + hoverPreviewImages[0] + '" alt="Object preview">' +
          '</div>'
        );
        syncPortraitImageClass(document.querySelector('#imgPreview img'));
        positionHoverPreview(e.clientX, e.clientY);
        if (hoverPreviewImages.length > 1) {
          hoverPreviewTimer = setInterval(function() {
            var previewImg = document.querySelector('#imgPreview img');
            if (!previewImg || !hoverPreviewImages.length) return;
            hoverPreviewIndex = (hoverPreviewIndex + 1) % hoverPreviewImages.length;
            previewImg.src = '/' + hoverPreviewImages[hoverPreviewIndex];
            syncPortraitImageClass(previewImg);
          }, 900);
        }
      })
      .on('mousemove', '.object-name-cell, .thumb-cell', function(e) {
        if (isMobileView) return;
        positionHoverPreview(e.clientX, e.clientY);
      })
      .on('mouseleave', '.object-name-cell, .thumb-cell', function() {
        if (isMobileView) return;
        removeHoverPreview();
      });
    $('#dayzObjects tbody').on('mouseleave', function() {
      if (isMobileView) return;
      removeHoverPreview();
    });
    $(document).on('scroll', function() {
      removeHoverPreview();
    });
    $(window).on('blur', function() {
      removeHoverPreview();
    });
    document.addEventListener('visibilitychange', function() {
      if (document.hidden) {
        removeHoverPreview();
      }
    });

    var closeOtherRowDetails = function($keepRow) {
      if (!table) return;
      $(table.rows().nodes()).each(function() {
        var $row = $(this);
        if ($keepRow && $row.is($keepRow)) return;
        var row = table.row($row);
        if (row && row.child && row.child.isShown()) {
          row.child.hide();
          $row.removeClass('parent');
        }
      });
    };

    $('#dayzObjects tbody').on('click', '.object-name-cell', function(e) {
      if ($(e.target).hasClass('copy-btn')) return;
      e.stopPropagation();
      if (table) {
        var $row = $(this).closest('tr');
        var row = table.row($row);
        if (row && row.child) {
          if (isMobileView) {
            var isOpen = row.child.isShown();
            closeOtherRowDetails($row);
            if (isOpen) {
              row.child.hide();
              $row.removeClass('parent');
              return;
            }
            row.child(buildRowDetailsHtml($(this)), 'child').show();
            $row.addClass('parent');
            return;
          }
          if (row.child.isShown()) {
            row.child.hide();
            $row.removeClass('parent');
          }
        }
      }
      var objName = $(this).data('object');
      if (objectFocusEl && objectFocusEl.classList.contains('visible') && currentObjectName === objName) {
        FocusPane.clear();
        return;
      }
      showObjectFocus($(this), false);
    });

    $('#dayzObjects tbody').on('click', '.copy-name-btn', function(e) {
      e.stopPropagation();
      var text = $(this).closest('td').data('object');
      navigator.clipboard.writeText(text);
      flashIconButton($(this));
    });

    $('#dayzObjects tbody').on('click', '.copy-link-btn', function(e) {
      e.stopPropagation();
      var $td = $(this).closest('td');
      navigator.clipboard.writeText(buildObjectUrl($td.data('objectid'), $td.data('object')));
      flashIconButton($(this));
    });

    $('#dayzObjects tbody').on('click', '.path-pin-btn', function(e) {
      e.stopPropagation();
      var $row = $(this).closest('tr');
      if ($row.hasClass('child')) {
        $row = $row.prev();
      }
      var rowData = table.row($row).data();
      if (!rowData) return;
      if (!pinPathForRow(rowData)) return;
      flashIconButton($(this));
    });

    $('#dayzObjects tbody').on('click', '.path-copy-link-btn', function(e) {
      e.stopPropagation();
      var $row = $(this).closest('tr');
      if ($row.hasClass('child')) {
        $row = $row.prev();
      }
      var rowData = table.row($row).data();
      if (!rowData) return;
      var target = resolvePathActionTarget(rowData);
      if (!target) return;
      navigator.clipboard.writeText(buildFolderPathUrl(target.targetPath));
      flashIconButton($(this));
    });

    $('#dayzObjects tbody').on('click', '.path-copy-name-btn', function(e) {
      e.stopPropagation();
      var $row = $(this).closest('tr');
      if ($row.hasClass('child')) {
        $row = $row.prev();
      }
      var rowData = table.row($row).data();
      if (!rowData) return;
      var target = resolvePathActionTarget(rowData);
      if (!target) return;
      navigator.clipboard.writeText(target.rawPath);
      flashIconButton($(this));
    });

    $('#dayzObjects tbody').on('click', '.path-filter-btn', function(e) {
      e.stopPropagation();
      var $row = $(this).closest('tr');
      if ($row.hasClass('child')) {
        $row = $row.prev();
      }
      var rowData = table.row($row).data();
      if (!rowData) return;
      if (!applyPathFilterForRow(rowData)) return;
      flashIconButton($(this));
    });

    $('#dayzObjects tbody').on('click', '.pin-btn', function(e) {
      e.stopPropagation();
      var $td = $(this).closest('td');
      var item = buildPinnedItemFromCell($td);
      var $btn = $(this);
      if (isPinned(item.objName)) {
        removePinnedItemByName(item.objName);
      } else {
        addPinnedItem(item);
      }
      flashIconButton($btn);
    });

    $('#dayzObjects tbody').on('click', '.preset-copy-btn', async function(e) {
      e.stopPropagation();
      var $btn = $(this);
      if ($btn.prop('disabled')) return;
      var $row = $(this).closest('tr');
      var rowData = table.row($row).data();
      if (!rowData) return;
      var textToCopy = '';
      if (hasPresetEditorJson(rowData)) {
        textToCopy = JSON.stringify(normalizePresetClipboardEntries(rowData.editorJson), null, 4);
      } else {
        var copyablePath = String($btn.attr('data-preset-copy-path') || '').trim();
        var importPath = String($btn.attr('data-preset-import-path') || '').trim();
        var presetObjectName = String($btn.attr('data-preset-object') || '').trim();
        textToCopy = await fetchPresetCopyPayloadFromValues(
          copyablePath || getPresetCopyablePath(rowData),
          importPath || getPresetImportJsonPath(rowData),
          presetObjectName || getObjectName(rowData)
        );
      }
      if (!textToCopy) return;
      var copied = await copyTextToClipboard(textToCopy);
      if (!copied) return;
      var original = $btn.html();
      $btn.text('Copied');
      setTimeout(function() { $btn.html(original); }, 1000);
    });

    $('#dayzObjects tbody').on('click', '.preset-export-btn', function(e) {
      e.stopPropagation();
      var $btn = $(this);
      if ($btn.prop('disabled')) return;
      var $row = $(this).closest('tr');
      var rowData = table.row($row).data();
      var importPath = String($btn.attr('data-preset-import-path') || '').trim() || (rowData ? getPresetImportJsonPath(rowData) : '');
      var presetObjectName = String($btn.attr('data-preset-object') || '').trim() || (rowData ? getObjectName(rowData) : '');
      if (importPath) {
        var normalizedImportPath = importPath.replace(/^\/+/, '');
        var importFileName = normalizedImportPath.split('/').pop() || (sanitizePathFolder(presetObjectName || 'preset') + '.json');
        var importLink = document.createElement('a');
        importLink.href = '/' + encodeURI(normalizedImportPath);
        importLink.setAttribute('download', importFileName);
        importLink.rel = 'noopener';
        document.body.appendChild(importLink);
        importLink.click();
        document.body.removeChild(importLink);
      } else if (rowData && hasPresetEditorJson(rowData)) {
        var jsonText = buildPresetObjectPackage(
          rowData.editorJson ? JSON.stringify(rowData.editorJson) : '',
          getObjectName(rowData),
          rowData.modelType || '',
          rowData.path || ''
        );
        var fileName = sanitizePathFolder(presetObjectName || 'preset') + '_preset.json';
        downloadTextFile(jsonText, fileName, 'application/json;charset=utf-8');
      } else {
        return;
      }
      var original = $btn.html();
      $btn.text('✔');
      setTimeout(function() { $btn.html(original); }, 900);
    });

    $('#dayzObjects tbody').on('click', '.row-detail__action', async function(e) {
      e.stopPropagation();
      var $action = $(this);
      var action = $action.data('action');
      var $detail = $action.closest('.row-detail');
      var $row = $detail.closest('tr').prev();

      if (action === 'close') {
        if (table) {
          var row = table.row($row);
          if (row && row.child && row.child.isShown()) {
            row.child.hide();
            $row.removeClass('parent');
          }
        }
        if (typeof runResetView === 'function') {
          runResetView();
        }
        return;
      }
      var objName = $detail.data('object');
      var $cell = $row.find('.object-name-cell');
      if (!$cell.length || !objName) return;

      if (action === 'pin') {
        var item = buildPinnedItemFromCell($cell);
        if (!item || !item.objName) return;
        if (isPinned(item.objName)) {
          removePinnedItemByName(item.objName);
        } else {
          addPinnedItem(item);
        }
        var pinHtml = $action.html();
        $action.text('✔');
        setTimeout(function() { $action.html(pinHtml); }, 900);
        return;
      }

      if (action === 'name') {
        copyTextToClipboard(objName);
        var nameHtml = $action.html();
        $action.text('✔');
        setTimeout(function() { $action.html(nameHtml); }, 900);
        return;
      }

      if (action === 'link') {
        copyTextToClipboard(buildObjectUrl($cell.data('objectid'), objName));
        var linkHtml = $action.html();
        $action.text('✔');
        setTimeout(function() { $action.html(linkHtml); }, 900);
        return;
      }

      if (action === 'editor') {
        var rowDataForEditor = table.row($row).data();
        var jsonText = '';
        var isPresetContext = isPresetRow({
          category: $cell.data('category'),
          modelType: $cell.data('modeltype')
        }) || (rowDataForEditor && isPresetRow(rowDataForEditor));
        if (isPresetContext) {
          jsonText = await fetchPresetCopyPayloadFromValues(
            String($cell.attr('data-preset-copy-path') || '').trim() || (rowDataForEditor ? getPresetCopyablePath(rowDataForEditor) : ''),
            String($cell.attr('data-preset-import-path') || '').trim() || (rowDataForEditor ? getPresetImportJsonPath(rowDataForEditor) : ''),
            String($cell.data('object') || '').trim() || (rowDataForEditor ? getObjectName(rowDataForEditor) : '')
          );
          if (!jsonText) {
            return;
          }
        }
        if (!jsonText) {
          jsonText = buildEditorJson(
            $cell.attr('data-editorjson'),
            $cell.data('object'),
            $cell.data('modeltype'),
            $cell.data('p3d')
          );
        }
        copyTextToClipboard(jsonText);
        var editorHtml = $action.html();
        $action.text('✔');
        setTimeout(function() { $action.html(editorHtml); }, 900);
        return;
      }
    });

    $('#dayzObjects tbody').on('click', '.editor-copy-btn', async function(e) {
      e.stopPropagation();
      var $td = $(this).closest('td');
      var $row = $(this).closest('tr');
      if ($row.hasClass('child')) {
        $row = $row.prev();
      }
      var rowData = table.row($row).data();
      var isPresetContext = isPresetRow({
        category: $td.data('category'),
        modelType: $td.data('modeltype')
      }) || (rowData && isPresetRow(rowData));
      if (isPresetContext) {
        var presetText = '';
        if (rowData && hasPresetEditorJson(rowData)) {
          presetText = JSON.stringify(normalizePresetClipboardEntries(rowData.editorJson), null, 4);
        } else {
          presetText = await fetchPresetCopyPayloadFromValues(
            String($td.attr('data-preset-copy-path') || '').trim() || (rowData ? getPresetCopyablePath(rowData) : ''),
            String($td.attr('data-preset-import-path') || '').trim() || (rowData ? getPresetImportJsonPath(rowData) : ''),
            String($td.data('object') || '').trim() || (rowData ? getObjectName(rowData) : '')
          );
        }
        if (presetText) {
          var copiedPreset = await copyTextToClipboard(presetText);
          if (!copiedPreset) return;
          flashIconButton($(this));
        }
        return;
      }

      var predefined = $td.attr('data-editorjson');
      var jsonText = null;

      if (predefined && predefined.trim() !== "") {
        try {
          var parsed = JSON.parse(predefined); 
          jsonText = JSON.stringify(normalizeEditorJsonEntries(parsed), null, 4);
        } catch (err) {
          console.error("Invalid editorJson for row:", err);
        }
      }

      if (!jsonText) {
        var objName   = $td.data('object');
        var modelType = $td.data('modeltype');
        var path      = $td.data('p3d');

        var typeValue = (modelType === "Config")
          ? objName
          : path.replace(/\//g, "\\") + "\\" + objName;

        var json = [{
          Type: typeValue,
          DisplayName: modelType === "Config" ? typeValue : "",
          Position: [0, 0, 0],
          Orientation: [0, 0, 0],
          Scale: 1.0,
          AttachmentMap: {},
          Model: "",
          Flags: 30,
          m_LowBits: 0,
          m_HighBits: 0
        }];

        jsonText = JSON.stringify(json, null, 4);
      }

      copyTextToClipboard(jsonText);

      flashIconButton($(this));
    });

  });
