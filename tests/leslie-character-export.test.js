import fs from 'node:fs';
import { once } from 'node:events';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';

import { afterEach, describe, expect, jest, test } from '@jest/globals';
import archiver from 'archiver';
import { strFromU8, unzipSync } from 'fflate';

import {
    appendCharacterBundleFiles,
    getCharacterBundleFileName,
    getCharacterExportBaseName,
    listCharacterChatExports,
} from '../src/leslie-character-export.js';

const temporaryDirectories = [];

function makeTemporaryDirectory() {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'leslie-character-export-'));
    temporaryDirectories.push(directory);
    return directory;
}

afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

describe('Leslie character export', () => {
    test('keeps the character card base name in the archive download name', () => {
        expect(getCharacterExportBaseName('林雾遥.png')).toBe('林雾遥');
        expect(getCharacterBundleFileName('林雾遥.png')).toBe('林雾遥-角色卡与聊天记录.zip');
    });

    test('does not allow path components from an avatar URL into export paths', () => {
        expect(getCharacterExportBaseName('../../outside/Example.png')).toBe('Example');
        expect(getCharacterExportBaseName('')).toBe('character');
    });

    test('allows a valid character name that begins with two periods', async () => {
        const chatsRoot = makeTemporaryDirectory();
        fs.mkdirSync(path.join(chatsRoot, '..Hero'));
        fs.writeFileSync(path.join(chatsRoot, '..Hero', 'Chat.jsonl'), '{"mes":"synthetic"}\n');

        await expect(listCharacterChatExports(chatsRoot, '..Hero.png'))
            .resolves.toEqual([{ name: 'Chat.jsonl', path: path.join(chatsRoot, '..Hero', 'Chat.jsonl') }]);
    });

    test('lists only direct JSONL chat files in stable name order', async () => {
        const chatsRoot = makeTemporaryDirectory();
        const characterChats = path.join(chatsRoot, 'Test Character');
        fs.mkdirSync(path.join(characterChats, 'nested'), { recursive: true });
        fs.writeFileSync(path.join(characterChats, '02-later.jsonl'), '{"mes":"later"}\n');
        fs.writeFileSync(path.join(characterChats, '01-first.JSONL'), '{"mes":"first"}\n');
        fs.writeFileSync(path.join(characterChats, 'notes.txt'), 'not a chat');
        fs.writeFileSync(path.join(characterChats, 'nested', 'hidden.jsonl'), '{"mes":"hidden"}\n');

        const exports = await listCharacterChatExports(chatsRoot, 'Test Character.png');

        expect(exports.map(file => file.name)).toEqual(['01-first.JSONL', '02-later.jsonl']);
        expect(exports.every(file => path.dirname(file.path) === characterChats)).toBe(true);
    });

    test('returns an empty list when a character has no chat directory', async () => {
        const chatsRoot = makeTemporaryDirectory();

        await expect(listCharacterChatExports(chatsRoot, 'No Chats.png')).resolves.toEqual([]);
    });

    test('keeps the shareable PNG and raw JSONL files in separate archive paths', () => {
        const archive = {
            append: jest.fn(),
            file: jest.fn(),
        };
        const characterCard = Buffer.from('synthetic character card');
        const chatFiles = [
            { name: 'First.jsonl', path: 'C:\\synthetic\\First.jsonl' },
            { name: 'Second.jsonl', path: 'C:\\synthetic\\Second.jsonl' },
        ];

        appendCharacterBundleFiles(archive, { characterName: 'Test Character', characterCard, chatFiles });

        expect(archive.append).toHaveBeenCalledWith(characterCard, { name: 'Test Character.png' });
        expect(archive.file).toHaveBeenNthCalledWith(1, chatFiles[0].path, { name: '聊天记录/First.jsonl' });
        expect(archive.file).toHaveBeenNthCalledWith(2, chatFiles[1].path, { name: '聊天记录/Second.jsonl' });
    });

    test('produces a readable ZIP without changing JSONL bytes', async () => {
        const chatsRoot = makeTemporaryDirectory();
        const chatDirectory = path.join(chatsRoot, 'Synthetic');
        const chatText = '{"user_name":"Tester","character_name":"Synthetic"}\n{"name":"Synthetic","mes":"hello"}\n';
        fs.mkdirSync(chatDirectory);
        fs.writeFileSync(path.join(chatDirectory, 'Conversation.jsonl'), chatText);
        const chatFiles = await listCharacterChatExports(chatsRoot, 'Synthetic.png');
        const output = new PassThrough();
        const chunks = [];
        output.on('data', chunk => chunks.push(chunk));
        const completed = once(output, 'end');
        const archive = archiver('zip');
        archive.pipe(output);

        appendCharacterBundleFiles(archive, {
            characterName: 'Synthetic',
            characterCard: Buffer.from('synthetic PNG bytes'),
            chatFiles,
        });
        await archive.finalize();
        await completed;

        const entries = unzipSync(Buffer.concat(chunks));
        expect(Object.keys(entries).sort()).toEqual(['Synthetic.png', '聊天记录/Conversation.jsonl']);
        expect(strFromU8(entries['聊天记录/Conversation.jsonl'])).toBe(chatText);
    });
});
