/**
 * Leslie desktop chat shell.
 *
 * This module is a presentation adapter. It reads SillyTavern's live character
 * and group collections and calls their existing selection actions. It does not
 * own chat data, generation state, character cards, or memory data.
 */

import {
    chat_metadata,
    characters,
    default_avatar,
    eventSource,
    event_types,
    getRequestHeaders,
    openCharacterChat,
    saveChatDebounced,
    saveMetadata,
    getThumbnailUrl,
    selectCharacterById,
    this_chid,
    updateChatMetadata,
} from '../script.js';
import {
    groups,
    openGroupById,
    selected_group,
} from './group-chats.js';
import { selectLatestCharacterChat } from './leslie-chat-selection.js';
import { runCharacterExport, syncCharacterExportMenuState } from './leslie-character-export.js';
import { getLeslieConnectionState } from './leslie-connection-state.js';
import { user_avatar } from './personas.js';
import {
    beginRealitySession,
    getWorldLineKind,
    LESLIE_WORLD_LINE_METADATA_KEY,
    selectWorldLineChat,
    shouldGenerateRealitySessionOpening,
    touchRealitySession,
} from './leslie-reality-context.js';

const LAYOUT_PREFERENCE_KEY = 'leslie-chat-layout-enabled';
const MOBILE_BREAKPOINT = 700;
const MOBILE_HISTORY_KEY = 'leslieMobileView';

const layoutState = {
    filter: 'all',
    query: '',
    renderFrame: 0,
    previewTimer: 0,
    latestPreviews: new Map(),
    mobileView: 'list',
};

let sidebar;
let conversationList;
let searchInput;
let workspaceBackdrop;
let restoreButton;
let chatTransitionSequence = 0;
let realitySessionChatId = '';
let realitySessionTask = null;

function getLayoutEnabled() {
    return localStorage.getItem(LAYOUT_PREFERENCE_KEY) !== 'false';
}

function isMobileLayout() {
    return window.innerWidth <= MOBILE_BREAKPOINT;
}

function updateMobileAccessibility(chatOpen) {
    const shell = document.getElementById('sheld');
    if (!isMobileLayout() || !getLayoutEnabled()) {
        sidebar?.removeAttribute('aria-hidden');
        sidebar?.removeAttribute('inert');
        shell?.removeAttribute('aria-hidden');
        shell?.removeAttribute('inert');
        return;
    }

    sidebar?.toggleAttribute('inert', chatOpen);
    sidebar?.setAttribute('aria-hidden', String(chatOpen));
    shell?.toggleAttribute('inert', !chatOpen);
    shell?.setAttribute('aria-hidden', String(!chatOpen));
}

function setMobileView(view, { historyMode = 'none', focus = false } = {}) {
    const chatOpen = view === 'chat' && Boolean(getActiveEntity());
    layoutState.mobileView = chatOpen ? 'chat' : 'list';
    document.body.classList.toggle('leslie-mobile-chat-open', chatOpen && getLayoutEnabled());
    updateMobileAccessibility(chatOpen);

    if (isMobileLayout() && historyMode !== 'none') {
        const nextState = { ...(history.state ?? {}), [MOBILE_HISTORY_KEY]: layoutState.mobileView };
        history[historyMode === 'push' ? 'pushState' : 'replaceState'](nextState, '');
    }

    if (focus && isMobileLayout()) {
        window.setTimeout(() => {
            const target = chatOpen
                ? document.querySelector('.leslie-mobile-back')
                : searchInput;
            target?.focus({ preventScroll: true });
        }, 210);
    }
}

function initializeMobileNavigation() {
    if (!isMobileLayout()) {
        updateMobileAccessibility(false);
        return;
    }
    setMobileView('list', { historyMode: 'replace' });
}

function returnToConversationList() {
    if (isMobileLayout() && history.state?.[MOBILE_HISTORY_KEY] === 'chat') {
        history.back();
        return;
    }
    setMobileView('list', { historyMode: 'replace', focus: true });
}

function syncResponsiveNavigation() {
    if (!getLayoutEnabled()) {
        updateMobileAccessibility(false);
        return;
    }
    if (!isMobileLayout()) {
        document.body.classList.remove('leslie-mobile-chat-open');
        updateMobileAccessibility(false);
        return;
    }
    setMobileView(layoutState.mobileView);
}

function createIconButton({ action, icon, label, className = '' }) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `leslie-icon-button ${className}`.trim();
    button.dataset.action = action;
    button.title = label;
    button.setAttribute('aria-label', label);
    button.innerHTML = `<i class="fa-solid ${icon}" aria-hidden="true"></i>`;
    return button;
}

