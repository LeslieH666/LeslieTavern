import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { sync as writeFileAtomicSync } from 'write-file-atomic';

export const IDENTITY_SCHEMA_VERSION = 1;

export class LeslieIdentityStoreError extends Error {
    constructor(code, message) {
        super(message);
        this.name = 'LeslieIdentityStoreError';
        this.code = code;
    }
}

function cleanText(value, field, maximumLength = 500) {
    const text = String(value ?? '').trim();
    if (!text || text.length > maximumLength) {
        throw new LeslieIdentityStoreError('INVALID_INPUT', `${field} is required and must be shorter than ${maximumLength} characters.`);
    }
    return text;
}

function cleanOptionalText(value, maximumLength = 500) {
    return String(value ?? '').trim().slice(0, maximumLength);
}

function isUuid(value) {
    return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function createInitialRegistry() {
    const now = new Date().toISOString();
    return {
        schemaVersion: IDENTITY_SCHEMA_VERSION,
        revision: 0,
        owner: {
            id: randomUUID(),
            type: 'owner',
            label: '现实中的我',
            createdAt: now,
            updatedAt: now,
        },
        entities: [],
        storyScopes: [],
        createdAt: now,
        updatedAt: now,
    };
}

function readJson(filePath) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
        throw new LeslieIdentityStoreError('CORRUPT_DATA', `Could not read Leslie identity data. ${error.message}`);
    }
}

function writeJson(filePath, value) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileAtomicSync(filePath, `${JSON.stringify(value, null, 4)}\n`, 'utf8');
}

export class LeslieIdentityStore {
    constructor(userRoot) {
        if (!path.isAbsolute(userRoot)) {
            throw new TypeError('Leslie identity storage requires an absolute user data directory.');
        }
        this.directory = path.join(userRoot, 'leslie', 'identity');
        this.registryPath = path.join(this.directory, 'registry.json');
        this.historyDirectory = path.join(this.directory, 'history');
    }

    getRegistry() {
        if (!fs.existsSync(this.registryPath)) {
            const registry = createInitialRegistry();
            writeJson(this.registryPath, registry);
            return registry;
        }
        return readJson(this.registryPath);
    }

    saveRegistry(previous, next) {
        fs.mkdirSync(this.historyDirectory, { recursive: true });
        writeJson(path.join(this.historyDirectory, `registry-r${previous.revision}-${Date.now()}.json`), previous);
        next.schemaVersion = IDENTITY_SCHEMA_VERSION;
        next.revision = Number(previous.revision ?? 0) + 1;
        next.updatedAt = new Date().toISOString();
        writeJson(this.registryPath, next);
        return next;
    }

    resolveEntity(registry, value, allowedTypes) {
        const type = cleanText(value?.type, 'entity.type', 40);
        if (!allowedTypes.includes(type)) {
            throw new LeslieIdentityStoreError('INVALID_INPUT', `Unsupported Leslie identity type: ${type}.`);
        }
        const sourceKey = cleanText(value?.sourceKey, 'entity.sourceKey');
        const label = cleanText(value?.label, 'entity.label', 300);
        const suggestedId = isUuid(value?.id) ? value.id : null;
        let entity = suggestedId ? registry.entities.find(item => item.id === suggestedId) : null;
        entity ??= registry.entities.find(item => item.type === type && (item.sourceKey === sourceKey || item.sourceAliases?.includes(sourceKey)));
        const now = new Date().toISOString();

        if (!entity) {
            entity = {
                id: randomUUID(),
                type,
                sourceKey,
                sourceAliases: [],
                label,
                labelHistory: [],
                createdAt: now,
                updatedAt: now,
            };
            registry.entities.push(entity);
            return { entity, changed: true };
        }
        if (entity.type !== type) {
            throw new LeslieIdentityStoreError('IDENTITY_CONFLICT', 'The requested identity id belongs to a different identity type.');
        }

        let changed = false;
        if (entity.sourceKey !== sourceKey && !entity.sourceAliases?.includes(sourceKey)) {
            entity.sourceAliases = [...new Set([...(entity.sourceAliases ?? []), entity.sourceKey])].filter(Boolean).slice(-20);
            entity.sourceKey = sourceKey;
            changed = true;
        }
        if (entity.label !== label) {
            entity.labelHistory = [...new Set([...(entity.labelHistory ?? []), entity.label])].filter(Boolean).slice(-20);
            entity.label = label;
            changed = true;
        }
        if (changed) {
            entity.updatedAt = now;
        }
        return { entity, changed };
    }

