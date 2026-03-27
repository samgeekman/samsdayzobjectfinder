export const createMapBridge = (config = {}) => {
  const targetOrigin = config.origin || window.location.origin;
  const onFocusObject = typeof config.onFocusObject === 'function' ? config.onFocusObject : () => {};
  const onObjectAction = typeof config.onObjectAction === 'function' ? config.onObjectAction : () => {};

  const handleMessage = (event) => {
    if (!event || !event.data || event.origin !== targetOrigin) return;
    if (event.data.type === 'object-map-focus-object') {
      onFocusObject(event.data);
      return;
    }
    if (event.data.type === 'object-map-object-action') {
      onObjectAction(event.data);
    }
  };

  const attach = () => {
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  };

  return { attach, handleMessage };
};
