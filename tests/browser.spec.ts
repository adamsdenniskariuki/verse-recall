import { expect, test, type Page } from '@playwright/test';
import { passages, passageKey, personalPassage } from '../src/content';
import { freshState, STORAGE_KEY } from '../src/store';
import { finish, startRun } from '../src/engine';
import { makePersonal } from '../src/personal';
import { readFile } from 'node:fs/promises';

async function preferences(page: Page) {
  if (!await page.locator('#preferences-dialog').isVisible()) await page.locator('#open-preferences').click();
}
async function closePreferences(page: Page) {
  await page.locator('[data-dialog-action="close"]').click();
}
async function solveBank(page: Page) {
  // Match positions through public DOM controls, never call the game engine.
  const ids = await page.locator('[data-slot]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-slot')!));
  for (const id of ids) {
    await page.locator(`[data-slot="${id}"]`).click();
    await page.locator(`[data-token="${id}"]`).click();
  }
  await page.locator('[data-action="check-bank"]').click();
}

test('six playable passages and separate progress', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('./');
  for (const passage of passages) {
    await preferences(page);
    await page.locator('#translation').selectOption(passage.translation);
    await closePreferences(page);
    await page.locator('[data-start]').filter({ hasText: 'Practise' }).filter({ visible: true }).first().waitFor();
    await page.locator(`.verse-card [data-start="${passageKey(passage)}"]`).click();
    await expect(page.locator('blockquote')).toHaveText(passage.text);
    await page.locator('[data-action="next"]').click();
    await page.locator('[data-action="check-bank"]').click();
    await expect(page.locator('#feedback')).toContainText('Not quite yet');
    await solveBank(page);
    await expect(page.locator('.steps [aria-current]')).toContainText('Arrange');
    await solveBank(page);
    await expect(page.locator('#answer')).toBeVisible();
    await page.locator('#answer').fill(passage.text.toUpperCase().replace(/[’]/gu, "'"));
    await page.reload();
    await expect(page.locator('#answer')).toHaveValue(passage.text.toUpperCase().replace(/[’]/gu, "'"));
    await page.locator('[data-action="check-recall"]').click();
    await expect(page.locator('.results .lead')).toHaveText('An exact, unaided recall.');
    await expect(page.locator('.result-stats')).toContainText('Complete');
    await page.locator('.results [data-nav="today"]').click();
  }
  const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY);
  expect(Object.keys(saved.progress)).toHaveLength(6);
  expect(Object.values(saved.progress).every((value: unknown) => (value as { unaided: number }).unaided === 1)).toBe(true);
  expect(errors).toEqual([]);
});

test('theme preferences preserve typed recall', async ({ page }) => {
  const state = freshState();
  state.run = startRun(passages[0], 'review');
  await page.addInitScript(({ key, value }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, value); }, { key: STORAGE_KEY, value: JSON.stringify(state) });
  await page.goto('./');
  await page.locator('#answer').fill('I have hidden your word');
  await preferences(page);
  for (const preset of ['calm', 'study', 'focus']) {
    for (const colour of ['light', 'dark', 'system']) {
      await page.emulateMedia({ colorScheme: 'dark' });
      await page.locator('#preset').selectOption(preset);
      await page.locator('#colour').selectOption(colour);
      await expect(page.locator('html')).toHaveAttribute('data-preset', preset);
      await expect(page.locator('html')).toHaveAttribute('data-theme', colour === 'system' ? 'dark' : colour);
      await expect(page.locator('#answer')).toHaveValue('I have hidden your word');
    }
  }
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-preset', 'focus');
  await expect(page.locator('#answer')).toHaveValue('I have hidden your word');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await preferences(page);
  await page.locator('#translation').selectOption('bsb');
  await page.locator('#filter').selectOption('NT');
  await expect(page.locator('.practice-top .pill')).toContainText('WEB British');
  await expect(page.locator('#answer')).toHaveValue('I have hidden your word');
});

test('responsive layouts and accessible targets', async ({ page }) => {
  await page.goto('./');
  for (const viewport of [{ width: 390, height: 844 }, { width: 1024, height: 768 }, { width: 1440, height: 1000 }]) {
    await page.setViewportSize(viewport);
    for (const preset of ['calm', 'study', 'focus']) {
      for (const colour of ['light', 'dark']) {
        await preferences(page);
        await page.locator('#preset').selectOption(preset);
        await page.locator('#colour').selectOption(colour);
        await closePreferences(page);
        const layout = await page.evaluate(() => ({
          overflow: document.documentElement.scrollWidth > innerWidth,
          short: [...document.querySelectorAll('button, select, summary')].filter(node => {
            const r = node.getBoundingClientRect();
            return r.width > 0 && r.height < 44;
          }).length,
        }));
        expect(layout.overflow).toBe(false);
        expect(layout.short).toBe(0);
        await page.screenshot({ path: `verification/${preset}-${colour}-${viewport.width}.png`, fullPage: true });
      }
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(`.verse-card [data-start="${passageKey(passages[1])}"]`).click();
  await page.locator('[data-action="next"]').click();
  await solveBank(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'verification/phone-arrange.png', fullPage: true });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await page.locator('main .primary').evaluate(node => getComputedStyle(node).animationName)).toBe('none');
});

