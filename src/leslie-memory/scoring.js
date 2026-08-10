function splitTerms(text) {
    const normalized = String(text ?? '').toLocaleLowerCase().normalize('NFKC');
    const terms = new Set(normalized.match(/[\p{L}\p{N}_-]{2,}/gu) ?? []);
    const hanRuns = normalized.match(/[\p{Script=Han}]+/gu) ?? [];

    for (const run of hanRuns) {
        for (const character of run) {
            terms.add(character);
        }
        for (let index = 0; index < run.length - 1; index++) {
            terms.add(run.slice(index, index + 2));
        }
    }

    return terms;
}

function getLastSourceMessageId(event) {
    const messageIds = (event.source ?? []).map(item => Number(item.messageId)).filter(Number.isFinite);
    return messageIds.length ? Math.max(...messageIds) : 0;
}

function getAge(event, currentMessageId) {
    return Math.max(0, Number(currentMessageId ?? 0) - getLastSourceMessageId(event));
}

function getRelevance(queryTerms, event) {
    if (!queryTerms.size) {
        return 0;
    }

    const eventTerms = splitTerms([event.summary, ...(event.tags ?? []), ...(event.participants ?? [])].join(' '));
    let matches = 0;
    for (const term of queryTerms) {
        if (eventTerms.has(term)) {
            matches++;
        }
    }
    return Math.min(1, matches / Math.max(1, Math.min(queryTerms.size, 8)));
}

function getRecency(event, currentMessageId, settings) {
    if (event.level === 'A' || event.pinned) {
        return 1;
    }

    const age = getAge(event, currentMessageId);
    const decayTurns = event.level === 'B' ? settings.bDecayTurns : settings.cDecayTurns;
    return Math.exp(-age / Math.max(1, decayTurns));
}

export function scoreMemoryEvent(event, { query = '', currentMessageId = 0, settings } = {}) {
    if (event.status !== 'active' || Number(event.confidence ?? 0) < 0.35) {
        return Number.NEGATIVE_INFINITY;
    }

    const safeSettings = {
        bDecayTurns: Number(settings?.bDecayTurns ?? 40),
        cDecayTurns: Number(settings?.cDecayTurns ?? 8),
    };
    const queryTerms = splitTerms(query);
    const levelWeight = { A: 3.2, B: 2.1, C: 1.0 }[event.level] ?? 0;
    const relevance = getRelevance(queryTerms, event);
    const recency = getRecency(event, currentMessageId, safeSettings);
    const age = getAge(event, currentMessageId);
    const isForgottenC = event.level === 'C' && !event.pinned && age > safeSettings.cDecayTurns && relevance < 0.2;
    const isForgottenB = event.level === 'B' && !event.pinned && age > safeSettings.bDecayTurns * 2 && relevance < 0.2;
    if (isForgottenC || isForgottenB) {
        return Number.NEGATIVE_INFINITY;
    }
    const reinforcement = Math.min(1.5, Math.log2(Math.max(1, Number(event.reinforcement ?? 1))) * 0.35);
    const importance = Math.min(1, Math.max(0, Number(event.importance ?? 0) / 100));
    const confidence = Math.min(1, Math.max(0, Number(event.confidence ?? 0)));
    const pinned = event.pinned ? 10 : 0;

    return pinned + levelWeight + (importance * 1.8) + (relevance * 4.5) + (recency * 1.6) + reinforcement + (confidence * 0.6);
}

export function selectMemoryEvents(events, { query = '', currentMessageId = 0, settings = {}, maximum = 8 } = {}) {
    return events
        .map(event => ({ event, score: scoreMemoryEvent(event, { query, currentMessageId, settings }) }))
        .filter(item => Number.isFinite(item.score))
        .sort((left, right) => right.score - left.score || String(right.event.updatedAt).localeCompare(String(left.event.updatedAt)))
        .slice(0, Math.max(1, Number(maximum) || 8));
}
