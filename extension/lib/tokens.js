export const TOKEN_WEIGHTS = {input: 1, output: 1, cacheCreation: 1, cacheRead: 0.1};

const n = v => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

function weighted(u) {
    return n(u.input_tokens) * TOKEN_WEIGHTS.input +
        n(u.output_tokens) * TOKEN_WEIGHTS.output +
        n(u.cache_creation_input_tokens) * TOKEN_WEIGHTS.cacheCreation +
        n(u.cache_read_input_tokens) * TOKEN_WEIGHTS.cacheRead;
}

/**
 * Extrai registros {ts, key, weight} das linhas JSONL com `message.usage`.
 * @param {string} text
 * @returns {{ts:number, key:string|null, weight:number}[]}
 */
export function parseRecords(text) {
    const out = [];
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
        if (Number.isNaN(ts))
            continue;
        out.push({ts, key: row.requestId ?? row.message.id ?? null, weight: weighted(usage)});
    }
    return out;
}

/**
 * Soma registros em [fromMs, toMs), contando cada chave uma vez (via `seen`).
 * @param {{ts:number, key:string|null, weight:number}[]} records
 */
export function sumRecords(records, fromMs, toMs, seen) {
    let total = 0;
    for (const r of records) {
        if (r.ts < fromMs || r.ts >= toMs)
            continue;
        if (r.key) {
            if (seen.has(r.key))
                continue;
            seen.add(r.key);
        }
        total += r.weight;
    }
    return total;
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
    return sumRecords(parseRecords(text), fromMs, toMs, seen);
}
