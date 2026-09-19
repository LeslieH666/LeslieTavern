import {
    Generate,
    characters,
    extractMessageFromData,
    generateRawData,
    isGenerating,
    main_api,
    online_status,
    stopGeneration,
    this_chid,
} from '../../script.js';
import { eventSource, event_types } from '../events.js';
import { chat_completion_sources, getChatCompletionModel, oai_settings } from '../openai.js';
import {
    classifySafetyResponse,
    parseSafetyTestInputs,
    parseTermList,
    summarizeSafetyResults,
} from './core.js';

const LAUNCHER_ID = 'leslie-safety-test-launcher';
const OVERLAY_ID = 'leslie-safety-test-overlay';
const DEFAULT_RESPONSE_LENGTH = 256;

const state = {
    running: false,
    runId: 0,
    results: [],
    prompt: null,
    settings: {
        includeHistory: false,
        includeExamples: true,
        includeWorldInfo: false,
        includeExtensions: false,
        responseLength: DEFAULT_RESPONSE_LENGTH,
    },
};

let overlay;

function currentCharacterName() {
    const character = characters[this_chid];
    return character?.name || character?.data?.name || '当前角色';
}

function hasActiveCharacter() {
    return this_chid !== undefined && this_chid !== null && Boolean(characters[this_chid]);
}

function currentModelName() {
    try {
        return getChatCompletionModel(oai_settings) || '未选择模型';
    } catch {
        return '未选择模型';
    }
}

function isDeepSeekReady() {
    return main_api === 'openai' && oai_settings.chat_completion_source === chat_completion_sources.DEEPSEEK;
}

function getElement(selector) {
    return overlay?.querySelector(selector);
}

function setText(selector, value) {
    const element = getElement(selector);
    if (element) element.textContent = String(value ?? '');
}

function setError(message = '') {
    const element = getElement('[data-safety-test-error]');
    if (!element) return;
    element.hidden = !message;
    element.textContent = message;
}

function setStatus(message, tone = 'idle') {
    const element = getElement('[data-safety-test-status]');
    if (!element) return;
    element.dataset.tone = tone;
    element.textContent = message;
}

function updateHeader() {
    setText('[data-safety-test-character]', currentCharacterName());
    setText('[data-safety-test-model]', currentModelName());
    setText('[data-safety-test-connection]', isDeepSeekReady() ? 'DeepSeek Chat Completions' : '未连接 DeepSeek');
}

function readSettings() {
    state.settings = {
        includeHistory: Boolean(getElement('[data-safety-setting="history"]')?.checked),
        includeExamples: Boolean(getElement('[data-safety-setting="examples"]')?.checked),
        includeWorldInfo: Boolean(getElement('[data-safety-setting="world-info"]')?.checked),
        includeExtensions: Boolean(getElement('[data-safety-setting="extensions"]')?.checked),
        responseLength: Number(getElement('[data-safety-setting="response-length"]')?.value) || DEFAULT_RESPONSE_LENGTH,
    };
    return state.settings;
}

function getPromptText(messages) {
    return messages.map((message, index) => {
        const role = message?.role || 'unknown';
        const content = typeof message?.content === 'string'
            ? message.content
            : JSON.stringify(message?.content ?? '');
        return `[${index + 1}] ${role}\n${content}`;
    }).join('\n\n');
}

async function buildPromptSnapshot(input) {
    if (!hasActiveCharacter()) {
        throw new Error('请先打开一张角色卡，再进行安全测试。');
    }
    if (!isDeepSeekReady()) {
        throw new Error('请先在“模型连接”中选择 DeepSeek Chat Completions。');
    }

    let capturedMessages = null;
    const capturePrompt = (eventData) => {
        if (eventData?.dryRun !== true || !Array.isArray(eventData.chat)) return;
        capturedMessages = eventData.chat.map((message) => ({
            ...message,
            content: typeof message.content === 'string' ? message.content : message.content,
        }));
    };

    eventSource.on(event_types.CHAT_COMPLETION_PROMPT_READY, capturePrompt);
    try {
        await Generate('normal', {
            promptTestInput: input,
            promptTestIncludeHistory: state.settings.includeHistory,
            promptTestIncludeExamples: state.settings.includeExamples,
            promptTestIncludeWorldInfo: state.settings.includeWorldInfo,
            promptTestIncludeExtensions: state.settings.includeExtensions,
            generationPurpose: 'leslie-safety-test',
        }, true);
    } finally {
        eventSource.removeListener(event_types.CHAT_COMPLETION_PROMPT_READY, capturePrompt);
    }

    if (!Array.isArray(capturedMessages)) {
        throw new Error('没有捕获到角色卡提示词，请确认当前角色和 DeepSeek 连接已经加载。');
    }

    return capturedMessages;
}

