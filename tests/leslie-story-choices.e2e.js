/* global localStorage */
import { expect, test } from '@playwright/test';

test.use({
    channel: 'msedge',
    viewport: { width: 1180, height: 820 },
});

test('interactive guidance remains optional and collapses for a free-form draft', async ({ page }) => {
    await page.addInitScript(() => localStorage.removeItem('leslie-story-choice-mode'));
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#preloader')).toBeHidden();
    const onboarding = page.locator('.popup').filter({ hasText: 'Welcome to SillyTavern!' });
    // eslint-disable-next-line playwright/no-conditional-in-test
    if (await onboarding.isVisible()) {
        await onboarding.locator('.popup-input').fill('Synthetic User');
        await onboarding.locator('.popup-button-ok').click();
    }
    await page.locator('.popup[open]').evaluateAll((popups) => popups.forEach((popup) => popup.close()));

    const panel = page.locator('#leslie-story-choices');
    await expect(page.locator('.leslie-conversation-item').first()).toBeVisible();
    await page.locator('.leslie-conversation-item').first().click();
    await expect(panel).toBeVisible();
    await expect(panel.locator('[data-story-mode="free"]')).toHaveClass(/is-active/);
    await expect(panel.locator('.leslie-story-choice-body')).toBeHidden();

    const textarea = page.locator('#send_textarea');
    await textarea.fill('这是一条不会被剧情选项覆盖的合成草稿。');
    await panel.locator('[data-story-mode="guided"]').click();
    await expect(panel.locator('[data-story-mode="guided"]')).toHaveClass(/is-active/);
    await expect.poll(() => page.evaluate(() => localStorage.getItem('leslie-story-choice-mode'))).toBe('guided');
    await expect(panel.locator('[data-story-user-name]')).toHaveText('Synthetic User');
    await expect(panel.locator('.leslie-story-choice-perspective')).toContainText('接下来');

    await textarea.focus();
    await expect(panel).toHaveClass(/is-collapsed/);
    await expect(panel.locator('[data-story-action="expand"]')).toBeVisible();
    await expect(textarea).toHaveValue('这是一条不会被剧情选项覆盖的合成草稿。');

    await panel.locator('[data-story-mode="free"]').click();
    await expect(panel.locator('[data-story-mode="free"]')).toHaveClass(/is-active/);
    await expect(panel.locator('.leslie-story-choice-body')).toBeHidden();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('leslie-story-choice-mode'))).toBe('free');
    await textarea.fill('');
});
