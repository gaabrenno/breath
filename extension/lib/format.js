const DAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const pad = n => String(n).padStart(2, '0');
const hhmm = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

function formatDuration(ms) {
    const min = Math.max(0, Math.round(ms / 60e3));
    const d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), m = min % 60;
    if (d > 0)
        return `${d}d ${h}h`;
    if (h > 0)
        return `${h}h ${m}min`;
    return `${m}min`;
}

/**
 * @param {number|null} resetsAtMs
 * @param {number} nowMs
 */
export function formatReset(resetsAtMs, nowMs) {
    if (resetsAtMs === null || resetsAtMs === undefined)
        return 'Sem sessão ativa';
    const r = new Date(resetsAtMs), n = new Date(nowMs);
    const sameDay = r.toDateString() === n.toDateString();
    const when = sameDay
        ? `às ${hhmm(r)}`
        : `${DAYS[r.getDay()]} ${r.getDate()} ${MONTHS[r.getMonth()]}, ${hhmm(r)}`;
    return `Reseta ${when} · em ${formatDuration(resetsAtMs - nowMs)}`;
}

/** @param {number} ageMs */
export function formatAge(ageMs) {
    const s = Math.max(0, Math.round(ageMs / 1000));
    if (s < 60)
        return `há ${s}s`;
    if (s < 3600)
        return `há ${Math.floor(s / 60)}min`;
    if (s < 86400)
        return `há ${Math.floor(s / 3600)}h`;
    return `há ${Math.floor(s / 86400)}d`;
}
