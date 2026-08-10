/**
 * Leslie AI-assisted character workshop.
 *
 * The workshop creates an in-memory draft, then hands it to SillyTavern's
 * existing character editor. It never saves character data by itself.
 */

import {
    create_save,
    generateRaw,
    isGenerating,
    name1,
    name2,
    online_status,
    stopGeneration,
} from '../../script.js';
import {
    assessCharacterCard,
    canonicalizeDialogueRoleLabels,
    cardToCreateState,
    formatAvatarPrompt,
    normalizeAvatarPrompt,
    normalizeCharacterCard,
    normalizeCreativeBrief,
    normalizeKnowledgeCheck,
    parseStructuredResponse,
    protectRoleMacrosForGeneration,
} from './core.js';
import {
    buildBriefRequest,
    buildDraftRequest,
    buildKnowledgeCheckRequest,
    buildRepairRequest,
    buildReviewRequest,
    LESLIE_CHARACTER_WRITING_SKILL,
} from './writing-skill.js';
import { parseCharacterCardJsonText } from './importer.js';

const STAGES = ['brief', 'research', 'draft', 'review', 'ready'];
const PREVIEW_FIELDS = [
    ['description', '角色是谁'],
    ['personality', '性格与说话方式'],
    ['scenario', '世界、关系与开场'],
    ['first_mes', '首条消息'],
    ['mes_example', '示例对话'],
    ['system_prompt', '核心边界'],
    ['post_history_instructions', '每轮输出契约'],
];

const state = {
    runId: 0,
    running: false,
    cancelled: false,
    bypassNextCreateClick: false,
    previousFocus: null,
    brief: null,
    knowledgeCheck: null,
    draft: null,
    finalCard: null,
    avatarPrompt: null,
    modelReview: null,
    localReview: null,
    importSource: '',
    importNotices: [],
};

let overlay;

