import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', use: { baseURL: 'http://127.0.0.1:4177',
    launchOptions: process.env.MOO_BROWSER_EXECUTABLE ? { executablePath: process.env.MOO_BROWSER_EXECUTABLE } : {} },
  webServer: { command: 'node scripts/serve.mjs', port: 4177, reuseExistingServer: false },
});
