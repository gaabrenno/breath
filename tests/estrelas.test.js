import {assertEq} from './assert.js';
import {formatStars} from '../site/estrelas.js';

export default {
    'zero': () => assertEq(formatStars(0), '0'),
    'poucas': () => assertEq(formatStars(7), '7'),
    'centenas': () => assertEq(formatStars(999), '999'),
    'mil': () => assertEq(formatStars(1000), '1 mil'),
    'mil e duzentas': () => assertEq(formatStars(1234), '1,2 mil'),
    'dezenas de milhares': () => assertEq(formatStars(15400), '15,4 mil'),
    'arredonda para baixo (não promete estrela que não tem)': () => assertEq(formatStars(1299), '1,2 mil'),
    'valor inválido': () => assertEq(formatStars(undefined), null),
};