function createWorkshopMarkup() {
    const element = document.createElement('section');
    element.id = 'leslie-character-workshop';
    element.className = 'leslie-character-workshop';
    element.hidden = true;
    element.dataset.open = 'false';
    element.setAttribute('role', 'dialog');
    element.setAttribute('aria-modal', 'true');
    element.setAttribute('aria-labelledby', 'leslie-character-workshop-title');
    element.innerHTML = `
        <div class="leslie-character-workshop-panel">
            <header class="leslie-character-workshop-header">
                <div class="leslie-character-workshop-heading">
                    <span class="leslie-character-workshop-logo fa-solid fa-wand-magic-sparkles" aria-hidden="true"></span>
                    <span>
                        <small>QUALITY-FIRST CREATION</small>
                        <strong id="leslie-character-workshop-title">AI 角色工坊</strong>
                    </span>
                </div>
                <div class="leslie-character-workshop-header-actions">
                    <span class="leslie-character-workshop-connection" data-workshop-connection></span>
                    <button type="button" class="leslie-character-workshop-icon-button fa-solid fa-xmark" data-workshop-action="close" aria-label="关闭角色工坊"></button>
                </div>
            </header>

            <div class="leslie-character-workshop-layout">
                <aside class="leslie-character-workshop-rail" aria-label="创作进度">
                    <div class="leslie-character-workshop-rail-copy">
                        <span>一次一张</span>
                        <strong>先理解，再核对，最后审校。</strong>
                        <p>AI 不会生成头像，只会附带手动图片提示词。最终草稿会先进入原角色编辑器，由你确认。</p>
                    </div>
                    <ol class="leslie-character-workshop-steps">
                        <li data-workshop-stage="brief"><span>1</span><div><strong>创作简报</strong><small>锁定硬事实与边界</small></div></li>
                        <li data-workshop-stage="research"><span>2</span><div><strong>AI 知识核对</strong><small>复用当前聊天 API</small></div></li>
                        <li data-workshop-stage="draft"><span>3</span><div><strong>完整写作</strong><small>只生成一个候选</small></div></li>
                        <li data-workshop-stage="review"><span>4</span><div><strong>独立审校</strong><small>检查失真、边界与节奏</small></div></li>
                        <li data-workshop-stage="ready"><span>5</span><div><strong>人工确认</strong><small>补头像后再保存</small></div></li>
                    </ol>
                    <div class="leslie-character-workshop-privacy">
                        <i class="fa-solid fa-shield-halved" aria-hidden="true"></i>
                        <span>不会读取现有角色卡、聊天、记忆或密钥。全部文本任务只使用当前聊天模型连接。</span>
                    </div>
                </aside>

                <main class="leslie-character-workshop-main">
                    <section class="leslie-character-workshop-intro">
                        <span class="leslie-character-workshop-eyebrow">从一句想法开始</span>
                        <h2>把你想要的角色告诉 AI</h2>
                        <p>可以写得很短，也可以把姓名、年龄、关系、原作时间点、开场地点和禁区全部写清楚。越明确的内容越不会被改动。</p>
                        <textarea data-workshop-prompt rows="7" maxlength="12000" placeholder="例如：原创成年女性角色，名字叫……她和玩家是刚认识的邻居。性格警觉但好奇，开场在深夜便利店。默认短对话，不要替玩家行动……"></textarea>
                        <div class="leslie-character-workshop-options">
                            <label>
                                <span>创作类型</span>
                                <select data-workshop-mode>
                                    <option value="auto">让 AI 判断</option>
                                    <option value="original">原创角色</option>
                                    <option value="adaptation">原作复刻</option>
                                </select>
                            </label>
                            <label class="leslie-character-workshop-toggle">
                                <input type="checkbox" data-workshop-knowledge-check checked>
                                <span><strong>需要时由当前 AI 核对知识</strong><small>不需要第二套 API；模型不支持联网时只做非实时核对</small></span>
                            </label>
                        </div>
                        <div class="leslie-character-workshop-api-note">
                            <i class="fa-solid fa-link" aria-hidden="true"></i>
                            <span><strong>一个连接完成全部文本工作</strong><small>创作简报、知识核对、角色写作、质量审校和头像提示词都走“设置 → 模型连接”中的当前聊天 API。</small></span>
                        </div>

                        <details class="leslie-character-workshop-json-import">
                            <summary>
                                <span><i class="fa-solid fa-box-open" aria-hidden="true"></i> 已经有角色卡 JSON</span>
                                <small>接收公益角色网站复制的 V2 JSON，也兼容普通 V2 / V3 文本</small>
                            </summary>
                            <div class="leslie-character-workshop-json-import-body">
                                <div class="leslie-character-workshop-json-import-heading">
                                    <div>
                                        <strong>从公益角色网站带入</strong>
                                        <p>在网站选择“复制 JSON 到剪贴板”，回到这里读取并检查。内容只在本机内存中处理，不会自动保存。</p>
                                    </div>
                                    <a href="https://sillytavern-helper.clarixe.top/" target="_blank" rel="noopener noreferrer">打开角色网站</a>
                                </div>
                                <textarea data-workshop-import-json rows="7" maxlength="1500000" spellcheck="false" placeholder='粘贴以 { "spec": "chara_card_v2", "data": { ... } } 开头的 JSON'></textarea>
                                <div class="leslie-character-workshop-json-import-actions">
                                    <button type="button" class="leslie-character-workshop-button is-quiet" data-workshop-action="paste-json">读取剪贴板并检查</button>
                                    <button type="button" class="leslie-character-workshop-button is-primary" data-workshop-action="inspect-json">检查粘贴内容</button>
                                </div>
                                <p class="leslie-character-workshop-json-import-note" data-workshop-import-note>一次只接收一张角色卡；图片仍需在原角色编辑器中补充。</p>
                            </div>
                        </details>
                    </section>

                    <div class="leslie-character-workshop-status" data-workshop-status hidden>
                        <span class="leslie-character-workshop-spinner" aria-hidden="true"></span>
                        <div><strong data-workshop-status-title></strong><p data-workshop-status-body></p></div>
                    </div>
                    <div class="leslie-character-workshop-error" data-workshop-error hidden></div>

                    <section class="leslie-character-workshop-result" data-workshop-section="brief" hidden>
                        <div class="leslie-character-workshop-section-heading"><div><span>01</span><div><h3>AI 理解的创作简报</h3><p>明确要求不会被擅自修改；补全部分会单独列出。</p></div></div></div>
                        <div data-workshop-brief></div>
                    </section>

                    <section class="leslie-character-workshop-result" data-workshop-section="knowledge" hidden>
                        <div class="leslie-character-workshop-section-heading"><div><span>02</span><div><h3>当前 AI 的知识核对</h3><p data-workshop-knowledge-summary></p></div></div></div>
                        <div class="leslie-character-workshop-knowledge" data-workshop-knowledge></div>
                    </section>

                    <section class="leslie-character-workshop-result" data-workshop-section="quality" hidden>
                        <div class="leslie-character-workshop-section-heading"><div><span>04</span><div><h3>质量审校</h3><p>模型复审与本地硬规则同时通过，才会进入最终预览。</p></div></div></div>
                        <div data-workshop-quality></div>
                    </section>

                    <section class="leslie-character-workshop-result" data-workshop-section="preview" hidden>
                        <div class="leslie-character-workshop-section-heading"><div><span>05</span><div><h3 data-workshop-card-name>角色卡预览</h3><p>这里只是内存草稿，尚未写入正式角色目录。</p></div></div></div>
                        <div class="leslie-character-workshop-preview" data-workshop-preview></div>
                    </section>

                    <section class="leslie-character-workshop-result" data-workshop-section="avatar" hidden>
                        <div class="leslie-character-workshop-section-heading"><div><span>IMG</span><div><h3>手动生成头像提示词</h3><p>这里只提供文字，不调用图片 API，也不会生成或保存图片。</p></div></div></div>
                        <div class="leslie-character-workshop-avatar-prompt" data-workshop-avatar-prompt></div>
                    </section>
                </main>
            </div>

            <footer class="leslie-character-workshop-footer">
                <span data-workshop-footer-note>写作规则 ${LESLIE_CHARACTER_WRITING_SKILL.version} · 只生成一张</span>
                <div>
                    <button type="button" class="leslie-character-workshop-button is-quiet" data-workshop-action="manual">改用手动创建</button>
                    <button type="button" class="leslie-character-workshop-button is-quiet" data-workshop-action="download" hidden>下载 JSON 草稿</button>
                    <button type="button" class="leslie-character-workshop-button is-quiet" data-workshop-action="copy-avatar" hidden>复制头像提示词</button>
                    <button type="button" class="leslie-character-workshop-button is-quiet" data-workshop-action="review" hidden>再审校一次</button>
                    <button type="button" class="leslie-character-workshop-button is-danger" data-workshop-action="cancel" hidden>停止创作</button>
                    <button type="button" class="leslie-character-workshop-button is-primary" data-workshop-action="generate">开始深度创作</button>
                    <button type="button" class="leslie-character-workshop-button is-primary" data-workshop-action="apply" hidden>带入角色编辑器</button>
                </div>
            </footer>
        </div>`;
    return element;
}

