import {assertEq} from './assert.js';
import {retryDelay} from '../linux/sni.js';

export default {
    'tenta de novo logo no começo': () => assertEq(retryDelay(0), 2),
    'espaça as tentativas': () => assertEq(retryDelay(3), 16),
    'teto de 60 s': () => assertEq(retryDelay(10), 60),
};
