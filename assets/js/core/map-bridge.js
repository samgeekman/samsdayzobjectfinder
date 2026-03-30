import { OBJECT_MAP_MESSAGE_TYPES } from './object-map-contract.js';

export const createMapBridge = (config = {}) => {
  const targetOrigin = config.origin || window.location.origin;
  const onFocusObject = typeof config.onFocusObject === 'function' ? config.onFocusObject : () => {};
  const onObjectAction = typeof config.onObjectAction === 'function' ? config.onObjectAction : () => {};
  const onFilterObject = typeof config.onFilterObject === 'function' ? config.onFilterObject : () => {};

  const handleMessage = (event) => {
    if (!event || !event.data || event.origin !== targetOrigin) return;
    if (event.data.type === OBJECT_MAP_MESSAGE_TYPES.FOCUS_OBJECT) {
      onFocusObject(event.data);
      return;
    }
    if (event.data.type === OBJECT_MAP_MESSAGE_TYPES.OBJECT_ACTION) {
      onObjectAction(event.data);
      return;
    }
    if (event.data.type === OBJECT_MAP_MESSAGE_TYPES.FILTER_OBJECT) {
      onFilterObject(event.data);
    }
  };

  const attach = () => {
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  };

  return { attach, handleMessage };
};
