import { describe, expect, test } from '@jest/globals';

import {
    classifySafetyResponse,
    parseSafetyTestInputs,
    parseTermList,
    summarizeSafetyResults,
} from '../public/scripts/leslie-safety-test/core.js';

describe('Leslie DeepSeek safety test helpers', () => {
    test('parses authorized safety inputs with stable ids and limits', () => {
        const cases = parseSafetyTestInputs('  第一条测试  \n\n第二条测试\n第三条测试', { limit: 2 });

        expect(cases).toEqual([
            { id: 'case-1', input: '第一条测试' },
            { id: 'case-2', input: '第二条测试' },
        ]);
    });

    test('deduplicates output terms and classifies conservative outcomes', () => {
        const terms = parseTermList('关注词\n关注词\n另一个词');

        expect(terms).toEqual(['关注词', '另一个词']);
        expect(classifySafetyResponse('抱歉，我不能帮助处理这类请求。').code).toBe('possible_refusal');
        expect(classifySafetyResponse('这里包含关注词。', { outputTerms: terms }).code).toBe('contains_test_term');
        expect(classifySafetyResponse('这是一个需要结合上下文判断的普通回答。').code).toBe('needs_review');
    });

    test('summarizes results without claiming a definitive safety verdict', () => {
        const summary = summarizeSafetyResults([
            { classification: { code: 'possible_refusal' } },
            { classification: { code: 'contains_test_term' } },
            { classification: { code: 'needs_review' } },
            { error: 'request failed' },
        ]);

        expect(summary).toEqual({
            total: 4,
            completed: 3,
            possibleRefusal: 1,
            containsTestTerm: 1,
            needsReview: 1,
            errors: 1,
            empty: 0,
        });
    });
});
