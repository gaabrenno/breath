import {ApiError} from './api.js';
import {parseCredentials} from './credentials.js';
import {parseUsage} from './usage.js';
import {officialReadings, estimateReadings, rateOf, SESSION_MS, WEEK_MS} from './estimate.js';
import {notificationsFor} from './notify.js';

export const BASE_INTERVAL_SEC = 120;
export const MAX_INTERVAL_SEC = 600;

const NOTIFY_TITLE = 'Claude: 90% do limite';
const LABELS = {session: 'Sessão de 5h', weekly: 'Semanal'};

/**
 * Ciclo de atualização: API oficial → fallback (último oficial + logs).
 * Todas as dependências são injetadas para permitir testes fora do Shell.
 */
export class Controller {
    constructor({readCredentialsText, fetchUsage, countTokens, store, now, onUpdate, onNotify,
        log = m => console.warn(m)}) {
        Object.assign(this, {_readCreds: readCredentialsText, _fetch: fetchUsage, _count: countTokens,
            _store: store, _now: now, _onUpdate: onUpdate, _onNotify: onNotify, _log: log});
        this._interval = BASE_INTERVAL_SEC;
        this._state = null;
        this._running = null;
    }

    get nextIntervalSec() {
        return this._interval;
    }

    refresh() {
        this._running ??= this._refresh().finally(() => {
            this._running = null;
        });
        return this._running;
    }

    async _safeCount(from, to) {
        try {
            return await this._count(from, to);
        } catch {
            return 0;
        }
    }

    async _tryOfficial(now, prev) {
        let creds = null;
        try {
            creds = parseCredentials(await this._readCreds(), now);
        } catch {}
        if (!creds)
            return null;
        try {
            const usage = parseUsage(await this._fetch(creds.token));
            const start = (w, dur) => (w.resetsAt !== null ? w.resetsAt - dur : now - dur);
            const tokens5h = await this._safeCount(start(usage.session, SESSION_MS), now);
            const tokens7d = await this._safeCount(start(usage.weekly, WEEK_MS), now);
            this._interval = BASE_INTERVAL_SEC;
            // Mantém a última calibração válida: uma leitura com 0% ou sem tokens não a apaga.
            const prevRate = k => (typeof prev?.[k] === 'number' ? prev[k] : rateOf(
                k === 'rate5h' ? prev?.usage.session.pct : prev?.usage.weekly.pct,
                k === 'rate5h' ? prev?.tokens5h : prev?.tokens7d));
            return {ts: now, plan: creds.plan, usage, tokens5h, tokens7d,
                rate5h: rateOf(usage.session.pct, tokens5h) ?? prevRate('rate5h'),
                rate7d: rateOf(usage.weekly.pct, tokens7d) ?? prevRate('rate7d')};
        } catch (e) {
            if (e instanceof ApiError && e.status === 429)
                this._interval = Math.min(MAX_INTERVAL_SEC, this._interval * 2);
            this._log(`claude-limits: API indisponível (${e instanceof ApiError ? e.message : e.name})`);
            return null;
        }
    }

    async _refresh() {
        const now = this._now();
        this._state ??= await this._store.load();
        const state = this._state;

        const fresh = await this._tryOfficial(now, state.official);
        let readings;
        if (fresh) {
            state.official = fresh;
            readings = officialReadings(fresh, now);
        } else {
            readings = await estimateReadings(state.official, (f, t) => this._safeCount(f, t), now);
        }

        for (const n of notificationsFor(readings, state.notified)) {
            const suffix = n.reading.source === 'estimate' ? ' (estimativa)' : '';
            this._onNotify(NOTIFY_TITLE, `${LABELS[n.kind]} em ${Math.round(n.reading.pct)}%${suffix}`);
            state.notified.push(n.key);
        }

        try {
            await this._store.save(state);
        } catch (e) {
            this._log(`claude-limits: falha ao salvar estado (${e.message})`);
        }

        const off = state.official;
        const extra = w => (w && off ? {pct: w.pct, resetsAt: w.resetsAt,
            source: fresh ? 'official' : 'stale', ageMs: now - off.ts, deltaPct: 0} : null);
        this._onUpdate({
            plan: off?.plan ?? null,
            session: readings.session,
            weekly: readings.weekly,
            weeklyOpus: extra(off?.usage.weeklyOpus),
            weeklySonnet: extra(off?.usage.weeklySonnet),
            fetchedAt: off?.ts ?? null,
        });
    }
}
