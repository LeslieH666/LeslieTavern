import { describe, expect, test } from '@jest/globals';

import { normalizeCharacterChatName, selectLatestCharacterChat } from '../public/scripts/leslie-chat-selection.js';

describe('Leslie recent chat selection', () => {
    test('normalizes JSONL file names without changing the actual name', () => {
        expect(normalizeCharacterChatName('Role - old chat.jsonl')).toBe('Role - old chat');
        expect(normalizeCharacterChatName('Role - old chat')).toBe('Role - old chat');
    });

    test('selects by the last message time rather than by the file name', () => {
        const selected = selectLatestCharacterChat([
            { file_name: 'Z older.jsonl', last_mes: '2026-07-30T12:00:00Z', chat_items: 8 },
            { file_name: 'A latest.jsonl', last_mes: '2026-07-31T12:00:00Z', chat_items: 4 },
        ]);

        expect(selected.fileName).toBe('A latest');
    });

    test('does not let an accidental greeting-only chat replace an established recent chat', () => {
        const selected = selectLatestCharacterChat([
            { file_name: 'Established.jsonl', last_mes: '2026-07-31T23:00:00Z', chat_items: 20 },
            { file_name: 'Accidental new.jsonl', last_mes: '2026-08-01T08:00:00Z', chat_items: 1 },
        ]);

        expect(selected.fileName).toBe('Established');
    });

    test('opens a greeting-only chat when it is the character only history', () => {
        const selected = selectLatestCharacterChat([
            { file_name: 'First chat.jsonl', last_mes: 12345, chat_items: 1 },
        ]);

        expect(selected.fileName).toBe('First chat');
    });

    test('returns null when the character has no history', () => {
        expect(selectLatestCharacterChat([])).toBeNull();
        expect(selectLatestCharacterChat({ error: true })).toBeNull();
    });
});
