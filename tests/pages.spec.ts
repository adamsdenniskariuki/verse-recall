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

test.describe('installable offline app', () => {
  test.use({ serviceWorkers: 'allow' });

  test('installs, works offline and keeps opened Bible chapters', async ({ page, context, request }) => {
    const manifest = await (await request.get('/manifest.webmanifest')).json();
    expect(manifest).toMatchObject({ short_name: 'Verse Recall', start_url: '/', scope: '/', display: 'standalone' });
    for (const size of ['192x192', '512x512']) {
      const icon = manifest.icons.find((item: { sizes: string; type: string }) => item.sizes === size && item.type === 'image/png');
      expect((await request.get(icon.src)).ok()).toBe(true);
    }
    const worker = await request.get('/sw.js');
    expect(worker.ok()).toBe(true);
    expect(await worker.text()).not.toMatch(/__(VERSION|SHELL|SNAPSHOTS)__/);

    await page.goto('./');
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    await page.reload();
    expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    const reference = (await page.locator('#daily-heading').textContent())!;
    await page.locator('[data-action="daily"]').click();
    await expect(page.locator('.practice-heading')).toContainText(reference);
    const text = (await page.locator('blockquote.verse').textContent())!.trim();
    expect(text.length).toBeGreaterThan(10);

    await context.setOffline(true);
    await page.reload().catch(() => undefined);
    await expect(page.locator('.practice-heading')).toContainText(reference);
    await expect(page.locator('blockquote.verse')).toHaveText(text);
    await page.locator('[data-nav="library"]').click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await context.setOffline(false);
  });

  test('find a verse keeps working offline after the first search', async ({ page, context }) => {
    await page.goto('./');
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    await page.reload();
    await page.locator('nav [data-nav="find"]').click();
    await page.locator('#find-query').fill('lamp for my feet');
    await page.locator('#find-query').press('Enter');
    await expect(page.locator('.find-result h3').first()).toHaveText('Psalm 119:105');
    await context.setOffline(true);
    await page.reload().catch(() => undefined);
    await page.locator('nav [data-nav="find"]').click();
    await page.locator('#find-query').fill('John three sixteen');
    await page.locator('#find-query').press('Enter');
    await expect(page.locator('.find-result h3').first()).toHaveText('John 3:16');
    await page.locator('[data-find-query="lamp for my feet"]').first().click();
    await expect(page.locator('.find-result h3').first()).toHaveText('Psalm 119:105');
    await expect(page.locator('.find-result blockquote').first()).toContainText('lamp');
    await context.setOffline(false);
  });
});