function createSidebar() {
    const sheld = document.getElementById('sheld');
    if (!sheld || document.getElementById('leslie-conversation-sidebar')) {
        return;
    }

    sidebar = document.createElement('aside');
    sidebar.id = 'leslie-conversation-sidebar';
    sidebar.setAttribute('aria-label', '角色与会话');
    sidebar.innerHTML = `
        <header class="leslie-sidebar-header">
            <div class="leslie-brand" aria-label="Leslie">
                <span class="leslie-brand-mark"><i class="fa-solid fa-comment-dots" aria-hidden="true"></i></span>
                <span class="leslie-brand-copy"><strong>Leslie</strong><small>角色会话</small></span>
            </div>
            <div class="leslie-sidebar-actions"></div>
        </header>
        <div class="leslie-sidebar-tools">
            <label class="leslie-conversation-search" for="leslie-conversation-search">
                <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
                <input id="leslie-conversation-search" type="search" autocomplete="off" placeholder="搜索角色或群聊">
                <button type="button" data-action="clear-search" aria-label="清除搜索" title="清除搜索">
                    <i class="fa-solid fa-circle-xmark" aria-hidden="true"></i>
                </button>
            </label>
            <nav class="leslie-conversation-filters" aria-label="会话筛选">
                <button type="button" class="is-active" data-filter="all" aria-pressed="true">全部</button>
                <button type="button" data-filter="character" aria-pressed="false">角色</button>
                <button type="button" data-filter="group" aria-pressed="false">群聊</button>
            </nav>
        </div>
        <div id="leslie-conversation-list" class="leslie-conversation-list" role="listbox" aria-label="会话列表"></div>
        <footer class="leslie-sidebar-footer">
            <button type="button" class="leslie-connection-card" data-action="settings">
                <span class="leslie-connection-dot" aria-hidden="true"></span>
                <span><strong data-leslie-connection-label>模型未连接</strong><small data-leslie-connection-detail>点击配置模型与 API</small></span>
                <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
            </button>
        </footer>
    `;

    const actions = sidebar.querySelector('.leslie-sidebar-actions');
    actions.append(
        createIconButton({ action: 'create-character', icon: 'fa-pen-to-square', label: '新建角色' }),
        createIconButton({ action: 'settings', icon: 'fa-gear', label: '设置' }),
    );

    conversationList = sidebar.querySelector('#leslie-conversation-list');
    searchInput = sidebar.querySelector('#leslie-conversation-search');
    document.body.insertBefore(sidebar, sheld);

    restoreButton = document.createElement('button');
    restoreButton.id = 'leslie-layout-restore';
    restoreButton.type = 'button';
    restoreButton.innerHTML = '<i class="fa-solid fa-table-columns" aria-hidden="true"></i><span>启用 Leslie 双栏</span>';
    restoreButton.addEventListener('click', () => setLayoutEnabled(true));
    document.body.append(restoreButton);
}

function ensureChatHeader() {
    const header = document.getElementById('leslie-chat-header');
    if (!header || header.dataset.leslieShellReady === 'true') {
        return;
    }

    header.dataset.leslieShellReady = 'true';
    header.replaceChildren();

    const backButton = createIconButton({ action: 'mobile-back', icon: 'fa-arrow-left', label: '返回会话列表', className: 'leslie-mobile-back' });
    const identity = document.createElement('div');
    identity.className = 'leslie-chat-identity';
    identity.innerHTML = `
        <span class="leslie-chat-avatar" id="leslie-chat-avatar">
            <img alt="" hidden>
            <i class="fa-solid fa-user" aria-hidden="true"></i>
        </span>
        <span class="leslie-chat-heading">
            <strong id="leslie-chat-name">选择一个角色</strong>
            <small id="leslie-chat-status">从左侧开始一段对话</small>
        </span>
    `;
    identity.tabIndex = 0;
    identity.setAttribute('role', 'button');
    identity.setAttribute('aria-label', '打开当前角色卡');
    identity.dataset.action = 'character-card';

    const actions = document.createElement('div');
    actions.id = 'leslie-chat-actions';
    actions.className = 'leslie-chat-actions';
    actions.append(
        createIconButton({ action: 'character-card', icon: 'fa-address-card', label: '角色卡' }),
        createIconButton({ action: 'chat-more', icon: 'fa-ellipsis-vertical', label: '更多会话操作' }),
    );

    const worldLineSwitch = document.createElement('div');
    worldLineSwitch.className = 'leslie-world-line-switch';
    worldLineSwitch.setAttribute('role', 'group');
    worldLineSwitch.setAttribute('aria-label', '聊天世界线');
    worldLineSwitch.innerHTML = `
        <button type="button" data-action="line-story" data-world-line="story"><i class="fa-solid fa-book-open"></i><span>故事线</span></button>
        <button type="button" data-action="line-reality" data-world-line="reality"><i class="fa-solid fa-earth-asia"></i><span>现实线</span></button>`;

    const menu = document.createElement('div');
    menu.id = 'leslie-chat-more-menu';
    menu.className = 'leslie-chat-more-menu';
    menu.hidden = true;
    menu.innerHTML = `
        <button type="button" data-action="new-chat"><i class="fa-solid fa-comment-medical" aria-hidden="true"></i><span>新建当前角色会话</span></button>
        <button type="button" data-action="manage-chats"><i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i><span>历史会话</span></button>
        <button type="button" data-action="line-story"><i class="fa-solid fa-book-open" aria-hidden="true"></i><span>切换到故事线</span></button>
        <button type="button" data-action="line-reality"><i class="fa-solid fa-earth-asia" aria-hidden="true"></i><span>切换到现实世界线</span></button>
        <button type="button" data-action="world-info"><i class="fa-solid fa-book-atlas" aria-hidden="true"></i><span>世界设定</span></button>
        <hr>
        <button type="button" data-action="export-character" data-character-export-only><i class="fa-solid fa-address-card" aria-hidden="true"></i><span>导出角色卡（PNG）</span></button>
        <button type="button" data-action="export-chat"><i class="fa-solid fa-file-lines" aria-hidden="true"></i><span>导出当前聊天（JSONL）</span></button>
        <button type="button" data-action="export-character-bundle" data-character-export-only><i class="fa-solid fa-file-zipper" aria-hidden="true"></i><span>导出角色卡与全部聊天（ZIP）</span></button>
        <hr>
        <button type="button" data-action="settings"><i class="fa-solid fa-sliders" aria-hidden="true"></i><span>设置与高级功能</span></button>
        <button type="button" data-action="disable-layout"><i class="fa-solid fa-arrow-rotate-left" aria-hidden="true"></i><span>暂时使用原版布局</span></button>
    `;

    header.append(backButton, identity, worldLineSwitch, actions, menu);
    relocateMemoryLauncher();
}

