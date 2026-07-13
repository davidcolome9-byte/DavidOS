import { defineConfig } from '@playwright/test';

// Browser smoke tests run against the PRODUCTION build (dist/) served by
// vite preview — `npm run test:smoke` builds first. Mobile-first app, so
// the default viewport is a phone.
export default defineConfig({
  testDir: 'tests/smoke',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: {
    baseURL: 'http://localhost:4174',
    viewport: { width: 375, height: 812 },
  },
  webServer: {
    command: 'npm run preview -- --port 4174 --strictPort',
    port: 4174,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
