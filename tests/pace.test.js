import {assertEq} from './assert.js';
import {assessPace, paceWarning} from '../extension/lib/pace.js';

// Rodar com TZ=America/Sao_Paulo. 25/11/2026 é quarta-feira.
const H = 3600e3;
const now = Date.parse('2026-11-25T16:00:00-03:00');
const R = (pct, resetsAt, o = {}) => ({pct, resetsAt, source: 'official', ageMs: 0, deltaPct: 0, ...o});
const WEEK = 7 * 24 * H, SESSION = 5 * H;
// Semana: início seg 23/11 01:00, reset seg 30/11 01:00 → 63h decorridas, 105h restantes.
const WRESET = Date.parse('2026-11-30T01:00:00-03:00');
// Sessão: início 15:00, reset 20:00 → 1h decorrida.
const SRESET = Date.parse('2026-11-25T20:00:00-03:00');
const level = (pct, reset, dur) => assessPace(R(pct, reset), dur, now)?.level ?? null;
const full = (s, w) => paceWarning({session: s, weekly: w}, now);
const pw = (s, w) => {
    const r = full(s, w);
    if (!r)
        return r;
    const {secondary, ...main} = r;
    return main;
};

export default {
    'azul: chega ao reset com crédito': () => {
        const a = assessPace(R(30, WRESET), WEEK, now);
        assertEq(a.level, 'blue');
        assertEq(Math.round(a.projectedPct), 80);
        assertEq(a.exhaustAt, null);
    },
    'azul: chega com ~99%': () => assertEq(level(37, WRESET, WEEK), 'blue'),
    'amarelo: semana esgota até 1 dia antes': () => {
        assertEq(level(42, WRESET, WEEK), 'yellow');     // esgota dom 07:00, 18h antes
        assertEq(level(43.75, WRESET, WEEK), 'yellow');  // exatamente 24h antes
    },
    'vermelho: semana esgota mais de 1 dia antes': () => {
        assertEq(level(44, WRESET, WEEK), 'red');        // ~24.8h antes
        assertEq(level(63, WRESET, WEEK), 'red');        // sex 05:00, 68h antes
    },
    'sessão: amarelo até 45 min, vermelho acima': () => {
        assertEq(level(15, SRESET, SESSION), 'blue');    // projeta 75%
        assertEq(level(22, SRESET, SESSION), 'yellow');  // esgota ~19:32, 27 min antes
        assertEq(level(25, SRESET, SESSION), 'red');     // esgota 19:00, 60 min antes
    },
    'sem avaliação com pouco tempo de janela (ruído)': () => {
        assertEq(assessPace(R(30, now - 5 * H + WEEK), WEEK, now), null);
        assertEq(assessPace(R(30, now - 0.25 * H + SESSION), SESSION, now), null);
    },
    'sem avaliação sem dados, sem reset ou 0%': () => {
        assertEq(assessPace(R(null, now + H, {source: 'none'}), WEEK, now), null);
        assertEq(assessPace(R(50, null), WEEK, now), null);
        assertEq(assessPace(R(0, SRESET), SESSION, now), null);
    },
    'valor oficial antigo projeta a partir do momento da leitura': () => {
        const readAt = now - 10 * H;
        const reset = readAt - 50 * H + WEEK;
        const a = assessPace(R(50, reset, {source: 'stale', ageMs: 10 * H}), WEEK, now);
        assertEq(a.exhaustAt, readAt + 50 * H);
    },
    'texto vermelho semanal': () => assertEq(pw(R(5, SRESET), R(63, WRESET)), {
        level: 'red', title: 'Atenção.',
        text: 'Nesse ritmo, você vai esgotar seu limite semanal sexta-feira de madrugada, antes da redefinição de segunda-feira.',
    }),
    'texto amarelo semanal': () => assertEq(pw(R(5, SRESET), R(42, WRESET)), {
        level: 'yellow', title: 'Atenção.',
        text: 'Nesse ritmo, você vai esgotar seu limite semanal domingo de manhã, pouco antes da redefinição de segunda-feira.',
    }),
    'texto azul semanal': () => assertEq(pw(R(2, SRESET), R(30, WRESET)), {
        level: 'blue', title: null,
        text: 'No ritmo atual, você chega ao reset de segunda-feira com cerca de 80% do limite semanal.',
    }),
    'textos da sessão': () => {
        assertEq(pw(R(60, SRESET), R(10, WRESET)).text,
            'Nesse ritmo, você vai esgotar a sessão de 5h por volta das 16:40, antes do reset das 20:00.');
        assertEq(pw(R(22, SRESET), R(10, WRESET)).text,
            'Nesse ritmo, você vai esgotar a sessão de 5h por volta das 19:32, pouco antes do reset das 20:00.');
    },
    'hoje e amanhã nos períodos': () => {
        assertEq(pw(R(2, SRESET), R(80, WRESET)).text.includes('amanhã de manhã'), true);
        assertEq(pw(R(2, SRESET), R(95, WRESET)).text.includes('hoje à noite'), true);
    },
    'limite já atingido': () => {
        assertEq(pw(R(5, SRESET), R(100, WRESET)), {level: 'red', title: 'Limite atingido.',
            text: 'O limite semanal volta na redefinição de segunda-feira.'});
        assertEq(pw(R(100, SRESET), R(10, WRESET)), {level: 'red', title: 'Limite atingido.',
            text: 'A sessão de 5h volta às 20:00.'});
    },
    'prioridade: cor mais grave vence': () =>
        assertEq(pw(R(22, SRESET), R(63, WRESET)).text.includes('limite semanal'), true),
    'prioridade: mesma cor, o que acaba primeiro': () =>
        assertEq(pw(R(60, SRESET), R(63, WRESET)).text.includes('sessão de 5h'), true),
    'prioridade: ambos azuis, maior projeção': () =>
        assertEq(pw(R(15, SRESET), R(30, WRESET)).text.includes('limite semanal'), true),
    'linha secundária: sessão azul sob semanal vermelho': () =>
        assertEq(full(R(15, SRESET), R(63, WRESET)).secondary,
            {level: 'blue', text: 'Sessão 5h: no ritmo, chega ao reset das 20:00 com ~75%.'}),
    'linha secundária: semanal vermelho sob sessão vermelha': () =>
        assertEq(full(R(60, SRESET), R(63, WRESET)).secondary,
            {level: 'red', text: 'Semanal: esgota sexta-feira de madrugada, antes da redefinição de segunda-feira.'}),
    'linha secundária: sessão amarela': () =>
        assertEq(full(R(22, SRESET), R(63, WRESET)).secondary,
            {level: 'yellow', text: 'Sessão 5h: esgota por volta das 19:32, pouco antes do reset das 20:00.'}),
    'linha secundária: semanal azul': () =>
        assertEq(full(R(60, SRESET), R(30, WRESET)).secondary,
            {level: 'blue', text: 'Semanal: no ritmo, chega ao reset de segunda-feira com ~80%.'}),
    'linha secundária: limite atingido': () => {
        assertEq(full(R(100, SRESET), R(63, WRESET)).secondary.text, 'Semanal: esgota sexta-feira de madrugada, antes da redefinição de segunda-feira.');
        assertEq(full(R(5, SRESET), R(100, WRESET)).secondary,
            {level: 'blue', text: 'Sessão 5h: no ritmo, chega ao reset das 20:00 com ~25%.'});
        assertEq(full(R(100, SRESET), R(100, WRESET)).secondary,
            {level: 'red', text: 'Semanal: limite atingido, volta segunda-feira.'});
    },
    'sem linha secundária quando o outro não tem avaliação': () =>
        assertEq(full(R(0, SRESET), R(63, WRESET)).secondary, null),
    'sem avaliação nenhuma': () => assertEq(pw(R(0, SRESET), R(30, now - 2 * H + WEEK)), null),
};