function createWorkspaceBackdrop() {
    if (document.getElementById('leslie-workspace-backdrop')) {
        return;
    }
    workspaceBackdrop = document.createElement('button');
    workspaceBackdrop.id = 'leslie-workspace-backdrop';
    workspaceBackdrop.type = 'button';
    workspaceBackdrop.tabIndex = -1;
    workspaceBackdrop.setAttribute('aria-label', '关闭高级工作区');
    workspaceBackdrop.addEventListener('click', closeOpenDrawers);
    document.body.append(workspaceBackdrop);
}

function getCharacterAvatar(character) {
    try {
        return character?.avatar && character.avatar !== 'none'
            ? getThumbnailUrl('avatar', character.avatar)
            : default_avatar;
    } catch {
        return default_avatar;
    }
}

function getGroupAvatar(group) {
    const escapedId = globalThis.CSS?.escape ? CSS.escape(String(group?.id ?? '')) : String(group?.id ?? '');
    const renderedAvatar = document.querySelector(`#rm_print_characters_block .group_select[data-grid="${escapedId}"] img`)?.src;
    return renderedAvatar || group?.avatar_url || '';
}

function getTimestamp(value) {
    if (!value) {
        return 0;
    }
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) {
        return numeric;
    }
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
}

function formatConversationTime(timestamp) {
    if (!timestamp) {
        return '';
    }
    const date = new Date(timestamp);
    const now = new Date();
    if (date.toDateString() === now.toDateString()) {
        return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
    }
    if (now.getTime() - date.getTime() < 6 * 24 * 60 * 60 * 1000) {
        return date.toLocaleDateString('zh-CN', { weekday: 'short' });
    }
    return date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}

function getActiveEntity() {
    if (selected_group) {
        const group = groups.find(item => String(item.id) === String(selected_group));
        return group ? {
            type: 'group',
            key: `group:${group.id}`,
            id: group.id,
            name: group.name || '未命名群聊',
            avatar: getGroupAvatar(group),
            item: group,
        } : null;
    }
    if (this_chid !== undefined && characters[this_chid]) {
        const character = characters[this_chid];
        return {
            type: 'character',
            key: `character:${this_chid}`,
            id: this_chid,
            name: character.name || '未命名角色',
            avatar: getCharacterAvatar(character),
            item: character,
        };
    }
    return null;
}

function getConversationEntities() {
    const characterItems = characters.map((character, id) => ({
        type: 'character',
        key: `character:${id}`,
        id,
        name: character.name || '未命名角色',
        avatar: getCharacterAvatar(character),
        timestamp: getTimestamp(character.date_last_chat),
        preview: layoutState.latestPreviews.get(`character:${id}`)
            || (character.chat ? '继续最近的角色对话' : '开始一段新的角色对话'),
    }));
    const groupItems = groups.map(group => ({
        type: 'group',
        key: `group:${group.id}`,
        id: group.id,
        name: group.name || '未命名群聊',
        avatar: getGroupAvatar(group),
        timestamp: getTimestamp(group.date_last_chat || group.chat_metadata?.last_mes),
        preview: layoutState.latestPreviews.get(`group:${group.id}`)
            || `${group.members?.length ?? 0} 位角色参与`,
    }));

    const query = layoutState.query.trim().toLocaleLowerCase('zh-CN');
    return [...characterItems, ...groupItems]
        .filter(item => layoutState.filter === 'all' || item.type === layoutState.filter)
        .filter(item => !query || `${item.name} ${item.preview}`.toLocaleLowerCase('zh-CN').includes(query))
        .sort((left, right) => right.timestamp - left.timestamp || left.name.localeCompare(right.name, 'zh-CN'));
}