test('save corruption and write errors are visible', async ({ page }) => {
  await page.addInitScript(key => { localStorage.setItem(key, '{"broken":'); }, STORAGE_KEY);
  await page.goto('./');
  await expect(page.getByRole('alert')).toContainText('has not been overwritten');
  await page.locator('.hero [data-start]').click();
  expect(await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY)).toBe('{"broken":');
  await page.locator('[data-action="retry-save"]').click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException('Quota exceeded', 'QuotaExceededError'); }; });
  await page.locator('[data-action="next"]').click();
  await expect(page.getByRole('alert')).toContainText('Saving is unavailable');
  await expect(page.locator('.steps [aria-current]')).toContainText('Fill');
});

test('keyboard drag hints and unfiltered reviews', async ({ page }) => {
  const p = passages[0];
  const state = freshState();
  const progress = finish(p, { ...startRun(p, 'review'), answer: 'partial' }, undefined, Date.now() - 700_000);
  state.progress[progress.key] = progress;
  state.preferences.translation = 'bsb';
  state.preferences.filter = 'NT';
  await page.addInitScript(({ key, value }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, value); }, { key: STORAGE_KEY, value: JSON.stringify(state) });
  await page.goto('./');
  await expect(page.locator('.verse-card')).toHaveCount(1);
  await expect(page.locator('.review-list')).toContainText('Psalm 119:11 · WEB British');
  await page.locator('[data-review]').click();
  await expect(page.locator('#answer')).toBeVisible();
  await page.locator('[data-action="hint"]').click();
  await page.reload();
  await expect(page.locator('.hint-panel')).toContainText('assisted practice');
  await page.locator('#answer').fill(p.text);
  await page.locator('[data-action="check-recall"]').click();
  await expect(page.locator('.results .lead')).toContainText('not unaided mastery');
  await page.locator('.results [data-start]').click();
  await page.locator('[data-action="next"]').click();
  await page.locator('[data-token="2"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-slot="2"]')).toContainText('hidden');
  await page.locator('[data-token="6"]').dragTo(page.locator('[data-slot="6"]'));
  await expect(page.locator('[data-slot="6"]')).toContainText('my');
  await page.locator('[data-slot="2"]').click();
  await expect(page.locator('[data-token="2"]')).toBeVisible();
  await page.locator('[data-slot="2"]').evaluate(node => {
    const dataTransfer = new DataTransfer();
    dataTransfer.setData('text/plain', '999');
    node.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer }));
  });
  await expect(page.locator('#feedback')).toContainText('cannot be placed here');
  await expect(page.locator('[data-slot="2"]')).toContainText('3');
});

test('preferences dialog focus colour font and responsive sheet', async ({ page }) => {
  const seed = freshState();
  seed.run = { ...startRun(passages[0], 'review'), answer: 'A draft to keep' };
  await page.addInitScript(({ key, value }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, value); }, { key: STORAGE_KEY, value: JSON.stringify(seed) });
  await page.goto('./');
  for (const viewport of [{ width: 390, height: 844 }, { width: 1024, height: 768 }, { width: 1440, height: 1000 }]) {
    await page.setViewportSize(viewport);
    await preferences(page);
    await expect(page.getByRole('dialog', { name: 'Preferences' })).toBeVisible();
    await expect(page.locator('[data-dialog-action="close"]')).toBeFocused();
    await page.locator('#colour').selectOption(viewport.width === 1024 ? 'dark' : 'light');
    for (const accent of ['neutral', 'rose']) {
      await page.locator('#accent').selectOption(accent);
      await expect(page.locator('html')).toHaveAttribute('data-accent', accent);
      const neutral = await page.evaluate(() => {
        const style = getComputedStyle(document.documentElement);
        return style.getPropertyValue('--cp-accent').trim() === style.getPropertyValue('--cp-text').trim();
      });
      expect(neutral).toBe(accent === 'neutral');
    }
    await page.locator('#accent').selectOption('neutral');
    for (const font of ['segoe', 'aptos', 'calibri', 'mono']) {
      await page.locator('#font').selectOption(font);
      await expect(page.locator('html')).toHaveAttribute('data-font', font);
    }
    expect(await page.locator('.font-preview').evaluate(node => getComputedStyle(node).fontFamily)).toContain('Consolas');
    await expect(page.locator('#answer')).toHaveValue('A draft to keep');
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => document.querySelector('#preferences-dialog')!.contains(document.activeElement))).toBe(true);
    }
    const box = await page.locator('#preferences-dialog').boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
    expect(box!.height).toBeLessThanOrEqual(viewport.height);
    expect(await page.locator('#preferences-dialog').evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    await page.screenshot({ path: `verification/preferences-${viewport.width}.png`, fullPage: true });
    await page.keyboard.press('Escape');
    await expect(page.locator('#preferences-dialog')).not.toBeVisible();
    await expect(page.locator('#open-preferences')).toBeFocused();
  }
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'neutral');
  await expect(page.locator('html')).toHaveAttribute('data-font', 'mono');
  await expect(page.locator('#answer')).toHaveValue('A draft to keep');
});

