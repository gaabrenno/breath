import {SESSION_MS, WEEK_MS} from './estimate.js';

// Abaixo disso a janela é curta demais para a média ser confiável.
const MIN_ELAPSED = {[SESSION_MS]: 20 * 60e3, [WEEK_MS]: 6 * 3600e3};
// Tempo máximo sem crédito antes do reset que ainda conta como amarelo (~15% da janela).
const YELLOW_MAX_GAP = {[SESSION_MS]: 45 * 60e3, [WEEK_MS]: 24 * 3600e3};
const RANK = {blue: 0, yellow: 1, red: 2};

const WEEKDAYS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira',
    'quinta-feira', 'sexta-feira', 'sábado'];

const pad = n => String(n).padStart(2, '0');
const hhmm = ms => {
    const d = new Date(ms);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const dayIndex = d => Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400e3);

/**
 * @typedef {{level:'blue'|'yellow'|'red', exhaustAt:number|null, projectedPct:number}} Pace
 *   exhaustAt: quando o limite acaba (null se chega ao reset com crédito).
 */

/**
 * Avalia o ritmo médio desde o início da janela.
 * azul: chega ao reset com crédito; amarelo: fica sem crédito por até
 * YELLOW_MAX_GAP antes do reset; vermelho: mais que isso.
 * @param {import('./estimate.js').Reading} r
 * @param {number} durMs SESSION_MS ou WEEK_MS
 * @param {number} nowMs
 * @returns {Pace|null} null se não há dados suficientes
 */
export function assessPace(r, durMs, nowMs) {
    if (!r || r.source === 'none' || r.pct === null || r.resetsAt === null || r.pct <= 0)
        return null;
    // Valor oficial antigo vale para o momento em que foi lido.
    const measuredAt = r.source === 'estimate' ? nowMs : nowMs - r.ageMs;
    const elapsed = measuredAt - (r.resetsAt - durMs);
    const level = gap => (gap <= YELLOW_MAX_GAP[durMs] ? 'yellow' : 'red');
    if (r.pct >= 100)
        return {level: level(r.resetsAt - measuredAt), exhaustAt: measuredAt, projectedPct: r.pct};
    if (elapsed < MIN_ELAPSED[durMs])
        return null;
    const perMs = r.pct / elapsed;
    const projectedPct = r.pct + perMs * (r.resetsAt - measuredAt);
    if (projectedPct <= 100)
        return {level: 'blue', exhaustAt: null, projectedPct};
    const exhaustAt = Math.round(measuredAt + (100 - r.pct) / perMs);
    return {level: level(r.resetsAt - exhaustAt), exhaustAt, projectedPct};
}

function period(ms) {
    const h = new Date(ms).getHours();
    if (h < 6)
        return 'de madrugada';
    if (h < 12)
        return 'de manhã';
    if (h < 18)
        return 'à tarde';
    return 'à noite';
}

function relativeDay(ms, nowMs) {
    const diff = dayIndex(new Date(ms)) - dayIndex(new Date(nowMs));
    if (diff === 0)
        return 'hoje';
    if (diff === 1)
        return 'amanhã';
    return WEEKDAYS[new Date(ms).getDay()];
}

function message(kind, p, reading, nowMs) {
    const weekly = kind === 'weekly';
    const resetDay = relativeDay(reading.resetsAt, nowMs);
    if (reading.pct >= 100) {
        return {level: p.level, title: 'Limite atingido.',
            text: weekly ? `O limite semanal volta na redefinição de ${resetDay}.`
                : `A sessão de 5h volta às ${hhmm(reading.resetsAt)}.`};
    }
    if (p.level === 'blue') {
        const pct = Math.round(p.projectedPct);
        return {level: 'blue', title: null,
            text: weekly
                ? `No ritmo atual, você chega ao reset de ${resetDay} com cerca de ${pct}% do limite semanal.`
                : `No ritmo atual, você chega ao reset das ${hhmm(reading.resetsAt)} com cerca de ${pct}% da sessão de 5h.`};
    }
    const close = p.level === 'yellow' ? 'pouco antes' : 'antes';
    return {level: p.level, title: 'Atenção.',
        text: weekly
            ? `Nesse ritmo, você vai esgotar seu limite semanal ${relativeDay(p.exhaustAt, nowMs)} ` +
              `${period(p.exhaustAt)}, ${close} da redefinição de ${resetDay}.`
            : `Nesse ritmo, você vai esgotar a sessão de 5h por volta das ${hhmm(p.exhaustAt)}, ` +
              `${close} do reset das ${hhmm(reading.resetsAt)}.`};
}

function shortLine(kind, p, reading, nowMs) {
    const weekly = kind === 'weekly';
    const label = weekly ? 'Semanal' : 'Sessão 5h';
    const resetDay = relativeDay(reading.resetsAt, nowMs);
    let text;
    if (reading.pct >= 100) {
        text = weekly ? `limite atingido, volta ${resetDay}.` : `limite atingido, volta às ${hhmm(reading.resetsAt)}.`;
    } else if (p.level === 'blue') {
        const pct = Math.round(p.projectedPct);
        text = weekly ? `no ritmo, chega ao reset de ${resetDay} com ~${pct}%.`
            : `no ritmo, chega ao reset das ${hhmm(reading.resetsAt)} com ~${pct}%.`;
    } else {
        const close = p.level === 'yellow' ? 'pouco antes' : 'antes';
        text = weekly
            ? `esgota ${relativeDay(p.exhaustAt, nowMs)} ${period(p.exhaustAt)}, ${close} da redefinição de ${resetDay}.`
            : `esgota por volta das ${hhmm(p.exhaustAt)}, ${close} do reset das ${hhmm(reading.resetsAt)}.`;
    }
    return {level: p.level, text: `${label}: ${text}`};
}

/**
 * Aviso de ritmo para o painel. Mostra o limite mais grave; empate: o que
 * acaba primeiro; ambos azuis: a maior projeção.
 * @param {{session:import('./estimate.js').Reading, weekly:import('./estimate.js').Reading}} readings
 * @param {number} nowMs
 * `secondary` é a linha curta do outro limite (null se ele não tem avaliação).
 * @returns {{level:'blue'|'yellow'|'red', title:string|null, text:string,
 *            secondary:{level:'blue'|'yellow'|'red', text:string}|null}|null}
 */
export function paceWarning(readings, nowMs) {
    const cands = [['session', SESSION_MS], ['weekly', WEEK_MS]]
        .map(([kind, dur]) => ({kind, p: assessPace(readings[kind], dur, nowMs)}))
        .filter(c => c.p !== null);
    if (!cands.length)
        return null;
    cands.sort((a, b) =>
        RANK[b.p.level] - RANK[a.p.level] ||
        (a.p.exhaustAt ?? Infinity) - (b.p.exhaustAt ?? Infinity) ||
        b.p.projectedPct - a.p.projectedPct);
    const {kind, p} = cands[0];
    const other = cands[1];
    return {
        ...message(kind, p, readings[kind], nowMs),
        secondary: other ? shortLine(other.kind, other.p, readings[other.kind], nowMs) : null,
    };
}
