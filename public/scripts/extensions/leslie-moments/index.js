import {
    characters,
    default_avatar,
    eventSource,
    event_types,
    getThumbnailUrl,
} from '../../../script.js';
import { getContext } from '../../extensions.js';
import { getUserAvatar, user_avatar } from '../../personas.js';
import { power_user } from '../../power-user.js';
import { getMemoryChatIdentity } from '../leslie-memory/chat-context.js';
import {
    buildStoryScopeRequest,
    createPersonaDescriptor,
    getMemoryMetadataReference,
} from '../leslie-memory/identity-context.js';
import {
    MOMENT_MODE_DETAILS,
    describeMomentVisibility,
    filterMomentPosts,
    formatMomentTime,
    getMomentModeDetails,
} from './model.js';

const API_ROOT = '/api/leslie/moments';
const IDENTITY_API_ROOT = '/api/leslie/identity';

const pageState = {
    open: false,
    busy: false,
    posts: [],
    timelineRevision: 0,
    currentPersona: null,
    currentPersonaEntity: null,
    currentStory: null,
    mode: 'reality',
    filter: 'all',
    visibilityType: 'all',
    selectedSourceKeys: new Set(),
    includeArchived: false,
    audienceOpen: false,
    audienceQuery: '',
    editingId: null,
    confirmingArchiveId: null,
    draftContent: '',
    error: '',
};

let overlay;
let pageMain;

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll('\'', '&#039;');
}

function notify(type, message) {
    if (globalThis.toastr?.[type]) {
        globalThis.toastr[type](message, 'Leslie 朋友圈');
        return;
    }
    console[type === 'error' ? 'error' : 'info'](`[Leslie Moments] ${message}`);
}

function getSafeThumbnail(type, value) {
    if (!value) {
        return type === 'persona' ? '' : default_avatar;
    }
    try {
        return getThumbnailUrl(type, value);
    } catch {
        return type === 'persona' ? getUserAvatar(value) : default_avatar;
    }
}

function getCurrentPersona() {
    const context = getContext();
    const descriptor = createPersonaDescriptor(context, {
        avatarId: user_avatar,
        name: power_user.personas?.[user_avatar] || context.name1,
    });
    return {
        type: 'persona',
        sourceKey: descriptor.sourceKey,
        label: descriptor.name,
        avatar: user_avatar ? getSafeThumbnail('persona', user_avatar) : '',
    };
}

function getAudienceCandidates() {
    const unique = new Map();
    characters.forEach((character) => {
        const sourceKey = String(character?.avatar || character?.name || '').trim();
        const label = String(character?.name || '').trim();
        if (!sourceKey || !label || unique.has(sourceKey)) {
            return;
        }
        unique.set(sourceKey, {
            type: 'character',
            sourceKey,
            label,
            avatar: getSafeThumbnail('avatar', character.avatar),
        });
    });
    return [...unique.values()].sort((left, right) => left.label.localeCompare(right.label, 'zh-CN'));
}

function getCurrentStory() {
    const context = getContext();
    const personaDescriptor = createPersonaDescriptor(context, {
        avatarId: user_avatar,
        name: power_user.personas?.[user_avatar] || context.name1,
    });
    const identity = getMemoryChatIdentity(context, personaDescriptor);
    if (!identity || identity.error) {
        return null;
    }
    const reference = getMemoryMetadataReference(context.chatMetadata?.leslie_memory, personaDescriptor.sourceKey);
    const storyContext = buildStoryScopeRequest(identity, reference.storyScopeId || null);
    storyContext.counterpart.avatar = identity.isGroup ? '' : getSafeThumbnail('avatar', identity.character?.avatar);
    return {
        label: identity.displayName,
        isGroup: identity.isGroup,
        storyContext,
    };
}