function query(selector) {
    return overlay.querySelector(selector);
}

function setHidden(selector, hidden) {
    const element = query(selector);
    if (element) {
        element.hidden = hidden;
    }
}

function setConnectionBadge() {
    const badge = query('[data-workshop-connection]');
    const connected = online_status && online_status !== 'no_connection';
    badge.textContent = connected ? '● 模型已连接' : '○ 模型未连接';
    badge.classList.toggle('is-connected', connected);
}

function setStage(stage, status = 'active') {
    const stageIndex = STAGES.indexOf(stage);
    overlay.querySelectorAll('[data-workshop-stage]').forEach((item, index) => {
        item.classList.toggle('is-active', index === stageIndex && status === 'active');
        item.classList.toggle('is-complete', index < stageIndex || (index === stageIndex && status === 'complete'));
    });
}

function showStatus(title, body, stage) {
    const status = query('[data-workshop-status]');
    status.hidden = false;
    query('[data-workshop-status-title]').textContent = title;
    query('[data-workshop-status-body]').textContent = body;
    if (stage) {
        setStage(stage);
    }
}

function hideStatus() {
    setHidden('[data-workshop-status]', true);
}

function showError(message) {
    const error = query('[data-workshop-error]');
    error.textContent = message;
    error.hidden = false;
}

function clearError() {
    const error = query('[data-workshop-error]');
    error.textContent = '';
    error.hidden = true;
}

function setRunning(running) {
    state.running = running;
    query('[data-workshop-action="generate"]').hidden = running || Boolean(state.finalCard);
    query('[data-workshop-action="cancel"]').hidden = !running;
    query('[data-workshop-action="manual"]').disabled = running;
    query('[data-workshop-action="close"]').disabled = running;
    query('[data-workshop-prompt]').disabled = running;
    query('[data-workshop-mode]').disabled = running;
    query('[data-workshop-knowledge-check]').disabled = running;
    query('[data-workshop-import-json]').disabled = running;
    query('[data-workshop-action="paste-json"]').disabled = running;
    query('[data-workshop-action="inspect-json"]').disabled = running;
}

function resetResults() {
    state.brief = null;
    state.knowledgeCheck = null;
    state.draft = null;
    state.finalCard = null;
    state.avatarPrompt = null;
    state.modelReview = null;
    state.localReview = null;
    state.importSource = '';
    state.importNotices = [];
    ['brief', 'knowledge', 'quality', 'preview', 'avatar'].forEach(section => setHidden(`[data-workshop-section="${section}"]`, true));
    setHidden('[data-workshop-action="download"]', true);
    setHidden('[data-workshop-action="review"]', true);
    setHidden('[data-workshop-action="apply"]', true);
    setHidden('[data-workshop-action="copy-avatar"]', true);
    const importNote = query('[data-workshop-import-note]');
    importNote.textContent = '一次只接收一张角色卡；图片仍需在原角色编辑器中补充。';
    delete importNote.dataset.status;
    setStage('brief');
}

function openWorkshop() {
    state.previousFocus = document.activeElement;
    overlay.hidden = false;
    setConnectionBadge();
    document.documentElement.classList.add('leslie-character-workshop-open');
    document.body.classList.add('leslie-character-workshop-open');
    requestAnimationFrame(() => {
        overlay.dataset.open = 'true';
        query('[data-workshop-prompt]').focus();
    });
}

