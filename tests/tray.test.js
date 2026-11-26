import {assertEq} from './assert.js';
import {nextUpdateDelay, safely, ITEMS} from '../linux/tray.js';

export default {
    'primeira busca de atualização em 2 min': () => assertEq(nextUpdateDelay(0), 120),
    'depois a cada hora': () => assertEq(nextUpdateDelay(5), 3600),
    'safely engole o erro e registra': () => {
        const logs = [];
        const r = safely('desenhar', () => { throw new Error('x'); }, m => logs.push(m));
        assertEq(r, undefined);
        assertEq(logs.length, 1);
        assertEq(logs[0].includes('desenhar'), true);
    },
    'títulos em ordem alfabética: sessão antes da semana': () => {
        assertEq(ITEMS.map(i => i.kind), ['session', 'weekly']);
        const titles = ITEMS.map(i => i.title);
        assertEq([...titles].sort(), titles);
    },
    'safely devolve o resultado': () => assertEq(safely('a', () => 7, () => {}), 7),
};
