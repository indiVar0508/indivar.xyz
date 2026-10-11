import { defineConfig, devices } from '@playwright/test';

const external = process.env.GARAGE_URL;

export default defineConfig({
  testDir: 'tests',
  timeout: 180_000,
  expect: { timeout: 60_000 },
  outputDir: 'test-results',
  use: {
    baseURL: external ?? 'http://localhost:4176/',
    trace: 'retain-on-failure',
    // The full Chromium build can use the real GPU; the headless shell falls back to SwiftShader, which is too slow here.
    channel: 'chromium',
    launchOptions: { args: ['--use-angle=gl', '--ignore-gpu-blocklist'] },
  },
  webServer: external ? undefined : { command: 'npm run build && npx vite preview --port 4176 --strictPort', url: 'http://localhost:4176/', reuseExistingServer: true, timeout: 240_000 },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
});
