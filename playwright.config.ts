import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  testMatch: ['**/*.spec.ts'],
  timeout: 60_000,
  use: { baseURL: 'http://localhost:5173', headless: true },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
