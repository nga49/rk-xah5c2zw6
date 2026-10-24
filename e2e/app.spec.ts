// End to end on an iPhone-sized viewport, against the production build.
// Numbers here are neutral test values, never real ones.
import { expect, test, type Page } from '@playwright/test';

async function setup(page: Page, lb = false) {
  await page.goto('./');
  await page.getByRole('button', { name: 'Set up this phone' }).click();
  await page.getByRole('textbox', { name: 'Name' }).fill('Test');
  await page.getByRole('textbox', { name: 'Height' }).fill('180');
  if (lb) await page.getByRole('group', { name: 'Weight unit' }).getByRole('button', { name: 'Pounds' }).click();
  await page.getByRole('button', { name: /Next/ }).click();
  await page.getByRole('textbox', { name: 'Weight' }).fill(lb ? '187.4' : '85');
  await page.getByRole('button', { name: /Next/ }).click();
  await page.getByLabel('Bench press 1RM').fill(lb ? '330' : '150');
  await page.getByLabel('Back squat 1RM').fill('140');
  await page.getByLabel('Overhead press 1RM').fill('65');
  await page.getByRole('button', { name: /Next/ }).click();
  await page.getByRole('button', { name: /Next/ }).click();
  await page.getByRole('button', { name: 'Start the road' }).click();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
}

async function checkIn(page: Page, o: { h: string; m: string; score: string; energy: string; stress: string; back?: string }) {
  await page.getByLabel('Sleep hours').fill(o.h);
  await page.getByLabel('Sleep minutes').fill(o.m);
  await page.getByLabel('Garmin sleep score').fill(o.score);
  await page.getByRole('group', { name: 'Energy, 1 to 5' }).getByRole('button', { name: o.energy, exact: true }).click();
  await page.getByRole('group', { name: 'Stress, 1 to 5' }).getByRole('button', { name: o.stress, exact: true }).click();
  if (o.back) await page.getByRole('group', { name: 'Back pain, 0 to 10' }).getByRole('button', { name: o.back, exact: true }).click();
  await page.getByRole('button', { name: 'Save check-in' }).click();
}

async function at(page: Page, iso: string) {
  await page.clock.setFixedTime(new Date(iso));
  await page.reload();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    // Opening claude.ai is not part of the test.
    window.open = () => null;
  });
});

