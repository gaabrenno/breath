import GLib from 'gi://GLib';
import {assertEq} from './assert.js';
import {readConfig} from '../linux/runtime.js';

const file = text => {
    const dir = GLib.dir_make_tmp('breath-XXXXXX');
    GLib.file_set_contents(`${dir}/install.conf`, text);
    return `${dir}/install.conf`;
};

export default {
    'readConfig lê modo e atualizador': () =>
        assertEq(readConfig(file('mode=tray\nupdater=none\nx=y\n')), {mode: 'tray', updater: 'none'}),
    'readConfig sem arquivo': () =>
        assertEq(readConfig('/nonexistent/breath/install.conf'), {mode: null, updater: null}),
    'readConfig valor inválido': () =>
        assertEq(readConfig(file('mode=foo\nupdater=systemd')), {mode: null, updater: 'systemd'}),
};
