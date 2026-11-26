// Textos da bandeja e do comando `breath`, a partir de uma View do Controller.
// Puro: sem gi://, para ser testado e reaproveitado.
import {formatReset, formatAge} from '../extension/lib/format.js';
import {paceWarning} from '../extension/lib/pace.js';

const WARN = 75, CRIT = 90;

const none = () => ({pct: null, resetsAt: null, source: 'none', ageMs: 0, deltaPct: 0});
/** View sem dados (sem credenciais e sem cache). */
export const EMPTY_VIEW = Object.freeze({plan: null, session: none(), weekly: none(),
    weeklyOpus: null, weeklySonnet: null, fetchedAt: null});

const cap = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
const hasData = r => r && r.source !== 'none' && r.pct !== null && r.pct !== undefined;

/** @param {import('../extension/lib/estimate.js').Reading} r */
export function pctLabel(r) {
    if (!hasData(r))
        return '–';
    return `${r.source === 'estimate' ? '~' : ''}${Math.round(r.pct)}%`;
}

/**
 * Nível para a waybar, pelo pior anel. warn/crit valem mesmo na estimativa;
 * abaixo disso, qualquer anel estimado, antigo ou sem dados dá `stale`.
 * @returns {'ok'|'warn'|'crit'|'stale'}
 */
export function levelOf(view) {
    const rs = [view.session, view.weekly];
    const worst = Math.max(...rs.map(r => (hasData(r) ? r.pct : 0)));
    if (worst >= CRIT)
        return 'crit';
    if (worst >= WARN)
        return 'warn';
    return rs.every(r => hasData(r) && r.source === 'official') ? 'ok' : 'stale';
}

export function shortLine(view) {
    return `5h ${pctLabel(view.session)} · sem ${pctLabel(view.weekly)}`;
}

function footer(view, nowMs) {
    const s = view.session.source;
    if (s === 'none' || view.fetchedAt === null || view.fetchedAt === undefined)
        return 'Sem dados ainda';
    const age = formatAge(nowMs - view.fetchedAt);
    if (s === 'official')
        return `Fonte: API /usage · atualizado ${age}`;
    const delta = Math.round(Math.max(view.session.deltaPct ?? 0, view.weekly.deltaPct ?? 0));
    return delta > 0 ? `Oficial ${age} · +~${delta}% estimado pelos logs` : `Oficial ${age}`;
}

/** Mesmo conteúdo do painel da extensão (ui/popup.js), em texto. */
export function detailLines(view, nowMs) {
    const pace = paceWarning(view, nowMs);
    const row = (label, r) => ({label, pct: pctLabel(r), reset: formatReset(r.resetsAt, nowMs)});
    const rows = [row('Sessão (janela de 5h)', view.session), row('Semanal (todos os modelos)', view.weekly)];
    if (view.weeklyOpus)
        rows.push(row('Semanal (Opus)', view.weeklyOpus));
    if (view.weeklySonnet)
        rows.push(row('Semanal (Sonnet)', view.weeklySonnet));
    return {
        title: view.plan ? `Limites do Claude · Plano ${cap(view.plan)}` : 'Limites do Claude',
        warning: pace ? (pace.title ? `${pace.title} ${pace.text}` : pace.text) : null,
        secondary: pace?.secondary?.text ?? null,
        rows,
        footer: footer(view, nowMs),
    };
}

function body(d) {
    const width = Math.max(...d.rows.map(r => r.label.length));
    const lines = [];
    if (d.warning)
        lines.push(`⚠ ${d.warning}`);
    if (d.secondary)
        lines.push(`• ${d.secondary}`);
    for (const r of d.rows)
        lines.push(`${r.label.padEnd(width)}  ${r.pct.padStart(4)}  ${r.reset}`);
    lines.push(d.footer);
    return lines.join('\n');
}

export function terminalReport(view, nowMs) {
    const d = detailLines(view, nowMs);
    return `${d.title}\n${body(d)}`;
}

export function waybarJson(view, nowMs) {
    const pcts = [view.session, view.weekly].filter(hasData).map(r => Math.round(r.pct));
    return JSON.stringify({
        text: `${pctLabel(view.session)} · ${pctLabel(view.weekly)}`,
        tooltip: terminalReport(view, nowMs),
        class: levelOf(view),
        percentage: pcts.length ? Math.max(...pcts) : 0,
    });
}

/** @param {'session'|'weekly'} kind */
export function tooltipFor(kind, view, nowMs) {
    const title = kind === 'session'
        ? `Sessão de 5h: ${pctLabel(view.session)}`
        : `Semanal: ${pctLabel(view.weekly)}`;
    return {title, body: body(detailLines(view, nowMs))};
}