function closeWorkshop() {
    if (state.running) {
        return;
    }

    overlay.dataset.open = 'false';
    document.documentElement.classList.remove('leslie-character-workshop-open');
    document.body.classList.remove('leslie-character-workshop-open');
    window.setTimeout(() => {
        overlay.hidden = true;
        if (state.previousFocus instanceof HTMLElement) {
            state.previousFocus.focus();
        }
    }, 180);
}

function appendTextList(container, title, values, emptyText = '无') {
    const group = document.createElement('div');
    group.className = 'leslie-character-workshop-brief-group';
    const heading = document.createElement('strong');
    heading.textContent = title;
    group.append(heading);
    const list = document.createElement('ul');
    const items = Array.isArray(values) ? values.filter(Boolean) : [values].filter(Boolean);

    for (const value of items.length ? items : [emptyText]) {
        const item = document.createElement('li');
        item.textContent = String(value);
        list.append(item);
    }

    group.append(list);
    container.append(group);
}

function renderBrief() {
    const container = query('[data-workshop-brief]');
    container.replaceChildren();
    container.className = 'leslie-character-workshop-brief-grid';
    appendTextList(container, '硬事实', state.brief.hardFacts);
    appendTextList(container, '主题核心', state.brief.themeCore);
    appendTextList(container, '性格矛盾', state.brief.personalityTensions);
    appendTextList(container, '认知边界', state.brief.knowledgeBoundaries);
    appendTextList(container, '关系与开场', [state.brief.relationshipStart, state.brief.openingHook]);
    appendTextList(container, '克制补全', state.brief.assumptions, '没有额外补全');
    setHidden('[data-workshop-section="brief"]', false);
}

function renderKnowledgeCheck() {
    const section = query('[data-workshop-section="knowledge"]');
    const container = query('[data-workshop-knowledge]');
    const summary = query('[data-workshop-knowledge-summary]');
    container.replaceChildren();

    if (!state.brief?.requiresKnowledgeCheck) {
        summary.textContent = '本次创作不需要额外知识核对。';
        const note = document.createElement('div');
        note.className = 'leslie-character-workshop-empty';
        note.textContent = '已跳过知识核对；原创内容会以你的提示词和创作简报为唯一事实来源。';
        container.append(note);
    } else {
        const knowledgeCheck = state.knowledgeCheck || normalizeKnowledgeCheck({});
        const facts = knowledgeCheck.facts;
        summary.textContent = `${knowledgeCheck.summary || '当前模型已完成一次知识核对。'} 该步骤复用当前聊天 API；若模型本身不支持联网，这不是实时检索结果。`;

        facts.forEach((fact, index) => {
            const article = document.createElement('article');
            const number = document.createElement('span');
            number.textContent = String(index + 1).padStart(2, '0');
            const copy = document.createElement('div');
            const claim = document.createElement('strong');
            claim.textContent = fact.claim;
            const confidence = document.createElement('small');
            confidence.textContent = `置信度：${({ high: '高', medium: '中', low: '低' })[fact.confidence] || '低'}`;
            const basis = document.createElement('p');
            basis.textContent = fact.basis || '模型未提供判断依据，请人工确认。';
            copy.append(claim, confidence, basis);
            article.append(number, copy);
            container.append(article);
        });

        if (facts.length === 0) {
            const note = document.createElement('div');
            note.className = 'leslie-character-workshop-empty';
            note.textContent = '当前模型没有给出足够可靠的知识结论；角色卡会保守处理，并在质量审校中提示人工确认。';
            container.append(note);
        }

        if (knowledgeCheck.uncertainties.length > 0) {
            const uncertainty = document.createElement('div');
            uncertainty.className = 'leslie-character-workshop-knowledge-uncertainties';
            appendTextList(uncertainty, '仍需人工确认', knowledgeCheck.uncertainties);
            container.append(uncertainty);
        }
    }

    section.hidden = false;
}

function renderAvatarPrompt() {
    const section = query('[data-workshop-section="avatar"]');
    const container = query('[data-workshop-avatar-prompt]');
    const avatarPrompt = normalizeAvatarPrompt(state.avatarPrompt || {});
    container.replaceChildren();

    if (!avatarPrompt.positive) {
        section.hidden = true;
        setHidden('[data-workshop-action="copy-avatar"]', true);
        return;
    }

    const fields = [
        ['正向提示词', avatarPrompt.positive],
        ['负向提示词', avatarPrompt.negative || '无额外负向提示词'],
    ];
    for (const [label, value] of fields) {
        const block = document.createElement('div');
        block.className = 'leslie-character-workshop-avatar-field';
        const heading = document.createElement('strong');
        heading.textContent = label;
        const content = document.createElement('pre');
        content.textContent = value;
        block.append(heading, content);
        container.append(block);
    }

    const meta = document.createElement('p');
    meta.className = 'leslie-character-workshop-avatar-meta';
    meta.textContent = `推荐比例：${avatarPrompt.aspectRatio || '2:3'}${avatarPrompt.notes ? ` · ${avatarPrompt.notes}` : ''}`;
    container.append(meta);
    section.hidden = false;
    setHidden('[data-workshop-action="copy-avatar"]', false);
}

