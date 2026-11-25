import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {assertEq, assert, assertClose} from './assert.js';
import {Controller} from '../extension/lib/controller.js';
import {ApiError} from '../extension/lib/api.js';

const dir = GLib.path_get_dirname(GLib.filename_from_uri(import.meta.url)[0]);
const [, bytes] = Gio.File.new_for_path(`${dir}/fixtures/usage-pro.json`).load_contents(null);
const usageJson = () => JSON.parse(new TextDecoder().decode(bytes));

const TOKEN = 'sk-ant-oat-SECRET-123';
const NOW = Date.parse('2026-11-25T20:00:00Z');

const structuredClone = o => JSON.parse(JSON.stringify(o));

class MemStore {
    constructor(state = {official: null, notified: []}) { this.state = state; this.saves = 0; }
    async load() { return structuredClone(this.state); }
    async save(s) { this.state = structuredClone(s); this.saves++; }
}

function make(over = {}) {
    const calls = {fetch: 0, updates: [], notes: []};
    const deps = {
        readCredentialsText: async () => JSON.stringify({claudeAiOauth: {accessToken: TOKEN, expiresAt: NOW + 3600e3, subscriptionType: 'pro'}}),
        fetchUsage: async (tok) => { calls.fetch++; assertEq(tok, TOKEN); return usageJson(); },
        countTokens: async () => 1000,
        store: new MemStore(),
        now: () => NOW,
        onUpdate: v => calls.updates.push(v),
        onNotify: (t, b) => calls.notes.push([t, b]),
        ...over,
    };
    return {c: new Controller(deps), calls, deps};
}

