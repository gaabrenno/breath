import {assert, assertEq} from './assert.js';
import {menuItems, layoutVariant} from '../linux/dbusmenu.js';
import {EMPTY_VIEW} from '../linux/text.js';

const now = Date.parse('2026-11-25T17:32:00-03:00');
const rd = pct => ({pct, resetsAt: now + 3600e3, source: 'official', ageMs: 0, deltaPct: 0});
const v = {plan: 'pro', session: rd(42), weekly: rd(67), weeklyOpus: null, weeklySonnet: null, fetchedAt: now};

export default {
    'ações no fim, depois do separador': () => {
        const items = menuItems(EMPTY_VIEW, now);
        const n = items.length;
        assertEq(items[n - 1].action, 'open');
        assertEq(items[n - 1].label, 'Abrir uso no claude.ai');
        assertEq(items[n - 2].action, 'refresh');
        assertEq(items[n - 2].label, 'Atualizar agora');
        assertEq(items[n - 3].type, 'separator');
        assert(items.slice(0, n - 3).every(i => i.enabled === false), 'informação desativada');
    },
    'linhas de janela': () => {
        const labels = menuItems(v, now).map(i => i.label);
        assert(labels.some(l => l.startsWith('Sessão de 5h: 42% · Reseta')), labels.join('|'));
        assert(labels.some(l => l.startsWith('Semanal: 67% · Reseta')), labels.join('|'));
    },
    'ids 1..n únicos': () => {
        const ids = menuItems(v, now).map(i => i.id);
        assertEq(ids, ids.map((_, k) => k + 1));
    },
    'layout com revisão e filhos': () => {
        const items = menuItems(v, now);
        const [rev, [rootId, props, children]] = layoutVariant(items, 7).deepUnpack();
        assertEq(rev, 7);
        assertEq(rootId, 0);
        assertEq(props['children-display'].unpack(), 'submenu');
        assertEq(children.length, items.length);
    },
};
