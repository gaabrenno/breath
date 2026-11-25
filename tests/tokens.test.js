import {assertEq} from './assert.js';
import {countTokensInText, TOKEN_WEIGHTS} from '../extension/lib/tokens.js';

const line = (o) => JSON.stringify({
    timestamp: '2026-11-25T18:00:00Z', requestId: 'r1',
    message: {id: 'm1', usage: {input_tokens: 10, output_tokens: 20, cache_creation_input_tokens: 100, cache_read_input_tokens: 1000}},
    ...o,
});
const from = Date.parse('2026-11-25T17:00:00Z'), to = Date.parse('2026-11-25T19:00:00Z');

export default {
    'pesos': () => assertEq(TOKEN_WEIGHTS, {input: 1, output: 1, cacheCreation: 1, cacheRead: 0.1}),
    'pondera tokens': () => assertEq(countTokensInText(line(), from, to, new Set()), 230),
    'dedup mesmo requestId': () => assertEq(countTokensInText(`${line()}\n${line()}\n`, from, to, new Set()), 230),
    'dedup por message.id sem requestId': () =>
        assertEq(countTokensInText(`${line({requestId: undefined})}\n${line({requestId: undefined})}`, from, to, new Set()), 230),
    'seen compartilhado entre chamadas': () => {
        const seen = new Set();
        countTokensInText(line(), from, to, seen);
        assertEq(countTokensInText(line(), from, to, seen), 0);
    },
    'fora da janela': () => {
        assertEq(countTokensInText(line({timestamp: '2026-11-25T16:59:59Z'}), from, to, new Set()), 0);
        assertEq(countTokensInText(line({timestamp: '2026-11-25T19:00:00Z'}), from, to, new Set()), 0);
    },
    'linha lixo e sem usage são ignoradas': () =>
        assertEq(countTokensInText('lixo\n{"type":"user"}\n\n' + line(), from, to, new Set()), 230),
    'campos de usage ausentes contam 0': () =>
        assertEq(countTokensInText(line({message: {id: 'x', usage: {output_tokens: 7}}, requestId: 'q'}), from, to, new Set()), 7),
};
