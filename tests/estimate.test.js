import {assertEq, assertClose} from './assert.js';
import {officialReadings, estimateReadings, SESSION_MS, WEEK_MS} from '../extension/lib/estimate.js';

const H = 3600e3;
const now = Date.parse('2026-11-25T20:00:00Z');
const official = (o = {}) => ({
    ts: now - 3 * H, plan: 'pro',
    usage: {
        session: {pct: 40, resetsAt: now + H},
        weekly: {pct: 61, resetsAt: now + 2 * 24 * H},
        weeklyOpus: null, weeklySonnet: null,
    },
    tokens5h: 1000, tokens7d: 1000, ...o,
});
const fakeCounter = (value) => {
    const calls = [];
    const fn = async (from, to) => { calls.push([from, to]); return value; };
    fn.calls = calls;
    return fn;
};

export default {
    'durações': () => { assertEq(SESSION_MS, 5 * H); assertEq(WEEK_MS, 7 * 24 * H); },
    'oficial': () => {
        const r = officialReadings(official({ts: now - 40e3}), now);
        assertEq(r.weekly, {pct: 61, resetsAt: now + 2 * 24 * H, source: 'official', ageMs: 40e3, deltaPct: 0});
        assertEq(r.session.source, 'official');
    },
    'sem oficial': async () => {
        const r = await estimateReadings(null, fakeCounter(0), now);
        assertEq(r.session, {pct: null, resetsAt: null, source: 'none', ageMs: 0, deltaPct: 0});
        assertEq(r.weekly.source, 'none');
    },
    'stale sem uso novo': async () => {
        const r = await estimateReadings(official(), fakeCounter(0), now);
        assertEq(r.weekly, {pct: 61, resetsAt: now + 2 * 24 * H, source: 'stale', ageMs: 3 * H, deltaPct: 0});
    },
    'acréscimo conta desde a leitura oficial': async () => {
        const c = fakeCounter(100);
        const r = await estimateReadings(official(), c, now);
        assertClose(r.weekly.pct, 67.1);
        assertClose(r.weekly.deltaPct, 6.1);
        assertEq(r.weekly.source, 'estimate');
        assertEq(c.calls[0], [now - 3 * H, now]);
    },
    'janela virou: base zera e conta desde o reset': async () => {
        const o = official();
        o.usage.session = {pct: 80, resetsAt: now - H};
        const c = fakeCounter(100);
        const r = await estimateReadings(o, c, now);
        assertClose(r.session.pct, 8); // 100 tokens × (80% / 1000 tokens)
        assertEq(r.session.resetsAt, now - H + 5 * H);
        assertEq(r.session.source, 'estimate');
        assert0(c.calls.find(([f]) => f === now - H));
    },
    'janela virou várias vezes rola até a atual': async () => {
        const o = official({ts: now - 20 * H});
        o.usage.session = {pct: 50, resetsAt: now - 11 * H};
        const r = await estimateReadings(o, fakeCounter(0), now);
        assertEq(r.session.resetsAt, now - 11 * H + 15 * H);
        assertEq(r.session.pct, 0);
    },
    'sem calibração': async () => {
        const r = await estimateReadings(official({tokens5h: 0}), fakeCounter(500), now);
        assertEq(r.session.deltaPct, 0);
        assertEq(r.session.source, 'stale');
        assertEq(r.session.pct, 40);
    },
    'usa taxas salvas (rate5h/rate7d) quando presentes': async () => {
        const o = official({tokens5h: 0, rate5h: 0.05});
        o.usage.session.pct = 0;
        const r = await estimateReadings(o, fakeCounter(200), now);
        assertClose(r.session.pct, 10);
        assertEq(r.session.source, 'estimate');
    },
    'limita a 100': async () => {
        const o = official();
        o.usage.weekly.pct = 95;
        const r = await estimateReadings(o, fakeCounter(200), now);
        assertEq(r.weekly.pct, 100);
    },
};

function assert0(v) {
    if (!v)
        throw new Error('countTokens não foi chamado a partir do reset');
}
