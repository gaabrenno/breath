import Gio from 'gi://Gio';
import {countTokensInText} from './tokens.js';

Gio._promisify(Gio.File.prototype, 'enumerate_children_async');
Gio._promisify(Gio.FileEnumerator.prototype, 'next_files_async');
Gio._promisify(Gio.File.prototype, 'load_contents_async');

const ATTRS = 'standard::name,standard::type,time::modified';
const decoder = new TextDecoder();

async function listChildren(file) {
    const out = [];
    let en;
    try {
        en = await file.enumerate_children_async(ATTRS, Gio.FileQueryInfoFlags.NONE, 0, null);
    } catch {
        return out;
    }
    for (;;) {
        const batch = await en.next_files_async(100, 0, null);
        if (!batch.length)
            break;
        out.push(...batch);
    }
    en.close(null);
    return out;
}

/** Varre `rootDir/<projeto>/*.jsonl` (logs do Claude Code) de forma assíncrona. */
export class LogScanner {
    /** @param {string} rootDir ex.: ~/.claude/projects */
    constructor(rootDir) {
        this._root = Gio.File.new_for_path(rootDir);
    }

    /**
     * @param {number} fromMs
     * @param {number} toMs
     * @param {number} [mtimeFloorMs=fromMs] ignora arquivos modificados antes disso
     * @returns {Promise<number>}
     */
    async countTokens(fromMs, toMs, mtimeFloorMs = fromMs) {
        const seen = new Set();
        let total = 0;
        for (const proj of await listChildren(this._root)) {
            if (proj.get_file_type() !== Gio.FileType.DIRECTORY)
                continue;
            const projDir = this._root.get_child(proj.get_name());
            for (const info of await listChildren(projDir)) {
                if (!info.get_name().endsWith('.jsonl'))
                    continue;
                const mtime = info.get_modification_date_time()?.to_unix() * 1000;
                if (mtime < mtimeFloorMs)
                    continue;
                try {
                    const [bytes] = await projDir.get_child(info.get_name()).load_contents_async(null);
                    total += countTokensInText(decoder.decode(bytes), fromMs, toMs, seen);
                } catch {
                    // arquivo sumiu ou ilegível: ignora
                }
            }
        }
        return total;
    }
}
