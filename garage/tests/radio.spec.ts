import { expect, test, type Page } from '@playwright/test';

// Chromium blocks <audio>.play() without a real gesture; the own-track test needs it to succeed.
test.use({ launchOptions: { args: ['--use-angle=gl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] } });

/** Stands in for YouTube's IFrame API: one iframe per player, ready and "playing" a tick after each command. */
const FAKE_IFRAME_API = `
window.YT = { Player: function (element, options) {
  const frame = document.createElement('iframe');
  frame.title = 'YouTube video player';
  frame.dataset.videoId = options.videoId;
  frame.dataset.host = options.host;
  element.replaceWith(frame);
  const later = (fn) => setTimeout(fn, 20);
  const api = {
    playVideo() { later(() => options.events.onStateChange({ data: 1 })); },
    pauseVideo() { options.events.onStateChange({ data: 2 }); },
    loadVideoById(id) { frame.dataset.videoId = id; later(() => options.events.onStateChange({ data: 1 })); },
    destroy() { frame.remove(); },
  };
  window.fakePlayers = (window.fakePlayers || []).concat([{ api, options }]);
  later(() => options.events.onReady({ target: api }));
} };
window.onYouTubeIframeAPIReady && window.onYouTubeIframeAPIReady();
`;

async function open(page: Page): Promise<{ errors: string[]; youtube: string[] }> {
  const errors: string[] = [];
  const youtube: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
  page.on('request', (request) => /youtube/.test(request.url()) && youtube.push(request.url()));
  await page.route('https://www.youtube.com/iframe_api', (route) => route.fulfill({ contentType: 'text/javascript', body: FAKE_IFRAME_API }));
  await page.goto('./?qa&quality=low');
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true', { timeout: 150_000 });
  await expect(page.locator('.loader')).toHaveCount(0);
  return { errors, youtube };
}

const frame = (page: Page) => page.locator('.radio-player iframe');
const store = (page: Page) => page.evaluate(() => (window as unknown as { garage: { getState(): { soundOn: boolean; radioOpen: boolean; ownTrack: string | null } } }).garage.getState());

/** Is the player the topmost element at its centre and at each corner, so nothing covers it? */
const playerUncovered = (page: Page) =>
  frame(page).evaluate((element) => {
    const box = element.getBoundingClientRect();
    const inset = 4;
    return [
      [box.x + box.width / 2, box.y + box.height / 2],
      [box.left + inset, box.top + inset],
      [box.right - inset, box.top + inset],
      [box.left + inset, box.bottom - inset],
      [box.right - inset, box.bottom - inset],
    ].every(([x, y]) => document.elementFromPoint(x!, y!) === element);
  });

/** A short, silent, valid WAV file. */
function silentWav(): Buffer {
  const samples = 8000;
  const buffer = Buffer.alloc(44 + samples * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + samples * 2, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(8000, 24);
  buffer.writeUInt32LE(16000, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(samples * 2, 40);
  return buffer;
}

test('plays the Most Wanted soundtrack from YouTube, starting with I Am Rock', async ({ page }, info) => {
  const { errors, youtube } = await open(page);
  expect(youtube).toEqual([]); // nothing from YouTube until the visitor asks

  await page.getByRole('button', { name: 'Most Wanted radio' }).click();
  const dock = page.getByRole('region', { name: 'Most Wanted radio' });
  await expect(dock).toBeVisible();
  await expect(frame(page)).toHaveAttribute('data-video-id', 'MhrjEWSkznM');
  await expect(frame(page)).toHaveAttribute('data-host', 'https://www.youtube-nocookie.com');
  await expect(dock.getByRole('status')).toContainText('I Am Rock');
  expect((await store(page)).soundOn).toBe(true);

  const box = (await frame(page).boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(200);
  expect(box.height).toBeGreaterThanOrEqual(200);
  expect(await playerUncovered(page)).toBe(true);
  await page.screenshot({ path: info.outputPath('radio.png') });

  await dock.getByRole('button', { name: 'Next song' }).click();
  await expect(dock.getByRole('status')).toContainText('Nine Thou');
  await expect(frame(page)).toHaveAttribute('data-video-id', 'M_s95No5E-s');

  // An upload YouTube refuses moves on by itself.
  await page.evaluate(() => (window as unknown as { fakePlayers: { options: { events: { onError(e: { data: number }): void } } }[] }).fakePlayers[0]!.options.events.onError({ data: 150 }));
  await expect(dock.getByRole('status')).toContainText('Do Ya Thang');

  await dock.getByRole('button', { name: 'Previous song' }).click();
  await expect(dock.getByRole('status')).toContainText('Nine Thou');

  await dock.getByRole('button', { name: 'Close the radio' }).click();
  await expect(dock).toHaveCount(0);
  await expect(frame(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('keeps the player uncovered and every engine marker reachable', async ({ page }, info) => {
  await open(page);
  await page.getByRole('button', { name: 'Most Wanted radio' }).click();
  await expect(frame(page)).toHaveCount(1);
  await page.getByRole('button', { name: 'Open the hood' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'P60B40 V8' })).toBeVisible();
  await page.waitForTimeout(2500); // let the camera arrive
  const markers = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.hotspot-holder')]
      .filter((holder) => Number(getComputedStyle(holder).opacity) > 0.2) // markers facing away are hidden by design
      .map((holder) => {
        const button = holder.querySelector('button')!;
        const box = button.getBoundingClientRect();
        const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        return { name: button.textContent, reachable: hit !== null && button.contains(hit) };
      }),
  );
  await page.screenshot({ path: info.outputPath('radio-bay.png') });
  expect(markers.length).toBeGreaterThanOrEqual(5);
  expect(markers.filter((marker) => !marker.reachable)).toEqual([]);
  if (info.project.name === 'desktop') await page.locator('.credits summary').click();
  expect(await playerUncovered(page)).toBe(true);
});

test('the radio and the visitor’s own track replace each other', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Most Wanted radio' }).click();
  await expect(frame(page)).toHaveCount(1);

  await page.locator('input[type=file]').setInputFiles({ name: 'mine.wav', mimeType: 'audio/wav', buffer: silentWav() });
  await expect(page.getByRole('button', { name: 'Stop my track' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Most Wanted radio' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Most Wanted radio' }).click();
  await expect(frame(page)).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Stop my track' })).toHaveCount(0);
  expect((await store(page)).ownTrack).toBeNull();
});

test('offers YouTube itself when the player can’t load', async ({ page }) => {
  await open(page);
  await page.unroute('https://www.youtube.com/iframe_api');
  await page.route('https://www.youtube.com/iframe_api', (route) => route.abort());
  await page.getByRole('button', { name: 'Most Wanted radio' }).click();
  const link = page.getByRole('link', { name: 'Play the list on YouTube' });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', /^https:\/\/www\.youtube\.com\/watch_videos\?video_ids=MhrjEWSkznM,/);
});
