import { AppMode } from './core/state.js';
import { createAppUrl } from './core/url.js';
import {
  rowMatchesCollectionWithIndex,
  rowPassesTagFilter,
  rowPassesCollectionFilter
} from './core/filters.js';
import { createFocusPane } from './core/focus.js';
import {
  normalizePinnedEntries,
  addUniquePinnedItem,
  removePinnedItemByName
} from './core/pinned.js';
import { createMapBridge } from './core/map-bridge.js';
import { createTableRenderers } from './core/table-init.js';

window.DayzCoreModules = {
  AppMode,
  createAppUrl,
  rowMatchesCollectionWithIndex,
  rowPassesTagFilter,
  rowPassesCollectionFilter,
  createFocusPane,
  normalizePinnedEntries,
  addUniquePinnedItem,
  removePinnedItemByName,
  createMapBridge,
  createTableRenderers
};