export default {
    'sucesso usa valor oficial e salva calibração': async () => {
        const {c, calls, deps} = make();
        await c.refresh();
        const v = calls.updates.at(-1);
        assertEq(v.session.source, 'official');
        assertEq(v.weekly.pct, 61);
        assertEq(v.plan, 'pro');
        assertEq(v.fetchedAt, NOW);
        assertEq(v.weeklyOpus, null);
        assertEq(deps.store.state.official.tokens7d, 1000);
        assertEq(deps.store.state.official.ts, NOW);
        assertEq(c.nextIntervalSec, 120);
    },
    'janela de calibração vai de resetsAt − duração até agora': async () => {
        const seen = [];
        const {c} = make({countTokens: async (f, t) => { seen.push([f, t]); return 1; }});
        await c.refresh();
        const wk = Date.parse('2026-11-30T04:00:00Z') - 7 * 24 * 3600e3;
        assert(seen.some(([f, t]) => f === wk && t === NOW), 'janela semanal');
    },
    'sem token não chama a API e usa estimativa': async () => {
        const store = new MemStore({official: {ts: NOW - 3600e3, plan: 'pro', usage: {session: {pct: 10, resetsAt: NOW + 3600e3}, weekly: {pct: 50, resetsAt: NOW + 86400e3}, weeklyOpus: null, weeklySonnet: null}, tokens5h: 1000, tokens7d: 1000}, notified: []});
        const {c, calls} = make({
            readCredentialsText: async () => JSON.stringify({claudeAiOauth: {accessToken: TOKEN, expiresAt: NOW - 1}}),
            countTokens: async () => 100, store,
        });
        await c.refresh();
        assertEq(calls.fetch, 0);
        const v = calls.updates.at(-1);
        assertEq(v.weekly.source, 'estimate');
        assertClose(v.weekly.pct, 55);
        assertEq(v.fetchedAt, NOW - 3600e3);
    },
    'credenciais ilegíveis caem no fallback sem exceção': async () => {
        const {c, calls} = make({readCredentialsText: async () => { throw new Error('ENOENT'); }});
        await c.refresh();
        assertEq(calls.updates.at(-1).session.source, 'none');
    },
    '401 cai no fallback e não mexe no intervalo': async () => {
        const {c, calls} = make({fetchUsage: async () => { throw new ApiError(401); }});
        await c.refresh();
        assertEq(calls.updates.at(-1).session.source, 'none');
        assertEq(c.nextIntervalSec, 120);
    },
    'formato inesperado cai no fallback': async () => {
        const {c, calls} = make({fetchUsage: async () => ({foo: 1})});
        await c.refresh();
        assertEq(calls.updates.at(-1).session.source, 'none');
    },
    '429 dobra o intervalo até 600 e volta a 120': async () => {
        let fail = true;
        const {c} = make({fetchUsage: async () => { if (fail) throw new ApiError(429); return usageJson(); }});
        const seq = [];
        for (let i = 0; i < 4; i++) { await c.refresh(); seq.push(c.nextIntervalSec); }
        assertEq(seq, [240, 480, 600, 600]);
        fail = false;
        await c.refresh();
        assertEq(c.nextIntervalSec, 120);
    },
    'notificação dispara uma vez e é persistida': async () => {
        const u = usageJson();
        u.seven_day.utilization = 91;
        const {c, calls, deps} = make({fetchUsage: async () => structuredClone(u)});
        await c.refresh();
        await c.refresh();
        assertEq(calls.notes, [['Claude: 90% do limite', 'Semanal em 91%']]);
        assertEq(deps.store.state.notified.length, 1);
        const c2 = new Controller({...deps, onNotify: (t, b) => calls.notes.push([t, b])});
        await c2.refresh();
        assertEq(calls.notes.length, 1);
    },
    'notificação não repete quando resets_at varia nos sub-segundos': async () => {
        let i = 0;
        const {c, calls} = make({fetchUsage: async () => {
            const u = usageJson();
            u.seven_day.utilization = 91;
            u.seven_day.resets_at = ['2026-11-30T04:00:00.394486+00:00', '2026-11-30T03:59:59.652000+00:00'][i++ % 2];
            return u;
        }});
        await c.refresh();
        await c.refresh();
        assertEq(calls.notes.length, 1);
    },
    'calibração anterior sobrevive a leitura com 0%': async () => {
        let mode = 'ok';
        const {c, calls} = make({
            fetchUsage: async () => {
                const u = usageJson();
                u.five_hour.utilization = 50;
                if (mode === 'zero')
                    u.five_hour = null;
                return u;
            },
            readCredentialsText: async () => mode === 'expired' ? '{}'
                : JSON.stringify({claudeAiOauth: {accessToken: TOKEN, expiresAt: NOW + 3600e3, subscriptionType: 'pro'}}),
            countTokens: async () => 1000,
        });
        await c.refresh();           // calibra: 50% / 1000 tokens
        mode = 'zero';
        await c.refresh();           // sem sessão ativa: pct 0
        mode = 'expired';
        await c.refresh();           // fallback: 1000 tokens novos → ~50%
        const v = calls.updates.at(-1);
        assertEq(v.session.source, 'estimate');
        assertClose(v.session.pct, 50);
    },
    'texto de notificação da estimativa': async () => {
        const store = new MemStore({official: {ts: NOW - 3600e3, plan: 'pro', usage: {session: {pct: 85, resetsAt: NOW + 3600e3}, weekly: {pct: 10, resetsAt: NOW + 86400e3}, weeklyOpus: null, weeklySonnet: null}, tokens5h: 1000, tokens7d: 1000}, notified: []});
        const {c, calls} = make({readCredentialsText: async () => '{}', countTokens: async () => 70, store}); // 85 + 70×0.085 = 90.95 → 91
        await c.refresh();
        assertEq(calls.notes, [['Claude: 90% do limite', 'Sessão de 5h em 91% (estimativa)']]);
    },
    'refresh concorrente reaproveita a mesma execução': async () => {
        const {c, calls} = make();
        await Promise.all([c.refresh(), c.refresh()]);
        assertEq(calls.fetch, 1);
    },
    'token nunca aparece em logs': async () => {
        const out = [];
        const log = m => out.push(String(m));
        await make({log, fetchUsage: async () => { throw new Error('network down'); }}).c.refresh();
        await make({log, fetchUsage: async () => { throw new ApiError(500); }}).c.refresh();
        await make({log, store: {load: async () => ({official: null, notified: []}), save: async () => { throw new Error('disk full'); }}}).c.refresh();
        await make({log}).c.refresh();
        assert(out.length >= 3, 'esperava mensagens de log nos caminhos de erro');
        assert(!out.join('\n').includes(TOKEN), 'token vazou em log');
    },
};
