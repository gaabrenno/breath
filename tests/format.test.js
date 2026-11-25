import {assertEq} from './assert.js';
import {formatReset, formatAge} from '../extension/lib/format.js';

// Rodar com TZ=America/Sao_Paulo
const now = Date.parse('2026-11-25T17:32:00-03:00');

export default {
    'reset no mesmo dia': () =>
        assertEq(formatReset(Date.parse('2026-11-25T20:00:00-03:00'), now), 'Reseta às 20:00 · em 2h 28min'),
    'reset em outro dia': () =>
        assertEq(formatReset(Date.parse('2026-11-27T09:00:00-03:00'), now), 'Reseta sex 27 nov, 09:00 · em 1d 15h'),
    'reset em menos de 1h': () =>
        assertEq(formatReset(Date.parse('2026-11-25T17:50:00-03:00'), now), 'Reseta às 17:50 · em 18min'),
    'sem reset': () => assertEq(formatReset(null, now), 'Sem sessão ativa'),
    'idade em segundos': () => assertEq(formatAge(40e3), 'há 40s'),
    'idade em minutos': () => assertEq(formatAge(5 * 60e3), 'há 5min'),
    'idade em horas': () => assertEq(formatAge(3 * 3600e3 + 600e3), 'há 3h'),
    'idade em dias': () => assertEq(formatAge(2 * 86400e3 + 3600e3), 'há 2d'),
};