test('personal editor plays and safely revises text', async ({ page }) => {
  const reference = 'Sample <img src=x onerror=alert(1)>';
  const text = 'Keep these original words close.';
  await page.goto('./');
  await preferences(page);
  await page.locator('#personal-panel summary').click();
  await page.locator('#verse-reference').fill(reference);
  await page.locator('#verse-translation').fill('Personal <b>notes</b>');
  await page.locator('#verse-edition').fill('First edition');
  await page.locator('#verse-testament').selectOption('NT');
  await page.locator('#verse-text').fill(text);
  await page.getByRole('button', { name: 'Preview verse', exact: true }).click();
  await expect(page.locator('#import-preview')).toContainText('1 new');
  expect(await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY)).toBeNull();
  await page.locator('[data-dialog-action="confirm-import"]').click();
  await expect(page.locator('#dialog-message')).toContainText('saved on this device');
  await closePreferences(page);
  await expect(page.locator('.verse-card')).toHaveCount(1);
  await expect(page.locator('.verse-card h3')).toHaveText(reference);
  await expect(page.locator('img')).toHaveCount(0);
  const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY);
  const id = stored.personal[0].id;
  await page.locator('.verse-card [data-start]').click();
  await expect(page.locator('.practice-heading')).toContainText('not independently verified');
  await expect(page.locator('blockquote')).toHaveText(text);
  await page.screenshot({ path: 'verification/personal-verse-phone.png', fullPage: true });
  await page.locator('[data-action="next"]').click();
  await solveBank(page);
  await solveBank(page);
  await page.locator('#answer').fill(text);
  await page.locator('[data-action="check-recall"]').click();
  await expect(page.locator('.results .lead')).toHaveText('An exact, unaided recall.');
  await preferences(page);
  await page.locator('#personal-panel summary').click();
  await page.locator('#edit-verse').selectOption(id);
  await page.locator('#verse-text').fill('Keep these revised words close.');
  await page.getByRole('button', { name: 'Preview verse', exact: true }).click();
  await expect(page.locator('#import-preview')).toContainText('previous progress/reviews will be reset');
  await page.locator('[data-dialog-action="cancel-import"]').click();
  expect(await page.evaluate(key => Object.keys(JSON.parse(localStorage.getItem(key)!).progress).length, STORAGE_KEY)).toBe(1);
  await page.getByRole('button', { name: 'Preview verse', exact: true }).click();
  await page.locator('[data-dialog-action="confirm-import"]').click();
  const edited = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY);
  expect(edited.personal[0].id).toBe(id);
  expect(edited.personal[0].revision).not.toBe(stored.personal[0].revision);
  expect(edited.progress).toEqual({});
  expect(edited.run).toBeNull();
  await page.locator('#translation').selectOption('webbe');
  await closePreferences(page);
  await expect(page.locator('.verse-card')).toHaveCount(3);
});

