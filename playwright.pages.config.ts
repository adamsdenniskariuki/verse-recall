import { defineConfig } from '@playwright/test';
import base from './playwright.config';

export default defineConfig({
  ...base,
  testMatch: ['browser.spec.ts', 'pages.spec.ts'],
  use: { ...base.use, baseURL: 'http://127.0.0.1:4179/' },
  webServer: {
    command: 'npm run preview -- --port 4179 --strictPort',
    url: 'http://127.0.0.1:4179/',
    reuseExistingServer: false,
  },
});
