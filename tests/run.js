// Harness mínimo: gjs -m tests/run.js [filtro]
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import System from 'system';

export {assert, assertEq} from './assert.js';

const dir = GLib.path_get_dirname(GLib.filename_from_uri(import.meta.url)[0]);
const filter = ARGV[0] ?? '';
const enumerator = Gio.File.new_for_path(dir).enumerate_children('standard::name', 0, null);
const files = [];
for (let info; (info = enumerator.next_file(null));) {
    const n = info.get_name();
    if (n.endsWith('.test.js') && n.includes(filter))
        files.push(n);
}
files.sort();

let failed = 0, passed = 0;
for (const f of files) {
    let mod;
    try {
        mod = await import(`file://${dir}/${f}`);
    } catch (e) {
        failed++;
        print(`FAIL ${f} (import): ${e.message}`);
        continue;
    }
    for (const [name, fn] of Object.entries(mod.default)) {
        try {
            await fn();
            passed++;
            print(`PASS ${f} › ${name}`);
        } catch (e) {
            failed++;
            print(`FAIL ${f} › ${name}: ${e.message}`);
        }
    }
}
print(`\n${passed} passed, ${failed} failed`);
System.exit(failed ? 1 : 0);
