import { create_save } from '../script.js';
import {
    CHARACTER_IMPORT_FIELD_BINDINGS,
    createCharacterImportDraft,
    summarizeCharacterImportFiles,
} from './leslie-character-import-core.js';

let selectedJsonFile = null;
let selectedAvatarFile = null;
let avatarPreviewUrl = '';

function query(selector) {
    return document.querySelector(selector);
}

function setStatus(message, status = 'idle') {
    const element = query('[data-leslie-character-import-status]');
    if (!element) {
        return;
    }

    element.textContent = message;
    element.dataset.status = status;
}

function updateFileSummary() {
    const summary = summarizeCharacterImportFiles({
        jsonFile: selectedJsonFile,
        avatarFile: selectedAvatarFile,
    });
    const jsonName = query('[data-leslie-character-import-json-name]');
    const avatarName = query('[data-leslie-character-import-avatar-name]');
    const button = query('[data-leslie-character-import-action]');

    if (jsonName) {
        jsonName.textContent = summary.jsonName;
    }
    if (avatarName) {
        avatarName.textContent = summary.avatarName;
    }
    if (button instanceof HTMLButtonElement) {
        button.disabled = !summary.hasJson;
    }
}

function syncImportPanelVisibility() {
    const panel = document.getElementById('leslie-character-card-import');
    const form = document.getElementById('form_create');
    if (!panel || !form) {
        return;
    }

    panel.hidden = form.getAttribute('actiontype') !== 'createcharacter';
}

function setFieldValue(id, value) {
    const element = document.getElementById(id);
    if (!(element instanceof HTMLInputElement)
        && !(element instanceof HTMLTextAreaElement)
        && !(element instanceof HTMLSelectElement)) {
        return;
    }

    element.value = String(value ?? '');
    element.dispatchEvent(new Event('input', { bubbles: true }));
}

function setAvatarPreview(file) {
    if (avatarPreviewUrl) {
        URL.revokeObjectURL(avatarPreviewUrl);
        avatarPreviewUrl = '';
    }

    if (!(file instanceof Blob)) {
        return;
    }

    const preview = document.getElementById('avatar_load_preview');
    if (!preview) {
        return;
    }

    avatarPreviewUrl = URL.createObjectURL(file);
    preview.setAttribute('src', avatarPreviewUrl);
}

/**
 * Puts the selected file into SillyTavern's original form input. The create
 * endpoint reads this exact input, so the new panel does not need a second
 * upload API or a second persistence path.
 *
 * @param {File|null} file Selected avatar.
 * @returns {boolean} Whether the original input was updated.
 */
function syncAvatarToCreateForm(file) {
    const input = document.getElementById('add_avatar_button');
    if (!(input instanceof HTMLInputElement) || !file) {
        return false;
    }

    if (typeof DataTransfer !== 'function') {
        setStatus('当前浏览器不支持同步头像文件，请直接点击左侧头像框重新选择。', 'error');
        return false;
    }

    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    create_save.avatar = input.files;
    setAvatarPreview(file);
    return true;
}

function applyDraftToCreateForm(draft) {
    Object.assign(create_save, draft.state);

    for (const [id, stateKey] of CHARACTER_IMPORT_FIELD_BINDINGS) {
        setFieldValue(id, draft.state[stateKey]);
    }

    // Keep the creator-note preview in sync with the native editor listener.
    query('#creator_notes_textarea')?.dispatchEvent(new Event('input', { bubbles: true }));

    const existingAvatar = query('#add_avatar_button')?.files?.[0];
    if (selectedAvatarFile) {
        syncAvatarToCreateForm(selectedAvatarFile);
    } else if (existingAvatar) {
        create_save.avatar = query('#add_avatar_button').files;
    }
}

async function importSelectedCharacterCard() {
    if (!(selectedJsonFile instanceof File)) {
        setStatus('请先选择一个标准 JSON 角色卡文件。', 'error');
        return;
    }

    const button = query('[data-leslie-character-import-action]');
    if (button instanceof HTMLButtonElement) {
        button.disabled = true;
    }
    setStatus('正在读取 JSON 并填充原角色编辑器……', 'working');

    try {
        const draft = createCharacterImportDraft(await selectedJsonFile.text());
        applyDraftToCreateForm(draft);
        const summary = summarizeCharacterImportFiles({
            jsonFile: selectedJsonFile,
            avatarFile: selectedAvatarFile,
        });
        const notice = draft.notices.length ? ` ${draft.notices.join(' ')}` : '';
        setStatus(`已导入「${summary.jsonName}」${summary.hasAvatar ? `，头像「${summary.avatarName}」已就绪。` : '；尚未选择头像。'}${notice} 当前只填充表单，尚未写入数据库；确认无误后点击原有“创建角色”按钮。`, 'success');
        window.toastr?.success('角色卡字段已带入创建表单，尚未保存。', '导入完成');
    } catch (error) {
        setStatus(error?.message || '无法读取这份角色卡 JSON，原表单没有被改写。', 'error');
    } finally {
        updateFileSummary();
    }
}

function bindCharacterImport() {
    const jsonInput = document.getElementById('leslie-character-json-file');
    const avatarInput = document.getElementById('leslie-character-avatar-file');
    const importButton = query('[data-leslie-character-import-action]');

    if (!(jsonInput instanceof HTMLInputElement)
        || !(avatarInput instanceof HTMLInputElement)
        || !(importButton instanceof HTMLButtonElement)) {
        return;
    }

    jsonInput.addEventListener('change', () => {
        selectedJsonFile = jsonInput.files?.[0] || null;
        updateFileSummary();
        if (selectedJsonFile) {
            setStatus('JSON 已选择。若要连同头像一起创建，请再选择头像，然后点击“导入并填充”。', 'idle');
        }
    });

    avatarInput.addEventListener('change', () => {
        selectedAvatarFile = avatarInput.files?.[0] || null;
        updateFileSummary();
        if (!selectedAvatarFile) {
            setStatus('已取消头像选择；仍可只导入 JSON。', 'idle');
            return;
        }

        if (syncAvatarToCreateForm(selectedAvatarFile)) {
            setStatus(`头像「${selectedAvatarFile.name}」已就绪；点击“导入并填充”后会与 JSON 一起带入。`, 'idle');
        }
    });

    importButton.addEventListener('click', importSelectedCharacterCard);
    updateFileSummary();
    syncImportPanelVisibility();

    const form = document.getElementById('form_create');
    if (form) {
        const observer = new MutationObserver(syncImportPanelVisibility);
        observer.observe(form, { attributes: true, attributeFilter: ['actiontype'] });
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindCharacterImport, { once: true });
} else {
    bindCharacterImport();
}
