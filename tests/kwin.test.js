import {assertEq} from './assert.js';
import {kwinPlacementScript} from '../linux/kwin.js';

// Roda o script do KWin com um workspace falso e devolve a janela depois do windowAdded.
function run(pid, win, cursor, area = {x: 0, y: 0, width: 1920, height: 1040}) {
    const handlers = [];
    const workspace = {
        cursorPos: cursor,
        windowAdded: {connect: fn => handlers.push(fn)},
        clientArea: () => area,
    };
    const KWin = {MaximizeArea: 2};
    new Function('workspace', 'KWin', kwinPlacementScript(pid))(workspace, KWin);
    for (const h of handlers)
        h(win);
    return win;
}

const popup = (over = {}) => ({caption: 'Breath', pid: 4242, width: 334, height: 318,
    frameGeometry: {x: 800, y: 400, width: 334, height: 318}, ...over});

export default {
    'barra embaixo: painel acima do cursor, centrado nele': () => {
        const w = run(4242, popup(), {x: 1000, y: 1030});
        assertEq(w.frameGeometry, {x: 833, y: 704, width: 334, height: 318});
        assertEq([w.keepAbove, w.skipTaskbar, w.skipPager, w.skipSwitcher], [true, true, true, true]);
    },
    'barra em cima: painel abaixo do cursor': () =>
        assertEq(run(4242, popup(), {x: 1000, y: 10}).frameGeometry.y, 18),
    'não passa da borda direita': () =>
        assertEq(run(4242, popup(), {x: 1915, y: 1030}).frameGeometry.x, 1920 - 334),
    'não passa da borda esquerda': () =>
        assertEq(run(4242, popup(), {x: 5, y: 1030}).frameGeometry.x, 0),
    'ignora janela de outro processo': () =>
        assertEq(run(4242, popup({pid: 1}), {x: 1000, y: 1030}).frameGeometry.x, 800),
    'ignora janela com outro título': () =>
        assertEq(run(4242, popup({caption: 'Outra'}), {x: 1000, y: 1030}).frameGeometry.x, 800),
};
