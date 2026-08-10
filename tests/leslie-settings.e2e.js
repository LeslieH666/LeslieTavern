/* eslint-disable playwright/no-conditional-in-test */
import { expect, test } from '@playwright/test';

test.use({
    channel: 'msedge',
    viewport: { width: 1280, height: 900 },
});

async function preparePage(page) {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#preloader')).toBeHidden();
    await page.locator('.popup[open]').evaluateAll((popups) => popups.forEach((popup) => popup.close()));
}

test('Leslie settings keeps essentials clear and advanced tools guarded', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', (message) => {
        if (message.type() === 'error') {
            consoleErrors.push(message.text());
        }
    });

    await preparePage(page);

    const launcher = page.locator('#leslie-settings-launcher');
    await expect(page.locator('#leslie-conversation-sidebar')).toBeVisible();
    await expect(launcher).toBeHidden();
    await expect(page.locator('#ai-config-button > .drawer-toggle')).toBeHidden();
    await expect(page.locator('#rightNavHolder > .drawer-toggle')).toBeHidden();

    const conversationSidebarBox = await page.locator('#leslie-conversation-sidebar').boundingBox();

    await page.locator('.leslie-sidebar-actions [data-action="settings"]').click();

    const overlay = page.locator('#leslie-settings-overlay');
    const panel = page.locator('.leslie-settings-panel');
    const settingsMaster = page.locator('.leslie-settings-master');
    const settingsContent = page.locator('.leslie-settings-content-pane');
    const settingsNavigation = page.locator('.leslie-settings-navigation');
    const advancedPreview = page.locator('.leslie-advanced-preview');
    await expect(overlay).toBeVisible();
    await expect(overlay).toHaveCSS('opacity', '1');
    await expect(page.locator('.leslie-settings-backdrop')).toHaveCount(0);
    await expect(panel).not.toHaveAttribute('aria-modal', 'true');
    await expect.poll(async () => Math.abs((await panel.boundingBox()).x)).toBeLessThanOrEqual(1);
    await expect.poll(async () => Math.abs((await panel.boundingBox()).y)).toBeLessThanOrEqual(1);
    await expect.poll(async () => Math.abs((await panel.boundingBox()).width - 1280)).toBeLessThanOrEqual(1);
    await expect.poll(async () => Math.abs((await panel.boundingBox()).height - 900)).toBeLessThanOrEqual(1);
    await expect.poll(async () => Math.abs((await settingsMaster.boundingBox()).width - conversationSidebarBox.width)).toBeLessThanOrEqual(1);
    await expect.poll(async () => Math.abs((await settingsContent.boundingBox()).x - conversationSidebarBox.width)).toBeLessThanOrEqual(1);
    await page.locator('.popup[open]').evaluateAll((popups) => popups.forEach((popup) => popup.close()));
    await expect(settingsNavigation.locator('[data-leslie-detail="model"]')).toBeVisible();
    await expect(settingsNavigation.locator('[data-leslie-detail="character"]')).toBeVisible();
    await expect(advancedPreview).toHaveAttribute('aria-hidden', 'true');
    await expect(advancedPreview.locator('button').first()).toHaveAttribute('tabindex', '-1');
    await expect(page.locator('#leslie-advanced-relock')).toBeHidden();
    await expect(page.locator('#leslie-theme-select')).toHaveValue(await page.locator('#themes').inputValue());

    await settingsNavigation.locator('[data-leslie-detail="model"]').click();
    await expect(page.locator('#leslie-settings-home')).toBeHidden();
    await expect(page.locator('#leslie-settings-detail')).toBeVisible();
    await expect(page.locator('.leslie-detail-hero h2')).toHaveText('Model connection');
    await expect(page.locator('[data-leslie-api-kind]')).toHaveCount(2);
    await page.locator('[data-leslie-api-kind="online"]').click();
    await expect(page.locator('[data-leslie-api-kind="online"]')).toHaveClass(/is-active/);
    await expect(page.locator('.leslie-service-card')).toHaveCount(6);
    await expect(page.locator('[data-leslie-service="deepseek"]')).toBeVisible();
    await page.locator('[data-leslie-api-kind="local"]').click();
    await expect(page.locator('[data-leslie-api-kind="local"]')).toHaveClass(/is-active/);
    await expect(page.locator('.leslie-service-card')).toHaveCount(5);
    await expect(page.locator('[data-leslie-service="ollama"]')).toBeVisible();
    await page.locator('[data-leslie-api-kind="online"]').click();
    await expect(page.locator('[data-leslie-drawer-target="sys-settings-button"]')).toBeVisible();

    await settingsNavigation.locator('[data-leslie-detail="reply"]').click();
    const mainApi = await page.locator('#main_api').inputValue();
    const replyLengthSource = { openai: '#openai_max_tokens' }[mainApi] ?? '#amount_gen';
    const replyContextSource = { openai: '#openai_max_context' }[mainApi] ?? '#max_context';
    const originalLength = await page.locator('#leslie-reply-length').inputValue();
    const originalCreativity = await page.locator('#leslie-reply-creativity').inputValue();
    await expect(page.locator('#leslie-reply-length')).toHaveValue(await page.locator(replyLengthSource).inputValue());
    await expect(page.locator('#leslie-reply-context')).toHaveValue(await page.locator(replyContextSource).inputValue());
    await page.locator('[data-leslie-reply-style="novel"]').click();
    await expect(page.locator('#leslie-reply-length')).toHaveValue('1500');
    await expect(page.locator(replyLengthSource)).toHaveValue('1500');
    await expect(page.locator('#leslie-reply-creativity')).toHaveValue('1.05');
    await expect(page.locator('[data-leslie-reply-style="novel"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-leslie-preset-undo]')).toBeVisible();
    await page.locator('[data-leslie-preset-undo]').click();
    await expect(page.locator('#leslie-reply-length')).toHaveValue(originalLength);
    await expect(page.locator('#leslie-reply-creativity')).toHaveValue(originalCreativity);

    for (const [detail, title] of [['character', 'Characters & chats'], ['persona', 'My identity'], ['world', 'World & memory']]) {
        await settingsNavigation.locator(`[data-leslie-detail="${detail}"]`).click();
        await expect(page.locator('.leslie-detail-hero h2')).toHaveText(title);
    }

    await page.locator('[data-leslie-settings-anchor="advanced"]').click();
    await expect(page.locator('#leslie-settings-home')).toBeVisible();
    await expect(page.locator('#leslie-settings-detail')).toBeHidden();
    await page.locator('#leslie-advanced-unlock').click();
    await expect(advancedPreview).toHaveAttribute('aria-hidden', 'false');
    await expect(advancedPreview.locator('button').first()).not.toHaveAttribute('tabindex', '-1');
    await expect(page.locator('#leslie-advanced-relock')).toBeVisible();

    await page.locator('[data-leslie-drawer-target="advanced-formatting-button"]').click();
    await expect(overlay).toBeHidden();
    await expect(page.locator('#AdvancedFormatting')).toHaveClass(/openDrawer/);

    expect(consoleErrors).toEqual([]);
});