async function getLatestCharacterChat(characterId) {
    const character = characters[characterId];
    if (!character?.avatar) {
        return null;
    }
    const response = await fetch('/api/characters/chats', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ avatar_url: character.avatar }),
    });
    if (!response.ok) {
        throw new Error(`Could not read chat history (${response.status}).`);
    }
    const history = await response.json();
    if (history?.error === true) {
        return null;
    }
    return selectLatestCharacterChat(history);
}

async function getCharacterChatHistory(characterId, { metadata = false } = {}) {
    const character = characters[characterId];
    if (!character?.avatar) {
        return [];
    }
    const response = await fetch('/api/characters/chats', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ avatar_url: character.avatar, metadata }),
    });
    if (!response.ok) {
        throw new Error(`Could not read chat history (${response.status}).`);
    }
    const history = await response.json();
    return Array.isArray(history) ? history : [];
}

async function createRealityChat(active) {
    if (typeof globalThis.LeslieRealityPrepareOpening !== 'function') {
        throw new Error('现实世界线模块尚未加载，请刷新页面后重试。');
    }
    const characterId = this_chid;
    const prepared = await globalThis.LeslieRealityPrepareOpening({
        personaSourceKey: user_avatar,
    });
    if (this_chid !== characterId) {
        throw new Error('生成开场期间当前角色已经改变，请重新进入现实世界线。');
    }
    const chatName = `${active.name} - 现实世界线 - ${Date.now()}`;
    // The seeded first message is already this entry's greeting. Mark the chat
    // before CHAT_LOADED fires so the session hook cannot append a duplicate.
    realitySessionChatId = chatName;
    try {
        await openCharacterChat(chatName, {
            initialMetadata: {
                [LESLIE_WORLD_LINE_METADATA_KEY]: prepared.metadata,
            },
            initialAssistantMessage: {
                text: prepared.text,
                extra: prepared.extra,
            },
        });
    } catch (error) {
        realitySessionChatId = '';
        throw error;
    }
}

async function beginCurrentRealitySession() {
    if (getWorldLineKind(chat_metadata) !== 'reality') {
        realitySessionChatId = '';
        return;
    }
    const chatId = String(characters[this_chid]?.chat || '');
    if (realitySessionTask?.chatId === chatId) {
        return realitySessionTask.promise;
    }
    if (!chatId || realitySessionChatId === chatId) {
        return;
    }
    const previousMetadata = chat_metadata?.[LESLIE_WORLD_LINE_METADATA_KEY];
    realitySessionChatId = chatId;
    const promise = (async () => {
        const nextMetadata = beginRealitySession(previousMetadata, {
            personaSourceKey: user_avatar,
        });
        updateChatMetadata({
            [LESLIE_WORLD_LINE_METADATA_KEY]: nextMetadata,
        });
        await saveMetadata();
        updateHeader();
        if (shouldGenerateRealitySessionOpening(nextMetadata)
            && typeof globalThis.LeslieRealityGenerateSessionOpening === 'function') {
            try {
                await globalThis.LeslieRealityGenerateSessionOpening();
            } catch (error) {
                console.error('[Leslie chat layout] Could not generate reality session opening.', error);
                globalThis.toastr?.warning('这次主动消息没有生成成功，你仍然可以正常发送消息。');
            }
        }
    })();
    realitySessionTask = { chatId, promise };
    try {
        await promise;
    } catch (error) {
        if (realitySessionChatId === chatId) {
            realitySessionChatId = '';
        }
        throw error;
    } finally {
        if (realitySessionTask?.promise === promise) {
            realitySessionTask = null;
        }
    }
}

async function touchCurrentRealitySession({ immediate = false } = {}) {
    if (getWorldLineKind(chat_metadata) !== 'reality') {
        return;
    }
    updateChatMetadata({
        [LESLIE_WORLD_LINE_METADATA_KEY]: touchRealitySession(chat_metadata?.[LESLIE_WORLD_LINE_METADATA_KEY]),
    });
    if (immediate) {
        await saveMetadata();
    } else {
        saveChatDebounced();
    }
}

