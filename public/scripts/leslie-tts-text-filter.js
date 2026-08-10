const OPENING_PARENTHESES = new Set(['(', '（']);
const CLOSING_PARENTHESES = new Set([')', '）']);

/**
 * Removes text inside ASCII or full-width round parentheses without changing
 * the source message. Nested and mixed-width parentheses are treated as one
 * parenthetical block so role-play action notes are not sent to TTS.
 *
 * @param {unknown} value Text to filter.
 * @returns {string} Text outside parentheses.
 */
export function stripParentheticalText(value) {
    const text = String(value ?? '');
    let depth = 0;
    let output = '';
    let removedBlock = false;

    for (const character of text) {
        if (OPENING_PARENTHESES.has(character)) {
            depth += 1;
            removedBlock = true;
            continue;
        }

        if (CLOSING_PARENTHESES.has(character)) {
            if (depth > 0) depth -= 1;
            continue;
        }

        if (depth > 0) continue;

        if (removedBlock && output && !/\s/u.test(output.at(-1)) && !/[\s,.;:!?，。；：！？、…~～—-]/u.test(character)) {
            output += ' ';
        }
        removedBlock = false;
        output += character;
    }

    return output.replace(/[\t ]+/gu, ' ').trim();
}