test('bulk import and private backup transfer round trip', async ({ page, browser }) => {
  const seed = freshState();
  const verse = await makePersonal({
    reference: 'Private practice 1', text: 'Keep these private sample words close.',
    translationLabel: 'Original sample', edition: '1', testament: 'OT',
  });
  seed.personal = [verse];
  const source = personalPassage(verse);
  seed.preferences = { ...seed.preferences, translation: 'personal', accent: 'neutral', font: 'calibri', preset: 'study' };
  seed.run = { ...startRun(source, 'review'), answer: 'Keep these', hints: 1, exposed: true };
  const progress = finish(source, { ...startRun(source, 'review'), answer: source.text }, undefined, 1000);
  seed.progress[progress.key] = progress;
  await page.addInitScript(({ key, value }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, value); }, { key: STORAGE_KEY, value: JSON.stringify(seed) });
  await page.goto('./');
  await preferences(page);
  await page.locator('#transfer-panel summary').click();
  const downloadEvent = page.waitForEvent('download');
  await page.locator('[data-dialog-action="export"]').click();
  const download = await downloadEvent;
  const bytes = await readFile((await download.path())!);
  const other = await browser.newContext({ acceptDownloads: true, viewport: { width: 390, height: 844 } });
  try {
    const dest = await other.newPage();
    await dest.goto(page.url());
    await preferences(dest);
    await dest.locator('#transfer-panel summary').click();
    await dest.locator('#import-file').setInputFiles({ name: 'private-backup.json', mimeType: 'application/json', buffer: bytes });
    await expect(dest.locator('#import-preview')).toContainText('1 new');
    await dest.screenshot({ path: 'verification/import-preview-phone.png', fullPage: true });
    expect(await dest.evaluate(key => localStorage.getItem(key), STORAGE_KEY)).toBeNull();
    await dest.locator('[data-dialog-action="confirm-import"]').click();
    await expect(dest.locator('#dialog-message')).toContainText('saved on this device');
    expect(await dest.evaluate(key => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY)).toEqual(seed);
    await closePreferences(dest);
    await expect(dest.locator('#answer')).toHaveValue('Keep these');
    await expect(dest.locator('.hint-panel')).toBeVisible();
    await preferences(dest);
    await dest.locator('#transfer-panel summary').click();
    const malformed = { name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"__proto__":{"polluted":true}}') };
    await dest.locator('#import-file').setInputFiles(malformed);
    await expect(dest.locator('#dialog-message')).toHaveAttribute('role', 'alert');
    expect(await dest.evaluate(key => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY)).toEqual(seed);
    const batch = Buffer.from(JSON.stringify({
      format: 'wordkeep-verses', version: 1,
      verses: [{ reference: 'R'.repeat(120), text: 'These are more original sample words.', translationLabel: 'Personal sample', edition: '2', testament: 'NT' }],
    }));
    await dest.locator('#import-file').setInputFiles({ name: 'verses.json', mimeType: 'application/json', buffer: batch });
    await expect(dest.locator('#import-preview')).toContainText('1 new');
    await dest.locator('[data-dialog-action="confirm-import"]').click();
    await expect(dest.locator('#dialog-message')).toContainText('saved on this device');
    const merged = await dest.evaluate(key => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY);
    expect(merged.personal).toHaveLength(2);
    expect(merged.run).toEqual(seed.run);
    expect(merged.progress).toEqual(seed.progress);
    await closePreferences(dest);
    await dest.locator('[data-nav="library"]').click();
    expect(await dest.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { await other.close(); }
});

test('default font covers the entire app and honors saved choices', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('html')).toHaveAttribute('data-font', 'mono');
  const assertFont = async (family: string) => {
    const fonts = await page.locator('body, h1, h2, h3, p, nav, button, input, select, textarea, dialog, summary, .word, .slot').evaluateAll(nodes =>
      nodes.filter(node => node.getClientRects().length > 0 && node.checkVisibility()).flatMap(node =>
        node instanceof HTMLInputElement && node.type === 'file'
          ? [getComputedStyle(node).fontFamily, getComputedStyle(node, '::file-selector-button').fontFamily]
          : [getComputedStyle(node).fontFamily]));
    expect(fonts.length).toBeGreaterThan(5);
    expect(fonts.every(font => font.includes(family))).toBe(true);
  };
  await assertFont('Consolas');
  await expect(page.locator('.hero .lead')).toHaveText('Joshua 1:8');
  await preferences(page);
  await page.locator('#personal-panel summary').click();
  await page.locator('#transfer-panel summary').click();
  await assertFont('Consolas');
  await expect(page.locator('.font-preview')).toHaveText('Joshua 1:8');
  await closePreferences(page);
  await page.locator('.hero [data-start]').click();
  await assertFont('Consolas');
  await page.locator('[data-action="next"]').click();
  await assertFont('Consolas');
  await preferences(page);
  await page.locator('#font').selectOption('segoe');
  await assertFont('Segoe UI');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-font', 'segoe');
  await expect(page.locator('.steps [aria-current]')).toContainText('Fill');
  await assertFont('Segoe UI');
});

