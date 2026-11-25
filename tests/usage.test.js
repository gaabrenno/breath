import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {assertEq, assert} from './assert.js';
import {parseUsage} from '../extension/lib/usage.js';

const dir = GLib.path_get_dirname(GLib.filename_from_uri(import.meta.url)[0]);
const [, bytes] = Gio.File.new_for_path(`${dir}/fixtures/usage-pro.json`).load_contents(null);
const fixture = () => JSON.parse(new TextDecoder().decode(bytes));

export default {
    'usage pro': () => {
        const u = parseUsage(fixture());
        assertEq(u.session, {pct: 5, resetsAt: Date.parse('2026-11-25T21:50:00Z')});
        assertEq(u.weekly, {pct: 61, resetsAt: Date.parse('2026-11-30T04:00:00Z')});
        assertEq(u.weeklyOpus, null);
        assertEq(u.weeklySonnet, null);
    },
    'opus presente': () => {
        const f = fixture();
        f.seven_day_opus = {utilization: 12.5, resets_at: '2026-11-30T04:00:00Z'};
        assertEq(parseUsage(f).weeklyOpus, {pct: 12.5, resetsAt: Date.parse('2026-11-30T04:00:00Z')});
    },
    'five_hour null': () => {
        const f = fixture();
        f.five_hour = null;
        assertEq(parseUsage(f).session, {pct: 0, resetsAt: null});
    },
    'five_hour sem resets_at': () => {
        const f = fixture();
        f.five_hour = {utilization: 0, resets_at: null};
        assertEq(parseUsage(f).session, {pct: 0, resetsAt: null});
    },
    'formato inesperado lança': () => {
        let threw = false;
        try { parseUsage({foo: 1}); } catch (e) { threw = e.message === 'unexpected usage shape'; }
        assert(threw, 'deveria lançar unexpected usage shape');
    },
    'utilization não numérico lança': () => {
        const f = fixture();
        f.seven_day.utilization = 'x';
        let threw = false;
        try { parseUsage(f); } catch { threw = true; }
        assert(threw);
    },
    'resets_at é arredondado ao minuto (API varia nos sub-segundos)': () => {
        const f = fixture();
        f.five_hour.resets_at = '2026-11-25T21:49:59.652000+00:00';
        assertEq(parseUsage(f).session.resetsAt, Date.parse('2026-11-25T21:50:00Z'));
        assertEq(parseUsage(fixture()).session.resetsAt, Date.parse('2026-11-25T21:50:00Z'));
    },
    'pct acima de 100 é limitado': () => {
        const f = fixture();
        f.seven_day.utilization = 104;
        assertEq(parseUsage(f).weekly.pct, 100);
    },
};
