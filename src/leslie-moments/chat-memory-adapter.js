import fs from 'node:fs';

import { LeslieMemoryStore } from '../leslie-memory/store.js';

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

export function selectChatMemoryContext(userRoot, {
    actorEntityId,
    personaId = null,
    storyScopeId = null,
    query = '',
    maximum = 6,
} = {}) {
    const store = new LeslieMemoryStore(userRoot);
    if (!fs.existsSync(store.baseDirectory)) {
        return { memories: [] };
    }
    const queryTerms = splitTerms(query);
    const candidates = [];
    for (const entry of fs.readdirSync(store.baseDirectory, { withFileTypes: true })) {
        if (!entry.isDirectory() || !/^[0-9a-f-]{36}$/i.test(entry.name)) {
            continue;
        }
        try {
            const memory = store.getMemory(entry.name);
            const binding = memory.manifest?.identityBinding;
            if (!memory.state?.enabled || !binding?.confirmed || binding.counterpartId !== actorEntityId) {
                continue;
            }
            if (storyScopeId && binding.storyScopeId !== storyScopeId) {
                continue;
            }
            if (!storyScopeId && personaId && binding.personaId !== personaId) {
                continue;
            }
            for (const event of memory.events ?? []) {
                if (event.status !== 'active' || event.approved !== true) {
                    continue;
                }
                const text = `${event.summary} ${(event.tags ?? []).join(' ')} ${(event.participants ?? []).join(' ')}`;
                const terms = splitTerms(text);
                const relevance = queryTerms.filter(term => terms.includes(term) || text.includes(term)).length;
                candidates.push({
                    memoryId: memory.manifest.id,
                    storyScopeId: binding.storyScopeId,
                    personaId: binding.personaId,
                    eventId: event.id,
                    level: event.level,
                    summary: event.summary,
                    participants: event.participants ?? [],
                    score: relevance * 5 + Number(event.importance ?? 0) / 100 + Number(event.pinned === true) * 2,
                    updatedAt: event.updatedAt,
                });
            }
        } catch {
            // One damaged chat-memory profile must not stop Moments or ordinary chat.
        }
    }
    return {
        memories: candidates
            .sort((left, right) => right.score - left.score || String(right.updatedAt).localeCompare(String(left.updatedAt)))
            .slice(0, Math.max(1, Math.min(20, Number(maximum) || 6)))
            .map(({ score: _score, updatedAt: _updatedAt, ...memory }) => memory),
    };
}