async function switchWorldLine(kind) {
    const requested = kind === 'reality' ? 'reality' : 'story';
    const active = getActiveEntity();
    if (!active || active.type !== 'character') {
        globalThis.toastr?.info('现实世界线目前先支持单角色聊天；群聊会继续使用故事线。');
        return;
    }
    if (getWorldLineKind(chat_metadata) === requested) {
        return;
    }
    await touchCurrentRealitySession({ immediate: true });
    document.body.classList.add('leslie-chat-transitioning');
    try {
        const history = await getCharacterChatHistory(Number(active.id), { metadata: true });
        const target = selectWorldLineChat(history, requested, user_avatar);
        realitySessionChatId = '';
        if (target) {
            await openCharacterChat(String(target.file_id || target.file_name || '').replace(/\.jsonl$/i, ''));
        } else if (requested === 'reality') {
            await createRealityChat(active);
        } else {
            await openCharacterChat(`${active.name} - 故事线 - ${Date.now()}`);
            updateChatMetadata({
                [LESLIE_WORLD_LINE_METADATA_KEY]: {
                    schemaVersion: 1,
                    kind: 'story',
                    createdAt: new Date().toISOString(),
                },
            });
            await saveMetadata();
        }
        if (requested === 'reality') {
            await beginCurrentRealitySession();
        }
        updateHeader();
        scheduleConversationRender();
    } catch (error) {
        console.error('[Leslie chat layout] Could not switch world lines.', error);
        globalThis.toastr?.error('世界线切换失败，原聊天没有被删除。');
    } finally {
        requestAnimationFrame(() => document.body.classList.remove('leslie-chat-transitioning'));
    }
}

function buildAvatar(entity, className = '') {
    const avatar = document.createElement('span');
    avatar.className = `leslie-conversation-avatar ${className}`.trim();
    if (entity.avatar) {
        const image = document.createElement('img');
        image.src = entity.avatar;
        image.alt = '';
        image.loading = 'lazy';
        image.addEventListener('error', () => {
            image.remove();
            avatar.classList.add('is-fallback');
        }, { once: true });
        avatar.append(image);
    } else {
        avatar.classList.add('is-fallback');
    }
    const fallback = document.createElement('i');
    fallback.className = `fa-solid ${entity.type === 'group' ? 'fa-user-group' : 'fa-user'}`;
    fallback.setAttribute('aria-hidden', 'true');
    avatar.append(fallback);
    return avatar;
}

function renderConversationList() {
    if (!conversationList) {
        return;
    }
    const active = getActiveEntity();
    const entities = getConversationEntities();
    const fragment = document.createDocumentFragment();

    if (!entities.length) {
        const empty = document.createElement('div');
        empty.className = 'leslie-conversation-empty';
        empty.innerHTML = layoutState.query
            ? '<i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><strong>没有找到对应会话</strong><span>换一个名称或清除搜索试试</span>'
            : '<i class="fa-regular fa-comments" aria-hidden="true"></i><strong>还没有角色会话</strong><span>点击右上角按钮创建或导入角色</span>';
        fragment.append(empty);
    }

    entities.forEach((entity) => {
        const selected = active?.key === entity.key;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `leslie-conversation-item${selected ? ' is-active' : ''}`;
        button.dataset.entityType = entity.type;
        button.dataset.entityId = String(entity.id);
        button.dataset.entityKey = entity.key;
        button.setAttribute('role', 'option');
        button.setAttribute('aria-selected', String(selected));
        button.append(buildAvatar(entity));

        const copy = document.createElement('span');
        copy.className = 'leslie-conversation-copy';
        const row = document.createElement('span');
        row.className = 'leslie-conversation-primary';
        const name = document.createElement('strong');
        name.textContent = entity.name;
        const time = document.createElement('time');
        time.textContent = formatConversationTime(entity.timestamp);
        row.append(name, time);
        const preview = document.createElement('span');
        preview.className = 'leslie-conversation-preview';
        preview.textContent = entity.preview;
        copy.append(row, preview);
        button.append(copy);
        fragment.append(button);
    });

    conversationList.replaceChildren(fragment);
    updateHeader();
    updateConnectionState();
}

function scheduleConversationRender() {
    cancelAnimationFrame(layoutState.renderFrame);
    layoutState.renderFrame = requestAnimationFrame(renderConversationList);
}

function readLatestMessagePreview() {
    clearTimeout(layoutState.previewTimer);
    layoutState.previewTimer = window.setTimeout(() => {
        const active = getActiveEntity();
        const text = document.querySelector('#chat .mes:last-of-type .mes_text')?.textContent?.replace(/\s+/g, ' ').trim();
        if (active && text) {
            layoutState.latestPreviews.set(active.key, text.slice(0, 96));
        }
        scheduleConversationRender();
    }, 160);
}

