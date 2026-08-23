import path from 'node:path';
import { promises as fsPromises } from 'node:fs';

import sanitize from 'sanitize-filename';

/**
 * Gets a safe, stable base name for a character export.
 *
 * @param {unknown} avatarUrl Character avatar file name.
 * @returns {string} Export base name.
 */
export function getCharacterExportBaseName(avatarUrl) {
    const avatarName = sanitize(path.basename(String(avatarUrl ?? '').trim())).trim();
    const baseName = path.basename(avatarName, path.extname(avatarName)).trim();
    return baseName || 'character';
}

/**
 * Gets the download name for a character card and chat archive.
 *
 * @param {unknown} avatarUrl Character avatar file name.
 * @returns {string} Archive file name.
 */
export function getCharacterBundleFileName(avatarUrl) {
    return `${getCharacterExportBaseName(avatarUrl)}-角色卡与聊天记录.zip`;
}

/**
 * Lists the SillyTavern JSONL chats belonging to a character.
 * Missing chat directories are treated as characters with no saved chats.
 *
 * @param {string} chatsRoot User chats directory.
 * @param {unknown} avatarUrl Character avatar file name.
 * @returns {Promise<Array<{ name: string, path: string }>>} Sorted chat files.
 */
export async function listCharacterChatExports(chatsRoot, avatarUrl) {
    const characterName = getCharacterExportBaseName(avatarUrl);
    const chatDirectory = path.resolve(chatsRoot, characterName);
    const resolvedChatsRoot = path.resolve(chatsRoot);
    const relativeDirectory = path.relative(resolvedChatsRoot, chatDirectory);

    if (relativeDirectory === '..' || relativeDirectory.startsWith(`..${path.sep}`) || path.isAbsolute(relativeDirectory)) {
        throw new Error('Character chat directory is outside the user chats directory.');
    }

    let entries;
    try {
        entries = await fsPromises.readdir(chatDirectory, { withFileTypes: true });
    } catch (error) {
        if (error?.code === 'ENOENT') {
            return [];
        }
        throw error;
    }

    return entries
        .filter(entry => entry.isFile() && path.extname(entry.name).toLocaleLowerCase() === '.jsonl')
        .map(entry => ({
            name: entry.name,
            path: path.join(chatDirectory, entry.name),
        }))
        .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));
}

/**
 * Adds a shareable character card and its raw JSONL chats to an archive.
 *
 * @param {import('archiver').Archiver} archive ZIP archive.
 * @param {object} input Bundle files.
 * @param {string} input.characterName Character card base name.
 * @param {Buffer} input.characterCard Sanitized CCV3 PNG.
 * @param {Array<{ name: string, path: string }>} input.chatFiles JSONL chat files.
 */
export function appendCharacterBundleFiles(archive, { characterName, characterCard, chatFiles }) {
    archive.append(characterCard, { name: `${characterName}.png` });
    for (const chatFile of chatFiles) {
        archive.file(chatFile.path, { name: `聊天记录/${chatFile.name}` });
    }
}
