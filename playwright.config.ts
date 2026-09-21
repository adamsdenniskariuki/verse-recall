import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  testMatch: 'browser.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 5000 },
  reporter: 'list',
  use: {
    baseURL: process.env.WORDKEEP_TEST_URL ?? 'http://127.0.0.1:5180/verse-recall/',
    browserName: 'chromium',
    headless: true,
    viewport: { width: 390, height: 844 },
    trace: 'retain-on-failure',
  },
  webServer: process.env.WORDKEEP_TEST_URL ? undefined : {
    command: 'npm run dev -- --port 5180 --strictPort',
    url: 'http://127.0.0.1:5180/verse-recall/',
    reuseExistingServer: false,
  },
});
