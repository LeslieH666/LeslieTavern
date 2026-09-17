import { expect, test } from '@playwright/test';

test.use({
    channel: 'msedge',
    viewport: { width: 1280, height: 900 },
});

test.describe.configure({ mode: 'serial' });

async function preparePage(page) {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#preloader')).toBeHidden();
    const onboarding = page.locator('.popup[open]:has(.onboarding)').first();
    await onboarding.waitFor({ state: 'visible', timeout: 3000 }).catch(() => {});
    if (await onboarding.isVisible()) {
        await onboarding.locator('.popup-input').fill('朋友圈测试 Persona');
        await onboarding.locator('.popup-button-ok').click();
        await expect(onboarding).toBeHidden();
    }
    await page.locator('.popup[open]').evaluateAll(popups => popups.forEach(popup => popup.close()));
}

async function openMoments(page) {
    const launcher = page.locator('#leslie-moments-launcher');
    await expect(launcher).toBeVisible();
    await expect(launcher).toContainText('朋友圈');
    await launcher.click();
    await expect(page.locator('#leslie-moments-overlay')).toHaveClass(/is-open/);
    await expect(page.locator('#leslie-moments-title')).toHaveText('朋友圈');
    await expect(page.locator('.leslie-moments-composer-heading strong')).toContainText('朋友圈测试 Persona');
}

async function openTestCharacter(page) {
    const character = page.locator('#leslie-conversation-list .leslie-conversation-item[data-entity-type="character"]')
        .filter({ hasText: 'Seraphina' })
        .first();
    await expect(character).toBeVisible();
    await character.click();
    await expect(page.locator('#send_textarea')).toBeVisible();
}

test('Leslie moments publishes, edits, archives and restores a selected-audience post', async ({ page }) => {
    const marker = `朋友圈浏览器验收-${Date.now()}`;
    const originalContent = `${marker}：今天把现实里的第一件小事分享给妹妹。`;
    const editedContent = `${marker}：今天把修改后的现实小事分享给妹妹。`;
    const consoleErrors = [];
    page.on('console', message => {
        if (message.type() === 'error') {
            consoleErrors.push(message.text());
        }
    });
    await preparePage(page);
    await openMoments(page);

    await expect(page.locator('[data-moments-action="mode"][data-mode="story"]')).toBeDisabled();
    await expect(page.locator('.leslie-moments-notice')).toContainText('模型真正处理动态后才会显示已读');
    const enthusiasmSlider = page.locator('#leslie-moments-enthusiasm-slider');
    await expect(enthusiasmSlider).toBeVisible();
    await expect(enthusiasmSlider).toHaveAttribute('min', '0');
    await expect(enthusiasmSlider).toHaveAttribute('max', '2');
    await enthusiasmSlider.evaluate((element) => {
        element.value = '2';
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await expect(page.locator('#leslie-moments-enthusiasm-value')).toHaveText('高');
    await expect(page.locator('#leslie-moments-enthusiasm-detail')).toContainText('95%');
    await page.locator('#leslie-moments-content').fill(originalContent);
    await page.locator('[data-moments-action="audience"]').click();
    await page.locator('[data-moments-action="visibility"][data-visibility="selected"]').click();
    const seraphinaAudience = page.locator('.leslie-moments-audience-list label').filter({ hasText: 'Seraphina' }).first();
    await expect(seraphinaAudience).toBeVisible();
    await seraphinaAudience.click();
    await page.locator('[data-moments-action="audience-done"]').click();
    await page.locator('[data-moments-action="submit"]').click();

    const post = page.locator('.leslie-moments-post').filter({ hasText: originalContent }).first();
    await expect(post).toBeVisible();
    await expect(post).toContainText('现实分享');
    await expect(post).toContainText('Seraphina');
    await expect(post).toContainText('等待角色查看');

    await post.locator('[data-moments-action="edit"]').click();
    await page.locator('#leslie-moments-content').fill(editedContent);
    await page.locator('[data-moments-action="submit"]').click();
    const editedPost = page.locator('.leslie-moments-post').filter({ hasText: editedContent }).first();
    await expect(editedPost).toBeVisible();
    await expect(editedPost).toContainText('已编辑');

    await editedPost.locator('[data-moments-action="ask-archive"]').click();
    await editedPost.locator('[data-moments-action="archive"]').click();
    await expect(page.locator('.leslie-moments-post').filter({ hasText: editedContent })).toHaveCount(0);

    await page.locator('[data-moments-action="archived"]').check();
    const archivedPost = page.locator('.leslie-moments-post').filter({ hasText: editedContent }).first();
    await expect(archivedPost).toContainText('已撤回');
    await archivedPost.locator('[data-moments-action="restore"]').click();
    await expect(page.locator('.leslie-moments-post').filter({ hasText: editedContent }).first()).not.toHaveClass(/is-archived/);
    await page.screenshot({ path: 'test-results/leslie-moments-desktop.png', fullPage: true });
    expect(consoleErrors).toEqual([]);
});

test('Leslie moments locks a story post to the active character story line', async ({ page }) => {
    await preparePage(page);
    await openTestCharacter(page);
    await openMoments(page);

    const storyMode = page.locator('[data-moments-action="mode"][data-mode="story"]');
    await expect(storyMode).toBeEnabled();
    await storyMode.click();
    await expect(page.locator('.leslie-moments-story-lock')).toContainText('Seraphina');
    await expect(page.locator('[data-moments-action="audience"]')).toBeDisabled();
    await page.locator('#leslie-moments-content').fill('剧情里的今天，我正式走进了新的校园。');
    await page.locator('[data-moments-action="submit"]').click();

    const post = page.locator('.leslie-moments-post').filter({ hasText: '正式走进了新的校园' }).first();
    await expect(post).toBeVisible();
    await expect(post).toContainText('剧情内动态');
    await expect(post).toContainText('剧情线：Seraphina');
});

test('Leslie moments and its audience picker fit a phone viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await preparePage(page);
    await openMoments(page);

    const overlay = page.locator('#leslie-moments-overlay');
    await expect.poll(async () => Math.abs((await overlay.boundingBox()).width - 390)).toBeLessThanOrEqual(1);
    await expect.poll(async () => Math.abs((await overlay.boundingBox()).height - 844)).toBeLessThanOrEqual(1);
    await page.locator('[data-moments-action="audience"]').click();
    const dialog = page.locator('.leslie-moments-audience-dialog');
    await expect(dialog).toBeVisible();
    await expect.poll(async () => Math.abs((await dialog.boundingBox()).width - 390)).toBeLessThanOrEqual(1);
    await expect.poll(async () => Math.abs((await dialog.boundingBox()).height - 844)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: 'test-results/leslie-moments-mobile.png', fullPage: true });
});
