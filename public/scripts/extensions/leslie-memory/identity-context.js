function cleanText(value) {
    return String(value ?? '').trim();
}

export function createPersonaDescriptor(context, { avatarId = '', name = '' } = {}) {
    const sourceKey = cleanText(avatarId || context?.chatMetadata?.persona || `name:${context?.name1 || 'user'}`);
    return {
        sourceKey,
        name: cleanText(name || context?.name1) || '当前剧情身份',
        lockedToChat: Boolean(context?.chatMetadata?.persona && context.chatMetadata.persona === sourceKey),
    };
}

export function buildStoryScopeRequest(identity, existingStoryScopeId = null) {
    if (!identity || identity.error || !identity.persona?.sourceKey) {
        throw new TypeError('A complete chat and Persona identity is required.');
    }
    return {
        existingStoryScopeId: existingStoryScopeId || null,
        persona: {
            type: 'persona',
            sourceKey: identity.persona.sourceKey,
            label: identity.persona.name,
        },
        counterpart: {
            type: identity.isGroup ? 'group' : 'character',
            sourceKey: identity.characterKey,
            label: identity.displayName,
        },
        chat: {
            chatKey: identity.chatKey,
            parentChatKey: identity.parentChatKey,
            isBranch: identity.isBranch,
        },
    };
}

export function buildMemoryIdentityBinding(resolution, { confirmed = true, worldLine = 'story' } = {}) {
    if (!resolution?.storyScope?.id || !resolution?.persona?.id || !resolution?.counterpart?.id) {
        throw new TypeError('A resolved Leslie story line is required.');
    }
    return {
        domain: 'story',
        worldLine: worldLine === 'reality' ? 'reality' : 'story',
        storyScopeId: resolution.storyScope.id,
        personaId: resolution.persona.id,
        personaSourceKey: resolution.persona.sourceKey,
        personaName: resolution.persona.label,
        counterpartId: resolution.counterpart.id,
        counterpartType: resolution.counterpart.type,
        counterpartSourceKey: resolution.counterpart.sourceKey,
        counterpartName: resolution.counterpart.label,
        confirmed,
        boundAt: new Date().toISOString(),
    };
}

export function getMemoryMetadataReference(metadata, personaSourceKey) {
    const source = metadata && typeof metadata === 'object' ? metadata : {};
    const bindings = Array.isArray(source.bindings) ? source.bindings : [];
    const binding = bindings.find(item => item?.personaSourceKey === personaSourceKey) ?? null;
    if (binding) {
        return {
            kind: 'binding',
            memoryId: cleanText(binding.memoryId),
            storyScopeId: cleanText(binding.storyScopeId),
            binding,
        };
    }
    if (bindings.length) {
        return { kind: 'different-persona', memoryId: null, storyScopeId: null, binding: null };
    }
    if (cleanText(source.id)) {
        return {
            kind: 'legacy',
            memoryId: cleanText(source.id),
            storyScopeId: cleanText(source.storyScopeId),
            binding: null,
        };
    }
    return { kind: 'empty', memoryId: null, storyScopeId: null, binding: null };
}

export function upsertMemoryMetadata(metadata, { memoryId, chatKey, identityBinding, confirmed = true }) {
    const source = metadata && typeof metadata === 'object' ? structuredClone(metadata) : {};
    const bindings = Array.isArray(source.bindings) ? source.bindings.filter(Boolean) : [];
    const now = new Date().toISOString();
    const legacyUnbound = !bindings.length && cleanText(source.id) && cleanText(source.id) !== cleanText(memoryId)
        ? (source.legacyUnbound ?? {
            memoryId: cleanText(source.id),
            chatKey: cleanText(source.chatKey),
            preservedAt: now,
        })
        : source.legacyUnbound;
    const nextBinding = {
        memoryId: cleanText(memoryId),
        chatKey: cleanText(chatKey),
        storyScopeId: cleanText(identityBinding.storyScopeId),
        personaId: cleanText(identityBinding.personaId),
        personaSourceKey: cleanText(identityBinding.personaSourceKey),
        personaName: cleanText(identityBinding.personaName),
        confirmed: confirmed === true,
        linkedAt: now,
        updatedAt: now,
    };
    const index = bindings.findIndex(item => item?.personaId === nextBinding.personaId || item?.personaSourceKey === nextBinding.personaSourceKey);
    if (index >= 0) {
        nextBinding.linkedAt = bindings[index].linkedAt || now;
        bindings[index] = nextBinding;
    } else {
        bindings.push(nextBinding);
    }
    return {
        ...source,
        schemaVersion: 2,
        id: nextBinding.memoryId,
        chatKey: cleanText(chatKey),
        storyScopeId: nextBinding.storyScopeId,
        activePersonaId: nextBinding.personaId,
        bindings,
        ...(legacyUnbound ? { legacyUnbound } : {}),
    };
}
