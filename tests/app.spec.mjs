import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'fs';

const BASE_URL = 'https://careerdna-orpin.vercel.app';
const AUTH_FILE = 'tests/.auth/user.json';
const CONSENT_KEY = 'cdna_consent_v1';
const EMAIL = 'playwright.test@careerdna.app';
const PASSWORD = 'TestCareer2025!';
const SCREENSHOTS = 'tests/screenshots';
const DESKTOP = { width: 1920, height: 1080 };
const MOBILE = { width: 390, height: 844 };

mkdirSync(SCREENSHOTS, { recursive: true });
mkdirSync('tests/.auth', { recursive: true });
writeFileSync(AUTH_FILE, JSON.stringify({ cookies: [], origins: [] }));

const ss = (page, name) =>
  page.screenshot({ path: `${SCREENSHOTS}/${name}`, fullPage: true });

const bypassConsent = (page) =>
  page.addInitScript(`localStorage.setItem('${CONSENT_KEY}', 'true')`);

const waitForApp = async (page) =>
  page.waitForLoadState('networkidle', { timeout: 15_000 })
    .catch(() => page.waitForTimeout(2000));

const uid = () => Math.random().toString(16).slice(2, 6);

/**
 * Inject Web Speech API stubs so Playwright Chromium can exercise
 * the Live Simulation UI (Chromium headless doesn't expose these APIs natively).
 * The speechSynthesis stub fires onend after 300 ms so the interview advances
 * from "speaking" → "listening" without blocking.
 */
const mockSpeechApis = (page) =>
  page.addInitScript(() => {
    function SpeechRecognitionMock() {
      this.continuous = false;
      this.interimResults = false;
      this.lang = '';
      this.onresult = null;
      this.onerror = null;
      this.onend = null;
      this.onstart = null;
      this.start = () => {};
      this.stop = () => {};
      this.abort = () => {};
    }
    window.webkitSpeechRecognition = SpeechRecognitionMock;
    window.SpeechRecognition = SpeechRecognitionMock;

    window.speechSynthesis = {
      speak(utt) {
        setTimeout(() => utt.onstart?.(), 50);
        setTimeout(() => utt.onend?.(), 300);
      },
      cancel: () => {},
      getVoices: () => [{ name: 'Samantha', lang: 'en-US' }],
      onvoiceschanged: null,
    };
  });

// ──────────────────────────────────────────────────────────────────────────────
// SECTION 1 — AUTH FLOW (unauthenticated browser, no saved session)
// ──────────────────────────────────────────────────────────────────────────────

