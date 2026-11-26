import {assertEq} from './assert.js';
import {nextUpdateDelay} from '../linux/tray.js';

export default {
    'primeira busca de atualização em 2 min': () => assertEq(nextUpdateDelay(0), 120),
    'depois a cada hora': () => assertEq(nextUpdateDelay(5), 3600),
};
