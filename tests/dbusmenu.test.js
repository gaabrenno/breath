import {assertEq} from './assert.js';
import {menuItems, layoutVariant, rootEvent, gnomeMenuItems, GnomeClickMenus} from '../linux/dbusmenu.js';

export default {
    'menu enxuto: detalhes, separador e as duas ações': () => {
        const items = menuItems();
        assertEq(items.map(i => [i.id, i.type, i.label, i.action ?? null]), [
            [1, 'standard', 'Ver detalhes', 'details'],
            [2, 'separator', '', null],
            [3, 'standard', 'Atualizar agora', 'refresh'],
            [4, 'standard', 'Abrir uso no claude.ai', 'open'],
        ]);
        assertEq(items.every(i => i.enabled), true);
    },
    'abertura e fechamento do menu raiz': () => {
        assertEq(rootEvent(0, 'opened'), 'opened');
        assertEq(rootEvent(0, 'closed'), 'closed');
        assertEq(rootEvent(3, 'opened'), null);
        assertEq(rootEvent(0, 'clicked'), null);
    },
    'menu do GNOME: um item visível e inativo': () =>
        assertEq(gnomeMenuItems(1).map(i => [i.id, i.label, i.enabled, i.visible !== false]),
            [[1, 'Abrindo os detalhes…', false, true]]),
    'menu do GNOME: id novo a cada volta (a AppIndicator não readiciona um id removido)': () =>
        assertEq(gnomeMenuItems(7)[0].id, 7),
    'GNOME: abrir o menu abre o painel e esvazia; fechar troca para o outro menu': () => {
        const log = [];
        const g = new GnomeClickMenus({
            paths: ['/MenuBar', '/MenuBar2'],
            setItems: (i, items) => log.push(`items ${i} ${items.length}`),
            setMenuPath: p => log.push(`menu ${p}`),
            openPopup: () => log.push('painel'),
        });
        assertEq(g.currentPath, '/MenuBar');
        g.onRoot(0, 'opened');
        g.onRoot(0, 'closed');
        assertEq(log, ['painel', 'items 0 0', 'items 0 1', 'menu /MenuBar2']);
        assertEq(g.currentPath, '/MenuBar2');
        log.length = 0;
        g.onRoot(0, 'opened'); // evento atrasado do menu antigo: ignora
        g.onRoot(1, 'opened');
        g.onRoot(1, 'closed');
        assertEq(log, ['painel', 'items 1 0', 'items 1 1', 'menu /MenuBar']);
    },
    'layout com revisão e filhos': () => {
        const items = menuItems();
        const [rev, [rootId, props, children]] = layoutVariant(items, 7).deepUnpack();
        assertEq(rev, 7);
        assertEq(rootId, 0);
        assertEq(props['children-display'].unpack(), 'submenu');
        assertEq(children.length, items.length);
    },
};
