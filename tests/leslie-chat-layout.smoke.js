import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* global WebSocket */

const APP_URL = process.env.LESLIE_TEST_URL || 'http://127.0.0.1:8000/';
const EDGE_PATH = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'test-results');
const DESKTOP_SCREENSHOT = path.join(OUTPUT_DIR, 'leslie-chat-layout.png');
const MOBILE_SCREENSHOT = path.join(OUTPUT_DIR, 'leslie-chat-layout-mobile.png');
const SETTINGS_SCREENSHOT = path.join(OUTPUT_DIR, 'leslie-settings-master-detail.png');
const HEADER_MENU_SCREENSHOT = path.join(OUTPUT_DIR, 'leslie-chat-more-menu.png');
const LOCAL_API_SCREENSHOT = path.join(OUTPUT_DIR, 'leslie-settings-local-api.png');
const MEMORY_SCREENSHOT = path.join(OUTPUT_DIR, 'leslie-memory-master-detail.png');
const SETTINGS_MOBILE_SCREENSHOT = path.join(OUTPUT_DIR, 'leslie-settings-mobile.png');
const SETTINGS_MOBILE_DETAIL_SCREENSHOT = path.join(OUTPUT_DIR, 'leslie-settings-mobile-detail.png');
const MEMORY_MOBILE_SCREENSHOT = path.join(OUTPUT_DIR, 'leslie-memory-mobile.png');

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function getFreePort() {
    const server = net.createServer();
    await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', error => error ? reject(error) : resolve()));
    const address = server.address();
    await new Promise(resolve => server.close(resolve));
    return address.port;
}

async function waitForJson(url, timeout = 20_000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeout) {
        try {
            const response = await fetch(url);
            if (response.ok) {
                return await response.json();
            }
        } catch {
            // Edge has not exposed its debugging endpoint yet.
        }
        await delay(150);
    }
    throw new Error(`Timed out waiting for ${url}`);
}

class CdpClient {
    constructor(url) {
        this.url = url;
        this.sequence = 0;
        this.pending = new Map();
        this.events = new Map();
    }

    async connect() {
        if (!WebSocket) {
            throw new Error('This smoke test requires the built-in WebSocket available in Node.js 22 or newer.');
        }
        this.socket = new WebSocket(this.url);
        this.socket.addEventListener('message', event => this.handleMessage(event));
        await new Promise((resolve, reject) => {
            this.socket.addEventListener('open', resolve, { once: true });
            this.socket.addEventListener('error', reject, { once: true });
        });
    }

    handleMessage(event) {
        const message = JSON.parse(event.data);
        if (message.id) {
            const pending = this.pending.get(message.id);
            if (!pending) {
                return;
            }
            this.pending.delete(message.id);
            if (message.error) {
                pending.reject(new Error(message.error.message));
            } else {
                pending.resolve(message.result);
            }
            return;
        }
        this.events.get(message.method)?.forEach(handler => handler(message.params));
    }

    on(method, handler) {
        const handlers = this.events.get(method) || [];
        handlers.push(handler);
        this.events.set(method, handlers);
    }

    command(method, params = {}) {
        const id = ++this.sequence;
        this.socket.send(JSON.stringify({ id, method, params }));
        return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
    }

    async evaluate(expression) {
        const response = await this.command('Runtime.evaluate', {
            expression,
            awaitPromise: true,
            returnByValue: true,
        });
        if (response.exceptionDetails) {
            throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
        }
        return response.result.value;
    }

    close() {
        this.socket?.close();
    }
}

async function waitFor(client, expression, timeout = 60_000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeout) {
        if (await client.evaluate(expression)) {
            return;
        }
        await delay(250);
    }
    throw new Error(`Timed out waiting for condition: ${expression}`);
}

async function captureScreenshot(client, filePath) {
    const result = await client.command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile(filePath, result.data, 'base64');
}