test('accent palettes contrast persist and preserve practice', async ({ page }) => {
  const state = freshState();
  state.run = { ...startRun(passages[0], 'review'), answer: 'Keep this answer', hints: 1, exposed: true };
  await page.addInitScript(({ key, value }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, value); }, { key: STORAGE_KEY, value: JSON.stringify(state) });
  await page.goto('./');
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'purple');
  const colors: Record<string, [string, string]> = {
    rose: ['#b11f4b', '#fd8ea1'], neutral: ['#242424', '#dedede'],
    blue: ['#1d4ed8', '#93c5fd'], green: ['#166534', '#86efac'], purple: ['#6d28d9', '#c4b5fd'],
  };
  const presets = [
    { name: 'calm', width: 390, height: 844 },
    { name: 'study', width: 1024, height: 768 },
    { name: 'focus', width: 1440, height: 1000 },
  ];
  for (const preset of presets) {
    await page.setViewportSize({ width: preset.width, height: preset.height });
    await preferences(page);
    await page.locator('#preset').selectOption(preset.name);
    for (const mode of ['light', 'dark']) {
      await page.locator('#colour').selectOption(mode);
      for (const accent of Object.keys(colors)) {
        await page.locator('#accent').selectOption(accent);
        const metrics = await page.evaluate(() => {
          const root = getComputedStyle(document.documentElement);
          const probe = document.createElement('span');
          probe.style.display = 'none';
          document.body.append(probe);
          const color = (name: string): number[] => {
            probe.style.color = `var(${name})`;
            return getComputedStyle(probe).color.match(/[\d.]+/g)!.map(Number);
          };
          const luminance = (rgb: number[]) => {
            const c = rgb.slice(0, 3).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
            return .2126 * c[0] + .7152 * c[1] + .0722 * c[2];
          };
          const ratio = (a: number[], b: number[]) => {
            const x = luminance(a), y = luminance(b);
            return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
          };
          const accentColor = color('--cp-accent'), foreground = color('--cp-accent-fg');
          const soft = color('--cp-accent-soft'), bg = color('--cp-bg'), surface = color('--cp-surface');
          const composite = (background: number[]) => soft.slice(0, 3).map((c, i) => c * (soft[3] ?? 1) + background[i] * (1 - (soft[3] ?? 1)));
          const result = {
            accent: root.getPropertyValue('--cp-accent').trim(),
            normal: ratio(accentColor, foreground), hover: ratio(color('--cp-accent-hover'), foreground),
            soft: Math.min(ratio(accentColor, composite(bg)), ratio(accentColor, composite(surface))),
            focus: Math.min(ratio(color('--cp-focus'), bg), ratio(color('--cp-focus'), surface)),
            overflow: document.documentElement.scrollWidth > innerWidth,
          };
          probe.remove();
          return result;
        });
        expect(metrics.accent).toBe(colors[accent][mode === 'light' ? 0 : 1]);
        expect(metrics.normal, `${accent} ${mode} normal`).toBeGreaterThanOrEqual(4.5);
        expect(metrics.hover, `${accent} ${mode} hover`).toBeGreaterThanOrEqual(4.5);
        expect(metrics.soft, `${accent} ${mode} soft`).toBeGreaterThanOrEqual(4.5);
        expect(metrics.focus, `${accent} ${mode} focus`).toBeGreaterThanOrEqual(3);
        expect(metrics.overflow).toBe(false);
        await expect(page.locator('#answer')).toHaveValue('Keep this answer');
      }
    }
    await page.screenshot({ path: `verification/purple-consolas-${preset.width}.png`, fullPage: true });
    await closePreferences(page);
  }
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'purple');
  await expect(page.locator('#answer')).toHaveValue('Keep this answer');
  await expect(page.locator('.hint-panel')).toBeVisible();
  await preferences(page);
  await page.locator('#accent').selectOption('blue');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'blue');
});

test('focus indicators follow keyboard and pointer input', async ({ page, browser }) => {
  const appearance = async (target: ReturnType<Page['locator']>) => target.evaluate(node => {
    const css = getComputedStyle(node);
    return { width: css.outlineWidth, style: css.outlineStyle, offset: css.outlineOffset, shadow: css.boxShadow, border: css.borderTopWidth };
  });
  const keyboardRing = async (target: ReturnType<Page['locator']>) => {
    await expect(target).toBeFocused();
    const css = await appearance(target);
    expect(css.width).toBe('1px');
    expect(css.style).toBe('solid');
    expect(css.offset).toBe('2px');
    expect(css.shadow).toBe('none');
  };
  const pointerRing = async (target: ReturnType<Page['locator']>) => {
    await expect(target).toBeFocused();
    const css = await appearance(target);
    expect(css.style).toBe('none');
    expect(css.width).toBe('0px');
    expect(css.shadow).toBe('none');
  };
  await page.goto('./');
  for (const [preset, width, height] of [['calm', 390, 844], ['study', 1024, 768], ['focus', 1440, 1000]] as const) {
    await page.setViewportSize({ width, height });
    for (const mode of ['light', 'dark']) {
      for (const accent of ['purple', 'blue', 'green', 'rose', 'neutral']) {
        await preferences(page);
        await pointerRing(page.locator('[data-dialog-action="close"]'));
        await page.locator('#preset').selectOption(preset);
        await page.locator('#colour').selectOption(mode);
        await page.locator('#accent').selectOption(accent);
        await closePreferences(page);
        await pointerRing(page.locator('#open-preferences'));
        await page.keyboard.press('Shift+Tab');
        await keyboardRing(page.locator('[data-nav="library"]'));
        await page.keyboard.press('Tab');
        await keyboardRing(page.locator('#open-preferences'));
        await page.keyboard.press('Enter');
        await keyboardRing(page.locator('[data-dialog-action="close"]'));
        await page.keyboard.press('Tab');
        await keyboardRing(page.locator('#translation'));
        await page.keyboard.press('Escape');
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      }
    }
  }
  await preferences(page);
  await page.locator('#personal-panel summary').click();
  const input = page.locator('#verse-reference');
  await input.click();
  await pointerRing(input);
  await page.keyboard.type('Keep this input');
  await keyboardRing(input);
  await expect(input).toHaveValue('Keep this input');
  await closePreferences(page);
  await page.locator('.hero [data-start]').click();
  await page.locator('[data-action="next"]').click();
  await page.locator('[data-slot]').first().click();
  await expect(page.locator('.slot.selected')).toHaveAttribute('aria-pressed', 'true');
  await pointerRing(page.locator('.slot.selected'));
  expect((await appearance(page.locator('.slot.selected'))).border).toBe('1px');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await keyboardRing(page.locator('.slot.selected'));
  await solveBank(page);
  await solveBank(page);
  await page.locator('#answer').click();
  await pointerRing(page.locator('#answer'));
  await page.keyboard.type('Keep the caret and typed answer');
  await keyboardRing(page.locator('#answer'));
  await expect(page.locator('#answer')).toHaveValue('Keep the caret and typed answer');
  await expect(page.locator('footer')).toContainText('Local prototype · Working name · No tracking');
  const touch = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  try {
    const phone = await touch.newPage();
    await phone.goto(page.url());
    await phone.locator('#open-preferences').tap();
    await pointerRing(phone.locator('[data-dialog-action="close"]'));
    await phone.locator('#personal-panel summary').tap();
    await phone.locator('#verse-reference').tap();
    await pointerRing(phone.locator('#verse-reference'));
    await phone.locator('#verse-reference').fill('Touch still works');
    await expect(phone.locator('#verse-reference')).toHaveValue('Touch still works');
    await phone.keyboard.press('Tab');
    await keyboardRing(phone.locator('#verse-testament'));
  } finally { await touch.close(); }
});

