import {assertEq} from './assert.js';
import {menuItems, layoutVariant} from '../linux/dbusmenu.js';

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
    'layout com revisão e filhos': () => {
        const items = menuItems();
        const [rev, [rootId, props, children]] = layoutVariant(items, 7).deepUnpack();
        assertEq(rev, 7);
        assertEq(rootId, 0);
        assertEq(props['children-display'].unpack(), 'submenu');
        assertEq(children.length, items.length);
    },
};