function renderPromptPreview(messages) {
    const preview = getElement('[data-safety-test-prompt-preview]');
    if (!preview) return;
    preview.textContent = messages?.length ? getPromptText(messages) : '点击“预览最终提示词”查看本次测试将发送的上下文。';
}

function renderSummary() {
    const summary = summarizeSafetyResults(state.results);
    setText('[data-safety-test-summary]', state.results.length === 0
        ? '尚未运行测试'
        : `共 ${summary.total} 条 · 完成 ${summary.completed} · 可能拒答 ${summary.possibleRefusal} · 含检测词 ${summary.containsTestTerm} · 需复核 ${summary.needsReview} · 错误 ${summary.errors}`);
}

function createResultCard(result) {
    const card = document.createElement('article');
    card.className = 'leslie-safety-test-result-card';
    card.dataset.resultCode = result.error ? 'error' : result.classification?.code || 'needs_review';

    const heading = document.createElement('div');
    heading.className = 'leslie-safety-test-result-heading';
    const title = document.createElement('strong');
    title.textContent = result.id;
    const badge = document.createElement('span');
    badge.textContent = result.error ? '请求错误' : result.classification?.label || '需人工复核';
    heading.append(title, badge);
    card.append(heading);

    const inputLabel = document.createElement('small');
    inputLabel.textContent = '测试输入';
    const input = document.createElement('p');
    input.className = 'leslie-safety-test-result-input';
    input.textContent = result.input;
    card.append(inputLabel, input);

    const outputLabel = document.createElement('small');
    outputLabel.textContent = result.error ? '错误信息' : 'DeepSeek 响应';
    const output = document.createElement('pre');
    output.className = 'leslie-safety-test-result-output';
    output.textContent = result.error || result.response || '（空响应）';
    card.append(outputLabel, output);

    const metadata = document.createElement('small');
    metadata.className = 'leslie-safety-test-result-meta';
    const details = [];
    if (result.latencyMs) details.push(`${result.latencyMs} ms`);
    if (result.finishReason) details.push(`结束：${result.finishReason}`);
    if (result.classification?.matchedTerms?.length) details.push(`命中：${result.classification.matchedTerms.join('、')}`);
    metadata.textContent = details.join(' · ') || '仅供安全测试参考，请结合上下文人工判断。';
    card.append(metadata);

    return card;
}

function renderResults() {
    const container = getElement('[data-safety-test-results]');
    if (!container) return;
    container.replaceChildren(...state.results.map(createResultCard));
    renderSummary();
}

function setRunning(running) {
    state.running = running;
    for (const button of overlay.querySelectorAll('[data-safety-test-action]')) {
        const action = button.dataset.safetyTestAction;
        button.disabled = running
            ? !['stop', 'close'].includes(action)
            : action === 'stop';
    }
    overlay.dataset.running = String(running);
}

function clearResults() {
    if (state.running) return;
    state.results = [];
    state.prompt = null;
    renderPromptPreview(null);
    renderResults();
    setError('');
    setStatus('就绪');
}

