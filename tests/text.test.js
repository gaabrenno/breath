import {assert, assertEq} from './assert.js';
import {pctLabel, levelOf, shortLine, waybarJson, detailLines, tooltipFor, terminalReport, EMPTY_VIEW}
    from '../linux/text.js';

// Rodar com TZ=America/Sao_Paulo
const now = Date.parse('2026-11-25T17:32:00-03:00');
const reset = Date.parse('2026-11-25T20:00:00-03:00');
const weekReset = Date.parse('2026-11-30T09:00:00-03:00');

const rd = (pct, source = 'official', resetsAt = reset) => ({pct, resetsAt, source, ageMs: 0, deltaPct: 0});
const view = (s, w, extra = {}) => ({plan: 'max', session: s, weekly: w, weeklyOpus: null, weeklySonnet: null,
    fetchedAt: now - 60e3, ...extra});
const v4267 = view(rd(42), rd(67, 'official', weekReset));

export default {
    'pctLabel oficial': () => assertEq(pctLabel(rd(42.4)), '42%'),
    'pctLabel estimativa': () => assertEq(pctLabel(rd(42, 'estimate')), '~42%'),
    'pctLabel sem dados': () => assertEq(pctLabel(rd(null, 'none')), '–'),
    'levelOf ok': () => assertEq(levelOf(v4267), 'ok'),
    'levelOf warn': () => assertEq(levelOf(view(rd(80), rd(10))), 'warn'),
    'levelOf crit': () => assertEq(levelOf(view(rd(10), rd(95))), 'crit'),
    'levelOf estimativa': () => assertEq(levelOf(view(rd(10, 'estimate'), rd(20))), 'stale'),
    'levelOf vazio': () => assertEq(levelOf(EMPTY_VIEW), 'stale'),
    'shortLine': () => assertEq(shortLine(v4267), '5h 42% · sem 67%'),
    'waybar vazio é JSON válido': () => {
        const o = JSON.parse(waybarJson(EMPTY_VIEW, now));
        assertEq(o.text, '– · –');
        assertEq(o.class, 'stale');
        assertEq(o.percentage, 0);
    },
    'waybar 42/67': () => {
        const o = JSON.parse(waybarJson(v4267, now));
        assertEq(o.text, '42% · 67%');
        assertEq(o.class, 'ok');
        assertEq(o.percentage, 67);
        assert(o.tooltip.includes('Semanal'), 'tooltip com detalhes');
    },
    'detailLines reset e título': () => {
        const d = detailLines(v4267, now);
        assertEq(d.rows[0].reset, 'Reseta às 20:00 · em 2h 28min');
        assertEq(d.title, 'Limites do Claude · Plano Max');
        assertEq(d.rows.length, 2);
        assertEq(d.footer, 'Fonte: API /usage · atualizado há 1min');
    },
    'detailLines com Opus': () =>
        assertEq(detailLines(view(rd(1), rd(2), {weeklyOpus: rd(3)}), now).rows.length, 3),
    'detailLines vazio': () => assertEq(detailLines(EMPTY_VIEW, now).footer, 'Sem dados ainda'),
    'tooltip semanal': () => assertEq(tooltipFor('weekly', v4267, now).title, 'Semanal: 67%'),
    'tooltip sessão': () => assertEq(tooltipFor('session', v4267, now).title, 'Sessão de 5h: 42%'),
    'terminalReport tem linhas': () => {
        const t = terminalReport(v4267, now);
        assert(t.startsWith('Limites do Claude · Plano Max'), t);
        assert(t.includes('42%') && t.includes('Reseta às 20:00'), t);
    },
};
