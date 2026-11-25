export const NOTIFY_THRESHOLD = 90;

/**
 * Notificações a disparar: uma por (janela, resetsAt, fonte).
 * `stale` conta como oficial (é um valor oficial antigo).
 * @param {{session:import('./estimate.js').Reading, weekly:import('./estimate.js').Reading}} readings
 * @param {string[]} notified chaves já notificadas
 * @returns {{key:string, kind:'session'|'weekly', reading:import('./estimate.js').Reading}[]}
 */
export function notificationsFor(readings, notified) {
    const out = [];
    for (const kind of ['session', 'weekly']) {
        const r = readings[kind];
        if (!r || r.source === 'none' || r.pct === null || r.pct < NOTIFY_THRESHOLD)
            continue;
        const src = r.source === 'estimate' ? 'estimate' : 'official';
        const key = `${kind}:${r.resetsAt}:${src}`;
        if (!notified.includes(key))
            out.push({key, kind, reading: r});
    }
    return out;
}