async function previewPrompt() {
    if (state.running) return;
    setError('');
    const cases = parseSafetyTestInputs(getElement('[data-safety-test-inputs]')?.value);
    if (cases.length === 0) {
        setError('请先填写至少一条测试输入，每行一条。');
        return;
    }

    try {
        readSettings();
        setStatus('正在组装角色卡最终提示词…', 'working');
        const messages = await buildPromptSnapshot(cases[0].input);
        state.prompt = messages;
        renderPromptPreview(messages);
        setText('[data-safety-test-prompt-meta]', `${messages.length} 条消息 · 仅预览 · 不会写入聊天记录`);
        setStatus('提示词预览已更新');
    } catch (error) {
        setError(error?.message || '提示词预览失败。');
        setStatus('预览失败', 'error');
    }
}

function getErrorText(error) {
    if (typeof error?.message === 'string' && error.message.trim()) {
        return error.message.trim().slice(0, 500);
    }
    return 'DeepSeek 请求失败，请检查连接、密钥和模型设置。';
}

async function runTest() {
    if (state.running) return;
    setError('');

    if (!isDeepSeekReady()) {
        setError('请先在“模型连接”中选择 DeepSeek Chat Completions。');
        return;
    }
    if (!hasActiveCharacter()) {
        setError('请先打开一张角色卡，再进行安全测试。');
        return;
    }
    if (isGenerating()) {
        setError('当前已有普通生成任务正在运行，请等待它结束后再开始安全测试。');
        return;
    }
    if (online_status === 'no_connection') {
        setError('当前聊天 API 尚未连接，请先完成连接测试。');
        return;
    }

    const cases = parseSafetyTestInputs(getElement('[data-safety-test-inputs]')?.value);
    const outputTerms = parseTermList(getElement('[data-safety-test-output-terms]')?.value);
    if (cases.length === 0) {
        setError('请先填写至少一条测试输入，每行一条。');
        return;
    }

    readSettings();
    state.results = [];
    state.prompt = null;
    renderPromptPreview(null);
    renderResults();
    setRunning(true);
    const runId = ++state.runId;

    try {
        for (const testCase of cases) {
            if (runId !== state.runId) break;
            setStatus(`正在测试 ${testCase.id}（${state.results.length + 1}/${cases.length}）…`, 'working');
            const startedAt = performance.now();

            try {
                const messages = await buildPromptSnapshot(testCase.input);
                if (runId !== state.runId) break;
                if (state.prompt === null) {
                    state.prompt = messages;
                    renderPromptPreview(messages);
                    setText('[data-safety-test-prompt-meta]', `${messages.length} 条消息 · 由当前角色卡组装 · 不会写入聊天记录`);
                }

                const data = await generateRawData({
                    prompt: messages,
                    api: 'openai',
                    responseLength: state.settings.responseLength,
                });
                if (runId !== state.runId) break;
                const response = String(extractMessageFromData(data, 'openai') ?? '');
                state.results.push({
                    ...testCase,
                    response,
                    classification: classifySafetyResponse(response, { outputTerms }),
                    model: data?.model || currentModelName(),
                    usage: data?.usage || null,
                    finishReason: data?.choices?.[0]?.finish_reason || null,
                    latencyMs: Math.round(performance.now() - startedAt),
                });
            } catch (error) {
                if (runId !== state.runId) break;
                state.results.push({
                    ...testCase,
                    error: getErrorText(error),
                    latencyMs: Math.round(performance.now() - startedAt),
                });
            }
            if (runId !== state.runId) break;
            renderResults();
        }

        if (runId === state.runId) {
            setStatus(`测试完成 · ${state.results.length}/${cases.length} 条`, 'success');
        }
    } finally {
        if (runId === state.runId) setRunning(false);
    }
}

function stopTest() {
    if (!state.running) return;
    state.runId += 1;
    stopGeneration();
    setRunning(false);
    setStatus('已停止；已完成的结果仍保留在本面板中。');
}

function handleCharacterContextChange() {
    if (state.running) stopTest();
    updateHeader();
    if (state.results.length > 0 || state.prompt) {
        state.results = [];
        state.prompt = null;
        renderPromptPreview(null);
        renderResults();
        setStatus('角色卡或聊天上下文已变化，旧测试结果已清空。');
    }
}

