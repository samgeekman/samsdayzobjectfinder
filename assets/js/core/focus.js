export const createFocusPane = (deps = {}) => {
  const getContainer = () => (typeof deps.getContainer === 'function' ? deps.getContainer() : null);
  const setSelectedRow = typeof deps.setSelectedRow === 'function' ? deps.setSelectedRow : () => {};
  const clearPane = typeof deps.clearPane === 'function' ? deps.clearPane : () => {};
  const renderData = typeof deps.renderData === 'function' ? deps.renderData : () => {};
  const syncCollapse = typeof deps.syncCollapse === 'function' ? deps.syncCollapse : () => {};

  return {
    show(focusData, options = {}) {
      if (!focusData) return;
      const rowEl = options.rowEl && options.rowEl.nodeType === 1 ? options.rowEl : null;
      setSelectedRow(rowEl);
      const container = getContainer();
      if (container && container.classList.contains('collapsed')) {
        this.setCollapsed(false);
      }
      if (container) container.classList.add('expanded');
      renderData(focusData, !!options.updateUrl);
    },
    clear() {
      clearPane();
    },
    setCollapsed(isCollapsed) {
      const container = getContainer();
      if (!container) return;
      const nextCollapsed = !!isCollapsed;
      container.classList.toggle('collapsed', nextCollapsed);
      container.classList.toggle('expanded', !nextCollapsed);
      syncCollapse();
    },
    refresh() {
      syncCollapse();
    }
  };
};
