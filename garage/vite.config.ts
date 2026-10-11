import { readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { garagePlugin } from './build/garagePlugin.ts';
import { garageCanonical } from './build/siteUrl.ts';

const siteConfig = readFileSync(new URL('../_config.yml', import.meta.url), 'utf8');
const canonical = garageCanonical(siteConfig, process.env.SITE_BASEURL || undefined);

export default defineConfig({
  base: './',
  plugins: [react(), garagePlugin({ canonical })],
  build: { target: 'es2022', chunkSizeWarningLimit: 1600 },
  test: { environment: 'node', include: ['src/**/*.test.ts', 'build/**/*.test.ts'] },
});