function exportResults() {
    if (state.results.length === 0) {
        setError('暂无可导出的测试结果。');
        return;
    }

    const payload = {
        version: 1,
        createdAt: new Date().toISOString(),
        character: currentCharacterName(),
        model: currentModelName(),
        settings: { ...state.settings },
        results: state.results,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `leslie-deepseek-safety-test-${new Date().toISOString().replaceAll(':', '-')}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setStatus('测试结果已导出；应用不会自动保存测试内容。', 'success');
}

function openPanel() {
    updateHeader();
    overlay.hidden = false;
    overlay.dataset.open = 'true';
    document.documentElement.classList.add('leslie-safety-test-open');
    document.body.classList.add('leslie-safety-test-open');
    getElement('[data-safety-test-inputs]')?.focus();
}

function closePanel() {
    if (state.running) return;
    overlay.hidden = true;
    overlay.dataset.open = 'false';
    document.documentElement.classList.remove('leslie-safety-test-open');
    document.body.classList.remove('leslie-safety-test-open');
}

function createLauncher() {
    if (document.getElementById(LAUNCHER_ID)) return;
    const launcher = document.createElement('div');
    launcher.id = LAUNCHER_ID;
    launcher.className = 'leslie-safety-test-launcher fa-solid fa-shield-halved';
    launcher.setAttribute('role', 'button');
    launcher.setAttribute('tabindex', '0');
    launcher.setAttribute('aria-label', '打开 DeepSeek 安全测试');
    launcher.title = 'DeepSeek 安全测试';
    document.querySelector('#leftSendForm')?.append(launcher);
}

function createMarkup() {
    const element = document.createElement('section');
    element.id = OVERLAY_ID;
    element.className = 'leslie-safety-test-overlay';
    element.hidden = true;
    element.dataset.open = 'false';
    element.setAttribute('role', 'dialog');
    element.setAttribute('aria-modal', 'true');
    element.setAttribute('aria-labelledby', 'leslie-safety-test-title');
    element.innerHTML = `
        <div class="leslie-safety-test-panel">
            <header class="leslie-safety-test-header">
                <div>
                    <span class="leslie-safety-test-eyebrow">AUTHORIZED MODEL SAFETY CHECK</span>
                    <h2 id="leslie-safety-test-title"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i> DeepSeek 安全测试</h2>
                    <p>用当前角色卡的最终提示词作为上下文，逐条观察 DeepSeek 对授权测试输入的回应。</p>
                </div>
                <button type="button" class="leslie-safety-test-icon-button" data-safety-test-action="close" aria-label="关闭安全测试">×</button>
            </header>

            <div class="leslie-safety-test-context">
                <span>角色：<strong data-safety-test-character>当前角色</strong></span>
                <span>模型：<strong data-safety-test-model>未选择模型</strong></span>
                <span class="leslie-safety-test-connection" data-safety-test-connection>未连接 DeepSeek</span>
            </div>

            <div class="leslie-safety-test-notice"><i class="fa-solid fa-lock" aria-hidden="true"></i> 测试请求走现有 DeepSeek 连接；不会发送到聊天气泡，不会写入 JSONL、记忆或语音记录。</div>

            <main class="leslie-safety-test-body">
                <section class="leslie-safety-test-input-section">
                    <label class="leslie-safety-test-label" for="leslie-safety-test-inputs">测试输入 <small>每行一条，最多 50 条</small></label>
                    <textarea id="leslie-safety-test-inputs" data-safety-test-inputs rows="7" maxlength="200000" placeholder="填写你已获授权的测试文本；每行会作为一次独立的用户输入发送给 DeepSeek。"></textarea>
                    <label class="leslie-safety-test-label" for="leslie-safety-test-output-terms">可选：输出检测词 <small>仅用于标记响应，不能替代人工判断</small></label>
                    <textarea id="leslie-safety-test-output-terms" data-safety-test-output-terms rows="3" maxlength="6000" placeholder="每行一个需要关注的输出词；不填写也可以运行。"></textarea>
                </section>

                <section class="leslie-safety-test-options" aria-label="提示词选项">
                    <h3>角色卡上下文</h3>
                    <p>默认只带入角色卡及必要的系统提示词，便于观察角色卡中的内容如何影响安全响应。</p>
                    <label><input type="checkbox" data-safety-setting="history"> <span>包含当前聊天历史</span></label>
                    <label><input type="checkbox" data-safety-setting="examples" checked> <span>包含角色卡示例对话</span></label>
                    <label><input type="checkbox" data-safety-setting="world-info"> <span>包含 World Info</span></label>
                    <label><input type="checkbox" data-safety-setting="extensions"> <span>包含项目扩展提示词</span></label>
                    <label class="leslie-safety-test-select-label" for="leslie-safety-test-response-length">单次响应上限</label>
                    <select id="leslie-safety-test-response-length" data-safety-setting="response-length">
                        <option value="128">128 tokens</option>
                        <option value="256" selected>256 tokens</option>
                        <option value="512">512 tokens</option>
                        <option value="1024">1024 tokens</option>
                    </select>
                </section>
            </main>

            <section class="leslie-safety-test-prompt-section">
                <div class="leslie-safety-test-section-heading"><div><span>01</span><div><h3>最终提示词预览</h3><p data-safety-test-prompt-meta>先预览第一条测试输入的实际消息结构。</p></div></div><button type="button" class="leslie-safety-test-button is-quiet" data-safety-test-action="preview">预览最终提示词</button></div>
                <details>
                    <summary>显示发送给 DeepSeek 的消息（包含角色卡文本）</summary>
                    <pre class="leslie-safety-test-prompt-preview" data-safety-test-prompt-preview>点击“预览最终提示词”查看本次测试将发送的上下文。</pre>
                </details>
            </section>

            <section class="leslie-safety-test-results-section">
                <div class="leslie-safety-test-section-heading"><div><span>02</span><div><h3>测试结果</h3><p data-safety-test-summary>尚未运行测试</p></div></div></div>
                <div class="leslie-safety-test-results" data-safety-test-results></div>
            </section>

            <div class="leslie-safety-test-status" data-safety-test-status data-tone="idle">就绪</div>
            <div class="leslie-safety-test-error" data-safety-test-error hidden></div>
            <footer class="leslie-safety-test-footer">
                <button type="button" class="leslie-safety-test-button is-quiet" data-safety-test-action="clear">清空结果</button>
                <button type="button" class="leslie-safety-test-button is-quiet" data-safety-test-action="export">导出 JSON</button>
                <span class="leslie-safety-test-footer-spacer"></span>
                <button type="button" class="leslie-safety-test-button is-quiet" data-safety-test-action="stop" disabled>停止</button>
                <button type="button" class="leslie-safety-test-button is-primary" data-safety-test-action="run">开始测试</button>
            </footer>
        </div>`;
    return element;
}

function bindEvents() {
    const launcher = document.getElementById(LAUNCHER_ID);
    launcher?.addEventListener('click', openPanel);
    launcher?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openPanel();
        }
    });

    overlay.addEventListener('click', (event) => {
        const action = event.target instanceof Element
            ? event.target.closest('[data-safety-test-action]')?.dataset.safetyTestAction
            : '';
        if (action === 'close') closePanel();
        if (action === 'preview') previewPrompt();
        if (action === 'run') runTest();
        if (action === 'stop') stopTest();
        if (action === 'clear') clearResults();
        if (action === 'export') exportResults();
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !overlay.hidden && !state.running) closePanel();
    });

    for (const eventName of [
        event_types.CHAT_CHANGED,
        event_types.CHAT_LOADED,
        event_types.CHARACTER_EDITED,
    ]) {
        eventSource.on(eventName, handleCharacterContextChange);
    }
    for (const eventName of [
        event_types.CHATCOMPLETION_SOURCE_CHANGED,
        event_types.CHATCOMPLETION_MODEL_CHANGED,
        event_types.ONLINE_STATUS_CHANGED,
    ]) {
        eventSource.on(eventName, updateHeader);
    }
}

function initialize() {
    overlay = createMarkup();
    document.body.append(overlay);
    createLauncher();
    bindEvents();
    updateHeader();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
} else {
    initialize();
}
