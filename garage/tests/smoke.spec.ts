import { expect, test, type Page } from '@playwright/test';

async function open(page: Page, query = '?qa&quality=high'): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`./${query}`);
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true', { timeout: 150_000 });
  await expect(page.locator('.loader')).toHaveCount(0);
  return errors;
}

const cameraPosition = (page: Page) => page.evaluate(() => (window as unknown as { garageCamera(): number[] }).garageCamera());

/** Is the element the one a tap at its centre would reach? */
const isOnTop = (page: Page, selector: string) =>
  page.locator(selector).first().evaluate((element) => {
    const box = element.getBoundingClientRect();
    const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return hit !== null && element.contains(hit);
  });

test('renders the garage', async ({ page }, info) => {
  const errors = await open(page);
  const variance = await page.evaluate(() => {
    const source = document.querySelector('canvas')!;
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 40;
    const context = canvas.getContext('2d')!;
    context.drawImage(source, 0, 0, 64, 40);
    const data = context.getImageData(0, 0, 64, 40).data;
    let sum = 0;
    let squares = 0;
    for (let i = 0; i < data.length; i += 4) {
      const luma = (data[i]! + data[i + 1]! + data[i + 2]!) / 3;
      sum += luma;
      squares += luma * luma;
    }
    const n = data.length / 4;
    return squares / n - (sum / n) ** 2;
  });
  expect(variance).toBeGreaterThan(40);
  await expect(page.locator('h1')).toHaveCount(1);
  await page.screenshot({ path: info.outputPath('showroom.png') });
  expect(errors).toEqual([]);
});

test('opens the hood and explores the engine by keyboard', async ({ page }, info) => {
  const errors = await open(page);
  await page.getByRole('button', { name: 'Open the hood' }).click();
  const crank = page.getByRole('button', { name: /Flat-plane crankshaft/ });
  await expect(crank).toBeAttached();
  await crank.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 2, name: 'Flat-plane crankshaft' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Wikipedia: BMW P60B40' }).first()).toBeVisible();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: info.outputPath('crank.png') });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { level: 2, name: 'P60B40 V8' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Open the hood' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('shows real and game facts for a car hotspot', async ({ page }) => {
  const errors = await open(page);
  const wheels = page.getByRole('button', { name: /Wheels and brakes/ });
  await wheels.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 2, name: 'Wheels and brakes' })).toBeVisible();
  await page.getByRole('tab', { name: 'In the game' }).click();
  await expect(page.getByText(/ADR M Sport wheels/)).toBeVisible();
  expect(errors).toEqual([]);
});

test('phone layout keeps the car visible', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'phone only');
  await open(page);
  const wheels = page.getByRole('button', { name: /Wheels and brakes/ });
  await wheels.focus();
  await page.keyboard.press('Enter');
  const panel = await page.locator('.panel').boundingBox();
  const viewport = page.viewportSize()!;
  expect(panel!.y).toBeGreaterThanOrEqual(viewport.height * 0.5);
  await expect(page.getByRole('button', { name: 'Back' })).toBeInViewport();
  // The bottom sheet must not bury the HUD buttons, and the credits step aside while it is open.
  expect(await isOnTop(page, '.hud-button')).toBe(true);
  const actions = (await page.locator('.hud-actions').boundingBox())!;
  const gap = panel!.y - (actions.y + actions.height);
  expect(gap).toBeGreaterThanOrEqual(0); // the buttons sit just above the sheet, not over the car mid-screen
  expect(gap).toBeLessThan(24);
  await expect(page.locator('.credits')).toBeHidden();
  await page.screenshot({ path: info.outputPath('phone-wheels.png') });
});

test('keeps hotspots under the info panel', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'desktop layout');
  await open(page);
  await page.getByRole('button', { name: /Wheels and brakes/ }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 2, name: 'Wheels and brakes' })).toBeVisible();
  await page.waitForTimeout(2500); // let the camera arrive
  const layers = await page.evaluate(() => {
    const panel = document.querySelector('.panel')!.getBoundingClientRect();
    return [...document.querySelectorAll('.hotspot-dot')]
      .map((dot) => dot.getBoundingClientRect())
      .filter((r) => r.right > panel.left && r.left < panel.right && r.bottom > panel.top && r.top < panel.bottom)
      .map((r) => (document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('.panel') ? 'under' : 'over'));
  });
  expect(layers.length).toBeGreaterThan(0); // in this shot the history marker sits behind the panel
  expect(layers).not.toContain('over');
});

test('falls back without WebGL 2', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      return type === 'webgl2' ? null : (original as (...a: unknown[]) => unknown).call(this, type, ...rest);
    } as typeof original;
  });
  await page.goto('./');
  await expect(page.getByRole('alert')).toContainText('needs WebGL 2');
  await expect(page.getByRole('link', { name: 'Back to indivar.xyz' })).toBeVisible();
});

test('explains a failed load instead of showing an empty page', async ({ page }) => {
  await page.route('**/models/m3-gtr.glb', (route) => route.fulfill({ status: 404, body: 'missing' }));
  await page.goto('./?qa');
  await expect(page.getByRole('alert')).toContainText('Couldn’t load the garage', { timeout: 60_000 });
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back to indivar.xyz' })).toBeVisible();
});

test('rejects a file it can’t play', async ({ page }) => {
  const errors = await open(page);
  await page.locator('input[type=file]').setInputFiles({ name: 'not-audio.mp3', mimeType: 'audio/mpeg', buffer: Buffer.from('this is not audio') });
  await expect(page.getByRole('status').filter({ hasText: 'Couldn’t play' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play my own track' })).toBeVisible();
  expect(errors.filter((e) => !/NotSupportedError|no supported source/i.test(e))).toEqual([]);
});

test('keeps the camera out of the car and inside the room', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'mouse wheel and drag');
  await open(page);
  await page.mouse.move(720, 450);
  for (let i = 0; i < 40; i++) await page.mouse.wheel(0, -400);
  await page.waitForTimeout(1500);
  const [x, y, z] = await cameraPosition(page);
  expect(Math.hypot(x!, y! - 0.55, z!)).toBeGreaterThan(2.9); // the showroom target is [0, 0.55, 0]
  await page.mouse.down();
  await page.mouse.move(720, 900, { steps: 20 });
  await page.mouse.up();
  for (let i = 0; i < 40; i++) await page.mouse.wheel(0, 400);
  await page.waitForTimeout(1500);
  const camera = await cameraPosition(page);
  expect(camera[1]).toBeLessThan(4.4); // below the ceiling
  expect(Math.abs(camera[0]!)).toBeLessThan(8.5);
  expect(camera[2]).toBeGreaterThan(-7.5);
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('respects reduced motion', async ({ page }) => {
    await open(page);
    const before = await cameraPosition(page);
    await page.waitForTimeout(6000);
    expect(await cameraPosition(page)).toEqual(before);
  });
});

test('drifts when idle without reduced motion', async ({ page }) => {
  await open(page);
  await page.waitForTimeout(1500);
  const before = await cameraPosition(page);
  await page.waitForTimeout(6000);
  expect(await cameraPosition(page)).not.toEqual(before);
});