function updateHeader() {
    const active = getActiveEntity();
    const homeOpen = document.body.classList.contains('leslie-home-open')
        && !document.body.classList.contains('leslie-chat-layout-disabled')
        && !active;
    const name = document.getElementById('leslie-chat-name');
    const status = document.getElementById('leslie-chat-status');
    const avatar = document.getElementById('leslie-chat-avatar');
    const image = avatar?.querySelector('img');
    const fallback = avatar?.querySelector('i');
    const cardButton = document.querySelector('#leslie-chat-actions [data-action="character-card"]');

    if (name) {
        name.textContent = active?.name || (homeOpen ? '首页' : '选择一个角色');
    }
    if (status) {
        const connectionState = getLeslieConnectionState();
        const worldLineLabel = active?.type === 'character'
            ? getWorldLineKind(chat_metadata) === 'reality' ? '现实世界线' : '故事线'
            : '群聊故事线';
        status.textContent = active
            ? `${worldLineLabel} · ${connectionState.checking ? '正在检测模型' : connectionState.connected ? '模型已连接' : '模型未连接'}`
            : homeOpen ? '继续对话、查看角色动态或开始新的故事' : '从左侧开始一段对话';
    }
    if (image instanceof HTMLImageElement) {
        image.hidden = !active?.avatar;
        image.src = active?.avatar || '';
        image.alt = active ? `${active.name}头像` : '';
    }
    if (fallback) {
        fallback.hidden = Boolean(active?.avatar);
        fallback.className = `fa-solid ${active?.type === 'group' ? 'fa-user-group' : homeOpen ? 'fa-house' : 'fa-user'}`;
    }
    if (cardButton instanceof HTMLButtonElement) {
        cardButton.disabled = !active;
    }
    document.querySelectorAll('.leslie-world-line-switch [data-world-line]').forEach((button) => {
        const line = button.getAttribute('data-world-line');
        const selected = Boolean(active?.type === 'character' && getWorldLineKind(chat_metadata) === line);
        button.classList.toggle('is-active', selected);
        button.setAttribute('aria-pressed', String(selected));
        button.toggleAttribute('disabled', active?.type !== 'character');
    });
    syncCharacterExportMenuState();
    document.querySelector('.leslie-chat-identity')?.setAttribute('aria-disabled', String(!active));
    relocateMemoryLauncher();
}

function updateConnectionState() {
    const { connected, configured, checking } = getLeslieConnectionState();
    sidebar?.classList.toggle('is-connected', connected);
    sidebar?.classList.toggle('is-configured', configured && !connected);
    sidebar?.classList.toggle('is-checking', checking);
    const label = sidebar?.querySelector('[data-leslie-connection-label]');
    const detail = sidebar?.querySelector('[data-leslie-connection-detail]');
    if (label) {
        label.textContent = checking ? '正在检测 API 连接' : connected ? '模型已连接' : configured ? 'API 已配置' : '尚未配置模型';
    }
    if (detail) {
        detail.textContent = checking ? '正在读取设置并验证服务，请稍候' : connected ? '点击查看当前模型设置' : configured ? '点击连接或检查模型' : '点击选择 API 并完成配置';
    }
    const sendTextarea = document.getElementById('send_textarea');
    if (sendTextarea instanceof HTMLTextAreaElement) {
        sendTextarea.dataset.leslieConnectedPlaceholder ||= sendTextarea.placeholder;
        sendTextarea.placeholder = connected
            ? sendTextarea.dataset.leslieConnectedPlaceholder
            : checking ? '正在检测 API 连接…' : configured ? 'API 已配置，请先连接模型' : '尚未配置 API，点击左下角开始设置';
    }
    updateHeader();
}

function relocateMemoryLauncher() {
    const launcher = document.getElementById('leslie-memory-launcher');
    const actions = document.getElementById('leslie-chat-actions');
    if (!launcher || !actions || !getLayoutEnabled()) {
        return;
    }
    launcher.classList.add('leslie-header-memory-button');
    launcher.title = launcher.title || '角色记忆';
    const cardButton = actions.querySelector('[data-action="character-card"]');
    if (launcher.parentElement !== actions || launcher.nextElementSibling !== cardButton) {
        actions.insertBefore(launcher, cardButton);
    }
}

function restoreMemoryLauncher() {
    const launcher = document.getElementById('leslie-memory-launcher');
    const host = document.getElementById('leftSendForm');
    if (launcher && host && launcher.parentElement !== host) {
        launcher.classList.remove('leslie-header-memory-button');
        host.append(launcher);
    }
}

function openSettings() {
    document.getElementById('leslie-settings-launcher')?.click();
}

function ensureCharacterWorkspace(actionId) {
    const panel = document.getElementById('right-nav-panel');
    const drawer = document.getElementById('rightNavHolder');
    const toggle = drawer?.querySelector(':scope > .drawer-toggle');
    if (!panel || !toggle) {
        return;
    }
    const alreadyOpen = panel.classList.contains('openDrawer');
    if (!alreadyOpen) {
        toggle.click();
    }
    window.setTimeout(() => {
        if (actionId === 'rm_button_create') {
            document.getElementById('rm_button_characters')?.click();
        }
        document.getElementById(actionId)?.click();
        updateWorkspaceState();
    }, alreadyOpen ? 0 : 80);
}

function openWorldInfo() {
    document.getElementById('WIDrawerIcon')?.click();
    window.setTimeout(updateWorkspaceState, 0);
}

function closeOpenDrawers() {
    document.querySelectorAll('#top-settings-holder .drawer-content.openDrawer').forEach((panel) => {
        panel.closest('.drawer')?.querySelector(':scope > .drawer-toggle')?.click();
    });
    window.setTimeout(updateWorkspaceState, 0);
}