function renderQuality() {
    const container = query('[data-workshop-quality]');
    container.replaceChildren();
    container.className = 'leslie-character-workshop-quality-grid';
    const modelTotal = Number(state.modelReview?.scores?.total);
    const localScore = Number(state.localReview?.score ?? 0);
    const adaptationWithoutLiveSources = state.brief?.mode === 'adaptation'
        && /(?:无法|不支持|没有).{0,8}(?:实时)?联网|不是实时检索/u.test(state.knowledgeCheck?.summary || '');
    const combinedScore = Number.isFinite(modelTotal)
        ? Math.round((Math.min(100, Math.max(0, modelTotal)) * 0.45) + (localScore * 0.55))
        : localScore;
    const issues = [
        ...(state.localReview?.blocking || []).map(item => item.message),
        ...(state.localReview?.warnings || []).map(item => item.message),
    ];
    const score = document.createElement('div');
    score.className = 'leslie-character-workshop-score';
    score.dataset.grade = combinedScore >= 90 ? 'excellent' : combinedScore >= 75 ? 'good' : 'warning';
    const scoreNumber = document.createElement('strong');
    scoreNumber.textContent = String(combinedScore);
    const scoreCopy = document.createElement('span');
    scoreCopy.textContent = state.brief?.mode === 'adaptation'
        ? '结构与行为质量分 / 100'
        : '综合质量分 / 100';
    score.append(scoreNumber, scoreCopy);

    const summary = document.createElement('div');
    summary.className = 'leslie-character-workshop-review-copy';
    const heading = document.createElement('strong');
    heading.textContent = issues.length === 0
        ? '最终稿已通过全部本地硬规则，AI 独立复审已完成。'
        : state.modelReview?.summary || '已完成模型复审与本地规则检查。';
    const details = document.createElement('p');
    details.textContent = `本地规则 ${localScore} 分；模型复审 ${Number.isFinite(modelTotal) ? `${modelTotal} 分` : '未提供总分'}。${adaptationWithoutLiveSources ? ' 原作事实未经过实时网页来源验证，不计入此分数。' : ''}`;
    summary.append(heading, details);
    container.append(score, summary);

    const findings = document.createElement('div');
    findings.className = 'leslie-character-workshop-findings';
    appendTextList(findings, issues.length ? '仍需留意' : '本地硬规则', issues, '全部通过');
    const hasModelScore = Number.isFinite(modelTotal);
    appendTextList(
        findings,
        state.importSource && !hasModelScore ? '兼容处理' : '审校修改',
        state.modelReview?.changesMade,
        state.importSource && !hasModelScore ? '无需额外转换' : '模型未列出具体修改',
    );
    container.append(findings);
    setHidden('[data-workshop-section="quality"]', false);
}

function renderPreview() {
    const data = state.finalCard.data;
    const container = query('[data-workshop-preview]');
    container.replaceChildren();
    query('[data-workshop-card-name]').textContent = `${data.name} · 角色卡预览`;

    for (const [field, label] of PREVIEW_FIELDS) {
        const details = document.createElement('details');
        if (field === 'first_mes') {
            details.open = true;
        }
        const summary = document.createElement('summary');
        summary.textContent = label;
        const content = document.createElement('pre');
        content.textContent = data[field];
        details.append(summary, content);
        container.append(details);
    }

    setHidden('[data-workshop-section="preview"]', false);
    setHidden('[data-workshop-action="download"]', false);
    setHidden('[data-workshop-action="review"]', false);
    const missingFields = state.localReview.blocking.length > 0;
    const belowQualityFloor = state.localReview.score < 75;
    setHidden('[data-workshop-action="apply"]', missingFields || belowQualityFloor);
    let footerNote = '草稿尚未保存。带入后请补头像并逐项确认。';
    if (missingFields) {
        footerNote = '存在缺失字段，暂不能带入编辑器。请先让 AI 审校补全。';
    } else if (belowQualityFloor) {
        footerNote = `本地质量分 ${state.localReview.score}，低于 75 分门槛。请先让 AI 深度审校。`;
    } else if (state.brief?.mode === 'adaptation' && /(?:无法|不支持|没有).{0,8}(?:实时)?联网|不是实时检索/u.test(state.knowledgeCheck?.summary || '')) {
        footerNote = '草稿尚未保存；当前原作事实未经过实时网页来源验证，请先人工核对，再带入编辑器。';
    } else if (state.importSource) {
        footerNote = `${state.importSource} JSON 已通过结构检查，尚未保存。`;
    }
    query('[data-workshop-footer-note]').textContent = footerNote;
}