    resolveStoryScope(value = {}) {
        const previous = this.getRegistry();
        const registry = structuredClone(previous);
        const personaResult = this.resolveEntity(registry, { ...value.persona, type: 'persona' }, ['persona']);
        const counterpartResult = this.resolveEntity(registry, value.counterpart, ['character', 'group']);
        const chatKey = cleanText(value.chat?.chatKey, 'chat.chatKey');
        const parentChatKey = cleanOptionalText(value.chat?.parentChatKey);
        const requestedScopeId = isUuid(value.existingStoryScopeId) ? value.existingStoryScopeId : null;
        let scope = requestedScopeId ? registry.storyScopes.find(item => item.id === requestedScopeId) : null;
        scope ??= registry.storyScopes.find(item => item.personaId === personaResult.entity.id
            && item.counterpartId === counterpartResult.entity.id
            && (item.currentChatKey === chatKey || item.chatAliases?.includes(chatKey)));
        const now = new Date().toISOString();
        let changed = personaResult.changed || counterpartResult.changed;

        if (scope && (scope.personaId !== personaResult.entity.id || scope.counterpartId !== counterpartResult.entity.id)) {
            throw new LeslieIdentityStoreError('IDENTITY_CONFLICT', 'The requested story line belongs to a different Persona or character.');
        }
        if (!scope) {
            scope = {
                id: randomUUID(),
                domain: 'story',
                personaId: personaResult.entity.id,
                counterpartId: counterpartResult.entity.id,
                counterpartType: counterpartResult.entity.type,
                currentChatKey: chatKey,
                chatAliases: [],
                parentChatKey: parentChatKey || null,
                createdAt: now,
                updatedAt: now,
            };
            registry.storyScopes.push(scope);
            changed = true;
        } else {
            if (scope.currentChatKey !== chatKey) {
                scope.chatAliases = [...new Set([...(scope.chatAliases ?? []), scope.currentChatKey])].filter(Boolean).slice(-30);
                scope.currentChatKey = chatKey;
                changed = true;
            }
            if ((scope.parentChatKey ?? null) !== (parentChatKey || null)) {
                scope.parentChatKey = parentChatKey || null;
                changed = true;
            }
            if (changed) {
                scope.updatedAt = now;
            }
        }

        const saved = changed ? this.saveRegistry(previous, registry) : registry;
        return {
            owner: saved.owner,
            persona: saved.entities.find(item => item.id === personaResult.entity.id),
            counterpart: saved.entities.find(item => item.id === counterpartResult.entity.id),
            storyScope: saved.storyScopes.find(item => item.id === scope.id),
            registryRevision: saved.revision,
        };
    }

    resolveEntities(values = []) {
        if (!Array.isArray(values) || !values.length || values.length > 200) {
            throw new LeslieIdentityStoreError('INVALID_INPUT', 'One to 200 Leslie identities are required.');
        }
        const previous = this.getRegistry();
        const registry = structuredClone(previous);
        const results = [];
        let changed = false;

        for (const value of values) {
            const result = this.resolveEntity(registry, value, ['persona', 'character', 'group']);
            results.push(result.entity);
            changed ||= result.changed;
        }

        const saved = changed ? this.saveRegistry(previous, registry) : registry;
        return {
            entities: results.map(entity => saved.entities.find(item => item.id === entity.id)),
            registryRevision: saved.revision,
        };
    }
}