test('Leslie settings becomes a full-screen settings page on phones', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await preparePage(page);
    await page.locator('.leslie-sidebar-actions [data-action="settings"]').click();
    await page.locator('.popup[open]').evaluateAll((popups) => popups.forEach((popup) => popup.close()));

    const overlay = page.locator('#leslie-settings-overlay');
    const panel = page.locator('.leslie-settings-panel');
    const settingsMaster = page.locator('.leslie-settings-master');
    const settingsContent = page.locator('.leslie-settings-content-pane');
    const settingsNavigation = page.locator('.leslie-settings-navigation');
    await expect(overlay).toHaveCSS('opacity', '1');
    await expect.poll(async () => Math.abs((await panel.boundingBox()).width - 390)).toBeLessThanOrEqual(1);
    await expect.poll(async () => Math.abs((await panel.boundingBox()).height - 844)).toBeLessThanOrEqual(1);
    await expect.poll(async () => Math.abs((await settingsMaster.boundingBox()).x)).toBeLessThanOrEqual(1);
    await expect.poll(async () => Math.abs((await settingsMaster.boundingBox()).width - 390)).toBeLessThanOrEqual(1);
    await expect.poll(async () => Math.abs((await settingsContent.boundingBox()).x - 390)).toBeLessThanOrEqual(1);
    const navigationRows = await settingsNavigation.locator('[data-leslie-detail]').evaluateAll((elements) => elements.slice(0, 3).map((element) => element.getBoundingClientRect().y));
    expect(navigationRows[1]).toBeGreaterThan(navigationRows[0]);
    expect(navigationRows[2]).toBeGreaterThan(navigationRows[1]);

    await settingsNavigation.locator('[data-leslie-detail="reply"]').click();
    await expect(overlay).toHaveClass(/leslie-settings-mobile-detail/);
    await expect.poll(async () => Math.abs((await settingsContent.boundingBox()).x)).toBeLessThanOrEqual(1);
    await expect(page.locator('#leslie-settings-detail')).toBeVisible();
    await expect(page.locator('.leslie-detail-hero h2')).toHaveText('Reply style');
    await expect(page.locator('[data-leslie-reply-style]')).toHaveCount(4);
    await expect(page.locator('[data-leslie-reply-style="novel"]')).toContainText('Long-form novel');
    const presetColumns = await page.locator('.leslie-style-presets').evaluate((element) => element.ownerDocument.defaultView.getComputedStyle(element).gridTemplateColumns.split(' '));
    expect(presetColumns).toHaveLength(2);
    const detailColumns = await page.locator('.leslie-detail-grid').first().evaluate((element) => element.ownerDocument.defaultView.getComputedStyle(element).gridTemplateColumns.split(' '));
    expect(detailColumns).toHaveLength(1);
    const mainApi = await page.locator('#main_api').inputValue();
    const replyLengthSource = { openai: '#openai_max_tokens' }[mainApi] ?? '#amount_gen';
    await expect(page.locator('#leslie-reply-length')).toHaveValue(await page.locator(replyLengthSource).inputValue());
    await expect(page.locator('[data-leslie-drawer-target="ai-config-button"]')).toBeVisible();

    await page.locator('[data-leslie-settings-nav-back]').click();
    await expect(overlay).not.toHaveClass(/leslie-settings-mobile-detail/);
    await expect.poll(async () => Math.abs((await settingsMaster.boundingBox()).x)).toBeLessThanOrEqual(1);
});

test('Leslie settings follows the saved Chinese interface language', async ({ page }) => {
    await page.addInitScript({ content: 'localStorage.setItem("language", "zh-cn");' });
    await preparePage(page);
    await page.locator('.leslie-sidebar-actions [data-action="settings"]').click();

    const settingsNavigation = page.locator('.leslie-settings-navigation');
    await expect(page.locator('#leslie-settings-title')).toHaveText('设置');
    await expect(page.locator('.leslie-settings-intro h2')).toHaveText('把常用的留在眼前');
    await expect(settingsNavigation.locator('[data-leslie-detail="model"] strong')).toHaveText('模型连接');
    await settingsNavigation.locator('[data-leslie-detail="model"]').click();
    await expect(page.locator('.leslie-detail-hero h2')).toHaveText('模型连接');
    await expect(page.getByRole('heading', { name: '选择连接方式', exact: true })).toBeVisible();
    await settingsNavigation.locator('[data-leslie-detail="reply"]').click();
    await expect(page.locator('.leslie-style-presets-card h3')).toHaveText('选择一种写作节奏');
    await expect(page.locator('[data-leslie-reply-style="novel"]')).toContainText('长篇小说');
});
