import GLib from 'gi://GLib';
import {assert, assertEq, assertRejects} from './assert.js';
import {ViewCache, ensureFresh, FRESH_MS, LOCK_STALE_MS} from '../linux/viewcache.js';
import {EMPTY_VIEW} from '../linux/text.js';

const now = Date.parse('2026-11-25T17:32:00-03:00');
const rd = pct => ({pct, resetsAt: now + 3600e3, source: 'official', ageMs: 1000, deltaPct: 0});
const view = pct => ({plan: 'pro', session: rd(pct), weekly: rd(pct + 1), weeklyOpus: null,
    weeklySonnet: null, fetchedAt: now});

const tmp = () => GLib.dir_make_tmp('breath-XXXXXX');
const put = (dir, name, text) => GLib.file_set_contents(`${dir}/${name}`, text);
const exists = (dir, name) => GLib.file_test(`${dir}/${name}`, GLib.FileTest.EXISTS);

export default {
    'write e read devolvem a view com idade corrigida': () => {
        const c = new ViewCache(tmp());
        c.write(view(42), now);
        const e = c.read(now + 30e3);
        assertEq(e.savedAt, now);
        assertEq(e.view.session.pct, 42);
        assertEq(e.view.session.ageMs, 1000 + 30e3);
    },
    'write cria a pasta': () => {
        const dir = `${tmp()}/a/b`;
        new ViewCache(dir).write(view(1), now);
        assert(exists(dir, 'view.json'));
    },
    'arquivo cortado vira null': () => {
        const dir = tmp();
        put(dir, 'view.json', '{"savedAt":');
        assertEq(new ViewCache(dir).read(now), null);
    },
    'arquivo sem session vira null': () => {
        const dir = tmp();
        put(dir, 'view.json', JSON.stringify({savedAt: now, view: {plan: 'x'}}));
        assertEq(new ViewCache(dir).read(now), null);
    },
    'arquivo ausente vira null': () => assertEq(new ViewCache(tmp()).read(now), null),
    'frescor 149s / 150s': () => {
        const c = new ViewCache(tmp());
        assertEq(c.isFresh({savedAt: now}, now + FRESH_MS - 1e3), true);
        assertEq(c.isFresh({savedAt: now}, now + 150e3), false);
        assertEq(c.isFresh(null, now), false);
    },
    'cache gravado no futuro não é fresco': () => {
        const c = new ViewCache(tmp());
        assertEq(c.isFresh({savedAt: now + 3600e3}, now), false);
    },
    'trava com horário no futuro é abandonada': () => {
        const dir = tmp();
        put(dir, 'refresh.lock', String(now + 3600e3));
        assertEq(new ViewCache(dir).tryLock(now), true);
    },
    'trava exclusiva': () => {
        const c = new ViewCache(tmp());
        assertEq(c.tryLock(now), true);
        assertEq(c.tryLock(now), false);
        c.unlock();
        assertEq(c.tryLock(now), true);
    },
    'trava abandonada é ignorada': () => {
        const dir = tmp();
        put(dir, 'refresh.lock', String(now - LOCK_STALE_MS - 1e3));
        assertEq(new ViewCache(dir).tryLock(now), true);
    },
    'trava com lixo é ignorada': () => {
        const dir = tmp();
        put(dir, 'refresh.lock', 'abc');
        assertEq(new ViewCache(dir).tryLock(now), true);
    },
    'ensureFresh com cache fresco não consulta': async () => {
        const c = new ViewCache(tmp());
        c.write(view(10), now);
        let calls = 0;
        const v = await ensureFresh({cache: c, refresh: async () => (calls++, view(99)), nowMs: now + 10e3,
            force: false});
        assertEq(calls, 0);
        assertEq(v.session.pct, 10);
    },
    'ensureFresh com cache velho consulta e grava': async () => {
        const dir = tmp();
        const c = new ViewCache(dir);
        c.write(view(10), now);
        let calls = 0;
        const later = now + 200e3;
        const v = await ensureFresh({cache: c, refresh: async () => (calls++, view(50)), nowMs: later,
            force: false});
        assertEq(calls, 1);
        assertEq(v.session.pct, 50);
        assertEq(c.read(later).savedAt, later);
        assert(!exists(dir, 'refresh.lock'), 'trava removida');
    },
    'ensureFresh force consulta mesmo fresco': async () => {
        const c = new ViewCache(tmp());
        c.write(view(10), now);
        const v = await ensureFresh({cache: c, refresh: async () => view(60), nowMs: now + 1e3, force: true});
        assertEq(v.session.pct, 60);
    },
    'ensureFresh com trava de outro processo usa o cache': async () => {
        const dir = tmp();
        const c = new ViewCache(dir);
        c.write(view(10), now);
        put(dir, 'refresh.lock', String(now + 190e3));
        let calls = 0;
        const v = await ensureFresh({cache: c, refresh: async () => (calls++, view(50)), nowMs: now + 200e3,
            force: false});
        assertEq(calls, 0);
        assertEq(v.session.pct, 10);
    },
    'ensureFresh travado e sem cache dá EMPTY_VIEW': async () => {
        const dir = tmp();
        put(dir, 'refresh.lock', String(now));
        const v = await ensureFresh({cache: new ViewCache(dir), refresh: async () => view(1), nowMs: now,
            force: false});
        assertEq(v, EMPTY_VIEW);
    },
    'ensureFresh com erro solta a trava': async () => {
        const dir = tmp();
        await assertRejects(() => ensureFresh({cache: new ViewCache(dir),
            refresh: async () => { throw new Error('x'); }, nowMs: now, force: false}));
        assert(!exists(dir, 'refresh.lock'), 'trava removida');
    },
};