test('Verse Recall branding preserves legacy saves and backup formats', async ({ page }) => {
  const seed = freshState();
  seed.run = { ...startRun(passages[0], 'review'), answer: 'Preserve this older saved answer' };
  seed.preferences = { ...seed.preferences, font: 'calibri', accent: 'blue' };
  await page.addInitScript(value => {
    if (!localStorage.getItem('wordkeep.prototype.v2')) localStorage.setItem('wordkeep.prototype.v2', value);
  }, JSON.stringify(seed));
  await page.goto('./');
  await expect(page).toHaveTitle('Verse Recall — Bible Memory');
  await expect(page.getByRole('link', { name: 'Verse Recall home', exact: true })).toBeVisible();
  await expect(page.locator('footer strong')).toHaveText('Verse Recall');
  await expect(page.locator('#answer')).toHaveValue(seed.run.answer);
  await expect(page.locator('footer')).toContainText('Joshua 1:8');
  await preferences(page);
  await page.locator('#transfer-panel summary').click();
  await expect(page.locator('#transfer-panel')).toContainText('open Verse Recall');
  expect(await page.locator('body').textContent()).not.toContain('WordKeep');
  const exported = page.waitForEvent('download');
  await page.locator('[data-dialog-action="export"]').click();
  const backup = await exported;
  expect(backup.suggestedFilename()).toBe('verse-recall-backup.verse-recall.json');
  const raw = await readFile((await backup.path())!);
  expect(JSON.parse(raw.toString())).toMatchObject({ format: 'wordkeep-backup', version: 2, state: seed });
  const templateEvent = page.waitForEvent('download');
  await page.locator('[data-dialog-action="template"]').click();
  const template = await templateEvent;
  expect(template.suggestedFilename()).toBe('verse-recall-verses-template.json');
  expect(JSON.parse(await readFile((await template.path())!, 'utf8')).format).toBe('wordkeep-verses');
  await page.locator('#import-file').setInputFiles({
    name: 'wordkeep-backup.wordkeep.json', mimeType: 'application/json', buffer: raw,
  });
  await expect(page.locator('#import-preview')).toContainText('Review before importing');
  await page.locator('[data-dialog-action="confirm-import"]').click();
  await expect(page.locator('#dialog-message')).toContainText('saved on this device');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('wordkeep.prototype.v2')!))).toEqual(seed);
  await closePreferences(page);
  await page.reload();
  await expect(page.locator('#answer')).toHaveValue(seed.run.answer);
});

