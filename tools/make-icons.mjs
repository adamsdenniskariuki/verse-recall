// Renders public/icons/icon.svg to the PNG sizes used by the web app manifest.
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const svg = await readFile('public/icons/icon.svg', 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage();
const sizes = [[180, 'apple-touch-icon.png', false], [192, 'icon-192.png', false], [512, 'icon-512.png', false], [512, 'maskable-512.png', true]];
for (const [size, name, maskable] of sizes) {
  await page.setViewportSize({ width: size, height: size });
  // Maskable icons fill the whole square so platform masks never show transparent corners.
  const art = maskable ? svg.replace('rx="11"', 'rx="0"').replace('scale(.6)', 'scale(.5)').replace('translate(9.6 9.6)', 'translate(12 12)') : svg;
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${art}`);
  await page.screenshot({ path: `public/icons/${name}`, omitBackground: true });
}
await browser.close();
