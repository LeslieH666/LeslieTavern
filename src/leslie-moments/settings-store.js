import fs from 'node:fs';
import path from 'node:path';
import { sync as writeFileAtomicSync } from 'write-file-atomic';

import { normalizeMomentIdentity } from './schema.js';

export const MOMENTS_SETTINGS_SCHEMA_VERSION = 1;
const FREQUENCIES = Object.freeze(['occasional', 'normal', 'active']);

function createInitialSettings(now = new Date().toISOString()) {
    return {
        schemaVersion: MOMENTS_SETTINGS_SCHEMA_VERSION,
        revision: 0,
        globalAiPostingEnabled: false,
        characterPolicies: [],
        createdAt: now,
        updatedAt: now,
    };
}

function writeJson(filePath, value) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileAtomicSync(filePath, `${JSON.stringify(value, null, 4)}\n`, 'utf8');
}

function normalizePolicy(value) {
    return {
        actor: normalizeMomentIdentity(value?.actor, ['character']),
        canPost: value?.canPost === true,
        frequency: FREQUENCIES.includes(value?.frequency) ? value.frequency : 'normal',
        useChatMemory: value?.useChatMemory === true,
        canInteract: value?.canInteract !== false,
    };
}

function validateSettings(value) {
    if (!value || typeof value !== 'object'
        || Number(value.schemaVersion) !== MOMENTS_SETTINGS_SCHEMA_VERSION
        || typeof value.globalAiPostingEnabled !== 'boolean'
        || !Array.isArray(value.characterPolicies)) {
        throw new TypeError('The Leslie moments settings file is invalid.');
    }
    if (value.characterPolicies.length > 500) {
        throw new TypeError('The Leslie moments character policy list is too large.');
    }
    return {
        ...value,
        characterPolicies: value.characterPolicies.map(normalizePolicy),
    };
}

export class LeslieMomentsSettingsStore {
    constructor(userRoot) {
        if (!path.isAbsolute(userRoot)) {
            throw new TypeError('Leslie moments settings storage requires an absolute user data directory.');
        }
        this.directory = path.join(userRoot, 'leslie', 'moments');
        this.settingsPath = path.join(this.directory, 'settings.json');
        this.historyDirectory = path.join(this.directory, 'history', 'settings');
    }

    readSettings() {
        if (!fs.existsSync(this.settingsPath)) {
            return createInitialSettings();
        }
        try {
            return validateSettings(JSON.parse(fs.readFileSync(this.settingsPath, 'utf8')));
        } catch (error) {
            throw new TypeError(`Could not read Leslie moments settings. ${error.message}`);
        }
    }

    updateSettings(value) {
        const previous = this.readSettings();
        const policies = Array.isArray(value?.characterPolicies) ? value.characterPolicies.map(normalizePolicy) : [];
        const uniquePolicies = [...new Map(policies.map(policy => [policy.actor.entityId, policy])).values()];
        const next = {
            ...previous,
            schemaVersion: MOMENTS_SETTINGS_SCHEMA_VERSION,
            revision: Number(previous.revision ?? 0) + 1,
            globalAiPostingEnabled: value?.globalAiPostingEnabled === true,
            characterPolicies: uniquePolicies,
            updatedAt: new Date().toISOString(),
        };
        fs.mkdirSync(this.historyDirectory, { recursive: true });
        if (fs.existsSync(this.settingsPath)) {
            writeJson(path.join(this.historyDirectory, `settings-r${previous.revision}-${Date.now()}.json`), previous);
        }
        writeJson(this.settingsPath, next);
        return next;
    }

    getPolicy(actorEntityId) {
        return this.readSettings().characterPolicies.find(policy => policy.actor.entityId === actorEntityId) ?? null;
    }
}