test('Bible thought logo adapts without changing accessible branding', async ({ page }) => {
  await page.goto('./');
  const logo = page.locator('.brand-mark svg');
  await expect(logo).toHaveAttribute('viewBox', '0 0 48 48');
  await expect(logo).toHaveAttribute('aria-hidden', 'true');
  await expect(logo).toHaveAttribute('focusable', 'false');
  for (const part of ['book', 'cross', 'thought']) {
    const path = logo.locator(`[data-part="${part}"]`);
    await expect(path).toHaveCount(1);
    const bounds = await path.evaluate(node => {
      const box = (node as SVGGraphicsElement).getBBox();
      return { width: box.width, height: box.height };
    });
    expect(bounds.width).toBeGreaterThan(0);
    expect(bounds.height).toBeGreaterThan(0);
  }
  await expect(logo.locator('circle')).toHaveCount(2);
  await expect(page.getByRole('link', { name: 'Verse Recall home', exact: true })).toBeVisible();
  const previews: { mode: string; background: string; text: string; accent: string }[] = [];
  for (const mode of ['light', 'dark']) {
    for (const accent of ['blue', 'green', 'rose', 'neutral', 'purple']) {
      await preferences(page);
      await page.locator('#colour').selectOption(mode);
      await page.locator('#accent').selectOption(accent);
      await closePreferences(page);
      const palette = await page.locator('.brand-mark').evaluate(node => {
        const css = getComputedStyle(node);
        const root = getComputedStyle(document.documentElement);
        return {
          color: css.color, stroke: getComputedStyle(node.querySelector('[data-part="book"]')!).stroke,
          expected: root.getPropertyValue('--cp-accent').trim(),
          background: getComputedStyle(document.body).backgroundColor, text: getComputedStyle(document.body).color,
        };
      });
      expect(palette.stroke).toBe(palette.color);
      const expected = await logo.evaluate((node, value) => {
        const probe = document.createElement('span'); probe.style.color = value;
        node.parentElement!.append(probe); const color = getComputedStyle(probe).color; probe.remove(); return color;
      }, palette.expected);
      expect(palette.color).toBe(expected);
      if (accent === 'purple') previews.push({ mode, background: palette.background, text: palette.text, accent: palette.color });
    }
    for (const width of [390, 1024, 1440]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const brand = await page.locator('.brand').boundingBox();
      const button = await page.locator('#open-preferences').boundingBox();
      expect(brand!.x + brand!.width).toBeLessThanOrEqual(button!.x);
      await page.screenshot({ path: `verification/verse-recall-logo-${mode}-${width}.png`, fullPage: true });
    }
    for (const size of [24, 36, 48]) {
      await page.locator('.brand-mark').evaluate((node, size) => {
        (node as HTMLElement).style.width = `${size}px`;
        (node as HTMLElement).style.height = `${size}px`;
      }, size);
      const dimensions = await logo.boundingBox();
      expect(dimensions!.width).toBe(size);
      expect(dimensions!.height).toBe(size);
    }
    await page.locator('.brand-mark').evaluate(node => node.removeAttribute('style'));
  }
  await expect(page.locator('.hero .lead')).toHaveText('Joshua 1:8');
  await page.setViewportSize({ width: 900, height: 560 });
  await page.evaluate(previews => {
    const svg = document.querySelector('.brand-mark svg')!.outerHTML;
    document.body.replaceChildren();
    for (const preview of previews) {
      const row = document.createElement('section');
      Object.assign(row.style, { background: preview.background, color: preview.text, padding: '24px 32px', height: '280px' });
      const heading = document.createElement('h2');
      heading.textContent = `Verse Recall · ${preview.mode} · original vector mark`;
      row.append(heading);
      const samples = document.createElement('div');
      Object.assign(samples.style, { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '32px' });
      for (const size of [24, 36, 48, 144]) {
        const sample = document.createElement('div');
        sample.style.textAlign = 'center';
        const mark = document.createElement('div');
        Object.assign(mark.style, { width: `${size}px`, height: `${size}px`, color: preview.accent, margin: 'auto' });
        mark.innerHTML = svg;
        const caption = document.createElement('div'); caption.textContent = `${size}px`; caption.style.marginTop = '8px';
        sample.append(mark, caption); samples.append(sample);
      }
      row.append(samples); document.body.append(row);
    }
  }, previews);
  await page.screenshot({ path: 'verification/verse-recall-logo-closeup.png' });
});

async function chooseBibleVerse(page: Page, translation: string, book: string, chapter: string, verse: string) {
  if (!await page.locator('#bible-picker').isVisible()) await page.locator('[data-action="browse-bibles"]').click();
  await page.locator('#bible-translation').selectOption(translation);
  await page.locator('#bible-testament').selectOption('both');
  await page.locator('#bible-book-search').fill(book);
  await page.locator('#bible-chapter').selectOption(chapter);
  await page.locator('#bible-start').selectOption(verse);
  await expect(page.locator('[data-bible-action="add"]')).toBeEnabled();
}

