import { defineConfig } from '@playwright/test';
import base from './playwright.config';

export default defineConfig({
  ...base,
  testMatch: ['browser.spec.ts', 'pages.spec.ts'],
  // Service workers are blocked so request mocks in the shared browser suite still apply; pages.spec.ts opts in.
  use: { ...base.use, baseURL: 'http://127.0.0.1:4179/', serviceWorkers: 'block' },
  webServer: {
    command: 'npm run preview -- --port 4179 --strictPort',
    url: 'http://127.0.0.1:4179/',
    reuseExistingServer: false,
  },
});
