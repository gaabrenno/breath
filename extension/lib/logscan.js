import Gio from 'gi://Gio';
import {parseRecords, sumRecords} from './tokens.js';

Gio._promisify(Gio.File.prototype, 'enumerate_children_async');
Gio._promisify(Gio.FileEnumerator.prototype, 'next_files_async');
Gio._promisify(Gio.File.prototype, 'load_contents_async');

const ATTRS = 'standard::name,standard::type,standard::size,time::modified';
const NEWLINE = 10;
const decoder = new TextDecoder();

async function listChildren(file) {
    const out = [];
    let en;
    try {
        en = await file.enumerate_children_async(ATTRS, Gio.FileQueryInfoFlags.NONE, 0, null);
    } catch {
        return out;
    }
    try {
        for (;;) {
            const batch = await en.next_files_async(100, 0, null);
            if (!batch.length)
                break;
            out.push(...batch);
        }
    } catch {
        // diretório sumiu no meio da varredura
    } finally {
        en.close(null);
    }
    return out;
}

/**
 * Varre `rootDir/<projeto>/*.jsonl` (logs do Claude Code) de forma assíncrona.
 * Mantém cache por arquivo e só faz o parse dos bytes novos (os logs só crescem),
 * para não travar a thread do Shell a cada ciclo.
 */
export class LogScanner {
    /** @param {string} rootDir ex.: ~/.claude/projects */
    constructor(rootDir) {
        this._root = Gio.File.new_for_path(rootDir);
        /** @type {Map<string, {offset:number, records:object[]}>} */
        this._cache = new Map();
        /** Total de bytes já processados (diagnóstico/testes). */
        this.parsedBytes = 0;
    }

    async _records(file, size) {
        const path = file.get_path();
        let entry = this._cache.get(path);
        if (!entry || size < entry.offset)
            entry = {offset: 0, records: []};
        if (size > entry.offset) {
            const [bytes] = await file.load_contents_async(null);
            const end = bytes.lastIndexOf(NEWLINE) + 1; // só linhas completas
            if (end > entry.offset) {
                const chunk = bytes.subarray(entry.offset, end);
                entry.records = entry.records.concat(parseRecords(decoder.decode(chunk)));
                this.parsedBytes += chunk.length;
                entry.offset = end;
            }
        }
        this._cache.set(path, entry);
        return entry.records;
    }

    /**
     * @param {number} fromMs
     * @param {number} toMs
     * @param {number} [mtimeFloorMs=fromMs] ignora arquivos modificados antes disso
     * @returns {Promise<number>}
     */
    async countTokens(fromMs, toMs, mtimeFloorMs = fromMs) {
        const seen = new Set();
        const alive = new Set();
        let total = 0;
        for (const proj of await listChildren(this._root)) {
            if (proj.get_file_type() !== Gio.FileType.DIRECTORY)
                continue;
            const projDir = this._root.get_child(proj.get_name());
            for (const info of await listChildren(projDir)) {
                if (!info.get_name().endsWith('.jsonl'))
                    continue;
                const file = projDir.get_child(info.get_name());
                alive.add(file.get_path());
                const mtime = info.get_modification_date_time()?.to_unix() * 1000;
                if (mtime < mtimeFloorMs)
                    continue;
                try {
                    total += sumRecords(await this._records(file, info.get_size()), fromMs, toMs, seen);
                } catch {
                    // arquivo sumiu ou ilegível: ignora
                }
            }
        }
        for (const path of this._cache.keys()) {
            if (!alive.has(path))
                this._cache.delete(path);
        }
        return total;
    }
}
