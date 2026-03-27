const DEFAULT_PARAMS = [
  'id', 'path', 'version', 'maps', 'types_map', 'types_kind', 'types_tag',
  'q', 'world', 'object', 'types', 'types_maps', 'types_usage', 'types_value',
  'presets', 'pinned', 'pinned_ids'
];

export const createAppUrl = (config = {}) => {
  const managedParams = Array.isArray(config.managedParams) && config.managedParams.length
    ? config.managedParams.slice()
    : DEFAULT_PARAMS.slice();
  const getCurrentHref = typeof config.getCurrentHref === 'function'
    ? config.getCurrentHref
    : () => window.location.toString();
  const onPush = typeof config.onPush === 'function' ? config.onPush : null;

  const resolveUrl = (options = {}) => {
    const sourceUrl = options.sourceUrl ? String(options.sourceUrl) : getCurrentHref();
    return new URL(sourceUrl);
  };

  const read = (sourceUrl) => {
    const url = new URL(sourceUrl ? String(sourceUrl) : getCurrentHref());
    return {
      pathname: url.pathname,
      search: url.search,
      get: (name) => url.searchParams.get(name),
      getAll: (name) => url.searchParams.getAll(name),
      has: (name) => url.searchParams.has(name),
      toString: () => url.toString()
    };
  };

  const build = (overrides = {}, options = {}) => {
    const nextUrl = resolveUrl(options);
    if (options.clearAllParams) {
      Array.from(nextUrl.searchParams.keys()).forEach((key) => nextUrl.searchParams.delete(key));
    }
    if (typeof options.pathname === 'string' && options.pathname) {
      nextUrl.pathname = options.pathname;
    }
    managedParams.forEach((param) => {
      if (!Object.prototype.hasOwnProperty.call(overrides, param)) return;
      const nextValue = overrides[param];
      nextUrl.searchParams.delete(param);
      if (nextValue === null || typeof nextValue === 'undefined') return;
      if (Array.isArray(nextValue)) {
        nextValue.forEach((value) => {
          if (value !== null && typeof value !== 'undefined' && String(value).trim()) {
            nextUrl.searchParams.append(param, String(value));
          }
        });
        return;
      }
      nextUrl.searchParams.set(param, String(nextValue));
    });
    return nextUrl.toString();
  };

  const push = (overrides = {}, options = {}) => {
    window.history.replaceState({}, '', build(overrides, options));
    if (onPush) onPush();
  };

  return { read, build, push, managedParams: managedParams.slice() };
};
