import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

Gio._promisify(Gio.File.prototype, 'load_contents_async');
Gio._promisify(Gio.File.prototype, 'replace_contents_bytes_async', 'replace_contents_finish');

const MAX_NOTIFIED = 20;
const empty = () => ({official: null, notified: []});

/** Persiste o estado (último oficial, calibração, notificações) em JSON. */
export class Store {
    /** @param {string} path ex.: ~/.cache/breath/state.json */
    constructor(path) {
        this._file = Gio.File.new_for_path(path);
    }

    /** @returns {Promise<import('./estimate.js').State>} */
    async load() {
        try {
            const [bytes] = await this._file.load_contents_async(null);
            const s = JSON.parse(new TextDecoder().decode(bytes));
            return {
                official: s?.official ?? null,
                notified: Array.isArray(s?.notified) ? s.notified : [],
            };
        } catch {
            return empty();
        }
    }

    /** @param {import('./estimate.js').State} state */
    async save(state) {
        const parent = this._file.get_parent();
        if (!parent.query_exists(null))
            parent.make_directory_with_parents(null);
        const data = {official: state.official, notified: state.notified.slice(-MAX_NOTIFIED)};
        const bytes = new GLib.Bytes(new TextEncoder().encode(JSON.stringify(data)));
        await this._file.replace_contents_bytes_async(bytes, null, false,
            Gio.FileCreateFlags.REPLACE_DESTINATION, null);
    }
}
