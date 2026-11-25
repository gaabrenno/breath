import GLib from 'gi://GLib';
import {assertEq} from './assert.js';
import {LogScanner} from '../extension/lib/logscan.js';

const line = (id, ts = '2026-11-25T18:00:00Z') => JSON.stringify({timestamp: ts, requestId: id,
    message: {id, usage: {input_tokens: 10, output_tokens: 0}}}) + '\n';
const from = Date.parse('2026-11-25T17:00:00Z'), to = Date.parse('2026-11-25T19:00:00Z');

export default {
    'segunda varredura sem mudanças não reprocessa nada': async () => {
        const root = GLib.dir_make_tmp('cl-cache-XXXXXX');
        GLib.mkdir_with_parents(`${root}/p`, 0o755);
        GLib.file_set_contents(`${root}/p/a.jsonl`, line('r1') + line('r2'));
        const s = new LogScanner(root);
        assertEq(await s.countTokens(from, to, 0), 20);
        const parsed = s.parsedBytes;
        assertEq(await s.countTokens(from, to, 0), 20);
        assertEq(s.parsedBytes, parsed);
    },
    'arquivo que cresce: só o trecho novo é processado': async () => {
        const root = GLib.dir_make_tmp('cl-cache-XXXXXX');
        GLib.mkdir_with_parents(`${root}/p`, 0o755);
        const first = line('r1');
        GLib.file_set_contents(`${root}/p/a.jsonl`, first);
        const s = new LogScanner(root);
        assertEq(await s.countTokens(from, to, 0), 10);
        const before = s.parsedBytes;
        const added = line('r2');
        GLib.file_set_contents(`${root}/p/a.jsonl`, first + added);
        assertEq(await s.countTokens(from, to, 0), 20);
        assertEq(s.parsedBytes - before, added.length);
    },
    'linha incompleta no fim é lida quando completar': async () => {
        const root = GLib.dir_make_tmp('cl-cache-XXXXXX');
        GLib.mkdir_with_parents(`${root}/p`, 0o755);
        const full = line('r1');
        GLib.file_set_contents(`${root}/p/a.jsonl`, full.slice(0, 30));
        const s = new LogScanner(root);
        assertEq(await s.countTokens(from, to, 0), 0);
        GLib.file_set_contents(`${root}/p/a.jsonl`, full);
        assertEq(await s.countTokens(from, to, 0), 10);
    },
    'arquivo encolheu (reescrito): reprocessa do zero': async () => {
        const root = GLib.dir_make_tmp('cl-cache-XXXXXX');
        GLib.mkdir_with_parents(`${root}/p`, 0o755);
        GLib.file_set_contents(`${root}/p/a.jsonl`, line('r1') + line('r2'));
        const s = new LogScanner(root);
        assertEq(await s.countTokens(from, to, 0), 20);
        GLib.file_set_contents(`${root}/p/a.jsonl`, line('r3'));
        assertEq(await s.countTokens(from, to, 0), 10);
    },
};