function createImportedCardBrief(card) {
    const data = card.data;
    return {
        mode: 'imported',
        workingTitle: data.name,
        hardFacts: ['把待审角色卡中已经明确写出的身份、经历、关系和边界视为硬事实，不得擅自替换。'],
        themeCore: ['保留原卡创作意图，只修复一致性、字段职责与互动质量问题。'],
        personalityTensions: [],
        knowledgeBoundaries: ['不得为补全格式而虚构角色卡没有提供的新经历或原作事实。'],
        userIdentity: '沿用待审角色卡中的 {{user}} 定义。',
        relationshipStart: data.scenario,
        openingHook: data.first_mes,
        replyStyle: data.post_history_instructions,
        contentBoundaries: ['不替 {{user}} 决定台词、行动、情绪、同意或关系升级。'],
        assumptions: ['这是一份外部导入卡；审校只能做必要修复，不扩写无关设定。'],
        requiresKnowledgeCheck: false,
        knowledgeQuestions: [],
        qualityTargets: ['字段完整', '人格稳定', '短对话自然', '用户控制权清楚'],
    };
}

function inspectPastedJson() {
    if (state.running) {
        return;
    }

    clearError();
    try {
        const result = parseCharacterCardJsonText(query('[data-workshop-import-json]').value);
        resetResults();
        state.finalCard = result.card;
        state.importSource = result.sourceLabel;
        state.importNotices = result.notices;
        state.brief = createImportedCardBrief(result.card);
        state.modelReview = {
            summary: `已完成 ${result.sourceLabel} ${result.sourceSpec} 的兼容性与本地质量检查，尚未调用 AI 改写。`,
            changesMade: result.notices,
        };
        state.localReview = assessCharacterCard(state.finalCard);
        renderQuality();
        renderPreview();
        setStage('ready', 'complete');
        setRunning(false);

        const note = query('[data-workshop-import-note]');
        const warningCount = state.localReview.warnings.length;
        const missingFields = state.localReview.blocking.length > 0;
        const belowQualityFloor = state.localReview.score < 75;
        if (missingFields) {
            note.textContent = `结构读取成功，但有 ${state.localReview.blocking.length} 个关键字段缺失。请先点“再审校一次”，由 AI 补全后再带入。`;
        } else if (belowQualityFloor) {
            note.textContent = `结构读取成功，但本地质量分 ${state.localReview.score} 低于 75 分门槛。请先让 AI 深度审校。`;
        } else {
            note.textContent = `结构读取成功；本地质量分 ${state.localReview.score}，另有 ${warningCount} 项建议。你可以直接带入，也可以先让 AI 深度审校。`;
        }
        note.dataset.status = missingFields || belowQualityFloor ? 'warning' : 'success';
        query('[data-workshop-section="quality"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
        showError(error?.message || '无法读取这份角色卡 JSON。');
        const note = query('[data-workshop-import-note]');
        note.textContent = '没有写入或覆盖任何角色数据。请检查复制内容后重试。';
        note.dataset.status = 'error';
    }
}

async function pasteAndInspectJson() {
    clearError();
    if (!navigator.clipboard?.readText) {
        showError('当前环境不能自动读取剪贴板。请在输入框中按 Ctrl+V，再点“检查粘贴内容”。');
        query('[data-workshop-import-json]').focus();
        return;
    }

    try {
        const text = await navigator.clipboard.readText();
        query('[data-workshop-import-json]').value = text;
        inspectPastedJson();
    } catch (error) {
        console.warn('Leslie character workshop clipboard read failed', error);
        showError('没有取得剪贴板读取权限。请在输入框中按 Ctrl+V，再点“检查粘贴内容”。');
        query('[data-workshop-import-json]').focus();
    }
}

async function generateStructured(request, runId) {
    const response = await generateRaw({
        prompt: request.prompt,
        systemPrompt: request.systemPrompt,
        responseLength: request.responseLength,
        trimNames: false,
    });

    if (runId !== state.runId || state.cancelled) {
        throw new Error('创作已取消。');
    }

    try {
        return parseStructuredResponse(response);
    } catch (error) {
        showStatus('正在修复模型格式', '内容已经生成，但 JSON 格式不完整。AI 正在做一次格式修复，不会重写你的要求。');
        const repair = buildRepairRequest(response, error.message);
        const repairedResponse = await generateRaw({
            prompt: repair.prompt,
            systemPrompt: repair.systemPrompt,
            responseLength: repair.responseLength,
            trimNames: false,
        });
        if (runId !== state.runId || state.cancelled) {
            throw new Error('创作已取消。');
        }
        return parseStructuredResponse(repairedResponse);
    }
}

function ensureRunActive(runId) {
    if (runId !== state.runId || state.cancelled) {
        throw new Error('创作已取消。');
    }
}

async function runWorkshop() {
    const prompt = query('[data-workshop-prompt]').value.trim();
    if (prompt.length < 10) {
        showError('请先写下至少一句完整的角色需求。姓名、身份、关系和开场写得越清楚，结果越稳定。');
        query('[data-workshop-prompt]').focus();
        return;
    }
    if (!online_status || online_status === 'no_connection') {
        showError('当前没有连接可用模型。请先到“设置 → 模型连接”完成连接，再回来创作。');
        return;
    }
    if (isGenerating()) {
        showError('当前正在生成聊天回复。请先停止回复，再开始角色创作。');
        return;
    }

    resetResults();
    clearError();
    state.cancelled = false;
    const runId = ++state.runId;
    setRunning(true);

    try {
        showStatus('正在整理创作简报', 'AI 会先区分硬要求和可补全部分，避免一上来就堆设定。', 'brief');
        const selectedMode = query('[data-workshop-mode]').value;
        const modelSafePrompt = protectRoleMacrosForGeneration(prompt);
        const briefResponse = await generateStructured(buildBriefRequest(modelSafePrompt, selectedMode), runId);
        state.brief = normalizeCreativeBrief(briefResponse);
        if (selectedMode !== 'auto') {
            state.brief.mode = selectedMode;
            state.brief.requiresKnowledgeCheck = selectedMode === 'adaptation' || state.brief.requiresKnowledgeCheck;
        }
        ensureRunActive(runId);
        renderBrief();
        setStage('research');

        const knowledgeCheckEnabled = query('[data-workshop-knowledge-check]').checked;
        if (!knowledgeCheckEnabled) {
            state.brief.requiresKnowledgeCheck = false;
            state.brief.knowledgeQuestions = [];
        }

        if (state.brief.requiresKnowledgeCheck) {
            showStatus('正在用当前聊天 AI 核对知识', '不会要求第二套 API。模型若没有联网能力，必须标出不确定项，不得虚构网址或出处。', 'research');
            const knowledgeResponse = await generateStructured(buildKnowledgeCheckRequest(state.brief), runId);
            ensureRunActive(runId);
            state.knowledgeCheck = normalizeKnowledgeCheck(knowledgeResponse);
        } else {
            state.knowledgeCheck = normalizeKnowledgeCheck({ summary: '已按创作简报跳过知识核对。' });
        }
        renderKnowledgeCheck();

        showStatus('正在创作完整角色卡', '只生成一个候选；同时附带一份可复制的头像图片提示词，但不会调用图片生成。', 'draft');
        const draftResponse = await generateStructured(buildDraftRequest(state.brief, state.knowledgeCheck), runId);
        ensureRunActive(runId);
        state.draft = canonicalizeDialogueRoleLabels(draftResponse, {
            userLabel: name1,
            characterLabels: [name2],
        });
        state.avatarPrompt = normalizeAvatarPrompt(draftResponse);
        const draftReview = assessCharacterCard(state.draft, { brief: state.brief, knowledgeCheck: state.knowledgeCheck });

        showStatus('正在进行独立审校', 'AI 会重新检查硬事实、知识置信边界、人物一致性、用户控制权、关系节奏和头像提示词，再交付修订稿。', 'review');
        const reviewResponse = await generateStructured(buildReviewRequest(state.brief, state.draft, state.knowledgeCheck, draftReview, state.avatarPrompt), runId);
        ensureRunActive(runId);
        state.finalCard = canonicalizeDialogueRoleLabels(reviewResponse.card ?? reviewResponse, {
            userLabel: name1,
            characterLabels: [name2, state.draft.data.name],
        });
        const reviewedAvatarPrompt = normalizeAvatarPrompt(reviewResponse);
        if (reviewedAvatarPrompt.positive) {
            state.avatarPrompt = reviewedAvatarPrompt;
        }
        state.modelReview = reviewResponse.review ?? {};
        state.localReview = assessCharacterCard(state.finalCard, { brief: state.brief, knowledgeCheck: state.knowledgeCheck });
        renderQuality();
        renderPreview();
        renderAvatarPrompt();
        hideStatus();
        setStage('ready', 'complete');
    } catch (error) {
        hideStatus();
        if (!state.cancelled) {
            console.error('Leslie character workshop failed', error);
            showError(error?.message || '角色创作没有完成。你的正式角色卡和聊天没有受到影响，可以修改提示词后重试。');
        }
    } finally {
        setRunning(false);
    }
}

async function rerunReview() {
    if (!state.finalCard || state.running || isGenerating()) {
        return;
    }
    if (!online_status || online_status === 'no_connection') {
        showError('当前没有连接可用模型。你仍可查看本地检查结果，或连接模型后再做 AI 深度审校。');
        return;
    }

    clearError();
    state.cancelled = false;
    const runId = ++state.runId;
    setRunning(true);
    setHidden('[data-workshop-action="review"]', true);
    setHidden('[data-workshop-action="apply"]', true);
    try {
        showStatus('正在进行第二次审校', '这次会把上一版最终稿当作待审稿，只修复问题，不扩写无关设定。', 'review');
        const currentReview = assessCharacterCard(state.finalCard, { brief: state.brief, knowledgeCheck: state.knowledgeCheck });
        const response = await generateStructured(buildReviewRequest(state.brief, state.finalCard, state.knowledgeCheck, currentReview, state.avatarPrompt), runId);
        ensureRunActive(runId);
        state.finalCard = canonicalizeDialogueRoleLabels(response.card ?? response, {
            userLabel: name1,
            characterLabels: [name2, state.finalCard.data.name],
        });
        const reviewedAvatarPrompt = normalizeAvatarPrompt(response);
        if (reviewedAvatarPrompt.positive) {
            state.avatarPrompt = reviewedAvatarPrompt;
        }
        state.modelReview = response.review ?? {};
        state.localReview = assessCharacterCard(state.finalCard, { brief: state.brief, knowledgeCheck: state.knowledgeCheck });
        renderQuality();
        renderPreview();
        renderAvatarPrompt();
        hideStatus();
        setStage('ready', 'complete');
    } catch (error) {
        hideStatus();
        if (!state.cancelled) {
            showError(error?.message || '第二次审校没有完成，上一版草稿仍然保留。');
        }
    } finally {
        setRunning(false);
    }
}

function buildAuditedCard() {
    return normalizeCharacterCard(state.finalCard);
}

function openOriginalCreateEditor() {
    closeWorkshop();
    state.bypassNextCreateClick = true;
    document.querySelector('#rm_button_create')?.click();
}

function applyDraft() {
    if (!state.finalCard || state.localReview?.blocking?.length || state.localReview?.score < 75) {
        return;
    }

    const card = buildAuditedCard();
    Object.assign(create_save, cardToCreateState(card), { avatar: null });
    openOriginalCreateEditor();
    const source = state.importSource || 'AI 草稿';
    window.toastr?.success(`${source}已带入原角色编辑器。请补头像并逐项确认后再保存。`, '角色卡尚未保存');
}

function downloadDraft() {
    if (!state.finalCard) {
        return;
    }

    const card = buildAuditedCard();
    const safeName = card.data.name.replace(/[\\/:*?"<>|]/g, '_') || 'character-draft';
    const blob = new Blob([JSON.stringify(card, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${safeName}.draft.json`;
    anchor.click();
    URL.revokeObjectURL(url);
}

async function copyAvatarPrompt() {
    const text = formatAvatarPrompt(state.avatarPrompt || {});
    if (!text) {
        showError('当前草稿还没有可复制的头像提示词。');
        return;
    }

    try {
        await navigator.clipboard.writeText(text);
        window.toastr?.success('已复制正向提示词、负向提示词和推荐比例。', '头像提示词已复制');
    } catch (error) {
        console.warn('Leslie character workshop clipboard write failed', error);
        showError('浏览器没有允许自动写入剪贴板。请在“手动生成头像提示词”区域中手动选择并复制。');
        query('[data-workshop-section="avatar"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

function cancelWorkshopRun() {
    if (!state.running) {
        return;
    }
    state.cancelled = true;
    state.runId++;
    stopGeneration();
    hideStatus();
    showError('已停止本次创作。没有保存或覆盖任何角色数据。');
    setRunning(false);
}

function bindWorkshopEvents() {
    document.addEventListener('click', event => {
        const createButton = event.target instanceof Element ? event.target.closest('#rm_button_create') : null;
        if (!createButton) {
            return;
        }
        if (state.bypassNextCreateClick) {
            state.bypassNextCreateClick = false;
            return;
        }
        event.preventDefault();
        event.stopImmediatePropagation();
        openWorkshop();
    }, true);

    overlay.addEventListener('click', event => {
        const action = event.target instanceof Element ? event.target.closest('[data-workshop-action]')?.dataset.workshopAction : '';
        if (action === 'close') closeWorkshop();
        if (action === 'manual') openOriginalCreateEditor();
        if (action === 'generate') runWorkshop();
        if (action === 'cancel') cancelWorkshopRun();
        if (action === 'review') rerunReview();
        if (action === 'apply') applyDraft();
        if (action === 'download') downloadDraft();
        if (action === 'copy-avatar') copyAvatarPrompt();
        if (action === 'paste-json') pasteAndInspectJson();
        if (action === 'inspect-json') inspectPastedJson();
    });

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !overlay.hidden && !state.running) {
            closeWorkshop();
        }
    });
}

function initializeWorkshop() {
    overlay = createWorkshopMarkup();
    document.body.append(overlay);
    bindWorkshopEvents();
    setStage('brief');
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeWorkshop, { once: true });
} else {
    initializeWorkshop();
}