test('Bible picker adds official OT and NT verses and transfers progress', async ({ page, browser }) => {
  const bibleRequests: string[] = [];
  await page.route('**/bibles/**/*.json', async route => {
    await new Promise(resolve => setTimeout(resolve, 80));
    await route.continue();
  });
  page.on('request', request => { if (request.url().includes('/bibles/')) bibleRequests.push(request.url()); });
  await page.goto('./');
  await expect(page.locator('.verse-card')).toHaveCount(3);
  expect(bibleRequests).toEqual([]);
  for (const translation of ['webbe', 'bsb']) {
    await chooseBibleVerse(page, translation, 'Isaiah', '40', '31');
    await expect(page.locator('#bible-preview h3')).toHaveText('Isaiah 40:31');
    await expect(page.locator('#bible-preview blockquote')).toContainText(translation === 'webbe' ? 'They will mount up' : 'they will mount up');
    await page.locator('[data-bible-action="add"]').click();
    await expect(page.locator('#bible-status')).toContainText('added to');
    await page.locator('[data-bible-action="add"]').click();
    await expect(page.locator('#bible-status')).toContainText('already in your library');
    await page.locator('#bible-testament').selectOption('NT');
    await expect(page.locator('#bible-book')).toBeDisabled();
    await expect(page.locator('#bible-status')).toContainText('No books match');
    await chooseBibleVerse(page, translation, 'John', '3', '16');
    await expect(page.locator('#bible-preview h3')).toHaveText('John 3:16');
    await expect(page.locator('#bible-preview blockquote')).toContainText(translation === 'webbe' ? 'only born Son' : 'one and only Son');
    await page.locator('[data-bible-action="add"]').click();
    await expect(page.locator('#bible-status')).toContainText('added to');
    await page.locator('[data-bible-action="close"]').click();
  }
  const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY);
  expect(saved.official).toHaveLength(4);
  expect(saved.personal).toEqual([]);
  expect(bibleRequests.filter(url => url.endsWith('/manifest.json'))).toHaveLength(1);
  expect(bibleRequests.length).toBeLessThan(15);
  await page.reload();
  const card = page.locator('.verse-card').filter({ has: page.getByRole('heading', { name: 'John 3:16', exact: true }) });
  await card.locator('[data-start]').click();
  const text = (await page.locator('blockquote').textContent())!;
  await expect(page.locator('.practice-heading')).toContainText('Official Bible selection');
  await page.locator('[data-action="next"]').click();
  await solveBank(page);
  await solveBank(page);
  await page.locator('#answer').fill(text);
  await page.locator('[data-action="check-recall"]').click();
  await expect(page.locator('.results .lead')).toContainText('unaided');
  await preferences(page);
  await page.locator('#transfer-panel summary').click();
  const downloaded = page.waitForEvent('download');
  await page.locator('[data-dialog-action="export"]').click();
  const file = await downloaded;
  const bytes = await readFile((await file.path())!);
  const nextDevice = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const fresh = await nextDevice.newPage();
    await fresh.goto(page.url());
    await preferences(fresh);
    await fresh.locator('#transfer-panel summary').click();
    await fresh.locator('#import-file').setInputFiles({ name: 'verse-recall-backup.verse-recall.json', mimeType: 'application/json', buffer: bytes });
    await expect(fresh.locator('#import-preview')).toContainText('4 source-validated official Bible selection');
    await fresh.locator('[data-dialog-action="confirm-import"]').click();
    await expect(fresh.locator('#dialog-message')).toContainText('saved on this device');
    await closePreferences(fresh);
    await expect(fresh.locator('.results .lead')).toContainText('unaided');
    const restored = await fresh.evaluate(key => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY);
    expect(restored.official).toHaveLength(4);
    expect(Object.values(restored.progress).map(p => (p as { unaided: number }).unaided)).toEqual([1]);
    await fresh.reload();
    await expect(fresh.locator('.results .lead')).toContainText('unaided');
  } finally { await nextDevice.close(); }
});

test('Bible picker shows loading errors and rejects oversized ranges', async ({ page }) => {
  await page.route('**/bibles/**/manifest.json', route => route.abort());
  await page.goto('./');
  await page.locator('[data-action="browse-bibles"]').click();
  await expect(page.locator('#bible-picker [role="alert"]')).toContainText('Check your connection');
  await page.unroute('**/bibles/**/manifest.json');
  await page.locator('[data-bible-action="retry"]').click();
  await expect(page.locator('[data-bible-action="add"]')).toBeEnabled();
  await page.locator('#bible-end').selectOption('31');
  await expect(page.locator('#bible-status')).toContainText('exceeds the exercise limit');
  await expect(page.locator('[data-bible-action="add"]')).toBeDisabled();
  await page.locator('#bible-end').selectOption('2');
  await expect(page.locator('[data-bible-action="add"]')).toBeEnabled();
  await expect(page.locator('#bible-preview h3')).toHaveText('Genesis 1:1–2');
  for (const width of [390, 1024, 1440]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    expect(await page.locator('#bible-picker').evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    await page.screenshot({ path: `verification/bible-picker-${width}.png`, fullPage: true });
  }
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-action="browse-bibles"]')).toBeFocused();
  expect(await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY)).toBeNull();
});
