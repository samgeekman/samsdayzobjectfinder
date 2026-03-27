const { test, expect } = require('@playwright/test');

test.describe('UI Contract', () => {
  test('critical focus/map controls and data attributes exist', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('#objectFocus')).toBeVisible();
    await expect(page.locator('#objectFocusCollapse')).toBeVisible();
    await expect(page.locator('#objectFocusClear')).toBeVisible();
    await expect(page.locator('#pinnedList')).toBeVisible();
    await expect(page.locator('#folderTree')).toBeVisible();
    await expect(page.locator('#versionFilterNotice')).toBeAttached();
    await expect(page.locator('#linkedFilterNotice')).toBeAttached();
    await expect(page.locator('#pathFilterNotice')).toBeAttached();
    await expect(page.locator('#searchFilterNotice')).toBeAttached();

    const firstCell = page.locator('#dayzObjects tbody td.object-name-cell').first();
    await expect(firstCell).toBeVisible();
    await expect(firstCell).toHaveAttribute('data-object', /.+/);
    await expect(firstCell).toHaveAttribute('data-objectid', /.+/);
    await expect(firstCell).toHaveAttribute('data-p3d', /.+/);
    await expect(firstCell).toHaveAttribute('data-modeltype', /.+/);
    await expect(firstCell).toHaveAttribute('data-tags', /.*/);
  });

  test('object-map v2 bridge contract attrs remain', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('#objectMapPanel')).toBeAttached();
    await expect(page.locator('[data-object-map="chernarus"]')).toBeAttached();
    await expect(page.locator('[data-object-map="livonia"]')).toBeAttached();
    await expect(page.locator('[data-object-map="sakhal"]')).toBeAttached();
    await expect(page.locator('#objectMapV2Frame')).toHaveAttribute('title', /Object map/i);
  });

  test('URL contract controls remain', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('#linkedFilterCopyLink')).toBeAttached();
    await expect(page.locator('#pathFilterCopyLink')).toBeAttached();
    await expect(page.locator('#searchFilterCopyLink')).toBeAttached();
    await expect(page.locator('#versionFilterCopyLink')).toBeAttached();
    await expect(page.locator('#typesExplorerCopyLink')).toBeAttached();
  });
});