async function apiRequest(path = '', { method = 'GET', body } = {}) {
    const context = getContext();
    const response = await fetch(`${API_ROOT}${path}`, {
        method,
        headers: context.getRequestHeaders(),
        cache: 'no-cache',
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        if (response.status === 404 && data.error !== 'NOT_FOUND') {
            throw new Error('朋友圈后台尚未加载。请完全关闭 LeslieTavern 后重新打开。');
        }
        throw new Error(data.message || `朋友圈请求失败（${response.status}）`);
    }
    return data;
}

async function identityRequest(path, body) {
    const context = getContext();
    const response = await fetch(`${IDENTITY_API_ROOT}${path}`, {
        method: 'POST',
        headers: context.getRequestHeaders(),
        cache: 'no-cache',
        body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data.message || `身份请求失败（${response.status}）`);
    }
    return data;
}

async function resolveCurrentPersona() {
    pageState.currentPersona = getCurrentPersona();
    const result = await identityRequest('/entities/resolve', {
        entities: [pageState.currentPersona],
    });
    pageState.currentPersonaEntity = result.entities?.[0] ?? null;
}

async function loadPosts() {
    const query = pageState.includeArchived ? '?includeArchived=true' : '';
    const result = await apiRequest(query);
    pageState.posts = Array.isArray(result.posts) ? result.posts : [];
    pageState.timelineRevision = Number(result.revision ?? 0);
}

function renderAvatar(source, label, className = '') {
    const image = source
        ? `<img src="${escapeHtml(source)}" alt="" loading="lazy">`
        : '';
    return `<span class="leslie-moments-avatar ${className}">${image}<span ${source ? 'hidden' : ''}>${escapeHtml(String(label || '?').slice(0, 1))}</span></span>`;
}

function getEditingPost() {
    return pageState.editingId ? pageState.posts.find(post => post.id === pageState.editingId) ?? null : null;
}

function getComposerMode() {
    return getEditingPost()?.mode || pageState.mode;
}

function getSelectedAudienceDraft() {
    const candidates = getAudienceCandidates();
    return candidates.filter(candidate => pageState.selectedSourceKeys.has(candidate.sourceKey));
}

function getComposerVisibility(mode) {
    const editing = getEditingPost();
    if (mode === 'story') {
        if (editing) {
            return editing.visibility;
        }
        return pageState.currentStory ? {
            type: 'selected',
            targets: [{ label: pageState.currentStory.label }],
        } : { type: 'selected', targets: [] };
    }
    if (pageState.visibilityType === 'all') {
        return { type: 'all', targets: [] };
    }
    return { type: 'selected', targets: getSelectedAudienceDraft() };
}

function renderModeButtons(mode, editing) {
    return Object.entries(MOMENT_MODE_DETAILS).map(([key, details]) => {
        const disabled = editing || (key === 'story' && !pageState.currentStory);
        const title = key === 'story' && !pageState.currentStory ? '先打开一个角色聊天，才能发布剧情内动态。' : details.description;
        return `<button type="button" class="${mode === key ? 'is-active' : ''}" data-moments-action="mode" data-mode="${key}" aria-pressed="${mode === key}" ${disabled ? 'disabled' : ''} title="${escapeHtml(title)}">
            <i class="fa-solid ${details.icon}" aria-hidden="true"></i><span>${details.label}</span>
        </button>`;
    }).join('');
}

function renderComposer() {
    const editing = getEditingPost();
    const mode = getComposerMode();
    const details = getMomentModeDetails(mode);
    const visibility = getComposerVisibility(mode);
    const storyUnavailable = mode === 'story' && !editing && !pageState.currentStory;
    const selectedMissing = mode !== 'story' && pageState.visibilityType === 'selected' && !getSelectedAudienceDraft().length;
    const disabled = pageState.busy || !pageState.currentPersonaEntity || !pageState.draftContent.trim() || storyUnavailable || selectedMissing;
    const persona = pageState.currentPersona || getCurrentPersona();
    const audienceLocked = mode === 'story';
    const storyName = editing?.storyBinding?.counterpartName || pageState.currentStory?.label;
    return `<section class="leslie-moments-composer" aria-labelledby="leslie-moments-compose-title">
        <div class="leslie-moments-composer-heading">
            ${renderAvatar(persona.avatar, persona.label)}
            <div><strong id="leslie-moments-compose-title">${editing ? '编辑这条动态' : `以 ${escapeHtml(persona.label)} 发布`}</strong><small>${editing ? '动态类型不会在编辑时改变，避免记忆语义被重写。' : '先说明这条动态属于哪个世界，再选择谁能看见。'}</small></div>
        </div>
        <div class="leslie-moments-mode-picker" role="group" aria-label="动态类型">${renderModeButtons(mode, Boolean(editing))}</div>
        <p class="leslie-moments-mode-help"><i class="fa-solid ${details.icon}" aria-hidden="true"></i><span>${escapeHtml(details.description)}</span></p>
        ${storyUnavailable ? '<div class="leslie-moments-inline-warning"><i class="fa-solid fa-triangle-exclamation"></i><span>当前没有打开具体聊天，剧情内动态暂不可用。</span></div>' : ''}
        ${mode === 'story' && storyName ? `<div class="leslie-moments-story-lock"><i class="fa-solid fa-link"></i><span>已锁定剧情线：<strong>${escapeHtml(storyName)}</strong></span></div>` : ''}
        <label class="leslie-moments-textarea-wrap">
            <span class="sr-only">动态内容</span>
            <textarea id="leslie-moments-content" maxlength="5000" rows="4" placeholder="分享此刻发生的事……">${escapeHtml(pageState.draftContent)}</textarea>
            <small><span id="leslie-moments-character-count">${pageState.draftContent.length}</span> / 5000</small>
        </label>
        <div class="leslie-moments-compose-actions">
            <button type="button" class="leslie-moments-audience-button" data-moments-action="audience" ${audienceLocked ? 'disabled' : ''}>
                <i class="fa-solid ${visibility.type === 'all' ? 'fa-earth-asia' : 'fa-user-lock'}"></i><span>${escapeHtml(describeMomentVisibility(visibility))}</span>${audienceLocked ? '<i class="fa-solid fa-lock"></i>' : '<i class="fa-solid fa-chevron-down"></i>'}
            </button>
            ${editing ? '<button type="button" class="leslie-moments-button ghost" data-moments-action="cancel-edit">取消</button>' : ''}
            <button type="button" class="leslie-moments-button primary" data-moments-action="submit" ${disabled ? 'disabled' : ''}>
                <i class="fa-solid ${editing ? 'fa-floppy-disk' : 'fa-paper-plane'}"></i><span>${editing ? '保存修改' : '发布动态'}</span>
            </button>
        </div>
    </section>`;
}

function renderFilterBar() {
    const filters = [['all', '全部'], ['reality', '现实'], ['story', '剧情内'], ['aside', '调侃']];
    return `<div class="leslie-moments-filter-bar">
        <div role="tablist" aria-label="筛选动态">
            ${filters.map(([key, label]) => `<button type="button" data-moments-action="filter" data-filter="${key}" class="${pageState.filter === key ? 'is-active' : ''}" aria-selected="${pageState.filter === key}">${label}</button>`).join('')}
        </div>
        <label><input type="checkbox" data-moments-action="archived" ${pageState.includeArchived ? 'checked' : ''}><span>显示已撤回</span></label>
    </div>`;
}

function renderPostActions(post, editable) {
    if (!editable) {
        return '<span class="leslie-moments-other-persona"><i class="fa-solid fa-user-shield"></i>由另一个 Persona 发布</span>';
    }
    if (post.status === 'archived') {
        return `<button type="button" data-moments-action="restore" data-post-id="${post.id}"><i class="fa-solid fa-arrow-rotate-left"></i>恢复动态</button>`;
    }
    if (pageState.confirmingArchiveId === post.id) {
        return `<span class="leslie-moments-confirm-copy">撤回后仍可恢复</span>
            <button type="button" data-moments-action="cancel-archive" data-post-id="${post.id}">取消</button>
            <button type="button" class="danger" data-moments-action="archive" data-post-id="${post.id}">确认撤回</button>`;
    }
    return `<button type="button" data-moments-action="edit" data-post-id="${post.id}"><i class="fa-solid fa-pen"></i>编辑</button>
        <button type="button" data-moments-action="ask-archive" data-post-id="${post.id}"><i class="fa-solid fa-box-archive"></i>撤回</button>`;
}

function renderPost(post) {
    const details = getMomentModeDetails(post.mode);
    const editable = pageState.currentPersonaEntity?.id === post.author?.entityId;
    const likes = post.reactions?.likes?.length ?? 0;
    const comments = post.reactions?.comments?.length ?? 0;
    return `<article class="leslie-moments-post ${post.status === 'archived' ? 'is-archived' : ''}" data-post-id="${post.id}">
        <header>
            ${renderAvatar(post.author?.avatar, post.author?.label)}
            <div class="leslie-moments-post-author"><strong>${escapeHtml(post.author?.label || '未知 Persona')}</strong><span>${escapeHtml(formatMomentTime(post.createdAt))}${post.editedAt ? ' · 已编辑' : ''}</span></div>
            <span class="leslie-moments-mode-badge mode-${post.mode}"><i class="fa-solid ${details.icon}"></i>${details.label}</span>
        </header>
        ${post.status === 'archived' ? '<div class="leslie-moments-archived-label"><i class="fa-solid fa-box-archive"></i>这条动态已撤回，只对你可见</div>' : ''}
        <div class="leslie-moments-post-content">${escapeHtml(post.content)}</div>
        <div class="leslie-moments-post-meta"><i class="fa-solid ${post.visibility?.type === 'all' ? 'fa-earth-asia' : 'fa-user-lock'}"></i>${escapeHtml(describeMomentVisibility(post.visibility))}${post.storyBinding ? `<span><i class="fa-solid fa-link"></i>剧情线：${escapeHtml(post.storyBinding.counterpartName)}</span>` : ''}</div>
        <footer>
            <div class="leslie-moments-reactions" title="AI 点赞与评论将在下一阶段接入">
                <span aria-disabled="true"><i class="fa-regular fa-heart"></i>${likes}</span>
                <span aria-disabled="true"><i class="fa-regular fa-comment"></i>${comments}</span>
            </div>
            <div class="leslie-moments-post-actions">${renderPostActions(post, editable)}</div>
        </footer>
    </article>`;
}

function renderTimeline() {
    const posts = filterMomentPosts(pageState.posts, {
        mode: pageState.filter,
        includeArchived: pageState.includeArchived,
    });
    if (!posts.length) {
        return `<div class="leslie-moments-empty"><span><i class="fa-regular fa-images"></i></span><strong>${pageState.filter === 'all' ? '朋友圈还是空的' : '这个分类还没有动态'}</strong><p>从上面发布第一条文字动态。角色点赞、评论和主动发动态会在下一阶段接入。</p></div>`;
    }
    return posts.map(renderPost).join('');
}

function renderAudiencePicker() {
    if (!pageState.audienceOpen) {
        return '';
    }
    const query = pageState.audienceQuery.trim().toLocaleLowerCase('zh-CN');
    const candidates = getAudienceCandidates().filter(candidate => !query || candidate.label.toLocaleLowerCase('zh-CN').includes(query));
    return `<div class="leslie-moments-audience-overlay" role="presentation">
        <section class="leslie-moments-audience-dialog" role="dialog" aria-modal="true" aria-labelledby="leslie-moments-audience-title">
            <header><div><strong id="leslie-moments-audience-title">谁可以看见</strong><small>不选择限制时，所有角色都能看到这条动态。</small></div><button type="button" data-moments-action="audience-cancel" aria-label="关闭"><i class="fa-solid fa-xmark"></i></button></header>
            <div class="leslie-moments-visibility-options">
                <button type="button" data-moments-action="visibility" data-visibility="all" class="${pageState.visibilityType === 'all' ? 'is-active' : ''}"><i class="fa-solid fa-earth-asia"></i><span><strong>所有角色</strong><small>现在和以后添加的角色都可以看到</small></span><i class="fa-solid fa-circle-check"></i></button>
                <button type="button" data-moments-action="visibility" data-visibility="selected" class="${pageState.visibilityType === 'selected' ? 'is-active' : ''}"><i class="fa-solid fa-user-lock"></i><span><strong>指定角色</strong><small>只让你勾选的角色看到</small></span><i class="fa-solid fa-circle-check"></i></button>
            </div>
            <label class="leslie-moments-audience-search"><i class="fa-solid fa-magnifying-glass"></i><input type="search" id="leslie-moments-audience-search" value="${escapeHtml(pageState.audienceQuery)}" placeholder="搜索角色" ${pageState.visibilityType === 'all' ? 'disabled' : ''}></label>
            <div class="leslie-moments-audience-list ${pageState.visibilityType === 'all' ? 'is-disabled' : ''}">
                ${candidates.length ? candidates.map(candidate => `<label>
                    <input type="checkbox" data-audience-source="${escapeHtml(candidate.sourceKey)}" ${pageState.selectedSourceKeys.has(candidate.sourceKey) ? 'checked' : ''} ${pageState.visibilityType === 'all' ? 'disabled' : ''}>
                    ${renderAvatar(candidate.avatar, candidate.label, 'small')}
                    <span><strong>${escapeHtml(candidate.label)}</strong><small>${escapeHtml(candidate.sourceKey)}</small></span>
                    <i class="fa-solid fa-check"></i>
                </label>`).join('') : '<div class="leslie-moments-audience-empty">没有找到角色</div>'}
            </div>
            <footer><span>${pageState.visibilityType === 'all' ? '所有角色可见' : `已选择 ${pageState.selectedSourceKeys.size} 个角色`}</span><button type="button" class="leslie-moments-button primary" data-moments-action="audience-done" ${pageState.visibilityType === 'selected' && !pageState.selectedSourceKeys.size ? 'disabled' : ''}>完成</button></footer>
        </section>
    </div>`;
}

function renderPage() {
    if (!pageMain) {
        return;
    }
    const personaLabel = pageState.currentPersona?.label || getCurrentPersona().label;
    pageMain.innerHTML = `
        <div class="leslie-moments-notice"><i class="fa-solid fa-wand-magic-sparkles"></i><span><strong>当前是发布与时间线第一版</strong>AI 点赞、评论和角色主动发布将在下一阶段加入；这里不会伪造互动。</span></div>
        ${pageState.error ? `<div class="leslie-moments-error"><i class="fa-solid fa-circle-exclamation"></i><span>${escapeHtml(pageState.error)}</span><button type="button" data-moments-action="retry">重试</button></div>` : ''}
        ${renderComposer()}
        <section class="leslie-moments-timeline" aria-label="朋友圈时间线">
            <div class="leslie-moments-timeline-title"><div><strong>动态时间线</strong><small>${escapeHtml(personaLabel)} 的视角 · 数据保存在本机</small></div><span>${pageState.timelineRevision ? `版本 ${pageState.timelineRevision}` : '尚未写入数据'}</span></div>
            ${renderFilterBar()}
            <div class="leslie-moments-feed">${renderTimeline()}</div>
        </section>
        ${pageState.busy ? '<div class="leslie-moments-busy" aria-live="polite"><i class="fa-solid fa-spinner fa-spin"></i><span>正在保存到本机……</span></div>' : ''}
        ${renderAudiencePicker()}`;
    pageMain.querySelectorAll('.leslie-moments-avatar img').forEach((image) => {
        image.addEventListener('error', () => {
            image.hidden = true;
            image.nextElementSibling?.removeAttribute('hidden');
        }, { once: true });
    });
}

async function refreshPageData() {
    pageState.busy = true;
    pageState.error = '';
    pageState.currentStory = getCurrentStory();
    renderPage();
    try {
        await Promise.all([resolveCurrentPersona(), loadPosts()]);
    } catch (error) {
        pageState.error = String(error?.message || error);
    } finally {
        pageState.busy = false;
        renderPage();
    }
}

function openPage() {
    if (!overlay) {
        installPage();
    }
    pageState.open = true;
    pageState.currentStory = getCurrentStory();
    document.body.classList.add('leslie-moments-page-open');
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    renderPage();
    refreshPageData();
}

function closePage() {
    pageState.open = false;
    pageState.audienceOpen = false;
    document.body.classList.remove('leslie-moments-page-open');
    overlay?.classList.remove('is-open');
    overlay?.setAttribute('aria-hidden', 'true');
}

function buildVisibilityRequest() {
    if (pageState.visibilityType === 'all') {
        return { type: 'all', targets: [] };
    }
    return { type: 'selected', targets: getSelectedAudienceDraft() };
}

function resetComposer() {
    pageState.editingId = null;
    pageState.confirmingArchiveId = null;
    pageState.draftContent = '';
    pageState.mode = 'reality';
    pageState.visibilityType = 'all';
    pageState.selectedSourceKeys.clear();
}

async function submitPost() {
    const editing = getEditingPost();
    const mode = getComposerMode();
    if (!pageState.draftContent.trim()) {
        return;
    }
    pageState.busy = true;
    pageState.error = '';
    renderPage();
    try {
        const author = getCurrentPersona();
        if (editing) {
            await apiRequest(`/${editing.id}`, {
                method: 'PATCH',
                body: {
                    author,
                    content: pageState.draftContent,
                    visibility: buildVisibilityRequest(),
                },
            });
        } else {
            const body = {
                author,
                mode,
                content: pageState.draftContent,
                visibility: buildVisibilityRequest(),
            };
            if (mode === 'story') {
                body.storyContext = pageState.currentStory?.storyContext;
            }
            await apiRequest('', { method: 'POST', body });
        }
        resetComposer();
        await loadPosts();
    } catch (error) {
        pageState.error = String(error?.message || error);
        notify('error', pageState.error);
    } finally {
        pageState.busy = false;
        renderPage();
    }
}

function beginEditing(postId) {
    const post = pageState.posts.find(item => item.id === postId);
    if (!post) {
        return;
    }
    pageState.editingId = post.id;
    pageState.draftContent = post.content;
    pageState.mode = post.mode;
    pageState.visibilityType = post.visibility?.type === 'selected' ? 'selected' : 'all';
    pageState.selectedSourceKeys = new Set((post.visibility?.targets ?? []).map(target => target.sourceKey));
    pageState.confirmingArchiveId = null;
    renderPage();
    pageMain.querySelector('#leslie-moments-content')?.focus();
    pageMain.scrollTo({ top: 0, behavior: 'smooth' });
}

async function changePostStatus(postId, action) {
    pageState.busy = true;
    pageState.error = '';
    renderPage();
    try {
        await apiRequest(`/${postId}/${action}`, {
            method: 'POST',
            body: { author: getCurrentPersona() },
        });
        pageState.confirmingArchiveId = null;
        await loadPosts();
    } catch (error) {
        pageState.error = String(error?.message || error);
        notify('error', pageState.error);
    } finally {
        pageState.busy = false;
        renderPage();
    }
}

function handlePageInput(event) {
    if (event.target?.id === 'leslie-moments-content') {
        pageState.draftContent = event.target.value;
        const counter = pageMain.querySelector('#leslie-moments-character-count');
        if (counter) {
            counter.textContent = String(pageState.draftContent.length);
        }
        const submit = pageMain.querySelector('[data-moments-action="submit"]');
        if (submit) {
            const mode = getComposerMode();
            const selectedMissing = mode !== 'story' && pageState.visibilityType === 'selected' && !getSelectedAudienceDraft().length;
            const storyMissing = mode === 'story' && !getEditingPost() && !pageState.currentStory;
            submit.disabled = pageState.busy || !pageState.currentPersonaEntity || !pageState.draftContent.trim() || selectedMissing || storyMissing;
        }
    } else if (event.target?.id === 'leslie-moments-audience-search') {
        pageState.audienceQuery = event.target.value;
        renderPage();
        pageMain.querySelector('#leslie-moments-audience-search')?.focus();
    } else if (event.target instanceof HTMLInputElement && event.target.dataset.audienceSource) {
        if (event.target.checked) {
            pageState.selectedSourceKeys.add(event.target.dataset.audienceSource);
        } else {
            pageState.selectedSourceKeys.delete(event.target.dataset.audienceSource);
        }
        renderPage();
    }
}

async function handlePageClick(event) {
    const button = event.target instanceof Element ? event.target.closest('[data-moments-action]') : null;
    const action = button?.dataset.momentsAction;
    if (!action) {
        return;
    }
    switch (action) {
        case 'close':
            closePage();
            break;
        case 'retry':
            await refreshPageData();
            break;
        case 'mode':
            pageState.mode = button.dataset.mode || 'reality';
            renderPage();
            break;
        case 'audience':
            pageState.audienceOpen = true;
            pageState.audienceQuery = '';
            renderPage();
            break;
        case 'audience-cancel':
            pageState.audienceOpen = false;
            renderPage();
            break;
        case 'audience-done':
            pageState.audienceOpen = false;
            renderPage();
            break;
        case 'visibility':
            pageState.visibilityType = button.dataset.visibility || 'all';
            renderPage();
            break;
        case 'submit':
            await submitPost();
            break;
        case 'cancel-edit':
            resetComposer();
            renderPage();
            break;
        case 'filter':
            pageState.filter = button.dataset.filter || 'all';
            renderPage();
            break;
        case 'archived':
            break;
        case 'edit':
            beginEditing(button.dataset.postId);
            break;
        case 'ask-archive':
            pageState.confirmingArchiveId = button.dataset.postId;
            renderPage();
            break;
        case 'cancel-archive':
            pageState.confirmingArchiveId = null;
            renderPage();
            break;
        case 'archive':
            await changePostStatus(button.dataset.postId, 'archive');
            break;
        case 'restore':
            await changePostStatus(button.dataset.postId, 'restore');
            break;
    }
}

function handlePageChange(event) {
    if (event.target instanceof HTMLInputElement && event.target.dataset.momentsAction === 'archived') {
        pageState.includeArchived = event.target.checked;
        pageState.busy = true;
        renderPage();
        loadPosts()
            .catch(error => {
                pageState.error = String(error?.message || error);
            })
            .finally(() => {
                pageState.busy = false;
                renderPage();
            });
    }
}

function installPage() {
    if (document.getElementById('leslie-moments-overlay')) {
        overlay = document.getElementById('leslie-moments-overlay');
        pageMain = overlay.querySelector('.leslie-moments-main');
        return;
    }
    overlay = document.createElement('div');
    overlay.id = 'leslie-moments-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = `<section class="leslie-moments-page" role="dialog" aria-modal="true" aria-labelledby="leslie-moments-title">
        <header class="leslie-moments-header">
            <button type="button" data-moments-action="close" aria-label="返回聊天"><i class="fa-solid fa-arrow-left"></i></button>
            <span class="leslie-moments-header-icon"><i class="fa-solid fa-camera-retro"></i></span>
            <div><strong id="leslie-moments-title">朋友圈</strong><small>分享近况，也为角色互动留出空间</small></div>
            <span class="leslie-moments-local"><i class="fa-solid fa-shield-halved"></i>仅保存在本机</span>
        </header>
        <main class="leslie-moments-main"></main>
    </section>`;
    document.body.append(overlay);
    pageMain = overlay.querySelector('.leslie-moments-main');
    overlay.addEventListener('click', handlePageClick);
    overlay.addEventListener('input', handlePageInput);
    overlay.addEventListener('change', handlePageChange);
}

function installLauncher() {
    const sidebarTools = document.querySelector('#leslie-conversation-sidebar .leslie-sidebar-tools');
    if (sidebarTools && !document.getElementById('leslie-moments-launcher')) {
        const launcher = document.createElement('button');
        launcher.id = 'leslie-moments-launcher';
        launcher.type = 'button';
        launcher.innerHTML = '<span><i class="fa-solid fa-camera-retro"></i></span><span><strong>朋友圈</strong><small>分享近况与角色生活</small></span><i class="fa-solid fa-chevron-right"></i>';
        launcher.addEventListener('click', openPage);
        sidebarTools.prepend(launcher);
    }

    const menu = document.getElementById('leslie-chat-more-menu');
    if (menu && !document.getElementById('leslie-moments-menu-entry')) {
        const button = document.createElement('button');
        button.id = 'leslie-moments-menu-entry';
        button.type = 'button';
        button.innerHTML = '<i class="fa-solid fa-camera-retro" aria-hidden="true"></i><span>朋友圈</span>';
        button.addEventListener('click', (event) => {
            event.stopPropagation();
            menu.hidden = true;
            openPage();
        });
        menu.insertBefore(button, menu.querySelector('hr'));
    }
}

function bindLifecycleEvents() {
    eventSource.on(event_types.APP_READY, installLauncher);
    eventSource.on(event_types.PERSONA_CHANGED, () => {
        pageState.editingId = null;
        pageState.draftContent = '';
        if (pageState.open) {
            refreshPageData();
        }
    });
    for (const eventName of [event_types.CHAT_CHANGED, event_types.CHAT_LOADED, event_types.GROUP_UPDATED]) {
        eventSource.on(eventName, () => {
            pageState.currentStory = getCurrentStory();
            if (pageState.open) {
                renderPage();
            }
        });
    }
    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape' || !pageState.open) {
            return;
        }
        if (pageState.audienceOpen) {
            pageState.audienceOpen = false;
            renderPage();
        } else {
            closePage();
        }
    });
}

export async function init() {
    installPage();
    installLauncher();
    bindLifecycleEvents();
    new MutationObserver(installLauncher).observe(document.body, { childList: true, subtree: true });
}
