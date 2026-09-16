import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* global WebSocket */

const APP_URL = process.env.LESLIE_TEST_URL || 'http://127.0.0.1:8127/';
const EDGE_PATH = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'test-results');
const DESKTOP_SCREENSHOT = path.join(OUTPUT_DIR, 'leslie-character-workshop.png');
const LIGHT_SCREENSHOT = path.join(OUTPUT_DIR, 'leslie-character-workshop-light.png');
const MOBILE_SCREENSHOT = path.join(OUTPUT_DIR, 'leslie-character-workshop-mobile.png');
const IMPORT_SCREENSHOT = path.join(OUTPUT_DIR, 'leslie-character-workshop-json-import.png');
const RUN_LIVE_GENERATION = process.env.LESLIE_LIVE_GENERATION === '1';
const LIVE_MODE = process.env.LESLIE_LIVE_MODE || 'original';
const LIVE_PROMPT = process.env.LESLIE_LIVE_PROMPT || '原创成年女性角色，名字叫林雾遥，24岁，在临海旧城区经营一家只在傍晚营业的旧书修复铺。她外表安静克制，真正的矛盾是很想理解别人、又害怕承诺超出自己能力的事。她和玩家是第一次见面，开场是暴雨导致停电后，玩家来归还一本被海水打湿的书。她不能知道玩家未说出口的经历，不替玩家行动，关系与信任必须慢慢发展。默认真人短对话，一个即时反应，最多两行。';
const LIVE_EXPECTED_NAME = process.env.LESLIE_LIVE_EXPECTED_NAME || '林雾遥';
const LIVE_ARTIFACT_NAME = process.env.LESLIE_LIVE_ARTIFACT || LIVE_MODE;
const LIVE_ARTIFACT_SUFFIX = LIVE_ARTIFACT_NAME === 'original' ? '' : `-${LIVE_ARTIFACT_NAME.replace(/[^a-z0-9_-]/gi, '-')}`;
const LIVE_SCREENSHOT = path.join(OUTPUT_DIR, `leslie-character-workshop${LIVE_ARTIFACT_SUFFIX}-live-generation.png`);
const LIVE_REPORT = path.join(OUTPUT_DIR, `leslie-character-workshop${LIVE_ARTIFACT_SUFFIX}-live-report.json`);

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
            if (!pending) return;
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
            expression: expression,
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

async function waitFor(client, expression, timeout = 25_000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeout) {
        if (await client.evaluate(expression)) {
            return;
        }
        await delay(150);
    }
    throw new Error(`Timed out waiting for browser condition: ${expression}`);
}

async function captureScreenshot(client, outputPath) {
    const screenshot = await client.command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile(outputPath, screenshot.data, 'base64');
}

async function removeTemporaryProfile(profilePath) {
    for (let attempt = 0; attempt < 6; attempt++) {
        try {
            await rm(profilePath, { recursive: true, force: true });
            return;
        } catch (error) {
            if (attempt === 5) {
                console.warn(`Could not remove temporary Edge profile: ${error.message}`);
                return;
            }
            await delay(250);
        }
    }
}

