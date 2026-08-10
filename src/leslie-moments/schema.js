export const MOMENTS_SCHEMA_VERSION = 1;
export const MOMENT_MODES = Object.freeze(['reality', 'story', 'aside']);

const IDENTITY_TYPES = Object.freeze(['persona', 'character', 'group']);

function cleanText(value, field, maximumLength = 500) {
    const text = String(value ?? '').trim();
    if (!text || text.length > maximumLength) {
        throw new TypeError(`${field} is required and must be shorter than ${maximumLength} characters.`);
    }
    return text;
}

function cleanOptionalText(value, maximumLength = 500) {
    return String(value ?? '').trim().slice(0, maximumLength);
}

function requireUuid(value, field) {
    const text = cleanText(value, field, 80);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) {
        throw new TypeError(`${field} must be a UUID.`);
    }
    return text;
}

export function normalizeMomentIdentity(value, allowedTypes = IDENTITY_TYPES) {
    const type = cleanText(value?.type, 'identity.type', 40);
    if (!allowedTypes.includes(type)) {
        throw new TypeError(`Unsupported moment identity type: ${type}.`);
    }
    return {
        entityId: requireUuid(value?.entityId ?? value?.id, 'identity.entityId'),
        type,
        sourceKey: cleanText(value?.sourceKey, 'identity.sourceKey'),
        label: cleanText(value?.label, 'identity.label', 300),
        avatar: cleanOptionalText(value?.avatar, 1000),
    };
}

export function normalizeStoryBinding(value) {
    if (!value) {
        return null;
    }
    return {
        storyScopeId: requireUuid(value.storyScopeId, 'storyBinding.storyScopeId'),
        personaId: requireUuid(value.personaId, 'storyBinding.personaId'),
        counterpartId: requireUuid(value.counterpartId, 'storyBinding.counterpartId'),
        counterpartType: cleanText(value.counterpartType, 'storyBinding.counterpartType', 40),
        chatKey: cleanText(value.chatKey, 'storyBinding.chatKey', 1000),
        personaName: cleanText(value.personaName, 'storyBinding.personaName', 300),
        counterpartName: cleanText(value.counterpartName, 'storyBinding.counterpartName', 300),
    };
}

export function normalizeMomentVisibility(value, { storyBinding = null } = {}) {
    const type = String(value?.type ?? 'all').trim();
    if (!['all', 'selected'].includes(type)) {
        throw new TypeError('visibility.type must be all or selected.');
    }
    const rawTargets = Array.isArray(value?.targets) ? value.targets : [];
    const targets = rawTargets.map(item => normalizeMomentIdentity(item, ['character', 'group']));
    const uniqueTargets = [...new Map(targets.map(item => [item.entityId, item])).values()];
    if (uniqueTargets.length > 200) {
        throw new TypeError('A moment cannot target more than 200 roles.');
    }
    if (type === 'selected' && !uniqueTargets.length) {
        throw new TypeError('At least one visible role must be selected.');
    }
    if (storyBinding) {
        if (type !== 'selected' || uniqueTargets.length !== 1 || uniqueTargets[0].entityId !== storyBinding.counterpartId) {
            throw new TypeError('A story moment must only target its bound character or group.');
        }
    }
    return { type, targets: type === 'all' ? [] : uniqueTargets };
}

export function createMomentPost(value, { id, now = new Date().toISOString() }) {
    const mode = cleanText(value?.mode, 'mode', 40);
    if (!MOMENT_MODES.includes(mode)) {
        throw new TypeError(`Unsupported moment mode: ${mode}.`);
    }
    const author = normalizeMomentIdentity(value?.author, ['persona', 'character']);
    const storyBinding = mode === 'story' ? normalizeStoryBinding(value?.storyBinding) : null;
    if (mode === 'story' && !storyBinding) {
        throw new TypeError('A story moment requires a bound story line.');
    }
    if (storyBinding && author.entityId !== storyBinding.personaId) {
        throw new TypeError('The story moment author must match its bound Persona.');
    }
    return {
        id: requireUuid(id, 'id'),
        revision: 1,
        status: 'active',
        mode,
        content: cleanText(value?.content, 'content', 5000),
        author,
        visibility: normalizeMomentVisibility(value?.visibility, { storyBinding }),
        storyBinding,
        reactions: {
            likes: [],
            comments: [],
        },
        createdAt: now,
        updatedAt: now,
        editedAt: null,
        archivedAt: null,
    };
}

export function validateMomentsTimeline(value) {
    if (!value || typeof value !== 'object' || !Array.isArray(value.posts)) {
        throw new TypeError('The Leslie moments timeline is invalid.');
    }
    if (Number(value.schemaVersion) !== MOMENTS_SCHEMA_VERSION) {
        throw new TypeError(`Unsupported Leslie moments schema version: ${value.schemaVersion}.`);
    }
    return value;
}
