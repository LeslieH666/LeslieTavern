/**
 * Leslie character and chat exports.
 *
 * This module reuses SillyTavern's character-card and JSONL chat formats. It
 * does not mutate character cards, chat history, memory, or identity data.
 */

import {
    characters,
    getCurrentChatId,
    getRequestHeaders,
    saveChatConditional,
    this_chid,
} from '../script.js';
import { groups, selected_group } from './group-chats.js';

function getActiveExportContext() {
    if (selected_group) {
        const group = groups.find(item => String(item.id) === String(selected_group));
        return group ? {
            type: 'group',
            name: group.name || '未命名群聊',
            avatar: '',
        } : null;
    }

    const character = characters[this_chid];
    return character ? {
        type: 'character',
        name: character.name || '未命名角色',
        avatar: character.avatar,
    } : null;
}

function sanitizeDownloadFileName(value, fallback) {
    const sanitized = String(value ?? '')
        .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
        .replace(/[. ]+$/g, '')
        .trim();
    return sanitized || fallback;
}

function getAttachmentFileName(response, fallback) {
    const disposition = response.headers.get('Content-Disposition') || '';
    const encodedName = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
    if (encodedName) {
        try {
            return sanitizeDownloadFileName(decodeURIComponent(encodedName), fallback);
        } catch {
            // Fall through to the regular filename or the known safe fallback.
        }
    }

    const plainName = disposition.match(/filename="?([^";]+)"?/i)?.[1];
    if (plainName) {
        try {
            return sanitizeDownloadFileName(decodeURI(plainName), fallback);
        } catch {
            return sanitizeDownloadFileName(plainName, fallback);
        }
    }

    return fallback;
}

function downloadBlob(blob, fileName) {
    const link = document.createElement('a');
    const objectUrl = URL.createObjectURL(blob);
    link.href = objectUrl;
    link.download = fileName;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

async function throwExportResponseError(response, fallbackMessage) {
    let message = fallbackMessage;
    try {
        const data = await response.json();
        message = data?.message || data?.error || message;
    } catch {
        // The existing export routes may return an empty error response.
    }
    throw new Error(message);
}

async function exportActiveCharacterCard() {
    const active = getActiveExportContext();
    if (active?.type !== 'character' || !active.avatar) {
        throw new Error('请先选择要导出的角色。');
    }

    const response = await fetch('/api/characters/export', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ format: 'png', avatar_url: active.avatar }),
    });
    if (!response.ok) {
        await throwExportResponseError(response, '角色卡导出失败，请稍后重试。');
    }

    const fallbackName = sanitizeDownloadFileName(active.avatar, `${active.name}.png`);
    downloadBlob(await response.blob(), getAttachmentFileName(response, fallbackName));
    globalThis.toastr?.success(`已导出 ${active.name} 的角色卡。`);
}

async function exportCurrentChatRecord() {
    const active = getActiveExportContext();
    const chatId = getCurrentChatId();
    if (!active || !chatId) {
        throw new Error('当前还没有可导出的聊天记录。');
    }

    await saveChatConditional();
    const exportName = `${sanitizeDownloadFileName(chatId, 'chat')}.jsonl`;
    const response = await fetch('/api/chats/export', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({
            is_group: active.type === 'group',
            avatar_url: active.avatar,
            file: `${chatId}.jsonl`,
            exportfilename: exportName,
            format: 'jsonl',
        }),
    });
    if (!response.ok) {
        await throwExportResponseError(response, '聊天记录导出失败，请稍后重试。');
    }

    const data = await response.json();
    downloadBlob(new Blob([data.result], { type: 'application/x-ndjson;charset=utf-8' }), exportName);
    globalThis.toastr?.success('已按 SillyTavern JSONL 格式导出当前聊天。');
}

async function exportActiveCharacterBundle() {
    const active = getActiveExportContext();
    if (active?.type !== 'character' || !active.avatar) {
        throw new Error('请先选择要导出的角色。');
    }

    await saveChatConditional();
    const fallbackName = `${sanitizeDownloadFileName(active.name, 'character')}-角色卡与聊天记录.zip`;
    const response = await fetch('/api/characters/export-bundle', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ avatar_url: active.avatar }),
    });
    if (!response.ok) {
        await throwExportResponseError(response, '角色与聊天记录导出失败，请稍后重试。');
    }

    const chatCount = Number(response.headers.get('X-Leslie-Chat-Count')) || 0;
    downloadBlob(await response.blob(), getAttachmentFileName(response, fallbackName));
    globalThis.toastr?.success(`已导出角色卡和 ${chatCount} 条聊天记录。`);
}

export function syncCharacterExportMenuState() {
    const active = getActiveExportContext();
    document.querySelectorAll('#leslie-chat-more-menu [data-character-export-only]').forEach((button) => {
        button.toggleAttribute('hidden', active?.type !== 'character');
    });
    const chatExportButton = document.querySelector('#leslie-chat-more-menu [data-action="export-chat"]');
    if (chatExportButton instanceof HTMLButtonElement) {
        chatExportButton.disabled = !active || !getCurrentChatId();
    }
}

export async function runCharacterExport(action) {
    const exportButtons = document.querySelectorAll('#leslie-chat-more-menu [data-action^="export-"]');
    exportButtons.forEach(button => button.toggleAttribute('disabled', true));
    try {
        if (action === 'export-character') {
            await exportActiveCharacterCard();
        } else if (action === 'export-chat') {
            await exportCurrentChatRecord();
        } else if (action === 'export-character-bundle') {
            await exportActiveCharacterBundle();
        }
    } catch (error) {
        console.error('[Leslie character export] Export failed.', error);
        globalThis.toastr?.error(error?.message || '导出失败，请稍后重试。');
    } finally {
        exportButtons.forEach(button => button.toggleAttribute('disabled', false));
        syncCharacterExportMenuState();
    }
}
