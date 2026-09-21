import { expect, test } from '@playwright/test';

test('Pages production assets and navigation use the custom-domain root', async ({ page, request }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400) errors.push(`${response.status()}: ${response.url()}`);
  });
  await page.goto('./');
  await expect(page).toHaveTitle('Verse Recall — Bible Memory');
  await expect(page.getByRole('link', { name: 'Verse Recall home', exact: true })).toBeVisible();
  const assets = await page.locator('script[src], link[rel="stylesheet"]').evaluateAll(nodes =>
    nodes.map(node => node.getAttribute('src') ?? node.getAttribute('href')!));
  expect(assets.length).toBeGreaterThanOrEqual(2);
  for (const asset of assets) {
    expect(asset).toMatch(/^\/assets\/[^/]+\.(js|css)$/);
    const response = await request.get(asset);
    expect(response.ok()).toBe(true);
    expect(response.headers()['content-type']).toMatch(/\.(js)$/.test(asset) ? /javascript/ : /text\/css/);
  }
  await page.locator('[data-nav="library"]').click();
  expect(new URL(page.url()).pathname).toBe('/');
  await page.locator('.verse-card [data-start]').first().click();
  await expect(page.locator('.steps [aria-current]')).toContainText('Read');
  await page.reload();
  await expect(page.locator('.steps [aria-current]')).toContainText('Read');
  await page.getByRole('link', { name: 'Verse Recall home', exact: true }).click();
  expect(new URL(page.url()).pathname).toBe('/');
  await expect(page.locator('.hero .lead')).toHaveText('Joshua 1:8');
  const cname = await request.get('/CNAME');
  expect(cname.ok()).toBe(true);
  expect((await cname.text()).trim()).toBe('verserecall.madebyfavor.com');
  expect(errors).toEqual([]);
});
