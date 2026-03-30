const { test, expect } = require('@playwright/test');

test.describe('Object Map Contracts', () => {
  test('object map panel and lightbox anchors exist', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#objectMapPanel')).toBeAttached();
    await expect(page.locator('#objectMapV2Frame')).toBeAttached();
    await expect(page.locator('#chernarusMapLightbox')).toBeAttached();
    await expect(page.locator('#chernarusMapOverlay')).toBeAttached();
  });

  test('core message and dom event contracts are exported', async ({ page }) => {
    await page.goto('/');
    const contracts = await page.evaluate(() => {
      const core = window.DayzCoreModules || {};
      return {
        messageTypes: core.OBJECT_MAP_MESSAGE_TYPES || null,
        domEvents: core.OBJECT_MAP_DOM_EVENTS || null
      };
    });
    expect(contracts.messageTypes).toBeTruthy();
    expect(contracts.messageTypes.SEARCH_STATE).toBe('object-map-search-state');
    expect(contracts.messageTypes.CLEAR_SELECTION).toBe('object-map-clear-selection');
    expect(contracts.messageTypes.FOCUS_OBJECT).toBe('object-map-focus-object');
    expect(contracts.messageTypes.OBJECT_ACTION).toBe('object-map-object-action');
    expect(contracts.messageTypes.FILTER_OBJECT).toBe('object-map-filter-object');

    expect(contracts.domEvents).toBeTruthy();
    expect(contracts.domEvents.PANEL_VISIBILITY).toBe('object-map:panel-visibility');
    expect(contracts.domEvents.SEARCH_STATE_DISPATCHED).toBe('object-map:search-state-dispatched');
    expect(contracts.domEvents.LIGHTBOX_OPENED).toBe('object-map:lightbox-opened');
    expect(contracts.domEvents.LIGHTBOX_CLOSED).toBe('object-map:lightbox-closed');
  });
});