function updateWorkspaceState() {
    const hasOpenWorkspace = Boolean(document.querySelector('#top-settings-holder .drawer-content.openDrawer'));
    document.body.classList.toggle('leslie-workspace-open', hasOpenWorkspace && getLayoutEnabled());
}

function closeHeaderMenu() {
    const menu = document.getElementById('leslie-chat-more-menu');
    const button = document.querySelector('#leslie-chat-actions [data-action="chat-more"]');
    if (menu) {
        menu.hidden = true;
        delete menu.dataset.open;
    }
    button?.setAttribute('aria-expanded', 'false');
}

function toggleHeaderMenu() {
    const menu = document.getElementById('leslie-chat-more-menu');
    const button = document.querySelector('#leslie-chat-actions [data-action="chat-more"]');
    if (!menu) {
        return;
    }
    menu.hidden = !menu.hidden;
    if (menu.hidden) {
        delete menu.dataset.open;
    } else {
        menu.dataset.open = 'true';
    }
    button?.setAttribute('aria-expanded', String(!menu.hidden));
}

function setLayoutEnabled(enabled) {
    localStorage.setItem(LAYOUT_PREFERENCE_KEY, String(enabled));
    document.body.classList.toggle('leslie-chat-layout-disabled', !enabled);
    if (restoreButton) {
        restoreButton.hidden = enabled;
    }
    if (enabled) {
        relocateMemoryLauncher();
    } else {
        restoreMemoryLauncher();
        closeHeaderMenu();
    }
    syncResponsiveNavigation();
    updateWorkspaceState();
}

async function selectConversation(button) {
    const type = button.dataset.entityType;
    const id = button.dataset.entityId;
    const transitionSequence = ++chatTransitionSequence;
    button.classList.add('is-loading');
    document.body.classList.add('leslie-chat-transitioning');
    try {
        if (type === 'group') {
            await openGroupById(id);
        } else {
            const characterId = Number(id);
            realitySessionChatId = '';
            const active = getActiveEntity();
            if (active?.type === 'character' && Number(active.id) === characterId) {
                // Returning from the mobile list (or selecting the active role
                // again) continues the in-memory chat without reloading its file.
                await beginCurrentRealitySession();
            } else {
                const latestChat = await getLatestCharacterChat(characterId);
                await selectCharacterById(characterId, { switchMenu: false, chatFile: latestChat?.fileName ?? null });
                await beginCurrentRealitySession();
            }
        }
        if (isMobileLayout()) {
            setMobileView('chat', { historyMode: 'push', focus: true });
        }
        closeOpenDrawers();
        readLatestMessagePreview();
    } catch (error) {
        console.error('[Leslie chat layout] Could not open conversation.', error);
        globalThis.toastr?.error('无法打开最近的聊天记录，请稍后重试。');
    } finally {
        button.classList.remove('is-loading');
        scheduleConversationRender();
        requestAnimationFrame(() => requestAnimationFrame(() => {
            if (transitionSequence === chatTransitionSequence) {
                document.body.classList.remove('leslie-chat-transitioning');
            }
        }));
    }
}

async function handleAction(action) {
    closeHeaderMenu();
    if (action.startsWith('export-')) {
        await runCharacterExport(action);
        return;
    }
    switch (action) {
        case 'clear-search':
            searchInput.value = '';
            layoutState.query = '';
            searchInput.focus();
            scheduleConversationRender();
            break;
        case 'create-character':
            ensureCharacterWorkspace('rm_button_create');
            break;
        case 'settings':
            openSettings();
            break;
        case 'character-card':
            if (getActiveEntity()) {
                ensureCharacterWorkspace('rm_button_selected_ch');
            }
            break;
        case 'chat-more':
            toggleHeaderMenu();
            break;
        case 'new-chat':
            document.getElementById('option_start_new_chat')?.click();
            break;
        case 'manage-chats':
            document.getElementById('option_select_chat')?.click();
            break;
        case 'line-story':
            await switchWorldLine('story');
            break;
        case 'line-reality':
            await switchWorldLine('reality');
            break;
        case 'world-info':
            openWorldInfo();
            break;
        case 'disable-layout':
            setLayoutEnabled(false);
            break;
        case 'mobile-back':
            returnToConversationList();
            break;
    }
}

