export const OBJECT_MAP_MESSAGE_TYPES = {
  SEARCH_STATE: 'object-map-search-state',
  CLEAR_SELECTION: 'object-map-clear-selection',
  FOCUS_OBJECT: 'object-map-focus-object',
  OBJECT_ACTION: 'object-map-object-action',
  FILTER_OBJECT: 'object-map-filter-object'
};

export const OBJECT_MAP_DOM_EVENTS = {
  PANEL_VISIBILITY: 'object-map:panel-visibility',
  SEARCH_STATE_DISPATCHED: 'object-map:search-state-dispatched',
  LIGHTBOX_OPENED: 'object-map:lightbox-opened',
  LIGHTBOX_CLOSED: 'object-map:lightbox-closed'
};

export const createObjectMapContract = (config = {}) => {
  const targetOrigin = config.origin || window.location.origin;
  const eventTarget = config.eventTarget || window;

  const postToFrame = (frameEl, payload) => {
    if (!frameEl || !frameEl.contentWindow || !payload) return false;
    try {
      frameEl.contentWindow.postMessage(payload, targetOrigin);
      return true;
    } catch (_) {
      return false;
    }
  };

  const dispatchDomEvent = (type, detail) => {
    if (!eventTarget || typeof eventTarget.dispatchEvent !== 'function') return;
    eventTarget.dispatchEvent(new CustomEvent(type, { detail: detail || {} }));
  };

  return {
    messageTypes: OBJECT_MAP_MESSAGE_TYPES,
    domEvents: OBJECT_MAP_DOM_EVENTS,
    postToFrame,
    dispatchDomEvent
  };
};
