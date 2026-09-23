import { describe, expect, test } from '@jest/globals';

import {
    buildHomeMomentActivities,
    getLeslieHomeGreeting,
    migratePinnedCharacterAvatar,
    normalizePinnedCharacterAvatars,
    rankHomeCharacters,
    selectHomeContinueChat,
} from '../public/scripts/leslie-home-core.js';

describe('Leslie companion home', () => {
    const characters = [
        { avatar: 'alice.png', name: 'Alice', chat_size: 400, date_last_chat: 100 },
        { avatar: 'bea.png', name: 'Bea', chat_size: 120, date_last_chat: 300 },
        { avatar: 'cora.png', name: 'Cora', chat_size: 900, date_last_chat: 200 },
    ];

    test('keeps valid manual pins ordered and removes stale duplicates', () => {
        expect(normalizePinnedCharacterAvatars(['bea.png', 'missing.png', 'bea.png', 'alice.png'], characters))
            .toEqual(['bea.png', 'alice.png']);
    });

    test('migrates a pinned avatar before the renamed character list refreshes', () => {
        expect(migratePinnedCharacterAvatar(['alice.png', 'bea.png'], 'alice.png', 'alice-renamed.png'))
            .toEqual(['alice-renamed.png', 'bea.png']);
    });

    test('puts manual pins before characters ranked by recent chat frequency', () => {
        const chats = [
            { avatar: 'alice.png', chat_items: 12, last_mes: 1000 },
            { avatar: 'alice.png', chat_items: 8, last_mes: 900 },
            { avatar: 'bea.png', chat_items: 60, last_mes: 1100 },
            { avatar: '', group: 'group-1', is_group: true, chat_items: 100, last_mes: 1200 },
        ];

        const ranked = rankHomeCharacters(characters, chats, ['cora.png']);

        expect(ranked.map(item => item.avatar)).toEqual(['cora.png', 'alice.png', 'bea.png']);
        expect(ranked[0].homePinned).toBe(true);
        expect(ranked[1].homeSessions).toBe(2);
    });

    test('continues the newest chat instead of the first legacy pinned row', () => {
        const selected = selectHomeContinueChat([
            { avatar: 'alice.png', last_mes: '2026-01-01T08:00:00Z', pinned: true },
            { avatar: 'bea.png', last_mes: '2026-01-03T08:00:00Z' },
        ]);

        expect(selected.avatar).toBe('bea.png');
    });

    test('shows only content-free recent Moments events', () => {
        const activities = buildHomeMomentActivities([{
            status: 'active',
            content: 'private post body',
            author: { type: 'persona', label: 'Leslie', avatar: 'leslie.png' },
            createdAt: '2026-01-01T08:00:00Z',
            reactions: {
                comments: [{
                    content: 'private reply body',
                    actor: { type: 'character', label: 'Alice', avatar: 'alice.png' },
                    createdAt: '2026-01-02T08:00:00Z',
                }],
            },
        }]);

        expect(activities[0]).toMatchObject({ kind: 'comment', label: 'Alice 回复了你的动态' });
        expect(JSON.stringify(activities)).not.toContain('private post body');
        expect(JSON.stringify(activities)).not.toContain('private reply body');
    });

    test('uses deterministic time-of-day greetings without a model call', () => {
        expect(getLeslieHomeGreeting(8)).toBe('早上好');
        expect(getLeslieHomeGreeting(14)).toBe('下午好');
        expect(getLeslieHomeGreeting(23)).toBe('晚上好');
    });
});
