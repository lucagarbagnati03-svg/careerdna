import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'fs';

const BASE_URL = 'https://careerdna-orpin.vercel.app';
const AUTH_FILE = 'tests/.auth/user.json';
const CONSENT_KEY = 'cdna_consent_v1';
const EMAIL = 'lucagarbagnati03@gmail.com';
const PASSWORD = 'R7c7tt7n703';
const SCREENSHOTS = 'tests/screenshots';
const DESKTOP = { width: 1920, height: 1080 };
const MOBILE = { width: 390, height: 844 };

// Ensure directories exist
mkdirSync(SCREENSHOTS, { recursive: true });
mkdirSync('tests/.auth', { recursive: true });
// Pre-create empty auth placeholder so test.use({ storageState }) never hits ENOENT.
// beforeAll will overwrite this with the real session after login.
writeFileSync(AUTH_FILE, JSON.stringify({ cookies: [], origins: [] }));

/** Full-page screenshot helper */
const ss = (page, name) =>
  page.screenshot({ path: `${SCREENSHOTS}/${name}`, fullPage: true });

/**
 * Inject a script that runs before any page script, setting the consent
 * localStorage key so the modal never renders during tests.
 */
const bypassConsent = (page) =>
  page.addInitScript(`localStorage.setItem('${CONSENT_KEY}', 'true')`);

/** Wait for network to settle; fall back to a fixed delay for SPA transitions. */
const waitForApp = async (page) => {
  await page
    .waitForLoadState('networkidle', { timeout: 15_000 })
    .catch(() => page.waitForTimeout(2000));
};

// ──────────────────────────────────────────────────────────────────────────────
// SECTION 1 — UNAUTHENTICATED PAGES
// ──────────────────────────────────────────────────────────────────────────────

