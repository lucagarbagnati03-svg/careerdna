import { test, expect } from '@playwright/test';

test.describe('CareerDNA App Testing', () => {
  
  test('Homepage and Overview', async ({ page }) => {
    await page.goto('https://careerdna-orpin.vercel.app/');
    await page.screenshot({ path: 'tests/screenshots/01-homepage.png', fullPage: true });
    await expect(page).toHaveTitle(/CareerDNA/);
  });

  test('Daily Journal', async ({ page }) => {
    await page.goto('https://careerdna-orpin.vercel.app/');
    await page.click('text=JOURNAL');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'tests/screenshots/02-journal.png', fullPage: true });
  });

  test('Skills Page', async ({ page }) => {
    await page.goto('https://careerdna-orpin.vercel.app/');
    await page.click('text=SKILLS');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'tests/screenshots/03-skills.png', fullPage: true });
  });

  test('Mobile View', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('https://careerdna-orpin.vercel.app/');
    await page.screenshot({ path: 'tests/screenshots/04-mobile-overview.png', fullPage: true });
  });
});
