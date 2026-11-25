import GLib from 'gi://GLib';
import {assertEq} from './assert.js';
import {LogScanner} from '../extension/lib/logscan.js';

const dir = GLib.path_get_dirname(GLib.filename_from_uri(import.meta.url)[0]);
const root = `${dir}/fixtures/logs`;
const from = Date.parse('2026-11-25T17:00:00Z'), to = Date.parse('2026-11-25T19:00:00Z');

export default {
    'soma dois projetos com dedup entre arquivos': async () =>
        // r1 = 230 (em projA duas vezes e em projB) + r2 = 50
        assertEq(await new LogScanner(root).countTokens(from, to, 0), 280),
    'ignora arquivos com mtime antes da janela': async () =>
        assertEq(await new LogScanner(root).countTokens(from, to, Date.now() + 3600e3), 0),
    'diretório inexistente dá 0': async () =>
        assertEq(await new LogScanner(`${dir}/fixtures/nao-existe`).countTokens(from, to), 0),
};
