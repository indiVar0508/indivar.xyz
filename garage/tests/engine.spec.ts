import { expect, test, type Page } from '@playwright/test';

// The engine is heard: the test needs the AudioContext to run without waiting for a "real" gesture.
test.use({ launchOptions: { args: ['--use-angle=gl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] } });

type QaWindow = { garage: { getState(): Record<string, unknown> }; garageEngine: { rpm: number; status: string } };

async function open(page: Page, query = '?qa&quality=high'): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`./${query}`);
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true', { timeout: 150_000 });
  await expect(page.locator('.loader')).toHaveCount(0);
  return errors;
}

const rpm = (page: Page) => page.evaluate(() => (window as unknown as QaWindow).garageEngine.rpm);
const state = (page: Page, key: string) => page.evaluate((k) => (window as unknown as QaWindow).garage.getState()[k], key);

async function hold(page: Page, name: string, ms: number): Promise<void> {
  const box = (await page.getByRole('button', { name }).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(ms);
}

test('starts the engine, revs it, lets it fall back to idle, and stops it', async ({ page }) => {
  const errors = await open(page);
  await page.getByRole('button', { name: 'Start engine' }).click();
  await expect(page.getByRole('button', { name: 'Stop engine' })).toBeVisible({ timeout: 20_000 });
  expect(await state(page, 'soundOn')).toBe(true);
  await expect.poll(() => rpm(page), { timeout: 10_000 }).toBeGreaterThan(1200);
  await expect(page.locator('.tach')).toContainText('rpm');

  await hold(page, 'Hold to rev', 200);
  await expect.poll(() => rpm(page), { timeout: 5_000 }).toBeGreaterThan(5000);
  await page.mouse.up();
  await expect.poll(() => rpm(page), { timeout: 10_000 }).toBeLessThan(2500);

  await page.keyboard.down('r');
  await expect.poll(() => rpm(page), { timeout: 5_000 }).toBeGreaterThan(5000);
  await page.keyboard.up('r');
  await expect.poll(() => rpm(page), { timeout: 10_000 }).toBeLessThan(2500);

  await page.getByRole('button', { name: 'Stop engine' }).click();
  await expect.poll(() => state(page, 'engine'), { timeout: 10_000 }).toBe('off');
  await expect(page.getByRole('button', { name: 'Start engine' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('turning sound off stops the engine', async ({ page }) => {
  const errors = await open(page, '?qa&quality=low');
  await page.getByRole('button', { name: 'Start engine' }).click();
  await expect(page.getByRole('button', { name: 'Stop engine' })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Sound on' }).click();
  await expect(page.getByRole('button', { name: 'Start engine' })).toBeVisible();
  expect(await state(page, 'engine')).toBe('off');
  expect(errors).toEqual([]);
});

const pistons = (page: Page) => page.evaluate(() => (window as unknown as { garagePistons?: () => number[][] }).garagePistons?.() ?? null);

test('looks inside: x-ray, moving parts, firing order', async ({ page }, info) => {
  const errors = await open(page);
  await page.getByRole('button', { name: 'Look inside' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'How it runs' })).toBeVisible();
  await expect(page.getByText('Start the engine to see it run.')).toBeVisible();
  await expect.poll(() => pistons(page), { timeout: 30_000 }).not.toBeNull();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: info.outputPath('inside-off.png') });
  const still = await pistons(page);
  await page.waitForTimeout(300);
  expect(await pistons(page)).toEqual(still);

  await page.getByRole('button', { name: 'Start engine' }).click();
  await expect.poll(() => state(page, 'engine'), { timeout: 20_000 }).toBe('running');
  await page.waitForTimeout(1500);
  const before = await pistons(page);
  await page.waitForTimeout(400);
  expect(await pistons(page)).not.toEqual(before);
  await expect(page.locator('.firing li.is-firing')).toHaveCount(1);
  await page.screenshot({ path: info.outputPath('inside-running.png') });

  await page.getByRole('button', { name: 'Look inside' }).click();
  expect(await state(page, 'inside')).toBe(false);
  await expect(page.getByRole('heading', { level: 2, name: 'P60B40 V8' })).toBeVisible();
  await page.getByRole('button', { name: 'Look inside' }).click();
  await page.keyboard.press('Escape');
  expect(await state(page, 'inside')).toBe(false);
  expect(errors).toEqual([]);
});

test('keeps the engine controls clear of the radio player and the panel', async ({ page }) => {
  const errors = await open(page, '?qa&quality=low');
  await page.route('https://www.youtube.com/iframe_api', (route) => route.fulfill({ contentType: 'text/javascript', body: '' }));
  await page.getByRole('button', { name: 'Open the hood' }).click();
  await page.getByRole('button', { name: 'Most Wanted radio' }).click();
  await page.getByRole('button', { name: 'Start engine' }).click();
  await expect(page.getByRole('button', { name: 'Hold to rev' })).toBeVisible({ timeout: 20_000 });
  const controls = [page.locator('.tach'), ...['Stop engine', 'Hold to rev', 'Look inside'].map((name) => page.getByRole('button', { name }))];
  for (const control of controls) {
    const box = (await control.boundingBox())!;
    for (const selector of ['.radio-player', '.panel']) {
      const other = (await page.locator(selector).boundingBox())!;
      const overlaps = box.x < other.x + other.width && other.x < box.x + box.width && box.y < other.y + other.height && other.y < box.y + box.height;
      expect(overlaps, `${await control.textContent()} over ${selector}`).toBe(false);
    }
  }
  for (const name of ['Stop engine', 'Hold to rev', 'Look inside']) {
    const button = page.getByRole('button', { name });
    const box = (await button.boundingBox())!;
    const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x!, y!)?.closest('button')?.textContent ?? null, [box.x + box.width / 2, box.y + box.height / 2]);
    expect(hit, name).toContain(name === 'Hold to rev' ? 'Hold to rev' : name);
  }
  expect(errors).toEqual([]);
});
