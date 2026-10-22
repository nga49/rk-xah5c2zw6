// The recovery module in the browser, phone-sized. Synthetic values only.
import { expect, test, type Page } from '@playwright/test';

async function setup(page: Page) {
  await page.goto('./');
  await page.getByRole('button', { name: 'Set up this phone' }).click();
  await page.getByRole('textbox', { name: 'Name' }).fill('Test');
  await page.getByRole('textbox', { name: 'Height' }).fill('180');
  await page.getByRole('button', { name: /Next/ }).click();
  await page.getByRole('textbox', { name: 'Weight' }).fill('85');
  await page.getByRole('button', { name: /Next/ }).click();
  await page.getByLabel('Bench press 1RM').fill('150');
  await page.getByLabel('Back squat 1RM').fill('140');
  await page.getByLabel('Overhead press 1RM').fill('65');
  await page.getByRole('button', { name: /Next/ }).click();
  await page.getByRole('button', { name: /Next/ }).click();
  await page.getByRole('button', { name: 'Start the road' }).click();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
}

const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.open = () => null;
  });
});

test('module off: the recover route is just Today, and Today has no module cards', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-29T08:00:00'));
  await setup(page);
  await expect(page.getByRole('region', { name: 'Goal' })).toHaveCount(0);
  // Like any unknown route in the original app: Today's content under the app name.
  await page.goto('./#/recover');
  await expect(page.getByText('Morning check-in')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Recover' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Log injury' })).toHaveCount(0);
});

test('module on: every new screen fits the phone width, with no console errors, and leg days adapt', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.clock.setFixedTime(new Date('2026-10-29T08:00:00'));
  await setup(page);
  await page.goto('./#/settings');
  await page.getByRole('switch', { name: 'Injury and recovery module' }).click();
  await page.goto('./#/today');
  await expect(page.getByRole('button', { name: 'Wellness' })).toBeVisible();

  // Log a synthetic injury.
  await page.goto('./#/recover/injury/new');
  await page.getByLabel('Body region').selectOption('calf');
  await page.getByRole('group', { name: 'Side' }).getByRole('button', { name: 'Right' }).click();
  await page.getByRole('button', { name: 'Log injury' }).click();
  await expect(page.getByText('Right calf').first()).toBeVisible();

  for (const hash of ['#/recover', '#/recover/injury/new', '#/recover/wellness', '#/recover/goal', '#/today', '#/train', '#/mind/review']) {
    await page.goto(`./${hash}`);
    await page.waitForTimeout(200);
    expect(await overflow(page), hash).toBeLessThanOrEqual(0);
  }

  // Thursday is a leg day: it reads Upper only, and the banner says what changed.
  await page.goto('./#/today');
  await expect(page.getByRole('region', { name: 'Injury plan today' }).or(page.getByLabel('Injury plan today'))).toBeVisible();
  await expect(page.getByText(/Upper only/).first()).toBeVisible();

  // The daily check-in opens from the banner and saves.
  await page.getByRole('button', { name: 'Injury check-in · 30 s' }).first().click();
  await page.getByRole('group', { name: 'Pain at rest, 0 to 10' }).getByRole('button', { name: '1', exact: true }).click();
  await page.getByRole('button', { name: 'Save check-in' }).click();
  await expect(page.getByText('Check-in saved')).toBeVisible();

  // The wellness form saves.
  await page.goto('./#/recover/wellness');
  await page.getByRole('button', { name: 'Jittery' }).click();
  await page.getByRole('button', { name: 'Save wellness' }).click();
  await expect(page.getByText('Wellness saved')).toBeVisible();

  const text = await page.locator('body').innerText();
  expect(text).not.toContain('—');
  expect(errors).toEqual([]);
});
