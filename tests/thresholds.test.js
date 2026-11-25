import {assertEq} from './assert.js';
import {colorFor} from '../extension/lib/thresholds.js';

export default {
    'azul abaixo de 75': () => {
        assertEq(colorFor(0), '#3b8eea');
        assertEq(colorFor(74.9), '#3b8eea');
    },
    'amarelo de 75 a 89': () => {
        assertEq(colorFor(75), '#f5c542');
        assertEq(colorFor(89), '#f5c542');
        assertEq(colorFor(89.9), '#f5c542');
    },
    'vermelho a partir de 90': () => {
        assertEq(colorFor(90), '#e5484d');
        assertEq(colorFor(100), '#e5484d');
    },
    'cinza sem dados': () => assertEq(colorFor(null), '#888888'),
};