async function run() {
    await mkdir(OUTPUT_DIR, { recursive: true });
    const debugPort = await getFreePort();
    const profilePath = path.join(os.tmpdir(), `leslie-edge-${Date.now()}`);
    const edge = spawn(EDGE_PATH, [
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        '--disable-extensions',
        `--remote-debugging-port=${debugPort}`,
        `--user-data-dir=${profilePath}`,
        '--window-size=1440,900',
        'about:blank',
    ], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });

    let client;
    const consoleErrors = [];
    try {
        await waitForJson(`http://127.0.0.1:${debugPort}/json/version`);
        const targets = await waitForJson(`http://127.0.0.1:${debugPort}/json/list`);
        const pageTarget = targets.find(target => target.type === 'page');
        if (!pageTarget) {
            throw new Error('Edge did not expose a page target.');
        }

        client = new CdpClient(pageTarget.webSocketDebuggerUrl);
        await client.connect();
        client.on('Runtime.consoleAPICalled', (event) => {
            if (event.type === 'error') {
                consoleErrors.push(event.args.map(argument => argument.value || argument.description).join(' '));
            }
        });
        client.on('Runtime.exceptionThrown', event => consoleErrors.push(event.exceptionDetails.exception?.description || event.exceptionDetails.text));

        await Promise.all([
            client.command('Page.enable'),
            client.command('Runtime.enable'),
            client.command('DOM.enable'),
        ]);
        await client.command('Page.navigate', { url: APP_URL });
        await waitFor(client, `(() => {
            const preloader = document.querySelector('#preloader');
            return document.readyState === 'complete'
                && document.querySelector('#leslie-conversation-sidebar')
                && (!preloader || getComputedStyle(preloader).display === 'none' || preloader.hidden);
        })()`);

        await client.evaluate('document.querySelectorAll(\'.popup[open]\').forEach(popup => popup.close())');
        await waitFor(client, 'document.querySelectorAll(\'.leslie-conversation-item\').length > 0');

        const desktop = await client.evaluate(`(() => {
            const sidebar = document.querySelector('#leslie-conversation-sidebar').getBoundingClientRect();
            const chat = document.querySelector('#sheld').getBoundingClientRect();
            const firstConversation = document.querySelector('.leslie-conversation-item');
            return {
                sidebar: { x: sidebar.x, width: sidebar.width, height: sidebar.height },
                chat: { x: chat.x, width: chat.width, height: chat.height },
                conversationCount: document.querySelectorAll('.leslie-conversation-item').length,
                firstConversationName: firstConversation?.querySelector('strong')?.textContent?.trim() || '',
                memoryInHeader: Boolean(document.querySelector('#leslie-chat-actions #leslie-memory-launcher')),
                headerName: document.querySelector('#leslie-chat-name')?.textContent?.trim() || '',
                errorOverlay: Boolean(document.querySelector('[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay')),
            };
        })()`);

        if (desktop.headerName === '选择一个角色') {
            await client.evaluate('document.querySelector(\'.leslie-conversation-item\')?.click()');
            await waitFor(client, 'document.querySelector(\'#leslie-chat-name\')?.textContent?.trim() !== \'选择一个角色\'');
        }

        const connectionState = await client.evaluate(`(() => ({
            label: document.querySelector('[data-leslie-connection-label]')?.textContent?.trim() || '',
            detail: document.querySelector('[data-leslie-connection-detail]')?.textContent?.trim() || '',
            placeholder: document.querySelector('#send_textarea')?.placeholder || '',
            connected: document.querySelector('#leslie-conversation-sidebar')?.classList.contains('is-connected') || false,
            configured: document.querySelector('#leslie-conversation-sidebar')?.classList.contains('is-configured') || false,
        }))()`);
        await client.evaluate('document.querySelector(\'#leslie-chat-actions [data-action="chat-more"]\')?.click()');
        await waitFor(client, '!document.querySelector(\'#leslie-chat-more-menu\')?.hidden');
        const headerMenu = await client.evaluate(`(() => {
            const menu = document.querySelector('#leslie-chat-more-menu');
            const header = document.querySelector('#leslie-chat-header');
            const chat = document.querySelector('#chat');
            const rect = menu.getBoundingClientRect();
            const chatRect = chat.getBoundingClientRect();
            const sampleX = rect.left + (rect.width / 2);
            const sampleY = Math.max(chatRect.top + 8, rect.top + 24);
            const topElement = document.elementFromPoint(sampleX, sampleY);
            return {
                visible: !menu.hidden && rect.width > 0 && rect.height > 0,
                overlapsChat: rect.bottom > chatRect.top,
                unobscured: Boolean(topElement?.closest('#leslie-chat-more-menu')),
                headerZ: Number.parseInt(getComputedStyle(header).zIndex, 10),
                chatZ: Number.parseInt(getComputedStyle(chat).zIndex, 10),
            };
        })()`);
        await captureScreenshot(client, HEADER_MENU_SCREENSHOT);
        await client.evaluate('document.querySelector(\'#leslie-chat-actions [data-action="chat-more"]\')?.click()');

        await client.evaluate('document.querySelector(\'.leslie-sidebar-actions [data-action="settings"]\')?.click()');
        await waitFor(client, 'getComputedStyle(document.querySelector(\'#leslie-settings-overlay\')).display !== \'none\'');
        const settingsOpened = await client.evaluate('!document.querySelector(\'#leslie-settings-overlay\').hidden');
        const settings = await client.evaluate(`(() => {
            const panel = document.querySelector('.leslie-settings-panel').getBoundingClientRect();
            const master = document.querySelector('.leslie-settings-master').getBoundingClientRect();
            const navigation = document.querySelector('.leslie-settings-navigation').getBoundingClientRect();
            const contentPane = document.querySelector('.leslie-settings-content-pane').getBoundingClientRect();
            const content = document.querySelector('.leslie-settings-scroll').getBoundingClientRect();
            return {
                panel: { x: panel.x, y: panel.y, width: panel.width, height: panel.height },
                master: { x: master.x, y: master.y, width: master.width, height: master.height },
                navigation: { x: navigation.x, y: navigation.y, width: navigation.width, height: navigation.height },
                contentPane: { x: contentPane.x, y: contentPane.y, width: contentPane.width, height: contentPane.height },
                content: { x: content.x, y: content.y, width: content.width, height: content.height },
                categoryCount: document.querySelectorAll('.leslie-settings-navigation [data-leslie-settings-page]').length,
                activePage: document.querySelector('.leslie-settings-navigation .active')?.dataset.leslieSettingsPage || '',
                contentTitle: document.querySelector('#leslie-settings-content-title')?.textContent?.trim() || '',
                fullWindow: Math.abs(panel.x) <= 1 && Math.abs(panel.y) <= 1 && Math.abs(panel.width - innerWidth) <= 1 && Math.abs(panel.height - innerHeight) <= 1,
                replacesMainInterface: Math.abs(master.width - ${desktop.sidebar.width}) <= 1 && Math.abs(contentPane.x - (master.x + master.width)) <= 1,
                noModalBackdrop: !document.querySelector('.leslie-settings-backdrop') && !document.querySelector('.leslie-settings-panel').hasAttribute('aria-modal'),
            };
        })()`);
        await client.evaluate('document.querySelector(\'.leslie-settings-navigation [data-leslie-detail="model"]\')?.click()');
        await waitFor(client, '!document.querySelector(\'#leslie-settings-detail\').hidden');
        await client.evaluate('document.querySelector(\'[data-leslie-api-kind="online"]\')?.click()');
        await waitFor(client, 'document.querySelector(\'[data-leslie-api-kind="online"]\')?.classList.contains(\'is-active\')');
        settings.detail = await client.evaluate(`(() => ({
            activePage: document.querySelector('.leslie-settings-navigation .active')?.dataset.leslieSettingsPage || '',
            navigationVisible: document.querySelector('.leslie-settings-navigation').getBoundingClientRect().width > 0,
            modelPageVisible: !document.querySelector('#leslie-settings-detail').hidden,
            backHiddenOnDesktop: getComputedStyle(document.querySelector('[data-leslie-detail-back]')).display === 'none',
            contentTitle: document.querySelector('#leslie-settings-content-title')?.textContent?.trim() || '',
            apiKindCount: document.querySelectorAll('[data-leslie-api-kind]').length,
            activeApiKind: document.querySelector('[data-leslie-api-kind].is-active')?.dataset.leslieApiKind || '',
            providerCount: document.querySelectorAll('[data-leslie-service]').length,
            hasDeepSeek: Boolean(document.querySelector('[data-leslie-service="deepseek"]')),
            modelStatus: document.querySelector('[data-leslie-model-status] strong')?.textContent?.trim() || '',
        }))()`);
        await captureScreenshot(client, SETTINGS_SCREENSHOT);
        await client.evaluate('document.querySelector(\'[data-leslie-api-kind="local"]\')?.click()');
        await waitFor(client, 'document.querySelector(\'[data-leslie-api-kind="local"]\')?.classList.contains(\'is-active\')');
        settings.detail.local = await client.evaluate(`(() => ({
            providerCount: document.querySelectorAll('[data-leslie-service]').length,
            hasOllama: Boolean(document.querySelector('[data-leslie-service="ollama"]')),
            hasLlamaCpp: Boolean(document.querySelector('[data-leslie-service="llamacpp"]')),
            hasKoboldCpp: Boolean(document.querySelector('[data-leslie-service="koboldcpp"]')),
        }))()`);
        await captureScreenshot(client, LOCAL_API_SCREENSHOT);
        await client.evaluate('document.querySelector(\'[data-leslie-settings-close]\')?.click()');
        await waitFor(client, 'document.querySelector(\'#leslie-settings-overlay\').hidden');

        await client.evaluate('document.querySelector(\'#leslie-chat-actions [data-action="character-card"]\')?.click()');
        await waitFor(client, 'document.querySelector(\'#right-nav-panel\')?.classList.contains(\'openDrawer\')');
        const workspace = await client.evaluate(`(() => {
            const sidebar = document.querySelector('#leslie-conversation-sidebar').getBoundingClientRect();
            const panel = document.querySelector('#right-nav-panel').getBoundingClientRect();
            const availableWidth = innerWidth - sidebar.width;
            const expectedX = sidebar.width + ((availableWidth - panel.width) / 2);
            return {
                visible: panel.width > 0 && panel.height > 0,
                centered: Math.abs(panel.x - expectedX) <= 2,
                x: panel.x,
                width: panel.width,
            };
        })()`);
        await client.evaluate('document.querySelector(\'#leslie-workspace-backdrop\')?.click()');
        await waitFor(client, '!document.querySelector(\'#right-nav-panel\')?.classList.contains(\'openDrawer\')');

        await client.evaluate('document.querySelector(\'#leslie-chat-actions #leslie-memory-launcher\')?.click()');
        await waitFor(client, 'document.querySelector(\'#leslie-memory-overlay\')?.classList.contains(\'leslie-memory-open\')');
        const memory = await client.evaluate(`(() => {
            const panel = document.querySelector('#leslie-memory-panel').getBoundingClientRect();
            const navigation = document.querySelector('.leslie-memory-navigation').getBoundingClientRect();
            const content = document.querySelector('.leslie-memory-main').getBoundingClientRect();
            return {
                panel: { x: panel.x, y: panel.y, width: panel.width, height: panel.height },
                navigation: { x: navigation.x, y: navigation.y, width: navigation.width, height: navigation.height },
                content: { x: content.x, y: content.y, width: content.width, height: content.height },
                categoryCount: document.querySelectorAll('.leslie-memory-tab').length,
                activePage: document.querySelector('.leslie-memory-tab.active')?.dataset.tab || '',
                masterDetail: Math.abs(navigation.x - panel.x) <= 1 && Math.abs(content.x - (navigation.x + navigation.width)) <= 1,
            };
        })()`);
        await client.evaluate('document.querySelector(\'.leslie-memory-tab[data-tab="settings"]\')?.click()');
        await waitFor(client, 'document.querySelector(\'.leslie-memory-tab[data-tab="settings"]\')?.classList.contains(\'active\')');
        memory.settingsPageVisible = await client.evaluate('document.querySelector(\'.leslie-memory-tab.active\')?.getAttribute(\'aria-current\') === \'page\' && document.querySelector(\'#leslie-memory-content\')?.textContent.includes(\'遗忘\')');
        await captureScreenshot(client, MEMORY_SCREENSHOT);
        await client.evaluate('document.querySelector(\'#leslie-memory-panel [data-action="close"]\')?.click()');
        await waitFor(client, '!document.querySelector(\'#leslie-memory-overlay\')?.classList.contains(\'leslie-memory-open\')');

        await captureScreenshot(client, DESKTOP_SCREENSHOT);

        await client.evaluate('document.querySelector(\'#leslie-chat-actions [data-action="chat-more"]\')?.click()');
        await client.evaluate('document.querySelector(\'#leslie-chat-more-menu [data-action="disable-layout"]\')?.click()');
        const fallbackHidden = await client.evaluate('getComputedStyle(document.querySelector(\'#leslie-conversation-sidebar\')).display === \'none\'');
        const restoreVisible = await client.evaluate('getComputedStyle(document.querySelector(\'#leslie-layout-restore\')).display !== \'none\'');
        await client.evaluate('document.querySelector(\'#leslie-layout-restore\')?.click()');
        const restored = await client.evaluate('getComputedStyle(document.querySelector(\'#leslie-conversation-sidebar\')).display !== \'none\'');

        await client.command('Emulation.setDeviceMetricsOverride', {
            width: 390,
            height: 844,
            screenWidth: 390,
            screenHeight: 844,
            deviceScaleFactor: 1,
            mobile: true,
        });
        await delay(300);
        await client.evaluate('document.body.classList.remove(\'leslie-mobile-chat-open\'); document.querySelector(\'.leslie-conversation-item\')?.click()');
        await waitFor(client, 'document.body.classList.contains(\'leslie-mobile-chat-open\')');
        await waitFor(client, 'Math.abs(document.querySelector(\'#sheld\').getBoundingClientRect().x) <= 1');
        const mobile = await client.evaluate(`(() => {
            const chat = document.querySelector('#sheld');
            const rect = chat.getBoundingClientRect();
            const style = getComputedStyle(chat);
            return {
                chatOpened: document.body.classList.contains('leslie-mobile-chat-open')
                    && getComputedStyle(document.querySelector('[data-action="mobile-back"]')).display !== 'none',
                innerWidth,
                innerHeight,
                visualWidth: visualViewport?.width,
                mediaMatches: matchMedia('(max-width: 700px)').matches,
                chatRect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
                chatStyle: { left: style.left, top: style.top, width: style.width, height: style.height, transform: style.transform },
                bodyClasses: document.body.className,
            };
        })()`);
        await captureScreenshot(client, MOBILE_SCREENSHOT);
        await client.evaluate('document.querySelector(\'[data-action="mobile-back"]\')?.click()');
        mobile.listRestored = await client.evaluate('!document.body.classList.contains(\'leslie-mobile-chat-open\')');
        await waitFor(client, 'Math.abs(document.querySelector(\'#leslie-conversation-sidebar\').getBoundingClientRect().x) <= 1');

        await client.evaluate('document.querySelector(\'.leslie-sidebar-actions [data-action="settings"]\')?.click()');
        await waitFor(client, 'document.querySelector(\'#leslie-settings-overlay\')?.dataset.open === \'true\'');
        await waitFor(client, 'Math.abs(document.querySelector(\'.leslie-settings-panel\').getBoundingClientRect().width - innerWidth) <= 1');
        mobile.settings = await client.evaluate(`(() => {
            const panel = document.querySelector('.leslie-settings-panel').getBoundingClientRect();
            const master = document.querySelector('.leslie-settings-master').getBoundingClientRect();
            const contentPane = document.querySelector('.leslie-settings-content-pane').getBoundingClientRect();
            const navigation = document.querySelector('.leslie-settings-navigation').getBoundingClientRect();
            const navigationItems = [...document.querySelectorAll('.leslie-settings-navigation .leslie-settings-nav-item')];
            const closeButton = document.querySelector('.leslie-settings-close').getBoundingClientRect();
            return {
                panel: { x: panel.x, width: panel.width },
                master: { x: master.x, width: master.width },
                contentPane: { x: contentPane.x, width: contentPane.width },
                viewportWidth: innerWidth,
                documentWidth: document.documentElement.scrollWidth,
                fullWidth: Math.abs(panel.x) <= 1 && Math.abs(panel.width - innerWidth) <= 2,
                categoryListFirst: Math.abs(master.x) <= 1 && contentPane.x >= innerWidth - 1 && !document.querySelector('#leslie-settings-overlay').classList.contains('leslie-settings-mobile-detail'),
                verticalCategories: navigationItems.every((item, index) => index === 0 || item.getBoundingClientRect().y >= navigationItems[index - 1].getBoundingClientRect().bottom),
                noPageOverflow: scrollX === 0 && getComputedStyle(document.documentElement).overflowX === 'hidden',
                touchTargets: navigationItems.every(item => item.getBoundingClientRect().height >= 44) && closeButton.width >= 44 && closeButton.height >= 44,
            };
        })()`);
        await captureScreenshot(client, SETTINGS_MOBILE_SCREENSHOT);
        await client.evaluate('document.querySelector(\'.leslie-settings-navigation [data-leslie-detail="model"]\')?.click()');
        await waitFor(client, 'document.querySelector(\'#leslie-settings-overlay\')?.classList.contains(\'leslie-settings-mobile-detail\') && Math.abs(document.querySelector(\'.leslie-settings-content-pane\').getBoundingClientRect().x) <= 1');
        mobile.settings.detail = await client.evaluate(`(() => {
            const master = document.querySelector('.leslie-settings-master').getBoundingClientRect();
            const contentPane = document.querySelector('.leslie-settings-content-pane').getBoundingClientRect();
            const backButton = document.querySelector('[data-leslie-settings-nav-back]').getBoundingClientRect();
            return {
                masterOffscreen: master.right <= 1,
                contentVisible: Math.abs(contentPane.x) <= 1 && !document.querySelector('#leslie-settings-detail').hidden,
                contentTitle: document.querySelector('#leslie-settings-content-title')?.textContent?.trim() || '',
                backTouchTarget: backButton.width >= 44 && backButton.height >= 44,
            };
        })()`);
        await captureScreenshot(client, SETTINGS_MOBILE_DETAIL_SCREENSHOT);
        await client.evaluate('document.querySelector(\'[data-leslie-settings-nav-back]\')?.click()');
        await waitFor(client, '!document.querySelector(\'#leslie-settings-overlay\')?.classList.contains(\'leslie-settings-mobile-detail\') && Math.abs(document.querySelector(\'.leslie-settings-master\').getBoundingClientRect().x) <= 1');
        mobile.settings.returnedToCategories = true;
        await client.evaluate('document.querySelector(\'[data-leslie-settings-close]\')?.click()');
        await waitFor(client, 'document.querySelector(\'#leslie-settings-overlay\').hidden');

        await client.evaluate('document.querySelector(\'.leslie-conversation-item\')?.click()');
        await waitFor(client, 'document.body.classList.contains(\'leslie-mobile-chat-open\')');
        await waitFor(client, 'Math.abs(document.querySelector(\'#sheld\').getBoundingClientRect().x) <= 1');
        await client.evaluate('document.querySelector(\'#leslie-chat-actions #leslie-memory-launcher\')?.click()');
        await waitFor(client, 'document.querySelector(\'#leslie-memory-overlay\')?.classList.contains(\'leslie-memory-open\')');
        mobile.memory = await client.evaluate(`(() => {
            const panel = document.querySelector('#leslie-memory-panel').getBoundingClientRect();
            const overlay = document.querySelector('#leslie-memory-overlay').getBoundingClientRect();
            const navigation = document.querySelector('.leslie-memory-navigation').getBoundingClientRect();
            const content = document.querySelector('.leslie-memory-main').getBoundingClientRect();
            const navigationItems = [...document.querySelectorAll('.leslie-memory-tab')];
            const closeButton = document.querySelector('.leslie-memory-icon-button').getBoundingClientRect();
            return {
                panel: { x: panel.x, width: panel.width },
                overlay: { x: overlay.x, width: overlay.width },
                viewportWidth: innerWidth,
                documentWidth: document.documentElement.scrollWidth,
                fullWidth: Math.abs(panel.x) <= 1 && Math.abs(panel.width - innerWidth) <= 2,
                singleColumn: content.y >= navigation.y + navigation.height - 1,
                noPageOverflow: document.documentElement.scrollWidth <= innerWidth + 1,
                touchTargets: navigationItems.every(item => item.getBoundingClientRect().height >= 44) && closeButton.width >= 44 && closeButton.height >= 44,
            };
        })()`);
        await captureScreenshot(client, MEMORY_MOBILE_SCREENSHOT);
        await client.evaluate('document.querySelector(\'#leslie-memory-panel [data-action="close"]\')?.click()');

        const report = {
            pageReady: true,
            desktop,
            settingsOpened,
            connectionState,
            headerMenu,
            settings,
            memory,
            workspace,
            fallback: { hidden: fallbackHidden, restoreVisible, restored },
            mobile,
            consoleErrors,
            screenshots: {
                desktop: DESKTOP_SCREENSHOT,
                mobile: MOBILE_SCREENSHOT,
                settings: SETTINGS_SCREENSHOT,
                headerMenu: HEADER_MENU_SCREENSHOT,
                localApi: LOCAL_API_SCREENSHOT,
                memory: MEMORY_SCREENSHOT,
                settingsMobile: SETTINGS_MOBILE_SCREENSHOT,
                settingsMobileDetail: SETTINGS_MOBILE_DETAIL_SCREENSHOT,
                memoryMobile: MEMORY_MOBILE_SCREENSHOT,
            },
        };
        console.log(JSON.stringify(report, null, 2));

        const passed = desktop.sidebar.x === 0
            && desktop.sidebar.width >= 308
            && Math.abs(desktop.chat.x - desktop.sidebar.width) <= 1
            && desktop.conversationCount > 0
            && desktop.memoryInHeader
            && !desktop.errorOverlay
            && headerMenu.visible
            && headerMenu.overlapsChat
            && headerMenu.unobscured
            && headerMenu.headerZ > headerMenu.chatZ
            && (connectionState.connected || connectionState.configured || connectionState.label === '尚未配置模型')
            && settingsOpened
            && settings.categoryCount === 8
            && settings.activePage === 'overview'
            && settings.fullWindow
            && settings.replacesMainInterface
            && settings.noModalBackdrop
            && settings.detail.activePage === 'model'
            && settings.detail.navigationVisible
            && settings.detail.modelPageVisible
            && settings.detail.backHiddenOnDesktop
            && settings.detail.contentTitle === '模型连接'
            && settings.detail.apiKindCount === 2
            && settings.detail.activeApiKind === 'online'
            && settings.detail.providerCount === 6
            && settings.detail.hasDeepSeek
            && settings.detail.local.providerCount === 5
            && settings.detail.local.hasOllama
            && settings.detail.local.hasLlamaCpp
            && settings.detail.local.hasKoboldCpp
            && memory.categoryCount === 3
            && memory.masterDetail
            && workspace.visible
            && workspace.centered
            && fallbackHidden
            && restoreVisible
            && restored
            && mobile.chatOpened
            && mobile.listRestored
            && mobile.settings.fullWidth
            && mobile.settings.categoryListFirst
            && mobile.settings.verticalCategories
            && mobile.settings.noPageOverflow
            && mobile.settings.touchTargets
            && mobile.settings.detail.masterOffscreen
            && mobile.settings.detail.contentVisible
            && mobile.settings.detail.contentTitle === '模型连接'
            && mobile.settings.detail.backTouchTarget
            && mobile.settings.returnedToCategories
            && mobile.memory.fullWidth
            && mobile.memory.singleColumn
            && mobile.memory.noPageOverflow
            && mobile.memory.touchTargets
            && consoleErrors.length === 0;
        if (!passed) {
            process.exitCode = 1;
        }
    } finally {
        try {
            await client?.command('Browser.close');
        } catch {
            edge.kill();
        }
        client?.close();
    }
}

await run();
