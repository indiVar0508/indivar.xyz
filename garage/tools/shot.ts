// Saves screenshots of a running garage for visual review.
// Usage: node tools/shot.ts [url] [outDir] [action ...]
// Actions run in order, one screenshot each: car:<id>, part:<id>, back, close.
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const [url = 'http://localhost:5173/?qa&quality=high', out = 'test-results/shots', ...actions] = process.argv.slice(2);
mkdirSync(out, { recursive: true });

// The full Chromium build (not the headless shell) can use the real GPU; the shell falls back to SwiftShader,
// which is too slow for this scene.
const browser = await chromium.launch({ channel: 'chromium', args: ['--use-angle=gl', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('console', (message) => message.type() === 'error' && console.error('console error:', message.text()));
page.on('pageerror', (error) => console.error('page error:', error.message));

await page.goto(url);
await page.waitForFunction(() => document.body.dataset.ready === 'true', null, { timeout: 180_000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}/0-showroom.png` });

for (const [index, action] of actions.entries()) {
  await page.evaluate((step) => {
    const store = (window as unknown as { garage: { getState(): { dispatch(a: unknown): void } } }).garage.getState();
    const [kind, id] = step.split(':');
    if (kind === 'car') store.dispatch({ type: 'select-car', id });
    else if (kind === 'part') store.dispatch({ type: 'select-part', id });
    else if (kind === 'back') store.dispatch({ type: 'back' });
    else store.dispatch({ type: 'close-hood' });
  }, action);
  await page.waitForTimeout(2200);
  await page.screenshot({ path: `${out}/${index + 1}-${action.replace(':', '-')}.png` });
}
await browser.close();
