/**
 * @typedef {import('./usage.js').Usage} Usage
 * @typedef {{ts:number, plan:string|null, usage:Usage, tokens5h:number, tokens7d:number}} Official
 * @typedef {{pct:number|null, resetsAt:number|null,
 *            source:'official'|'stale'|'estimate'|'none',
 *            ageMs:number, deltaPct:number}} Reading
 * @typedef {{official:Official|null, notified:string[]}} State
 */

export const SESSION_MS = 5 * 3600e3;
export const WEEK_MS = 7 * 24 * 3600e3;

const WINDOWS = [
    ['session', SESSION_MS, 'tokens5h'],
    ['weekly', WEEK_MS, 'tokens7d'],
];

const NONE = {pct: null, resetsAt: null, source: 'none', ageMs: 0, deltaPct: 0};

/**
 * @param {Official} official
 * @param {number} nowMs
 * @returns {{session:Reading, weekly:Reading}}
 */
export function officialReadings(official, nowMs) {
    const out = {};
    for (const [kind] of WINDOWS) {
        const w = official.usage[kind];
        out[kind] = {pct: w.pct, resetsAt: w.resetsAt, source: 'official', ageMs: nowMs - official.ts, deltaPct: 0};
    }
    return out;
}

/**
 * Último valor oficial + acréscimo estimado pelos logs do Claude Code.
 * @param {Official|null} official
 * @param {(fromMs:number, toMs:number) => Promise<number>} countTokens
 * @param {number} nowMs
 * @returns {Promise<{session:Reading, weekly:Reading}>}
 */
export async function estimateReadings(official, countTokens, nowMs) {
    if (!official)
        return {session: {...NONE}, weekly: {...NONE}};
    const out = {};
    for (const [kind, dur, tokKey] of WINDOWS) {
        const w = official.usage[kind];
        const calTokens = official[tokKey];
        const rate = calTokens > 0 ? w.pct / calTokens : null;

        let base = w.pct, since = official.ts, resetsAt = w.resetsAt;
        if (resetsAt !== null && nowMs >= resetsAt) {
            // A janela virou desde a leitura oficial: avança até a janela atual.
            while (nowMs >= resetsAt)
                resetsAt += dur;
            base = 0;
            since = resetsAt - dur;
        }
        const delta = rate ? (await countTokens(since, nowMs)) * rate : 0;
        out[kind] = {
            pct: Math.min(100, base + delta),
            resetsAt,
            source: delta > 0 ? 'estimate' : 'stale',
            ageMs: nowMs - official.ts,
            deltaPct: delta,
        };
    }
    return out;
}
