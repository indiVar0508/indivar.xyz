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
  await page.getByRole('button', { name: 'Look inside the engine' }).click();
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

  // The engine view shows the engine alone: the gearbox stays hidden, as before there was a gearbox view.
  expect((await drive(page)).driveline).toBe(false);
  await page.getByRole('button', { name: 'Look inside the engine' }).click();
  expect(await state(page, 'inside')).toBe(false);
  await expect(page.getByRole('heading', { level: 2, name: 'P60B40 V8' })).toBeVisible();
  await page.getByRole('button', { name: 'Look inside the engine' }).click();
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
  const controls = [page.locator('.tach'), page.locator('.gear-readout'), ...['Stop engine', 'Hold to rev', 'Shift down', 'Shift up', 'Look inside the engine', 'Look inside the gearbox'].map((name) => page.getByRole('button', { name }))];
  for (const control of controls) {
    const box = (await control.boundingBox())!;
    for (const selector of ['.radio-player', '.panel']) {
      const other = (await page.locator(selector).boundingBox())!;
      const overlaps = box.x < other.x + other.width && other.x < box.x + box.width && box.y < other.y + other.height && other.y < box.y + box.height;
      expect(overlaps, `${await control.textContent()} over ${selector}`).toBe(false);
    }
  }
  for (const [name, text] of [['Stop engine', 'Stop engine'], ['Hold to rev', 'Hold to rev'], ['Look inside the gearbox', 'Gearbox']] as const) {
    const button = page.getByRole('button', { name });
    const box = (await button.boundingBox())!;
    const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x!, y!)?.closest('button')?.textContent ?? null, [box.x + box.width / 2, box.y + box.height / 2]);
    expect(hit, name).toContain(text);
  }
  expect(errors).toEqual([]);
});

const probe = (page: Page, name: string) => page.evaluate((n) => (window as unknown as Record<string, (() => unknown) | undefined>)[n]?.() ?? null, name);

test('turns the belt drive and shows fuel, spark, air, exhaust, oil and coolant inside', async ({ page }, info) => {
  const errors = await open(page);
  await page.getByRole('button', { name: 'Open the hood' }).click();
  await page.getByRole('button', { name: 'Start engine' }).click();
  await expect.poll(() => state(page, 'engine'), { timeout: 20_000 }).toBe('running');
  const belt = (await probe(page, 'garageBelt')) as number[];
  await page.waitForTimeout(300);
  const later = (await probe(page, 'garageBelt')) as number[];
  later.forEach((angle, i) => expect(angle, `pulley ${i}`).not.toBe(belt[i]));
  await page.getByRole('button', { name: 'Look inside the engine' }).click();
  await expect.poll(() => probe(page, 'garageFlows'), { timeout: 30_000 }).toBeGreaterThan(30);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: info.outputPath('inside-flows.png') });
  expect(errors).toEqual([]);
});

test('fits the game turbo kit: labelled, spooling with revs, and off again', async ({ page }, info) => {
  const errors = await open(page);
  await page.getByRole('button', { name: 'Open the hood' }).click();
  await page.getByRole('button', { name: 'Game turbo' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'only in Most Wanted' })).toBeVisible();
  await expect.poll(() => probe(page, 'garageTurbo'), { timeout: 30_000 }).not.toBeNull();
  await page.getByRole('button', { name: 'Start engine' }).click();
  await expect.poll(() => state(page, 'engine'), { timeout: 20_000 }).toBe('running');
  await hold(page, 'Hold to rev', 1500);
  const boost = await page.evaluate(() => (window as unknown as { garageEngine: { boost: number } }).garageEngine.boost);
  expect(boost).toBeGreaterThan(0.4);
  await page.screenshot({ path: info.outputPath('turbo.png') });
  await page.mouse.up();
  await page.getByRole('button', { name: 'Look inside the engine' }).click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: info.outputPath('turbo-inside.png') });
  await page.getByRole('button', { name: 'Game turbo' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'only in Most Wanted' })).toHaveCount(0);
  expect(errors).toEqual([]);
});

type DriveWindow = { garageDrive(): { wheels: number[]; rollers: number[]; dogs: number[]; clutch: number[]; driveline: boolean } };
const drive = (page: Page) => page.evaluate(() => (window as unknown as DriveWindow).garageDrive());
const live = (page: Page, key: string) => page.evaluate((k) => (window as unknown as { garageEngine: Record<string, number> }).garageEngine[k]!, key);

