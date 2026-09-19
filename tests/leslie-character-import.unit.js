import test from 'node:test';
import assert from 'node:assert/strict';

/* eslint-disable playwright/expect-expect */

import {
    CHARACTER_IMPORT_FIELD_BINDINGS,
    createCharacterImportDraft,
    summarizeCharacterImportFiles,
} from '../public/scripts/leslie-character-import-core.js';

function buildCard() {
    return {
        spec: 'chara_card_v3',
        spec_version: '3.0',
        data: {
            name: '导入测试角色',
            description: '一名在雨夜书店工作的成年角色。',
            personality: '克制、警觉、愿意慢慢建立信任。',
            scenario: '角色与 {{user}} 初次见面。',
            first_mes: '“请进来避雨，但请不要碰那排刚整理好的书。”',
            mes_example: '<START>\n{{user}}: “我可以看看吗？”\n{{char}}: “先告诉我你在找什么。”',
            creator_notes: '标准导入测试卡。',
            system_prompt: '保持角色独立意志，不替用户决定行动。',
            post_history_instructions: '每轮只写一个即时反应。',
            alternate_greetings: ['“今晚的雨比预报久。”'],
            tags: ['导入', '测试'],
            creator: 'LeslieTavern',
            character_version: '1.0',
            extensions: {
                talkativeness: 0.4,
                depth_prompt: { prompt: '保持克制；短回复。', depth: 0, role: 'system' },
            },
        },
    };
}

test('maps a standard Character Card JSON file to the native create state', () => {
    const draft = createCharacterImportDraft(JSON.stringify(buildCard()));

    assert.equal(draft.sourceSpec, 'chara_card_v3');
    assert.equal(draft.state.name, '导入测试角色');
    assert.equal(draft.state.first_message, '“请进来避雨，但请不要碰那排刚整理好的书。”');
    assert.equal(draft.state.tags, '导入, 测试');
    assert.deepEqual(draft.state.alternate_greetings, ['“今晚的雨比预报久。”']);
    assert.equal(draft.state.depth_prompt_role, 'system');
    assert.ok(CHARACTER_IMPORT_FIELD_BINDINGS.some(([id, key]) => id === 'firstmessage_textarea' && key === 'first_message'));
});

test('summarizes the combined JSON and avatar selection without persistence', () => {
    const summary = summarizeCharacterImportFiles({
        jsonFile: { name: 'character.json' },
        avatarFile: { name: 'portrait.webp' },
    });

    assert.deepEqual(summary, {
        jsonName: 'character.json',
        avatarName: 'portrait.webp',
        hasJson: true,
        hasAvatar: true,
    });
});