test('before the start, then a Full Monday with BLADES', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-18T09:00:00'));
  await setup(page);
  await expect(page.getByText('Starts Monday 19 October')).toBeVisible();
  await expect(page.getByText('M1 Foundation').first()).toBeVisible();

  await at(page, '2026-10-19T07:30:00');
  await checkIn(page, { h: '7', m: '50', score: '84', energy: '4', stress: '2' });
  await expect(page.getByRole('status').filter({ hasText: 'Full' }).first()).toBeVisible();
  await expect(page.getByText('BLADES · Full')).toBeVisible();
  await expect(page.getByText('Update calories in Yazio to 2,600 kcal')).toBeVisible();

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Train' }).click();
  await expect(page.locator('.band .n')).toHaveText('BLADES');
  const bench = page.locator('.ex', { hasText: 'Barbell Bench Press' });
  await expect(bench.getByLabel('Barbell Bench Press weight')).toHaveValue('120'); // 81% of 150, rounded down
  await bench.getByRole('button', { name: 'Set 1' }).click();
  await expect(page.getByRole('timer')).toBeVisible(); // rest timer starts on a set
  await bench.getByRole('checkbox', { name: 'Barbell Bench Press done' }).click();
  await bench.getByRole('button', { name: 'Clean' }).click();
  await expect(bench.getByRole('button', { name: 'Clean' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Finish session' }).click();
  await page.getByRole('group', { name: 'Session RPE, 1 to 10' }).getByRole('button', { name: '8', exact: true }).click();
  await page.getByRole('group', { name: 'Bench felt' }).getByRole('button', { name: 'Right' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText(/Session done · RPE 8/)).toBeVisible();
});

test('the kg / lb switch converts every weight on the spot', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-19T07:30:00'));
  await setup(page);
  await checkIn(page, { h: '7', m: '50', score: '84', energy: '4', stress: '2' });
  const weigh = page.getByRole('textbox', { name: 'Weight' });
  await expect(weigh).toHaveValue('85');
  const units = page.locator('.header').getByRole('group', { name: 'Weight unit' });
  await units.getByRole('button', { name: 'Pounds' }).click();
  await expect(units.getByRole('button', { name: 'Pounds' })).toHaveAttribute('aria-pressed', 'true');
  await expect(weigh).toHaveValue('187.4');

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Train' }).click();
  const bench = page.locator('.ex', { hasText: 'Barbell Bench Press' }).getByLabel('Barbell Bench Press weight');
  await expect(bench).toHaveValue('265'); // 121.5 kg is 267.9 lb, down to a 5 lb step
  await units.getByRole('button', { name: 'Kilograms' }).click();
  await expect(bench).toHaveValue('120'); // stored in kg, nothing drifted
});

test('setup in pounds stores kilos underneath', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-19T07:30:00'));
  await setup(page, true);
  await expect(page.locator('.header').getByRole('button', { name: 'Pounds' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Train' }).click();
  await expect(page.locator('.ex', { hasText: 'Barbell Bench Press' }).getByLabel('Barbell Bench Press weight')).toHaveValue('265');
  await page.locator('.header').getByRole('button', { name: 'Kilograms' }).click();
  await expect(page.locator('.ex', { hasText: 'Barbell Bench Press' }).getByLabel('Barbell Bench Press weight')).toHaveValue('120');
});

test('short sleep gives Light; back pain 6 gives Recovery', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-02T07:00:00'));
  await setup(page);
  await checkIn(page, { h: '5', m: '40', score: '58', energy: '3', stress: '2' });
  await expect(page.getByRole('status').filter({ hasText: 'Readiness 60' })).toContainText('Light');

  await at(page, '2026-11-03T07:00:00');
  await checkIn(page, { h: '8', m: '0', score: '90', energy: '4', stress: '1', back: '6' });
  await expect(page.getByRole('status').filter({ hasText: 'Recovery' }).first()).toBeVisible();
  await expect(page.getByText('Recovery · walk, back reset, breathe')).toBeVisible();
});

test('Ask Claude copies a context pack with the safety line and the question', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.clock.setFixedTime(new Date('2026-10-20T08:00:00'));
  await setup(page);
  await page.getByRole('button', { name: 'Ask Claude' }).click();
  await page.getByRole('button', { name: 'Hotel today' }).click();
  await page.getByRole('button', { name: 'Copy and open Claude' }).click();
  await expect(page.getByText('Copied. Paste it in Claude.')).toBeVisible();
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text).toContain('Act as an evidence-based strength coach and calm mentor.');
  expect(text).toContain('Not medical advice.');
  expect(text).toContain('Question: Hotel today');
  expect(text).toContain('LEVIATHAN');
  expect(text).not.toContain('—');
});

test('every screen fits the phone width (no horizontal scroll) and has no console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.clock.setFixedTime(new Date('2026-10-21T08:00:00'));
  await setup(page);
  for (const hash of ['#/today', '#/today/2026-10-19', '#/train', '#/mind', '#/log/activity', '#/log/sleep', '#/log/max', '#/log/body', '#/log/standards', '#/stats', '#/settings', '#/about']) {
    await page.goto(`./${hash}`);
    await page.waitForTimeout(150);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, hash).toBeLessThanOrEqual(0);
  }
  await page.goto('./#/settings');
  await expect(page.getByText('Not medical advice.', { exact: false }).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('a forgotten day can be filled in afterwards', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-19T07:30:00'));
  await setup(page);
  await checkIn(page, { h: '7', m: '50', score: '84', energy: '4', stress: '2' });

  await at(page, '2026-10-22T08:00:00');
  const card = page.locator('.card', { hasText: 'Steps not logged' });
  await expect(card.getByRole('button', { name: 'Mon 19 Oct' })).toBeVisible();
  await card.getByRole('button', { name: 'Tue 20 Oct' }).click();

  await expect(page.getByText('Tuesday 20 October')).toBeVisible();
  await expect(page.getByText('2 days ago')).toBeVisible();
  await page.getByLabel('Steps from Garmin').fill('11200');
  await page.getByRole('button', { name: 'Save steps' }).click();
  await expect(page.getByRole('checkbox', { name: 'Steps 10,000' })).toHaveAttribute('aria-checked', 'true');
  const session = page.getByRole('checkbox', { name: /LEVIATHAN/ });
  await session.click();
  await expect(session).toHaveAttribute('aria-checked', 'true');

  await page.getByRole('button', { name: 'Previous day' }).click();
  await expect(page.getByText('Monday 19 October')).toBeVisible();
  await page.getByRole('button', { name: 'Back to today' }).click();
  await expect(card.getByRole('button', { name: 'Tue 20 Oct' })).toHaveCount(0);
  await expect(card.getByRole('button', { name: 'Wed 21 Oct' })).toBeVisible();

  await page.getByRole('button', { name: /Wednesday 21 October/ }).click();
  await expect(page.getByText('Yesterday')).toBeVisible();
  await page.getByRole('button', { name: 'Next day' }).click();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  await expect(page.getByText('Thursday 22 October')).toBeVisible();
});

test('opens offline after the first visit (service worker)', async ({ page, context }) => {
  await page.clock.setFixedTime(new Date('2026-10-21T08:00:00'));
  await setup(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload(); // now controlled by the service worker
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  await expect(page.getByText('GUARDIAN').first()).toBeVisible();
  await context.setOffline(false);
});

test('robots and noindex keep the app out of search engines', async ({ page, request }) => {
  const robots = await (await request.get('./robots.txt')).text();
  expect(robots).toContain('Disallow: /');
  await page.goto('./');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex, nofollow/);
  const manifest = await (await request.get('./manifest.webmanifest')).json();
  expect(manifest.display).toBe('standalone');
  expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
});