test.describe('Section 1 - Unauthenticated Pages', () => {
  test.use({ viewport: DESKTOP });

  test('01 - Homepage / landing page - desktop', async ({ page }) => {
    await bypassConsent(page);
    await page.goto(BASE_URL);
    // ProtectedRoute redirects unauthenticated visitors to /auth
    await page.waitForURL(/\/auth/, { timeout: 10_000 });
    await page.waitForSelector('input[type="email"]');
    await ss(page, '01-homepage-desktop.png');
  });

  test('02 - Login page (Sign In tab active) - desktop', async ({ page }) => {
    await bypassConsent(page);
    await page.goto(`${BASE_URL}/auth`);
    await page.waitForSelector('input[type="email"]');
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await ss(page, '02-login-desktop.png');
  });

  test('03 - Signup page (Sign Up tab) - desktop', async ({ page }) => {
    await bypassConsent(page);
    await page.goto(`${BASE_URL}/auth`);
    await page.waitForSelector('text=Sign Up');
    await page.click('text=Sign Up');
    await page.waitForTimeout(600);
    await ss(page, '03-signup-desktop.png');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// SECTION 2 + 3 — AUTHENTICATED (login once via beforeAll, reuse session)
// ──────────────────────────────────────────────────────────────────────────────

test.describe('Authenticated Tests', () => {
  // serial mode: beforeAll runs first, then tests execute in order in one worker
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async ({ browser }) => {
    // Empty placeholder was pre-created above, so newContext won't hit ENOENT.
    // We don't pass storageState here intentionally — we're doing a fresh login.
    const context = await browser.newContext({ viewport: DESKTOP });
    const page = await context.newPage();
    // Bypass consent so the modal doesn't cover the login form
    await page.addInitScript(`localStorage.setItem('${CONSENT_KEY}', 'true')`);
    await page.goto(`${BASE_URL}/auth`);
    await page.waitForSelector('input[type="email"]');
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(`${BASE_URL}/`, { timeout: 20_000 });
    // Overwrite placeholder with the real authenticated session (cookies + localStorage)
    await context.storageState({ path: AUTH_FILE });
    await context.close();
  });

  // All tests below inherit the saved auth session
  test.use({ storageState: AUTH_FILE });

  // ────────────────────────────────────────────────────────────────────────────
  // SECTION 2 — PAGE SCREENSHOTS
  // ────────────────────────────────────────────────────────────────────────────

  test.describe('Section 2 - Authenticated Pages', () => {

    test('04 - Overview / Dashboard - desktop 1920x1080', async ({ page }) => {
      await bypassConsent(page);
      await page.setViewportSize(DESKTOP);
      await page.goto(`${BASE_URL}/`);
      await waitForApp(page);
      await ss(page, '04-overview-desktop.png');
    });

    test('05 - Overview / Dashboard - mobile 390x844', async ({ page }) => {
      await bypassConsent(page);
      await page.setViewportSize(MOBILE);
      await page.goto(`${BASE_URL}/`);
      await waitForApp(page);
      await ss(page, '05-overview-mobile.png');
    });

    test('06 - Daily Journal - desktop', async ({ page }) => {
      await bypassConsent(page);
      await page.setViewportSize(DESKTOP);
      await page.goto(`${BASE_URL}/journal`);
      await waitForApp(page);
      await ss(page, '06-journal-desktop.png');
    });

    test('07 - Daily Journal - mobile with tab bar visible', async ({ page }) => {
      await bypassConsent(page);
      await page.setViewportSize(MOBILE);
      await page.goto(`${BASE_URL}/journal`);
      await waitForApp(page);
      await ss(page, '07-journal-mobile.png');
    });

    test('08 - Past Experiences - mobile via Journal tab switcher', async ({ page }) => {
      await bypassConsent(page);
      await page.setViewportSize(MOBILE);
      await page.goto(`${BASE_URL}/journal`);
      await waitForApp(page);
      // Mobile Journal page has a tab switcher (.jmt-tab) — click the non-active tab (Experiences)
      const expTab = page.locator('.jmt-tab:not(.active)').first();
      if (await expTab.isVisible({ timeout: 4000 }).catch(() => false)) {
        await expTab.click();
        await page.waitForTimeout(1200);
      }
      await ss(page, '08-experiences-mobile.png');
    });

    test('09 - Skills - My Skills tab - desktop', async ({ page }) => {
      await bypassConsent(page);
      await page.setViewportSize(DESKTOP);
      await page.goto(`${BASE_URL}/skills`);
      await waitForApp(page);
      await ss(page, '09-skills-myskills-desktop.png');
    });

    test('10 - Skills - My Skills tab - mobile', async ({ page }) => {
      await bypassConsent(page);
      await page.setViewportSize(MOBILE);
      await page.goto(`${BASE_URL}/skills`);
      await waitForApp(page);
      await ss(page, '10-skills-myskills-mobile.png');
    });

    test('11 - CV Scanner - desktop (direct /cv-scanner route)', async ({ page }) => {
      await bypassConsent(page);
      await page.setViewportSize(DESKTOP);
      await page.goto(`${BASE_URL}/cv-scanner`);
      await waitForApp(page);
      await ss(page, '11-skills-cvscanner-desktop.png');
    });

    test('12 - CV Scanner tab - mobile (via Skills tab switcher)', async ({ page }) => {
      await bypassConsent(page);
      await page.setViewportSize(MOBILE);
      await page.goto(`${BASE_URL}/skills`);
      await waitForApp(page);
      // Mobile Skills page has a tab switcher (.smt-tab) — click the non-active tab (CV Scanner)
      const cvTab = page.locator('.smt-tab:not(.active)').first();
      if (await cvTab.isVisible({ timeout: 4000 }).catch(() => false)) {
        await cvTab.click();
        await page.waitForTimeout(1200);
      }
      await ss(page, '12-skills-cvscanner-mobile.png');
    });

    test('13 - Skill Gap - desktop', async ({ page }) => {
      await bypassConsent(page);
      await page.setViewportSize(DESKTOP);
      await page.goto(`${BASE_URL}/skill-gap`);
      await waitForApp(page);
      await ss(page, '13-skillgap-desktop.png');
    });

    test('14 - Skill Gap - mobile', async ({ page }) => {
      await bypassConsent(page);
      await page.setViewportSize(MOBILE);
      await page.goto(`${BASE_URL}/skill-gap`);
      await waitForApp(page);
      await ss(page, '14-skillgap-mobile.png');
    });

    test('15 - Interview Preparation - desktop', async ({ page }) => {
      await bypassConsent(page);
      await page.setViewportSize(DESKTOP);
      await page.goto(`${BASE_URL}/interview-prep`);
      await waitForApp(page);
      await ss(page, '15-interview-desktop.png');
    });

    test('16 - Interview Preparation - mobile', async ({ page }) => {
      await bypassConsent(page);
      await page.setViewportSize(MOBILE);
      await page.goto(`${BASE_URL}/interview-prep`);
      await waitForApp(page);
      await ss(page, '16-interview-mobile.png');
    });

    test('17 - Live Interview Simulation - desktop (Interview Prep → Live Simulation tab)', async ({ page }) => {
      await bypassConsent(page);
      await page.setViewportSize(DESKTOP);
      await page.goto(`${BASE_URL}/interview-prep`);
      await waitForApp(page);
      // Interview Prep has two mode tabs (.ip-mode-tab) — click the Live Simulation tab (tab=live)
      const liveTab = page.locator('.ip-mode-tab').nth(1);
      if (await liveTab.isVisible({ timeout: 5000 }).catch(() => false)) {
        await liveTab.click();
        await page.waitForTimeout(1500);
      }
      await ss(page, '17-live-simulation-desktop.png');
    });

    test('18 - Live Interview Simulation - mobile (Interview Prep → Live Simulation tab)', async ({ page }) => {
      await bypassConsent(page);
      await page.setViewportSize(MOBILE);
      await page.goto(`${BASE_URL}/interview-prep`);
      await waitForApp(page);
      // Interview Prep has two mode tabs (.ip-mode-tab) — click the Live Simulation tab (tab=live)
      const liveTab = page.locator('.ip-mode-tab').nth(1);
      if (await liveTab.isVisible({ timeout: 5000 }).catch(() => false)) {
        await liveTab.click();
        await page.waitForTimeout(1500);
      }
      await ss(page, '18-live-simulation-mobile.png');
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // SECTION 3 — INTERACTION / ELEMENT VERIFICATION TESTS
  // ────────────────────────────────────────────────────────────────────────────

  test.describe('Section 3 - Interaction Tests', () => {
    test.use({ viewport: DESKTOP });

    test('19 - Daily Journal - microphone button is visible in textarea area', async ({ page }) => {
      await bypassConsent(page);
      await page.goto(`${BASE_URL}/journal`);
      await waitForApp(page);
      // The mic button only renders when the browser supports the Web Speech API.
      // Firefox does not expose SpeechRecognition, so skip rather than fail.
      const speechSupported = await page.evaluate(
        () => !!(window.SpeechRecognition || window.webkitSpeechRecognition)
      );
      if (!speechSupported) {
        test.skip();
        return;
      }
      // Mic button sits inside the .journal-textarea-wrap container
      const micBtn = page
        .locator('.journal-textarea-wrap button')
        .or(page.locator('button[aria-label*="mic" i]'))
        .or(page.locator('button[title*="mic" i]'))
        .or(page.locator('button[class*="mic" i]'))
        .first();
      await expect(micBtn).toBeVisible({ timeout: 5000 });
    });

    test('20 - Daily Journal - form fields (title, date, description) all exist', async ({ page }) => {
      await bypassConsent(page);
      await page.goto(`${BASE_URL}/journal`);
      await waitForApp(page);
      // Title
      await expect(
        page.locator('input[placeholder*="title" i], input[name*="title" i]').first()
      ).toBeVisible({ timeout: 5000 });
      // Date (custom DatePicker renders three <select> elements with class dp-select)
      await expect(page.locator('select.dp-select, .dp-wrap select').first()).toBeVisible({ timeout: 5000 });
      // Description textarea
      await expect(page.locator('textarea').first()).toBeVisible({ timeout: 5000 });
    });

    test('21 - Skills - "Add Skill" button exists and is visible', async ({ page }) => {
      await bypassConsent(page);
      await page.goto(`${BASE_URL}/skills`);
      await waitForApp(page);
      const addBtn = page.locator('button').filter({ hasText: /add skill/i }).first();
      await expect(addBtn).toBeVisible({ timeout: 5000 });
    });

    test('22 - CV Scanner - upload drop-zone or file input is present', async ({ page }) => {
      await bypassConsent(page);
      await page.goto(`${BASE_URL}/cv-scanner`);
      await waitForApp(page);
      // When no CV is stored: .drop-zone + hidden file input are rendered.
      // When a CV is already stored: "Replace CV" button is rendered instead.
      const found =
        (await page.locator('.drop-zone').count()) > 0 ||
        (await page.locator('input[type="file"]').count()) > 0 ||
        (await page.locator('button').filter({ hasText: /replace cv|upload|browse|scan/i }).count()) > 0;
      expect(found).toBeTruthy();
    });

    test('23 - Interview Prep - start or practice button exists and is visible', async ({ page }) => {
      await bypassConsent(page);
      await page.goto(`${BASE_URL}/interview-prep`);
      await waitForApp(page);
      const btn = page
        .locator('button')
        .filter({ hasText: /practice|start|analyze/i })
        .first();
      await expect(btn).toBeVisible({ timeout: 5000 });
    });
  });
});
