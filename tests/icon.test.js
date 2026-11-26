import {assert, assertEq} from './assert.js';
import {rgbaToArgb, ringPixmaps} from '../linux/icon.js';
import {colorFor} from '../extension/lib/thresholds.js';

const rd = (pct, source = 'official') => ({pct, resetsAt: null, source, ageMs: 0, deltaPct: 0});
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));

export default {
    '1 pixel RGBA → ARGB': () =>
        assertEq([...rgbaToArgb(new Uint8Array([10, 20, 30, 40]), 1, 1, 4, true)], [40, 10, 20, 30]),
    'ignora o padding da linha': () => {
        const px = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 0, 0, 0, 0]);
        assertEq([...rgbaToArgb(px, 2, 1, 12, true)], [4, 1, 2, 3, 8, 5, 6, 7]);
    },
    'RGB sem alpha': () => assertEq([...rgbaToArgb(new Uint8Array([1, 2, 3]), 1, 1, 3, false)], [255, 1, 2, 3]),
    'três tamanhos com a cor do anel': () => {
        const pm = ringPixmaps(rd(42));
        assertEq(pm.map(p => p.width), [22, 32, 44]);
        for (const p of pm) {
            assertEq(p.height, p.width);
            assertEq(p.bytes.length, p.width * p.width * 4);
        }
        const [r, g, b] = hex(colorFor(42));
        const big = pm[2].bytes;
        let found = false;
        for (let i = 0; i < big.length && !found; i += 4) {
            found = big[i] === 255 && Math.abs(big[i + 1] - r) <= 8 && Math.abs(big[i + 2] - g) <= 8 &&
                Math.abs(big[i + 3] - b) <= 8;
        }
        assert(found, 'nenhum pixel com a cor do anel');
    },
    'sem dados também desenha': () => assertEq(ringPixmaps(rd(null, 'none')).length, 3),
};