function bindShellEvents() {
    sidebar?.addEventListener('click', async (event) => {
        const target = event.target instanceof Element ? event.target : null;
        const conversation = target?.closest('.leslie-conversation-item');
        if (conversation instanceof HTMLButtonElement) {
            await selectConversation(conversation);
            return;
        }
        const action = target?.closest('[data-action]')?.dataset.action;
        if (action) {
            await handleAction(action);
        }
    });

    searchInput?.addEventListener('input', () => {
        layoutState.query = searchInput.value;
        scheduleConversationRender();
    });

    sidebar?.querySelector('.leslie-conversation-filters')?.addEventListener('click', (event) => {
        const button = event.target instanceof Element ? event.target.closest('[data-filter]') : null;
        if (!(button instanceof HTMLButtonElement)) {
            return;
        }
        layoutState.filter = button.dataset.filter || 'all';
        sidebar.querySelectorAll('[data-filter]').forEach((item) => {
            const active = item === button;
            item.classList.toggle('is-active', active);
            item.setAttribute('aria-pressed', String(active));
        });
        scheduleConversationRender();
    });

    document.getElementById('leslie-chat-header')?.addEventListener('click', (event) => {
        const action = event.target instanceof Element ? event.target.closest('[data-action]')?.dataset.action : null;
        if (action) {
            void handleAction(action);
        }
    });
    document.querySelector('.leslie-chat-identity')?.addEventListener('keydown', (event) => {
        if ((event.key === 'Enter' || event.key === ' ') && getActiveEntity()) {
            event.preventDefault();
            ensureCharacterWorkspace('rm_button_selected_ch');
        }
    });

    document.addEventListener('pointerdown', (event) => {
        if (event.target instanceof Element && !event.target.closest('#leslie-chat-more-menu, [data-action="chat-more"]')) {
            closeHeaderMenu();
        }
    });
    document.addEventListener('keydown', (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === 'k' && getLayoutEnabled()) {
            event.preventDefault();
            searchInput?.focus();
        } else if (event.key === 'Escape') {
            closeHeaderMenu();
        }
    });
    window.addEventListener('resize', syncResponsiveNavigation, { passive: true });
    window.addEventListener('popstate', (event) => {
        if (!isMobileLayout() || !getLayoutEnabled()) {
            return;
        }
        setMobileView(event.state?.[MOBILE_HISTORY_KEY] === 'chat' ? 'chat' : 'list', { focus: true });
    });

    const connectionIcon = document.getElementById('API-status-top');
    if (connectionIcon) {
        new MutationObserver(updateConnectionState).observe(connectionIcon, { attributes: true, attributeFilter: ['class', 'title'] });
    }
    document.addEventListener('input', (event) => {
        if (event.target instanceof HTMLElement && event.target.closest('#openai_api, #textgenerationwebui_api, #kobold_api')) {
            updateConnectionState();
        }
    });
    document.addEventListener('change', (event) => {
        if (event.target instanceof HTMLElement && event.target.closest('#openai_api, #textgenerationwebui_api, #kobold_api, #main_api')) {
            window.setTimeout(updateConnectionState, 0);
        }
    });
    document.addEventListener('leslie:home-state-changed', updateHeader);
    const chat = document.getElementById('chat');
    if (chat) {
        new MutationObserver(readLatestMessagePreview).observe(chat, { childList: true, subtree: true, characterData: true });
    }
    const characterSource = document.getElementById('rm_print_characters_block');
    if (characterSource) {
        new MutationObserver(scheduleConversationRender).observe(characterSource, { childList: true, subtree: true });
    }
    const topSettings = document.getElementById('top-settings-holder');
    if (topSettings) {
        new MutationObserver(() => {
            relocateMemoryLauncher();
            updateWorkspaceState();
        }).observe(topSettings, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    }
    new MutationObserver(relocateMemoryLauncher).observe(document.body, { childList: true, subtree: true });

    [
        event_types.APP_READY,
        event_types.CHARACTER_PAGE_LOADED,
        event_types.CHARACTER_EDITED,
        event_types.CHARACTER_DELETED,
        event_types.GROUP_UPDATED,
        event_types.GROUP_CHAT_CREATED,
        event_types.GROUP_CHAT_DELETED,
        event_types.CHAT_CHANGED,
        event_types.CHAT_LOADED,
        event_types.CHAT_CREATED,
        event_types.CHAT_RENAMED,
        event_types.MESSAGE_SENT,
        event_types.MESSAGE_RECEIVED,
        event_types.MESSAGE_UPDATED,
        event_types.ONLINE_STATUS_CHANGED,
    ].filter(Boolean).forEach(eventName => eventSource.on(eventName, scheduleConversationRender));
    eventSource.on(event_types.CHAT_LOADED, () => {
        updateHeader();
        void beginCurrentRealitySession().catch(error => console.error('[Leslie chat layout] Could not begin reality session.', error));
    });
    [event_types.MESSAGE_SENT, event_types.MESSAGE_RECEIVED]
        .filter(Boolean)
        .forEach(eventName => eventSource.on(eventName, () => void touchCurrentRealitySession()));
    [event_types.ONLINE_STATUS_CHANGED, event_types.MAIN_API_CHANGED]
        .filter(Boolean)
        .forEach(eventName => eventSource.on(eventName, updateConnectionState));
}

function initLeslieChatLayout() {
    if (!document.body.classList.contains('leslie-modern')) {
        return;
    }
    createSidebar();
    ensureChatHeader();
    createWorkspaceBackdrop();
    bindShellEvents();
    initializeMobileNavigation();
    setLayoutEnabled(getLayoutEnabled());
    scheduleConversationRender();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLeslieChatLayout, { once: true });
} else {
    initLeslieChatLayout();
}