async function main() {
    await mkdir(OUTPUT_DIR, { recursive: true });
    const debugPort = await getFreePort();
    const profilePath = path.join(os.tmpdir(), `leslie-workshop-edge-${Date.now()}`);
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
    const runtimeExceptions = [];
    const consoleErrors = [];
    const generationRequests = [];
    let liveGeneration = null;
    let liveReport = null;
    try {
        await waitForJson(`http://127.0.0.1:${debugPort}/json/version`);
        const targets = await waitForJson(`http://127.0.0.1:${debugPort}/json/list`);
        const pageTarget = targets.find(target => target.type === 'page');
        if (!pageTarget) throw new Error('Edge did not expose a page target.');

        client = new CdpClient(pageTarget.webSocketDebuggerUrl);
        await client.connect();
        client.on('Runtime.exceptionThrown', params => runtimeExceptions.push(params.exceptionDetails?.text || 'Runtime exception'));
        client.on('Runtime.consoleAPICalled', params => {
            if (params.type === 'error') {
                consoleErrors.push(params.args.map(argument => argument.value || argument.description || '').join(' '));
            }
        });
        client.on('Network.requestWillBeSent', params => {
            if (/\/api\/(search|backends\/.*generate|sd|image)/.test(params.request.url)) {
                generationRequests.push(params.request.url);
            }
        });
        await Promise.all([
            client.command('Page.enable'),
            client.command('Runtime.enable'),
            client.command('Network.enable'),
        ]);
        await client.command('Page.navigate', { url: APP_URL });
        await waitFor(client, 'document.readyState === "complete" && document.querySelector("#leslie-character-workshop") && document.querySelector("#rm_button_create") && (!document.querySelector("#preloader") || getComputedStyle(document.querySelector("#preloader")).display === "none")');
        await client.evaluate('document.querySelectorAll(".popup[open]").forEach(popup => popup.close())');

        const hasContent = await client.evaluate('document.body.innerText.trim().length > 0');
        const hasErrorOverlay = await client.evaluate('Boolean(document.querySelector("[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay"))');
        if (!hasContent || hasErrorOverlay) throw new Error('The application page did not render cleanly.');

        await delay(700);
        generationRequests.length = 0;
        await client.evaluate('document.querySelector("#rm_button_create").click()');
        await waitFor(client, 'document.querySelector("#leslie-character-workshop").dataset.open === "true"');
        await delay(250);
        const desktop = await client.evaluate(`(() => {
            const overlay = document.querySelector('#leslie-character-workshop');
            const status = overlay.querySelector('[data-workshop-status]');
            return {
                title: overlay.querySelector('h2').textContent.trim(),
                panelVisible: getComputedStyle(overlay).display !== 'none',
                statusHidden: status.hidden && getComputedStyle(status).display === 'none',
                promptVisible: getComputedStyle(overlay.querySelector('[data-workshop-prompt]')).display !== 'none',
                steps: overlay.querySelectorAll('[data-workshop-stage]').length,
                initialResultsHidden: Array.from(overlay.querySelectorAll('[data-workshop-section]')).every(section => section.hidden),
                usesCurrentChatApi: overlay.querySelector('.leslie-character-workshop-api-note')?.textContent.includes('当前聊天 API'),
                knowledgeCheckVisible: getComputedStyle(overlay.querySelector('[data-workshop-knowledge-check]')).display !== 'none',
                legacySearchInputs: overlay.querySelectorAll('[data-workshop-provider], [data-workshop-searxng-url]').length,
            };
        })()`);
        if (!desktop.panelVisible || !desktop.statusHidden || !desktop.promptVisible || desktop.steps !== 5 || !desktop.initialResultsHidden || !desktop.usesCurrentChatApi || !desktop.knowledgeCheckVisible || desktop.legacySearchInputs !== 0) {
            throw new Error(`Desktop workshop state is invalid: ${JSON.stringify(desktop)}`);
        }
        await captureScreenshot(client, DESKTOP_SCREENSHOT);

        const themes = await client.evaluate(`(() => {
            const originalScheme = document.body.dataset.leslieColorScheme;
            const sample = () => {
                const overlay = document.querySelector('#leslie-character-workshop');
                const prompt = overlay.querySelector('[data-workshop-prompt]');
                const railTitle = overlay.querySelector('.leslie-character-workshop-rail-copy strong');
                const jsonTitle = overlay.querySelector('.leslie-character-workshop-json-import > summary span');
                const stepSmall = overlay.querySelector('.leslie-character-workshop-steps li.is-active small');
                const apiSmall = overlay.querySelector('.leslie-character-workshop-api-note small');
                const jsonSmall = overlay.querySelector('.leslie-character-workshop-json-import > summary small');
                const primary = overlay.querySelector('[data-workshop-action=generate]');
                return {
                    promptText: getComputedStyle(prompt).color,
                    promptBackground: getComputedStyle(prompt).backgroundColor,
                    railText: getComputedStyle(railTitle).color,
                    jsonText: getComputedStyle(jsonTitle).color,
                    stepSmall: { color: getComputedStyle(stepSmall).color, opacity: getComputedStyle(stepSmall).opacity },
                    apiSmall: { color: getComputedStyle(apiSmall).color, opacity: getComputedStyle(apiSmall).opacity },
                    jsonSmall: { color: getComputedStyle(jsonSmall).color, opacity: getComputedStyle(jsonSmall).opacity },
                    primary: { width: primary.getBoundingClientRect().width, scrollWidth: primary.scrollWidth, color: getComputedStyle(primary).color, overflow: getComputedStyle(primary).overflow },
                };
            };
            document.body.dataset.leslieColorScheme = 'dark';
            const dark = sample();
            document.body.dataset.leslieColorScheme = 'light';
            const light = sample();
            if (originalScheme) document.body.dataset.leslieColorScheme = originalScheme;
            else delete document.body.dataset.leslieColorScheme;
            return { dark, light };
        })()`);
        if (themes.dark.promptText === themes.light.promptText
            || themes.dark.promptBackground === themes.light.promptBackground
            || themes.dark.railText === themes.light.railText
            || themes.dark.jsonText === themes.light.jsonText
            || themes.dark.stepSmall.color === themes.light.stepSmall.color
            || themes.dark.apiSmall.color === themes.light.apiSmall.color
            || themes.dark.jsonSmall.color === themes.light.jsonSmall.color
            || themes.dark.stepSmall.opacity !== '1'
            || themes.light.stepSmall.opacity !== '1'
            || themes.dark.primary.width < themes.dark.primary.scrollWidth
            || themes.light.primary.width < themes.light.primary.scrollWidth) {
            throw new Error(`Workshop theme colors did not adapt: ${JSON.stringify(themes)}`);
        }
        await client.evaluate('document.body.dataset.leslieColorScheme = "light"');
        await delay(100);
        await captureScreenshot(client, LIGHT_SCREENSHOT);
        await client.evaluate('document.body.dataset.leslieColorScheme = "dark"');

        if (RUN_LIVE_GENERATION) {
            await client.evaluate(`(() => {
                const overlay = document.querySelector('#leslie-character-workshop');
                overlay.querySelector('[data-workshop-prompt]').value = ${JSON.stringify(LIVE_PROMPT)};
                overlay.querySelector('[data-workshop-mode]').value = ${JSON.stringify(LIVE_MODE)};
                overlay.querySelector('[data-workshop-action=generate]').click();
            })()`);
            await waitFor(client, `(() => {
                const overlay = document.querySelector('#leslie-character-workshop');
                return !overlay.querySelector('[data-workshop-section=preview]').hidden || !overlay.querySelector('[data-workshop-error]').hidden;
            })()`, 720_000);
            liveGeneration = await client.evaluate(`(() => {
                const overlay = document.querySelector('#leslie-character-workshop');
                const score = Number(overlay.querySelector('.leslie-character-workshop-score strong')?.textContent || 0);
                const avatarText = overlay.querySelector('[data-workshop-avatar-prompt]')?.textContent.trim() || '';
                return {
                    error: overlay.querySelector('[data-workshop-error]').hidden ? '' : overlay.querySelector('[data-workshop-error]').textContent.trim(),
                    knowledgeVisible: !overlay.querySelector('[data-workshop-section=knowledge]').hidden,
                    qualityVisible: !overlay.querySelector('[data-workshop-section=quality]').hidden,
                    previewVisible: !overlay.querySelector('[data-workshop-section=preview]').hidden,
                    avatarVisible: !overlay.querySelector('[data-workshop-section=avatar]').hidden,
                    copyAvatarVisible: !overlay.querySelector('[data-workshop-action=copy-avatar]').hidden,
                    avatarTextLength: avatarText.length,
                    containsGeneratedImage: Boolean(overlay.querySelector('[data-workshop-section=avatar] img, [data-workshop-section=avatar] canvas')),
                    score,
                    cardName: overlay.querySelector('[data-workshop-card-name]')?.textContent.trim() || '',
                    applyVisible: !overlay.querySelector('[data-workshop-action=apply]').hidden,
                };
            })()`);
            if (liveGeneration.error || !liveGeneration.knowledgeVisible || !liveGeneration.qualityVisible || !liveGeneration.previewVisible || !liveGeneration.avatarVisible || !liveGeneration.copyAvatarVisible || liveGeneration.avatarTextLength < 120 || liveGeneration.containsGeneratedImage || liveGeneration.score < 75 || !liveGeneration.cardName.includes(LIVE_EXPECTED_NAME) || !liveGeneration.applyVisible) {
                throw new Error(`Live workshop generation failed quality checks: ${JSON.stringify(liveGeneration)}`);
            }
            liveReport = await client.evaluate(`(() => {
                const overlay = document.querySelector('#leslie-character-workshop');
                return {
                    mode: overlay.querySelector('[data-workshop-mode]').value,
                    prompt: overlay.querySelector('[data-workshop-prompt]').value,
                    quality: overlay.querySelector('[data-workshop-quality]').textContent.trim(),
                    knowledgeSummary: overlay.querySelector('[data-workshop-knowledge-summary]')?.textContent.trim() || '',
                    knowledge: overlay.querySelector('[data-workshop-knowledge]').textContent.trim(),
                    preview: Array.from(overlay.querySelectorAll('[data-workshop-preview] details')).map(details => ({
                        field: details.querySelector('summary').textContent.trim(),
                        value: details.querySelector('pre').textContent.trim(),
                    })),
                    avatar: Array.from(overlay.querySelectorAll('[data-workshop-avatar-prompt] pre')).map(pre => pre.textContent.trim()),
                    avatarMeta: overlay.querySelector('.leslie-character-workshop-avatar-meta')?.textContent.trim() || '',
                    footerNote: overlay.querySelector('[data-workshop-footer-note]').textContent.trim(),
                };
            })()`);
            const exampleDialogue = liveReport.preview.find(item => item.field === '示例对话')?.value || '';
            const firstMessage = liveReport.preview.find(item => item.field === '首条消息')?.value || '';
            const userTurns = (exampleDialogue.match(/\{\{user\}\}\s*:/gi) || []).length;
            const characterTurns = (exampleDialogue.match(/\{\{char\}\}\s*:/gi) || []).length;
            await writeFile(LIVE_REPORT, JSON.stringify(liveReport, null, 2), 'utf8');
            await client.evaluate('document.querySelector("[data-workshop-section=avatar]").scrollIntoView({ block: "start" })');
            await delay(150);
            await captureScreenshot(client, LIVE_SCREENSHOT);
            if (liveReport.preview.length !== 7
                || liveReport.preview.some(item => item.value.length < 20)
                || !/[“”「」『』"']/.test(firstMessage)
                || /你.{0,5}(?:浑身湿透|湿透的(?:肩|衣|袖)|正站在|推门)/u.test(firstMessage)
                || userTurns < 4
                || characterTurns < 4
                || /缘分|命中注定|比.{0,8}(?:书|工作|一切|什么都)重要|(?:在这|我会).{0,5}等你/u.test(`${firstMessage}\n${exampleDialogue}`)
                || liveReport.quality.includes('没有明确禁止替用户')
                || liveReport.quality.includes('示例缺少用户触发标签')
                || liveReport.avatar.length !== 2
                || !/(adult|(?:18|19|[2-9]\d)[- ]year[- ]old|(?:18|19|[2-9]\d) years old)/i.test(liveReport.avatar[0])
                || !/(watermark|text|multiple people)/i.test(liveReport.avatar[1])) {
                throw new Error(`Live workshop content report failed: ${JSON.stringify(liveReport)}`);
            }
        }

        await client.evaluate('document.querySelector("[data-workshop-action=manual]").click()');
        await waitFor(client, 'document.querySelector("#leslie-character-workshop").hidden && document.querySelector("#form_create").getAttribute("actiontype") === "createcharacter"');
        const manualEditor = await client.evaluate(`(() => ({
            editorVisible: getComputedStyle(document.querySelector('#rm_ch_create_block')).display !== 'none',
            importPanelVisible: getComputedStyle(document.querySelector('#leslie-character-card-import')).display !== 'none',
            jsonInput: Boolean(document.querySelector('#leslie-character-json-file')),
            avatarInput: Boolean(document.querySelector('#leslie-character-avatar-file')),
            importButtonDisabled: document.querySelector('[data-leslie-character-import-action]')?.disabled === true,
        }))()`);
        if (!manualEditor.editorVisible || !manualEditor.importPanelVisible || !manualEditor.jsonInput || !manualEditor.avatarInput || !manualEditor.importButtonDisabled) {
            throw new Error(`The manual character editor/import panel did not open correctly: ${JSON.stringify(manualEditor)}`);
        }

        await client.command('Emulation.setDeviceMetricsOverride', {
            width: 390,
            height: 844,
            deviceScaleFactor: 1,
            mobile: true,
        });
        await client.evaluate('document.querySelector("#rm_button_create").click()');
        await waitFor(client, 'document.querySelector("#leslie-character-workshop").dataset.open === "true"');
        await delay(250);
        const mobile = await client.evaluate(`(() => {
            const panel = document.querySelector('.leslie-character-workshop-panel').getBoundingClientRect();
            const prompt = document.querySelector('[data-workshop-prompt]').getBoundingClientRect();
            return {
                panelWidth: Math.round(panel.width),
                viewportWidth: window.innerWidth,
                promptInsideViewport: prompt.left >= 0 && prompt.right <= window.innerWidth,
                footerVisible: getComputedStyle(document.querySelector('.leslie-character-workshop-footer')).display !== 'none',
            };
        })()`);
        if (Math.abs(mobile.panelWidth - mobile.viewportWidth) > 4 || !mobile.promptInsideViewport || !mobile.footerVisible) {
            throw new Error(`Mobile workshop state is invalid: ${JSON.stringify(mobile)}`);
        }
        await captureScreenshot(client, MOBILE_SCREENSHOT);

        await client.evaluate('document.querySelector("[data-workshop-action=close]").click()');
        await waitFor(client, 'document.querySelector("#leslie-character-workshop").hidden');
        await client.command('Emulation.setDeviceMetricsOverride', {
            width: 1440,
            height: 900,
            deviceScaleFactor: 1,
            mobile: false,
        });
        await client.evaluate('document.querySelector("#rm_button_create").click()');
        await waitFor(client, 'document.querySelector("#leslie-character-workshop").dataset.open === "true"');
        const imported = await client.evaluate(`(() => {
            const overlay = document.querySelector('#leslie-character-workshop');
            const card = {
                spec: 'chara_card_v2',
                spec_version: '2.0',
                clarix_personalization: { tone: 'restrained' },
                data: {
                    name: '网站导入验收',
                    description: '一名独立书店店员。她不知道玩家没有亲口说出的经历，不能凭空知道场外信息。',
                    personality: '警觉但好奇，有自己的计划。关系与信任必须逐步发展。',
                    scenario: '她与 {{user}} 刚认识，雨夜里在即将打烊的书店门口相遇。',
                    first_mes: '*她扶住门。* “要进来避一会儿吗？”',
                    mes_example: '<START>\\n{{char}}: “先等等。”\\n<START>\\n{{char}}: “我还没想好。”\\n<START>\\n{{char}}: “这件事我不知道。”\\n<START>\\n{{char}}: “可以。”',
                    creator_notes: '来自 Clarix 公益角色网站的测试卡。',
                    system_prompt: '保持角色独立意志和认知边界。不得替用户决定台词、行动、情绪或关系升级。',
                    post_history_instructions: '每轮只写一个即时反应，使用短回复，最多两行；不得替用户说话。',
                    alternate_greetings: ['“你也是来等雨停的？”'],
                    tags: ['网站导入'],
                    creator: 'Clarix',
                    character_version: '1.0',
                    extensions: {
                        talkativeness: 0.45,
                        clarix_personalization: { tone: 'restrained' },
                        depth_prompt: { prompt: '保持警觉但好奇；一个反应，最多两行。', depth: 0, role: 'system' },
                    },
                },
            };
            overlay.querySelector('.leslie-character-workshop-json-import').open = true;
            overlay.querySelector('[data-workshop-import-json]').value = JSON.stringify(card);
            overlay.querySelector('[data-workshop-action=inspect-json]').click();
            return {
                importOpen: overlay.querySelector('.leslie-character-workshop-json-import').open,
                qualityVisible: !overlay.querySelector('[data-workshop-section=quality]').hidden,
                previewVisible: !overlay.querySelector('[data-workshop-section=preview]').hidden,
                cardName: overlay.querySelector('[data-workshop-card-name]').textContent.trim(),
                importNote: overlay.querySelector('[data-workshop-import-note]').textContent.trim(),
                applyVisible: !overlay.querySelector('[data-workshop-action=apply]').hidden,
            };
        })()`);
        if (!imported.importOpen || !imported.qualityVisible || !imported.previewVisible || !imported.cardName.includes('网站导入验收') || !imported.importNote.includes('结构读取成功') || !imported.applyVisible) {
            throw new Error(`JSON import state is invalid: ${JSON.stringify(imported)}`);
        }
        await captureScreenshot(client, IMPORT_SCREENSHOT);
        await client.evaluate('document.querySelector("[data-workshop-action=apply]").click()');
        await waitFor(client, 'document.querySelector("#leslie-character-workshop").hidden && document.querySelector("#character_name_pole").value === "网站导入验收"');
        const handoff = await client.evaluate(`import('./script.js').then(({ create_save }) => ({
            name: create_save.name,
            clarixTone: create_save.extensions?.clarix_personalization?.tone,
        }))`);
        if (handoff.name !== '网站导入验收' || handoff.clarixTone !== 'restrained') {
            throw new Error(`JSON handoff did not preserve the card state: ${JSON.stringify(handoff)}`);
        }

        const searchOrImageRequests = generationRequests.filter(url => /\/api\/(search|sd|image)/.test(url));
        const chatRequests = generationRequests.filter(url => /\/api\/backends\/.*generate/.test(url));
        const expectedMinimumChatRequests = LIVE_MODE === 'adaptation' ? 4 : 3;
        if (searchOrImageRequests.length > 0 || (!RUN_LIVE_GENERATION && chatRequests.length > 0) || (RUN_LIVE_GENERATION && chatRequests.length < expectedMinimumChatRequests)) {
            throw new Error(`Workshop used an unexpected API path: ${generationRequests.join(', ')}`);
        }
        if (runtimeExceptions.length > 0) {
            throw new Error(`Browser runtime exceptions: ${runtimeExceptions.join(' | ')}`);
        }
        if (consoleErrors.some(message => /leslie-character-workshop|failed to load module|syntaxerror/i.test(message))) {
            throw new Error(`Workshop console errors: ${consoleErrors.join(' | ')}`);
        }

        console.log(JSON.stringify({
            desktop: desktop,
            mobile: mobile,
            runtimeExceptions: runtimeExceptions,
            relevantConsoleErrors: consoleErrors.filter(message => /leslie-character-workshop|failed to load module|syntaxerror/i.test(message)),
            generationRequests: generationRequests,
            liveMode: RUN_LIVE_GENERATION ? LIVE_MODE : null,
            liveGeneration: liveGeneration,
            liveReportPath: liveReport ? LIVE_REPORT : null,
            imported: imported,
            handoff: handoff,
            themes: themes,
            screenshots: [DESKTOP_SCREENSHOT, LIGHT_SCREENSHOT, MOBILE_SCREENSHOT, IMPORT_SCREENSHOT, ...(liveGeneration ? [LIVE_SCREENSHOT] : [])],
        }, null, 2));
    } finally {
        client?.close();
        const edgeExited = edge.exitCode === null
            ? new Promise(resolve => edge.once('exit', resolve))
            : Promise.resolve();
        edge.kill();
        await Promise.race([edgeExited, delay(2_000)]);
        await removeTemporaryProfile(profilePath);
    }
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