test('changes gear and drives the rear wheels on the rollers, and shows the driveline through the body', async ({ page }, info) => {
  const errors = await open(page);
  await page.getByRole('button', { name: 'Start engine' }).click();
  await expect(page.getByRole('button', { name: 'Shift up' })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.gear-now')).toHaveText('N');
  await page.keyboard.press('ArrowUp');
  await expect.poll(() => state(page, 'gear'), { timeout: 5_000 }).toBe(1);
  await expect(page.locator('.gear-now')).toHaveText('1');

  const before = await drive(page);
  await page.keyboard.down('r');
  await expect.poll(() => live(page, 'wheel'), { timeout: 10_000 }).toBeGreaterThan(20);
  await page.keyboard.up('r');
  const after = await drive(page);
  expect(after.wheels[0]).not.toBe(before.wheels[0]);
  expect(after.rollers[0]).not.toBe(before.rollers[0]);
  await expect(page.locator('.gear-speed')).not.toHaveText('0 km/h');

  await page.evaluate(() => (window as unknown as { garage: { getState(): { dispatch(action: object): void } } }).garage.getState().dispatch({ type: 'select-car', id: 'drivetrain' }));
  await expect(page.locator('.panel')).toContainText('Gearbox and drive');
  await expect(page.locator('.gears li')).toHaveCount(6);
  await expect(page.locator('.gears li.is-engaged .gear-number')).toHaveText('1');
  await expect.poll(async () => (await drive(page)).driveline).toBe(true);
  await expect.poll(async () => (await drive(page)).dogs[0]!, { timeout: 5_000 }).toBeLessThan(-0.008); // 1-2's ring slid to 1st
  await page.waitForTimeout(1500);
  await page.screenshot({ path: info.outputPath('drivetrain.png') });

  for (let gear = 2; gear <= 7; gear++) {
    await page.waitForTimeout(250);
    await page.getByRole('button', { name: 'Shift up' }).click();
  }
  await expect.poll(() => state(page, 'gear'), { timeout: 5_000 }).toBe(6);
  await expect(page.locator('.engine-note')).toHaveText('6th is the top gear.');
  expect(errors).toEqual([]);
});

type MountWindow = { garageMount(): number; garageBelt(): number[] };

/** Over `ms`, sampled every frame: the most the engine leans (degrees) and the crank pulley's mean speed (°/s). */
const watch = (page: Page, ms: number) =>
  page.evaluate(
    (ms) =>
      new Promise<{ lean: number; belt: number }>((done) => {
        const w = window as unknown as MountWindow;
        let [lean, turned, last] = [0, 0, w.garageBelt()[0]!];
        const start = performance.now();
        const tick = (now: number) => {
          lean = Math.max(lean, Math.abs(w.garageMount()));
          const angle = w.garageBelt()[0]!;
          turned += Math.abs(Math.atan2(Math.sin(angle - last), Math.cos(angle - last)));
          last = angle;
          if (now - start < ms) requestAnimationFrame(tick);
          else done({ lean: (lean * 180) / Math.PI, belt: (turned * 180) / Math.PI / ((now - start) / 1000) });
        };
        requestAnimationFrame(tick);
      }),
    ms,
  );

test('shows a gear change under the hood: the engine leans harder pulling in gear, and the belts follow the revs', async ({ page }, info) => {
  const errors = await open(page, '?qa&quality=low');
  await page.getByRole('button', { name: 'Open the hood' }).click();
  await page.getByRole('button', { name: 'Start engine' }).click();
  await expect.poll(() => state(page, 'engine'), { timeout: 20_000 }).toBe('running');
  await page.waitForTimeout(2500);
  const idle = await watch(page, 1000);

  await page.keyboard.down('r');
  const neutral = await watch(page, 1200);
  await page.keyboard.up('r');
  await expect.poll(() => rpm(page), { timeout: 10_000 }).toBeLessThan(2500);

  await page.keyboard.press('ArrowUp');
  await expect.poll(() => state(page, 'gear'), { timeout: 5_000 }).toBe(1);
  await page.keyboard.down('r');
  const first = await watch(page, 2000);
  await page.screenshot({ path: info.outputPath('pulling-in-first.png') });
  await page.keyboard.up('r');

  expect(first.lean, `1st ${first.lean}° vs neutral ${neutral.lean}°`).toBeGreaterThan(1.5 * neutral.lean);
  expect(first.lean).toBeGreaterThan(1);
  expect(neutral.belt, `revving ${neutral.belt}°/s vs idle ${idle.belt}°/s`).toBeGreaterThan(2 * idle.belt);
  expect(errors).toEqual([]);
});

type ReplayWindow = { __steps: (string | null)[]; __clutch: number; __dogs: number[]; __driving: string[] };

test('shows the gearbox live, and replays a change: the clutch opens, the ring slides from 1st to 2nd, the clutch closes', async ({ page }, info) => {
  const errors = await open(page, '?qa&quality=low');
  await page.getByRole('button', { name: 'Open the hood' }).click();
  await page.getByRole('button', { name: 'Start engine' }).click();
  await expect.poll(() => state(page, 'engine'), { timeout: 20_000 }).toBe('running');
  await page.keyboard.press('ArrowUp');
  await expect.poll(() => state(page, 'gear'), { timeout: 5_000 }).toBe(1);
  await expect(page.locator('.engine-note')).toHaveText('Look inside the gearbox to watch it change gear.');

  if (info.project.name === 'desktop') {
    await page.getByRole('button', { name: 'Look inside both' }).click();
    await expect.poll(async () => (await drive(page)).driveline).toBe(true);
    await expect(page.locator('.crumbs')).toContainText('Engine and gearbox');
    await expect(page.locator('.gearbox-label')).toHaveCount(0);
  } else {
    await expect(page.getByRole('button', { name: 'Look inside both' })).toBeHidden(); // too small to follow on a phone
  }

  await page.getByRole('button', { name: 'Look inside the gearbox' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'How the gearbox works' })).toBeVisible();
  await expect(page.locator('.engine-note')).toHaveText('');
  // Every gear is labelled with its speed; 1st, the one the dog ring locks, drives the wheels at the output shaft's speed.
  const gears = page.locator('.gearbox-label.gear');
  await expect(gears).toHaveCount(6);
  await expect(page.locator('.gearbox-label.is-driving')).toHaveCount(1);
  await expect(page.locator('.gearbox-label.is-driving b')).toHaveText('1st');
  await expect(gears.filter({ hasText: 'free' })).toHaveCount(5);
  const shift = page.locator('.shift');
  await expect(shift).toContainText('Change gear to watch the clutch and gearbox do it, slowed 40×.');
  await expect.poll(async () => (await drive(page)).dogs[0]!, { timeout: 5_000 }).toBeLessThan(-0.008); // in 1st
  await expect.poll(async () => Math.max(...(await drive(page)).clutch), { timeout: 5_000 }).toBeLessThan(0.001); // shut

  // Record every step the replay reports, the widest the clutch opens, and where 1-2's ring goes, frame by frame.
  await page.evaluate(() => {
    const w = window as unknown as ReplayWindow & { garage: { subscribe(fn: (s: { replay: { step: string | null } | null }) => void): void }; garageDrive(): { clutch: number[]; dogs: number[] } };
    Object.assign(w, { __steps: [], __clutch: 0, __dogs: [], __driving: [] });
    w.garage.subscribe((s) => {
      if (s.replay && w.__steps.at(-1) !== s.replay.step) w.__steps.push(s.replay.step);
    });
    requestAnimationFrame(function tick() {
      const d = w.garageDrive();
      w.__clutch = Math.max(w.__clutch, ...d.clutch);
      w.__dogs.push(d.dogs[0]!);
      const driving = document.querySelector('.gearbox-label.is-driving b')?.textContent ?? 'none';
      if (w.__driving.at(-1) !== driving) w.__driving.push(driving);
      requestAnimationFrame(tick);
    });
  });
  // Pull away in 1st, then change up with the engine revving, so the revs drop into 2nd.
  await page.keyboard.down('r');
  await expect.poll(() => rpm(page), { timeout: 10_000 }).toBeGreaterThan(4000);
  await page.keyboard.press('ArrowUp');
  await expect.poll(() => state(page, 'gear'), { timeout: 5_000 }).toBe(2);
  await page.keyboard.up('r');
  await expect(shift.locator('figcaption')).toHaveText('Changing gear: 1st to 2nd, slowed 40×');
  await expect(shift.locator('li')).toHaveText([/Clutch opens/, /Out of 1st/, /Into 2nd/, /Clutch closes/]);
  await expect(shift.locator('li.is-now')).toHaveText(/Into 2nd/, { timeout: 5_000 });
  await page.screenshot({ path: info.outputPath('replay-into-2nd.png') });

  // Slowed 40×, the crate's 0.12 s change plays over about five seconds.
  await expect.poll(() => page.evaluate(() => (window as unknown as ReplayWindow).__steps.at(-1)), { timeout: 8_000 }).toBeNull();
  const recorded = await page.evaluate(() => {
    const w = window as unknown as ReplayWindow;
    return { steps: w.__steps, clutch: w.__clutch, dogs: w.__dogs, driving: w.__driving };
  });
  expect(recorded.steps).toEqual(['open', 'out', 'in', 'close', null]);
  expect(recorded.driving, 'the labels: 1st drives, then nothing while the clutch is open, then 2nd').toEqual(['1st', 'none', '2nd']);
  expect(recorded.clutch, 'the clutch pack spreads open').toBeGreaterThan(0.02);
  expect(Math.min(...recorded.dogs)).toBeLessThan(-0.008);
  expect(recorded.dogs.some((v) => Math.abs(v) < 0.002), 'the ring passes through the middle').toBe(true);
  expect(recorded.dogs.at(-1)!).toBeGreaterThan(0.008);
  expect(Math.max(...(await drive(page)).clutch)).toBeLessThan(0.001);
  await expect(shift.locator('li.is-done')).toHaveCount(4);
  await expect(shift).toContainText(/The revs fall from [\d,]+ to [\d,]+ rpm to match it\./);
  expect(errors).toEqual([]);
});
