export const TOKEN_WEIGHTS = {input: 1, output: 1, cacheCreation: 1, cacheRead: 0.1};

const n = v => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

function weighted(u) {
    return n(u.input_tokens) * TOKEN_WEIGHTS.input +
        n(u.output_tokens) * TOKEN_WEIGHTS.output +
        n(u.cache_creation_input_tokens) * TOKEN_WEIGHTS.cacheCreation +
        n(u.cache_read_input_tokens) * TOKEN_WEIGHTS.cacheRead;
}

/**
 * Soma ponderada dos tokens das respostas em [fromMs, toMs).
 * O Claude Code grava várias linhas por resposta com o mesmo `usage`:
 * cada requestId (ou message.id) conta uma vez só, via `seen`.
 * @param {string} text conteúdo JSONL
 * @param {number} fromMs
 * @param {number} toMs
 * @param {Set<string>} seen
 * @returns {number}
 */
export function countTokensInText(text, fromMs, toMs, seen) {
    let total = 0;
    for (const raw of text.split('\n')) {
        if (!raw.includes('"usage"'))
            continue;
        let row;
        try {
            row = JSON.parse(raw);
        } catch {
            continue;
        }
        const usage = row?.message?.usage;
        if (!usage || typeof usage !== 'object')
            continue;
        const ts = Date.parse(row.timestamp);
        if (Number.isNaN(ts) || ts < fromMs || ts >= toMs)
            continue;
        const key = row.requestId ?? row.message.id;
        if (key) {
            if (seen.has(key))
                continue;
            seen.add(key);
        }
        total += weighted(usage);
    }
    return total;
}
