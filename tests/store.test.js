import GLib from 'gi://GLib';
import {assertEq} from './assert.js';
import {Store} from '../extension/lib/store.js';

const tmp = GLib.dir_make_tmp('breath-XXXXXX');
const EMPTY = {official: null, notified: []};

export default {
    'arquivo inexistente dá estado vazio': async () =>
        assertEq(await new Store(`${tmp}/nada/state.json`).load(), EMPTY),
    'ida e volta (cria diretório)': async () => {
        const s = new Store(`${tmp}/sub/dir/state.json`);
        const state = {official: {ts: 1, plan: 'pro', usage: {}, tokens5h: 2, tokens7d: 3}, notified: ['a']};
        await s.save(state);
        assertEq(await s.load(), state);
    },
    'arquivo corrompido dá estado vazio': async () => {
        GLib.file_set_contents(`${tmp}/bad.json`, 'xx');
        assertEq(await new Store(`${tmp}/bad.json`).load(), EMPTY);
    },
    'poda notified para as 20 últimas': async () => {
        const s = new Store(`${tmp}/prune.json`);
        await s.save({official: null, notified: Array.from({length: 25}, (_, i) => `k${i}`)});
        const st = await s.load();
        assertEq(st.notified.length, 20);
        assertEq(st.notified[0], 'k5');
        assertEq(st.notified[19], 'k24');
    },
};
