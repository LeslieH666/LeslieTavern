import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { sync as writeFileAtomicSync } from 'write-file-atomic';

import { normalizeMomentIdentity } from './schema.js';

export const MOMENTS_MEMORY_SCHEMA_VERSION = 1;

function cleanText(value, maximumLength = 2000) {
    return String(value ?? '').trim().slice(0, maximumLength);
}

function cleanTopics(value) {
    return [...new Set((Array.isArray(value) ? value : [])
        .map(item => cleanText(item, 80))
        .filter(Boolean))].slice(0, 16);
}

function createInitialMemory(now = new Date().toISOString()) {
    return {
        schemaVersion: MOMENTS_MEMORY_SCHEMA_VERSION,
        revision: 0,
        events: [],
        createdAt: now,
        updatedAt: now,
    };
}

function writeJson(filePath, value) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileAtomicSync(filePath, `${JSON.stringify(value, null, 4)}\n`, 'utf8');
}

function splitTerms(value) {
    const normalized = String(value ?? '').toLocaleLowerCase('zh-CN').normalize('NFKC');
    const terms = new Set(normalized.match(/[\p{L}\p{N}_-]{2,}/gu) ?? []);
    for (const run of normalized.match(/[\p{Script=Han}]+/gu) ?? []) {
        for (const character of run) {
            terms.add(character);
        }
        for (let index = 0; index < run.length - 1; index++) {
            terms.add(run.slice(index, index + 2));
        }
    }
    return [...terms];
}

function validateMemory(value) {
    if (!value || typeof value !== 'object'
        || Number(value.schemaVersion) !== MOMENTS_MEMORY_SCHEMA_VERSION
        || !Array.isArray(value.events)) {
        throw new TypeError('The Leslie moments memory file is invalid.');
    }
    return value;
}

function getScope(post) {
    return {
        personaId: post.author?.type === 'persona' ? post.author.entityId : (post.storyBinding?.personaId ?? null),
        storyScopeId: post.storyBinding?.storyScopeId ?? null,
        mode: post.mode,
    };
}

export class LeslieMomentsMemoryStore {
    constructor(userRoot) {
        if (!path.isAbsolute(userRoot)) {
            throw new TypeError('Leslie moments memory storage requires an absolute user data directory.');
        }
        this.directory = path.join(userRoot, 'leslie', 'moments', 'memory');
        this.memoryPath = path.join(this.directory, 'events.json');
        this.historyDirectory = path.join(this.directory, 'history');
    }

    readMemory() {
        if (!fs.existsSync(this.memoryPath)) {
            return createInitialMemory();
        }
        try {
            return validateMemory(JSON.parse(fs.readFileSync(this.memoryPath, 'utf8')));
        } catch (error) {
            throw new TypeError(`Could not read Leslie moments memory. ${error.message}`);
        }
    }

    saveMemory(previous, next) {
        fs.mkdirSync(this.historyDirectory, { recursive: true });
        if (fs.existsSync(this.memoryPath)) {
            writeJson(path.join(this.historyDirectory, `events-r${previous.revision}-${Date.now()}.json`), previous);
        }
        next.schemaVersion = MOMENTS_MEMORY_SCHEMA_VERSION;
        next.revision = Number(previous.revision ?? 0) + 1;
        next.updatedAt = new Date().toISOString();
        writeJson(this.memoryPath, next);
        return next;
    }

    recordObservation(actorValue, post, { comment = null, summary = '', topics = [], importance = 50, now = new Date().toISOString() } = {}) {
        const actor = normalizeMomentIdentity(actorValue, ['character', 'group']);
        const sourceType = comment ? 'comment' : 'post';
        const sourceId = comment?.id ?? post.id;
        const postRevision = Number(post.revision ?? 1);
        const previous = this.readMemory();
        const duplicate = previous.events.find(event => event.actor.entityId === actor.entityId
            && event.sourceRef.sourceType === sourceType
            && event.sourceRef.sourceId === sourceId
            && Number(event.sourceRef.postRevision) === postRevision
            && event.status === 'active');
        if (duplicate) {
            return duplicate;
        }
        const next = structuredClone(previous);
        const fallbackSummary = comment
            ? `${comment.actor?.label || '有人'}回复：${comment.content}`
            : `${post.author?.label || '有人'}发布：${post.content}`;
        const normalizedSummary = cleanText(summary || fallbackSummary);
        const queryTerms = splitTerms(`${normalizedSummary} ${cleanTopics(topics).join(' ')}`);
        const relatedEventIds = next.events
            .filter(event => event.actor.entityId === actor.entityId && event.status === 'active')
            .map(event => ({
                id: event.id,
                score: splitTerms(`${event.summary} ${(event.topics ?? []).join(' ')}`).filter(term => queryTerms.includes(term)).length,
            }))
            .filter(item => item.score > 0)
            .sort((left, right) => right.score - left.score)
            .slice(0, 5)
            .map(item => item.id);
        const event = {
            id: randomUUID(),
            actor,
            scope: getScope(post),
            summary: normalizedSummary,
            topics: cleanTopics(topics),
            importance: Math.max(0, Math.min(100, Math.round(Number(importance) || 50))),
            sourceRef: {
                postId: post.id,
                postRevision,
                sourceType,
                sourceId,
            },
            relatedEventIds,
            status: post.mode === 'aside' ? 'ephemeral' : 'active',
            createdAt: now,
            updatedAt: now,
            lastUsedAt: null,
            useCount: 0,
        };
        next.events.push(event);
        this.saveMemory(previous, next);
        return event;
    }

    invalidatePost(postId, { now = new Date().toISOString() } = {}) {
        const previous = this.readMemory();
        const next = structuredClone(previous);
        let changed = false;
        for (const event of next.events) {
            if (event.sourceRef?.postId === postId && event.status !== 'invalid') {
                event.status = 'invalid';
                event.updatedAt = now;
                changed = true;
            }
        }
        return changed ? this.saveMemory(previous, next) : previous;
    }

    selectContext({ actorEntityId, personaId = null, storyScopeId = null, query = '', maximum = 6 } = {}) {
        const memory = this.readMemory();
        const queryTerms = splitTerms(query);
        const now = Date.now();
        const events = memory.events
            .filter(event => event.actor?.entityId === actorEntityId && event.status === 'active')
            .filter(event => storyScopeId ? event.scope?.storyScopeId === storyScopeId : !event.scope?.storyScopeId)
            .filter(event => personaId ? (!event.scope?.personaId || event.scope.personaId === personaId) : !event.scope?.personaId)
            .map(event => {
                const terms = splitTerms(`${event.summary} ${(event.topics ?? []).join(' ')}`);
                const relevance = queryTerms.filter(term => terms.includes(term) || event.summary.includes(term)).length;
                const ageHours = Math.max(0, (now - new Date(event.createdAt).getTime()) / 3_600_000);
                const recency = 1 / (1 + ageHours / 72);
                return { event, score: relevance * 5 + Number(event.importance ?? 0) / 100 + recency };
            })
            .sort((left, right) => right.score - left.score)
            .slice(0, Math.max(1, Math.min(20, Number(maximum) || 6)))
            .map(item => item.event);
        return { schemaVersion: memory.schemaVersion, revision: memory.revision, events };
    }
}
