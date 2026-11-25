import {assertEq} from './assert.js';
import {notificationsFor} from '../extension/lib/notify.js';

const R = (pct, source = 'official', resetsAt = 1000) => ({pct, resetsAt, source, ageMs: 0, deltaPct: 0});
const readings = (s, w) => ({session: s, weekly: w});

export default {
    'notifica oficial ≥ 90': () => {
        const out = notificationsFor(readings(R(10), R(91)), []);
        assertEq(out.map(o => [o.key, o.kind]), [['weekly:1000:official', 'weekly']]);
    },
    'exatamente 90 notifica': () => assertEq(notificationsFor(readings(R(90), R(1)), []).length, 1),
    'abaixo de 90 não': () => assertEq(notificationsFor(readings(R(89.9), R(10)), []), []),
    'não repete a mesma chave': () => assertEq(notificationsFor(readings(R(10), R(91)), ['weekly:1000:official']), []),
    'estimativa tem chave própria': () =>
        assertEq(notificationsFor(readings(R(95, 'estimate'), R(1)), []).map(o => o.key), ['session:1000:estimate']),
    'oficial notifica depois da estimativa': () =>
        assertEq(notificationsFor(readings(R(95), R(1)), ['session:1000:estimate']).map(o => o.key), ['session:1000:official']),
    'stale conta como oficial': () =>
        assertEq(notificationsFor(readings(R(95, 'stale'), R(1)), ['session:1000:official']), []),
    'none e null são ignorados': () =>
        assertEq(notificationsFor(readings({pct: null, resetsAt: null, source: 'none', ageMs: 0, deltaPct: 0}, R(1)), []), []),
};