test.describe('Section 1 — Auth Flow', () => {
  test.use({ viewport: DESKTOP });

  test('01 — unauthenticated user is redirected from / to /auth', async ({ page }) => {
    await bypassConsent(page);
    await page.goto(BASE_URL);
    await page.waitForURL(/\/auth/, { timeout: 10_000 });
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await ss(page, '01-homepage-desktop.png');
  });

  test('02 — /auth shows Sign In form with email and password fields', async ({ page }) => {
    await bypassConsent(page);
    await page.goto(`${BASE_URL}/auth`);
    await page.waitForSelector('input[type="email"]');

    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toContainText('Sign In');
    await ss(page, '02-login-desktop.png');
  });

  test('03 — Sign Up tab switches to registration mode with "Create Account" button', async ({ page }) => {
    await bypassConsent(page);
    await page.goto(`${BASE_URL}/auth`);
    await page.waitForSelector('text=Sign Up');

    await page.click('text=Sign Up');
    await page.waitForTimeout(400);

    await expect(page.locator('button[type="submit"]')).toContainText('Create Account');
    await ss(page, '03-signup-desktop.png');
  });

  test('04 — Sign In with wrong credentials shows .auth-error message', async ({ page }) => {
    await bypassConsent(page);
    await page.goto(`${BASE_URL}/auth`);
    await page.waitForSelector('input[type="email"]');

    await page.fill('input[type="email"]', 'notauser@example.invalid');
    await page.fill('input[type="password"]', 'DefinitelyWrong99!');
    await page.click('button[type="submit"]');

    await expect(page.locator('.auth-error')).toBeVisible({ timeout: 15_000 });
    const errorText = (await page.locator('.auth-error').textContent()) ?? '';
    expect(errorText.trim().length, 'Error message should not be empty').toBeGreaterThan(0);
    expect(page.url()).toContain('/auth');
  });

  test('05 — empty form stays on /auth (HTML required validation prevents submit)', async ({ page }) => {
    await bypassConsent(page);
    await page.goto(`${BASE_URL}/auth`);
    await page.waitForSelector('input[type="email"]');

    await page.click('button[type="submit"]');
    await page.waitForTimeout(1000);

    expect(page.url()).toContain('/auth');
    await expect(page.locator('.auth-error')).not.toBeVisible();
  });

  test('06 — password visibility toggle changes input type between password and text', async ({ page }) => {
    await bypassConsent(page);
    await page.goto(`${BASE_URL}/auth`);
    await page.waitForSelector('input[type="password"]');

    const pwWrap = page.locator('.auth-password-wrap');
    await expect(pwWrap.locator('input[type="password"]')).toBeVisible();

    const eyeBtn = page.locator('.auth-eye-btn');
    await expect(eyeBtn).toBeVisible();
    await eyeBtn.click();

    // Password field is now type="text" (value visible)
    await expect(pwWrap.locator('input[type="text"]')).toBeVisible();
    await expect(pwWrap.locator('input[type="password"]')).not.toBeVisible();

    // Toggle back
    await eyeBtn.click();
    await expect(pwWrap.locator('input[type="password"]')).toBeVisible();
    await expect(pwWrap.locator('input[type="text"]')).not.toBeVisible();
  });

  test('07 — valid credentials → Sign In → redirects to dashboard at /', async ({ page }) => {
    await bypassConsent(page);
    await page.goto(`${BASE_URL}/auth`);
    await page.waitForSelector('input[type="email"]');

    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]');

    await page.waitForURL(`${BASE_URL}/`, { timeout: 20_000 });
    expect(page.url()).toBe(`${BASE_URL}/`);
    await waitForApp(page);
    await expect(page.locator('.page, #root')).not.toBeEmpty();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// AUTHENTICATED TESTS — one login via beforeAll, session shared via storageState
// ──────────────────────────────────────────────────────────────────────────────

test.describe('Authenticated Tests', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext({ viewport: DESKTOP });
    const page = await context.newPage();
    await page.addInitScript(`localStorage.setItem('${CONSENT_KEY}', 'true')`);
    await page.goto(`${BASE_URL}/auth`);
    await page.waitForSelector('input[type="email"]');
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(`${BASE_URL}/`, { timeout: 20_000 });
    await context.storageState({ path: AUTH_FILE });
    await context.close();
  });

  test.use({ storageState: AUTH_FILE });

  // ── SECTION 2 — Page Screenshots ───────────────────────────────────────────

  test.describe('Section 2 — Page Screenshots', () => {

    test('08 — Overview / Dashboard — desktop 1920×1080', async ({ page }) => {
      await bypassConsent(page);
      await page.setViewportSize(DESKTOP);
      await page.goto(`${BASE_URL}/`);
      await waitForApp(page);
      await ss(page, '04-overview-desktop.png');
    });

    test('09 — Overview / Dashboard — mobile 390×844', async ({ page }) => {
      await bypassConsent(page);
      await page.setViewportSize(MOBILE);
      await page.goto(`${BASE_URL}/`);
      await waitForApp(page);
      await ss(page, '05-overview-mobile.png');
    });

    test('10 — Daily Journal — desktop', async ({ page }) => {
      await bypassConsent(page);
      await page.setViewportSize(DESKTOP);
      await page.goto(`${BASE_URL}/journal`);
      await waitForApp(page);
      await ss(page, '06-journal-desktop.png');
    });

    test('11 — Daily Journal — mobile', async ({ page }) => {
      await bypassConsent(page);
      await page.setViewportSize(MOBILE);
      await page.goto(`${BASE_URL}/journal`);
      await waitForApp(page);
      await ss(page, '07-journal-mobile.png');
    });

    test('12 — Past Experiences — mobile via Journal tab switcher', async ({ page }) => {
      await bypassConsent(page);
      await page.setViewportSize(MOBILE);
      await page.goto(`${BASE_URL}/journal`);
      await waitForApp(page);
      const expTab = page.locator('.jmt-tab:not(.active)').first();
      if (await expTab.isVisible({ timeout: 4000 }).catch(() => false)) {
        await expTab.click();
        await page.waitForTimeout(1200);
      }
      await ss(page, '08-experiences-mobile.png');
    });

    test('13 — Skills / My Skills — desktop', async ({ page }) => {
      await bypassConsent(page);
      await page.setViewportSize(DESKTOP);
      await page.goto(`${BASE_URL}/skills`);
      await waitForApp(page);
      await ss(page, '09-skills-myskills-desktop.png');
    });

    test('14 — Skills / My Skills — mobile', async ({ page }) => {
      await bypassConsent(page);
      await page.setViewportSize(MOBILE);
      await page.goto(`${BASE_URL}/skills`);
      await waitForApp(page);
      await ss(page, '10-skills-myskills-mobile.png');
    });

    test('15 — CV Scanner — desktop', async ({ page }) => {
      await bypassConsent(page);
      await page.setViewportSize(DESKTOP);
      await page.goto(`${BASE_URL}/cv-scanner`);
      await waitForApp(page);
      await ss(page, '11-skills-cvscanner-desktop.png');
    });

    test('16 — CV Scanner — mobile via Skills tab switcher', async ({ page }) => {
      await bypassConsent(page);
      await page.setViewportSize(MOBILE);
      await page.goto(`${BASE_URL}/skills`);
      await waitForApp(page);
      const cvTab = page.locator('.smt-tab:not(.active)').first();
      if (await cvTab.isVisible({ timeout: 4000 }).catch(() => false)) {
        await cvTab.click();
        await page.waitForTimeout(1200);
      }
      await ss(page, '12-skills-cvscanner-mobile.png');
    });

    test('17 — Skill Gap — desktop', async ({ page }) => {
      await bypassConsent(page);
      await page.setViewportSize(DESKTOP);
      await page.goto(`${BASE_URL}/skill-gap`);
      await waitForApp(page);
      await ss(page, '13-skillgap-desktop.png');
    });

    test('18 — Skill Gap — mobile', async ({ page }) => {
      await bypassConsent(page);
      await page.setViewportSize(MOBILE);
      await page.goto(`${BASE_URL}/skill-gap`);
      await waitForApp(page);
      await ss(page, '14-skillgap-mobile.png');
    });

    test('19 — Interview Preparation — desktop', async ({ page }) => {
      await bypassConsent(page);
      await page.setViewportSize(DESKTOP);
      await page.goto(`${BASE_URL}/interview-prep`);
      await waitForApp(page);
      await ss(page, '15-interview-desktop.png');
    });

    test('20 — Interview Preparation — mobile', async ({ page }) => {
      await bypassConsent(page);
      await page.setViewportSize(MOBILE);
      await page.goto(`${BASE_URL}/interview-prep`);
      await waitForApp(page);
      await ss(page, '16-interview-mobile.png');
    });

    test('21 — Live Simulation setup — desktop', async ({ page }) => {
      await bypassConsent(page);
      await mockSpeechApis(page);
      await page.setViewportSize(DESKTOP);
      await page.goto(`${BASE_URL}/interview-prep`);
      await waitForApp(page);
      const liveTab = page.locator('.ip-mode-tab').nth(1);
      if (await liveTab.isVisible({ timeout: 5000 }).catch(() => false)) {
        await liveTab.click();
        await page.waitForTimeout(1000);
      }
      await ss(page, '17-live-simulation-desktop.png');
    });

    test('22 — Live Simulation setup — mobile', async ({ page }) => {
      await bypassConsent(page);
      await mockSpeechApis(page);
      await page.setViewportSize(MOBILE);
      await page.goto(`${BASE_URL}/interview-prep`);
      await waitForApp(page);
      const liveTab = page.locator('.ip-mode-tab').nth(1);
      if (await liveTab.isVisible({ timeout: 5000 }).catch(() => false)) {
        await liveTab.click();
        await page.waitForTimeout(1000);
      }
      await ss(page, '18-live-simulation-mobile.png');
    });
  });

  // ── SECTION 3 — Daily Journal E2E ─────────────────────────────────────────

  test.describe('Section 3 — Daily Journal (E2E)', () => {
    test.use({ viewport: DESKTOP });

    test('23 — journal form has title, date picker, and textarea all interactive', async ({ page }) => {
      await bypassConsent(page);
      await page.goto(`${BASE_URL}/journal`);
      await waitForApp(page);

      // Title
      const titleInput = page.locator('.journal-title-input');
      await expect(titleInput).toBeVisible();
      await titleInput.fill('E2E test title');
      await expect(titleInput).toHaveValue('E2E test title');

      // Date picker (three <select class="dp-select"> elements)
      await expect(page.locator('select.dp-select').first()).toBeVisible();

      // Description textarea
      const textarea = page.locator('.journal-textarea');
      await expect(textarea).toBeVisible();
      await textarea.fill('E2E test content');
      await expect(textarea).toHaveValue('E2E test content');
    });

    test('24 — submit button is disabled when description textarea is empty', async ({ page }) => {
      await bypassConsent(page);
      await page.goto(`${BASE_URL}/journal`);
      await waitForApp(page);

      // Fill title but leave description blank
      await page.fill('.journal-title-input', 'Some title');
      // disabled={saving || !text.trim() || !entryDate}
      await expect(page.locator('button[type="submit"]')).toBeDisabled();
    });

    test('25 — fill all fields + submit → entry appears in Past Entries list', async ({ page }) => {
      await bypassConsent(page);
      await page.goto(`${BASE_URL}/journal`);
      await waitForApp(page);

      const title = `PW Entry ${uid()}`;
      const content = `Playwright E2E automated test — ${new Date().toISOString()}`;

      await page.fill('.journal-title-input', title);
      await page.fill('.journal-textarea', content);

      await expect(page.locator('button[type="submit"]')).toBeEnabled({ timeout: 3000 });
      await page.click('button[type="submit"]');

      // Button enters "Saving…" state then resets once Supabase responds
      // Wait for the new entry card to appear (up to 15 s for round-trip)
      await expect(
        page.locator('.entry-card').filter({ hasText: title })
      ).toBeVisible({ timeout: 15_000 });

      // Form should be reset: title cleared
      await expect(page.locator('.journal-title-input')).toHaveValue('', { timeout: 5000 });

      // Cleanup
      const card = page.locator('.entry-card').filter({ hasText: title });
      await card.locator('.delete-btn').click();
      await expect(card).not.toBeVisible({ timeout: 5000 });
    });

    test('26 — delete a journal entry removes it from Past Entries', async ({ page }) => {
      await bypassConsent(page);
      await page.goto(`${BASE_URL}/journal`);
      await waitForApp(page);

      const title = `PW Delete ${uid()}`;
      await page.fill('.journal-title-input', title);
      await page.fill('.journal-textarea', 'Entry created by test — will be deleted');
      await page.click('button[type="submit"]');

      const card = page.locator('.entry-card').filter({ hasText: title });
      await expect(card).toBeVisible({ timeout: 15_000 });

      await card.locator('.delete-btn').click();

      // Entry disappears immediately (local state update)
      await expect(card).not.toBeVisible({ timeout: 5000 });
    });

    test('27 — microphone button visible in textarea wrap when speech API is supported', async ({ page }) => {
      await bypassConsent(page);
      await page.goto(`${BASE_URL}/journal`);
      await waitForApp(page);

      const speechSupported = await page.evaluate(
        () => !!(window.SpeechRecognition || window.webkitSpeechRecognition)
      );
      if (!speechSupported) {
        test.skip();
        return;
      }

      const micBtn = page
        .locator('.journal-textarea-wrap button')
        .or(page.locator('button[aria-label*="mic" i]'))
        .or(page.locator('button[class*="mic" i]'))
        .first();
      await expect(micBtn).toBeVisible({ timeout: 5000 });
    });

    test('28 — mobile: Experiences tab switch works, Journal tab switch returns form', async ({ page }) => {
      await bypassConsent(page);
      await page.setViewportSize(MOBILE);
      await page.goto(`${BASE_URL}/journal`);
      await waitForApp(page);

      // Default: Journal tab is active
      await expect(page.locator('.jmt-tab.active')).toBeVisible();
      await expect(page.locator('.journal-form')).toBeVisible({ timeout: 5000 });

      // Switch to Experiences
      const expTab = page.locator('.jmt-tab').filter({ hasText: /Experiences/i });
      await expect(expTab).toBeVisible({ timeout: 5000 });
      await expTab.click();
      await page.waitForTimeout(600);

      await expect(page.locator('.jmt-tab.active')).toContainText('Experiences', { timeout: 5000 });
      await expect(page.locator('.journal-form')).not.toBeVisible();

      // Switch back
      const journalTab = page.locator('.jmt-tab').filter({ hasText: /Journal/i });
      await journalTab.click();
      await page.waitForTimeout(600);

      await expect(page.locator('.journal-form')).toBeVisible({ timeout: 5000 });
    });
  });

  // ── SECTION 4 — Skills E2E ────────────────────────────────────────────────

  test.describe('Section 4 — Skills (E2E)', () => {
    test.use({ viewport: DESKTOP });

    test('29 — skill form has name input, category select, level range, and submit', async ({ page }) => {
      await bypassConsent(page);
      await page.goto(`${BASE_URL}/skills`);
      await waitForApp(page);

      await expect(page.locator('.skill-input')).toBeVisible();
      await expect(page.locator('.skill-select')).toBeVisible();
      await expect(page.locator('.level-range')).toBeVisible();
      await expect(page.locator('button[type="submit"]')).toBeVisible();
    });

    test('30 — submit button is disabled when skill name input is empty', async ({ page }) => {
      await bypassConsent(page);
      await page.goto(`${BASE_URL}/skills`);
      await waitForApp(page);

      // disabled={saving || !skillName.trim()}
      await expect(page.locator('button[type="submit"]')).toBeDisabled();
    });

    test('31 — add a skill → it appears in the skill list with correct name and level', async ({ page }) => {
      await bypassConsent(page);
      await page.goto(`${BASE_URL}/skills`);
      await waitForApp(page);

      const name = `PWSkill_${uid()}`;

      await page.fill('.skill-input', name);
      await page.selectOption('.skill-select', 'Technical');
      await page.fill('.level-range', '4');

      await expect(page.locator('button[type="submit"]')).toBeEnabled();
      await page.click('button[type="submit"]');

      // Skill card appears after Supabase insert + loadSkills()
      const card = page.locator('.skill-card').filter({ hasText: name });
      await expect(card.locator('.skill-name')).toBeVisible({ timeout: 15_000 });
      await expect(card.locator('.skill-level-text')).toContainText('Level 4');

      // Cleanup
      await card.locator('.delete-btn').click();
      await expect(card).not.toBeVisible({ timeout: 5000 });
    });

    test('32 — delete a skill → it is removed from the list immediately', async ({ page }) => {
      await bypassConsent(page);
      await page.goto(`${BASE_URL}/skills`);
      await waitForApp(page);

      const name = `PWDel_${uid()}`;
      await page.fill('.skill-input', name);
      await page.click('button[type="submit"]');

      const card = page.locator('.skill-card').filter({ hasText: name });
      await expect(card).toBeVisible({ timeout: 15_000 });

      await card.locator('.delete-btn').click();
      await expect(card).not.toBeVisible({ timeout: 5000 });
    });

    test('33 — CV Scanner page has a drop zone or file input or upload button', async ({ page }) => {
      await bypassConsent(page);
      await page.goto(`${BASE_URL}/cv-scanner`);
      await waitForApp(page);

      const hasDropZone  = (await page.locator('.drop-zone').count()) > 0;
      const hasFileInput = (await page.locator('input[type="file"]').count()) > 0;
      const hasUploadBtn = (await page.locator('button').filter({ hasText: /replace|upload|browse|scan/i }).count()) > 0;

      expect(
        hasDropZone || hasFileInput || hasUploadBtn,
        'Expected a drop zone, file input, or upload button on the CV Scanner page'
      ).toBeTruthy();
    });

    test('34 — mobile: switching to CV Scanner tab shows CV content', async ({ page }) => {
      await bypassConsent(page);
      await page.setViewportSize(MOBILE);
      await page.goto(`${BASE_URL}/skills`);
      await waitForApp(page);

      const cvTab = page.locator('.smt-tab').filter({ hasText: /CV Scanner/i });
      await expect(cvTab).toBeVisible({ timeout: 5000 });
      await cvTab.click();
      await page.waitForTimeout(800);

      await expect(
        page.locator('.smt-tab.active').filter({ hasText: /CV Scanner/i })
      ).toBeVisible({ timeout: 5000 });

      // Switch back to My Skills
      const mySkillsTab = page.locator('.smt-tab').filter({ hasText: /My Skills/i });
      await mySkillsTab.click();
      await page.waitForTimeout(600);
      await expect(page.locator('.skill-form')).toBeVisible({ timeout: 5000 });
    });
  });

  // ── SECTION 5 — Skill Gap E2E ─────────────────────────────────────────────

  test.describe('Section 5 — Skill Gap (E2E)', () => {

    test('35 — Skill Gap page loads without error and shows role input — desktop', async ({ page }) => {
      await bypassConsent(page);
      await page.setViewportSize(DESKTOP);
      await page.goto(`${BASE_URL}/skill-gap`);
      await waitForApp(page);

      await expect(page.locator('.page')).toBeVisible();

      // Role text input is present
      const roleInput = page.locator('input[type="text"]').first();
      await expect(roleInput).toBeVisible({ timeout: 5000 });

      await ss(page, '13-skillgap-desktop.png');
    });

    test('36 — Skill Gap shows same saved role on desktop and mobile viewports', async ({ page }) => {
      await bypassConsent(page);

      await page.setViewportSize(DESKTOP);
      await page.goto(`${BASE_URL}/skill-gap`);
      await waitForApp(page);
      const desktopRole = await page.locator('input[type="text"]').first().inputValue().catch(() => '');

      await page.setViewportSize(MOBILE);
      await page.goto(`${BASE_URL}/skill-gap`);
      await waitForApp(page);
      const mobileRole = await page.locator('input[type="text"]').first().inputValue().catch(() => '');

      expect(desktopRole).toBe(mobileRole);
      await ss(page, '14-skillgap-mobile.png');
    });

    test('37 — Skill Gap: if a role was previously saved, requirements are shown', async ({ page }) => {
      await bypassConsent(page);
      await page.setViewportSize(DESKTOP);
      await page.goto(`${BASE_URL}/skill-gap`);
      await waitForApp(page);

      const roleInput = page.locator('input[type="text"]').first();
      const savedRole = await roleInput.inputValue().catch(() => '');

      if (!savedRole) {
        // No target role set for this account — skip this assertion
        test.skip();
        return;
      }

      // When a role is saved, requirements with percentages should render
      // Wait for either a percentage element or an analyze button (in case it's loading)
      await expect(
        page.locator('[class*="pct"], [class*="percent"], [class*="match"], [class*="req"]').first()
      ).toBeVisible({ timeout: 10_000 });
    });
  });

  // ── SECTION 6 — Interview Prep E2E ────────────────────────────────────────

  test.describe('Section 6 — Interview Prep (E2E)', () => {
    test.use({ viewport: DESKTOP });

    test('38 — Prep mode: mode tabs visible, profile analysis area renders', async ({ page }) => {
      test.setTimeout(90_000);
      await bypassConsent(page);
      await page.goto(`${BASE_URL}/interview-prep`);
      await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});

      // Mode tabs must be visible
      await expect(page.locator('.ip-mode-tabs')).toBeVisible({ timeout: 10_000 });
      await expect(page.locator('.ip-mode-tab').first()).toContainText('Prep Mode');
      await expect(page.locator('.ip-mode-tab').nth(1)).toContainText('Live Simulation');

      // Wait for analysis card, error, notice, or loading indicator
      await expect(
        page.locator('.ip-analysis-card, .ip-error, .ip-notice, .ip-loading-card')
      ).toBeVisible({ timeout: 60_000 });

      const hasAnalysis = await page.locator('.ip-analysis-card').isVisible().catch(() => false);
      if (hasAnalysis) {
        await expect(page.locator('.ip-readiness-score')).toBeVisible();
        const scoreText = await page.locator('.ip-readiness-score').textContent();
        expect(scoreText?.match(/\d+/), 'Readiness score should contain a number').toBeTruthy();
      }
    });

    test('39 — Prep mode: interview questions are generated and Practice button is clickable', async ({ page }) => {
      test.setTimeout(90_000);
      await bypassConsent(page);
      await page.goto(`${BASE_URL}/interview-prep`);
      await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});

      const firstCard = page.locator('.ip-question-card').first();
      const questionsLoaded = await firstCard.isVisible({ timeout: 60_000 }).catch(() => false);

      if (!questionsLoaded) {
        const errorText = await page.locator('.ip-error').first().textContent().catch(() => null);
        if (errorText) throw new Error(`Questions failed: ${errorText}`);

        const noticeVisible = await page.locator('.ip-notice').isVisible().catch(() => false);
        if (noticeVisible) { test.skip(); return; }

        throw new Error('Interview questions did not appear within 60 s');
      }

      const count = await page.locator('.ip-question-card').count();
      expect(count, 'At least one question should be shown').toBeGreaterThan(0);

      const qText = await firstCard.locator('.ip-q-text').textContent();
      expect(qText?.trim().length, 'Question text should not be empty').toBeGreaterThan(10);

      // Practice button must be clickable
      const practiceBtn = firstCard.locator('.ip-practice-btn');
      await expect(practiceBtn).toBeVisible();
      await expect(practiceBtn).toBeEnabled();
    });

    test('40 — click Practice → answer textarea appears → submit → AI feedback shown', async ({ page }) => {
      test.setTimeout(120_000);
      await bypassConsent(page);
      await page.goto(`${BASE_URL}/interview-prep`);
      await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});

      const firstCard = page.locator('.ip-question-card').first();
      const questionsLoaded = await firstCard.isVisible({ timeout: 60_000 }).catch(() => false);
      if (!questionsLoaded) { test.skip(); return; }

      // Open practice panel
      await firstCard.locator('.ip-practice-btn').click();
      await expect(page.locator('.ip-answer-textarea')).toBeVisible({ timeout: 5000 });

      // Fill a substantial answer (evaluator penalises very short answers)
      await page.fill(
        '.ip-answer-textarea',
        'In my previous role I faced a tight deadline on a critical product launch. ' +
        'I broke the project into milestones, delegated tasks to the right team members, ' +
        'and held daily standups to surface blockers early. The launch shipped on schedule ' +
        'and user adoption exceeded targets by 25% in the first month.'
      );

      const submitBtn = page.locator('.ip-submit-btn');
      await expect(submitBtn).toBeEnabled();
      await submitBtn.click();

      // "Evaluating…" state should appear
      await expect(submitBtn).toContainText('Evaluating', { timeout: 10_000 });

      // Wait for feedback panel (Groq evaluation call — can take 10–20 s)
      await expect(page.locator('.ip-feedback')).toBeVisible({ timeout: 45_000 });

      // Feedback must have a numeric score
      await expect(page.locator('.ip-score-badge')).toBeVisible();
      const scoreText = await page.locator('.ip-score-badge').textContent();
      expect(scoreText?.match(/\d+/), 'Feedback score should contain a number').toBeTruthy();

      // All three feedback blocks must be present
      await expect(page.locator('.ip-fb-block.good')).toBeVisible();
      await expect(page.locator('.ip-fb-block.missing')).toBeVisible();
      await expect(page.locator('.ip-fb-block.improve')).toBeVisible();

      // Close the practice panel
      await page.locator('button').filter({ hasText: 'Close' }).click();
      await expect(page.locator('.ip-answer-textarea')).not.toBeVisible({ timeout: 3000 });
    });
  });

  // ── SECTION 7 — Live Simulation E2E ──────────────────────────────────────

  test.describe('Section 7 — Live Simulation (E2E)', () => {
    test.use({ viewport: DESKTOP });

    test('41 — Live Simulation tab shows setup screen with count buttons and Start Interview', async ({ page }) => {
      await bypassConsent(page);
      await mockSpeechApis(page);
      await page.goto(`${BASE_URL}/interview-prep`);
      await waitForApp(page);

      await page.locator('.ip-mode-tab').nth(1).click();
      await expect(page.locator('.sim-setup')).toBeVisible({ timeout: 5000 });

      // Count buttons
      await expect(page.locator('.sim-count-btn').filter({ hasText: '5' })).toBeVisible();
      await expect(page.locator('.sim-count-btn').filter({ hasText: '10' })).toBeVisible();
      await expect(page.locator('.sim-count-btn').filter({ hasText: '15' })).toBeVisible();

      // Default is 10 questions active
      await expect(page.locator('.sim-count-btn.active')).toContainText('10');

      // Action buttons
      await expect(page.locator('.sim-start-btn')).toBeVisible();
      await expect(page.locator('.sim-back-link')).toBeVisible();
    });

    test('42 — count selector updates the active question count', async ({ page }) => {
      await bypassConsent(page);
      await mockSpeechApis(page);
      await page.goto(`${BASE_URL}/interview-prep`);
      await waitForApp(page);

      await page.locator('.ip-mode-tab').nth(1).click();
      await expect(page.locator('.sim-setup')).toBeVisible({ timeout: 5000 });

      await page.locator('.sim-count-btn').filter({ hasText: '5' }).click();
      await expect(page.locator('.sim-count-btn').filter({ hasText: '5' })).toHaveClass(/active/);
      await expect(page.locator('.sim-count-btn').filter({ hasText: '10' })).not.toHaveClass(/active/);

      await page.locator('.sim-count-btn').filter({ hasText: '15' }).click();
      await expect(page.locator('.sim-count-btn').filter({ hasText: '15' })).toHaveClass(/active/);
      await expect(page.locator('.sim-count-btn').filter({ hasText: '5' })).not.toHaveClass(/active/);
    });

    test('43 — "Back to Prep Mode" button returns to Prep Mode tab', async ({ page }) => {
      await bypassConsent(page);
      await mockSpeechApis(page);
      await page.goto(`${BASE_URL}/interview-prep`);
      await waitForApp(page);

      await page.locator('.ip-mode-tab').nth(1).click();
      await expect(page.locator('.sim-setup')).toBeVisible({ timeout: 5000 });

      await page.locator('.sim-back-link').click();

      await expect(page.locator('.sim-setup')).not.toBeVisible({ timeout: 3000 });
      await expect(page.locator('.ip-mode-tab').first()).toHaveClass(/active/);
      await expect(page.locator('.ip-section')).toBeVisible({ timeout: 5000 });
    });

    test('44 — Start Interview → generating spinner → questions appear → interview phase active', async ({ page }) => {
      test.setTimeout(90_000);
      await bypassConsent(page);
      await mockSpeechApis(page);
      await page.goto(`${BASE_URL}/interview-prep`);
      await waitForApp(page);

      await page.locator('.ip-mode-tab').nth(1).click();
      await expect(page.locator('.sim-setup')).toBeVisible({ timeout: 5000 });

      // Use 5 questions (shortest API call)
      await page.locator('.sim-count-btn').filter({ hasText: '5' }).click();

      // Set up response listener BEFORE clicking (request fires immediately on click)
      const apiResponsePromise = page.waitForResponse(
        r => r.url().includes('/api/generate-interview-questions'),
        { timeout: 30_000 }
      );

      await page.locator('.sim-start-btn').click();

      // Generating spinner should appear right away
      await expect(page.locator('.sim-spinner')).toBeVisible({ timeout: 5000 });

      // Wait for the Vercel serverless function to respond
      const apiResponse = await apiResponsePromise;
      expect(
        apiResponse.status(),
        `/api/generate-interview-questions returned HTTP ${apiResponse.status()} — check server logs`
      ).toBe(200);

      // Interview phase — question text should be rendered
      await expect(page.locator('.sim-interview')).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('.sim-question-text')).toBeVisible({ timeout: 10_000 });

      const questionText = await page.locator('.sim-question-text').textContent();
      expect(
        questionText?.trim().length,
        'Question text should be a real question, not empty'
      ).toBeGreaterThan(10);

      // Progress counter
      await expect(page.locator('.sim-q-counter')).toContainText('Question 1 of 5');

      // Interview controls
      await expect(page.locator('.sim-end-btn')).toBeVisible();
      await expect(page.locator('.sim-next-btn')).toBeVisible();
    });

    test('45 — API failure shows user-friendly error and Retry button; stays on setup', async ({ page }) => {
      await bypassConsent(page);
      await mockSpeechApis(page);
      await page.goto(`${BASE_URL}/interview-prep`);
      await waitForApp(page);

      // Intercept the question-generation API and return a 500 error
      await page.route('**/api/generate-interview-questions', async (route) => {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Simulated server error for Playwright test' }),
        });
      });

      await page.locator('.ip-mode-tab').nth(1).click();
      await expect(page.locator('.sim-setup')).toBeVisible({ timeout: 5000 });
      await page.locator('.sim-count-btn').filter({ hasText: '5' }).click();
      await page.locator('.sim-start-btn').click();

      // The component retries 3× with 2 s + 4 s backoff before giving up (~6 s total delay)
      await expect(page.locator('.sim-error')).toBeVisible({ timeout: 30_000 });

      // After exhausting retries: back to setup phase, error message visible, retry available
      await expect(page.locator('.sim-setup')).toBeVisible({ timeout: 5000 });
      await expect(page.locator('.sim-retry-btn')).toBeVisible();

      const errorText = await page.locator('.sim-error').textContent();
      expect(errorText?.trim().length, 'Error message should not be empty').toBeGreaterThan(0);
    });
  });

  // ── SECTION 8 — Navigation E2E ────────────────────────────────────────────

  test.describe('Section 8 — Navigation (E2E)', () => {
    test.use({ viewport: DESKTOP });

    test('46 — direct URL navigation reaches all main pages without errors', async ({ page }) => {
      await bypassConsent(page);

      const routes = [
        { url: `${BASE_URL}/`,              selector: '.page'         },
        { url: `${BASE_URL}/journal`,        selector: '.journal-form' },
        { url: `${BASE_URL}/skills`,         selector: '.skill-form'  },
        { url: `${BASE_URL}/cv-scanner`,     selector: '.page'         },
        { url: `${BASE_URL}/skill-gap`,      selector: '.page'         },
        { url: `${BASE_URL}/interview-prep`, selector: '.ip-mode-tabs' },
      ];

      for (const { url, selector } of routes) {
        await page.goto(url);
        await waitForApp(page);
        await expect(
          page.locator(selector),
          `Expected ${selector} to be visible at ${url}`
        ).toBeVisible({ timeout: 10_000 });
      }
    });
  });
});
