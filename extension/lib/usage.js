/**
 * @typedef {{pct:number, resetsAt:number|null}} Window
 * @typedef {{session:Window, weekly:Window, weeklyOpus:Window|null, weeklySonnet:Window|null}} Usage
 */

const clamp = v => Math.min(100, Math.max(0, v));

function parseWindow(w) {
    if (w === null || w === undefined)
        return null;
    if (typeof w !== 'object' || typeof w.utilization !== 'number' || Number.isNaN(w.utilization))
        throw new Error('unexpected usage shape');
    const raw = w.resets_at ? Date.parse(w.resets_at) : NaN;
    // A API varia os sub-segundos a cada chamada: arredonda ao minuto para a
    // janela ter uma identidade estável (chave de notificação).
    const resetsAt = Number.isNaN(raw) ? null : Math.round(raw / 60e3) * 60e3;
    return {pct: clamp(w.utilization), resetsAt};
}

/**
 * @param {object} obj resposta JSON de /api/oauth/usage
 * @returns {Usage}
 */
export function parseUsage(obj) {
    if (!obj || typeof obj !== 'object' || !obj.seven_day)
        throw new Error('unexpected usage shape');
    return {
        session: parseWindow(obj.five_hour) ?? {pct: 0, resetsAt: null},
        weekly: parseWindow(obj.seven_day),
        weeklyOpus: parseWindow(obj.seven_day_opus),
        weeklySonnet: parseWindow(obj.seven_day_sonnet),
    };
}
