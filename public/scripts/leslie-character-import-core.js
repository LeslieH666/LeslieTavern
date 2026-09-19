import { cardToCreateState } from './leslie-character-workshop/core.js';
import { parseCharacterCardJsonText } from './leslie-character-workshop/importer.js';

/**
 * The existing character editor remains the source of truth for saving. These
 * bindings describe the fields that can be filled from a portable card.
 */
export const CHARACTER_IMPORT_FIELD_BINDINGS = Object.freeze([
    ['character_name_pole', 'name'],
    ['description_textarea', 'description'],
    ['creator_notes_textarea', 'creator_notes'],
    ['character_version_textarea', 'character_version'],
    ['post_history_instructions_textarea', 'post_history_instructions'],
    ['system_prompt_textarea', 'system_prompt'],
    ['tags_textarea', 'tags'],
    ['creator_textarea', 'creator'],
    ['personality_textarea', 'personality'],
    ['firstmessage_textarea', 'first_message'],
    ['talkativeness_slider', 'talkativeness'],
    ['scenario_pole', 'scenario'],
    ['depth_prompt_prompt', 'depth_prompt_prompt'],
    ['depth_prompt_depth', 'depth_prompt_depth'],
    ['depth_prompt_role', 'depth_prompt_role'],
    ['mes_example_textarea', 'mes_example'],
    ['character_world', 'world'],
]);

/**
 * Parses a standard Character Card JSON document and maps it to the existing
 * SillyTavern create state. No file system or server write happens here.
 *
 * @param {string} text Character Card JSON text.
 * @returns {{card: object, state: object, sourceLabel: string, sourceSpec: string, notices: string[]}}
 */
export function createCharacterImportDraft(text) {
    const parsed = parseCharacterCardJsonText(text);
    return {
        ...parsed,
        state: cardToCreateState(parsed.card),
    };
}

/**
 * Returns a small, UI-safe summary for the combined JSON and avatar flow.
 *
 * @param {{jsonFile?: File|null, avatarFile?: File|null}} files Selected files.
 * @returns {{jsonName: string, avatarName: string, hasJson: boolean, hasAvatar: boolean}}
 */
export function summarizeCharacterImportFiles({ jsonFile = null, avatarFile = null } = {}) {
    return {
        jsonName: jsonFile?.name || '未选择 JSON',
        avatarName: avatarFile?.name || '未选择头像',
        hasJson: Boolean(jsonFile),
        hasAvatar: Boolean(avatarFile),
    };
}
