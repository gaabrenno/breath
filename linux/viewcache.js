// Cache da última leitura (view.json) e trava de consulta (refresh.lock),
// compartilhados entre a bandeja e o comando `breath`.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {EMPTY_VIEW} from './text.js';

export const FRESH_MS = 150e3;
export const LOCK_STALE_MS = 60e3;

const READINGS = ['session', 'weekly', 'weeklyOpus', 'weeklySonnet'];

export class ViewCache {
    /** @param {string} dir ex.: ~/.cache/breath */
    constructor(dir) {
        this._dir = dir;
        this._view = Gio.File.new_for_path(`${dir}/view.json`);
        this._lock = Gio.File.new_for_path(`${dir}/refresh.lock`);
    }

    /** @returns {{view:object, savedAt:number}|null} */
    read(nowMs) {
        let entry;
        try {
            const [, bytes] = this._view.load_contents(null);
            entry = JSON.parse(new TextDecoder().decode(bytes));
        } catch {
            return null;
        }
        const v = entry?.view;
        if (typeof entry?.savedAt !== 'number' || !v?.session || !v?.weekly)
            return null;
        const elapsed = Math.max(0, nowMs - entry.savedAt);
        for (const k of READINGS) {
            if (v[k] && v[k].source !== 'none')
                v[k].ageMs = (v[k].ageMs ?? 0) + elapsed;
        }
        return {view: v, savedAt: entry.savedAt};
    }

    write(view, nowMs) {
        GLib.mkdir_with_parents(this._dir, 0o700);
        const bytes = new TextEncoder().encode(JSON.stringify({savedAt: nowMs, view}));
        this._view.replace_contents(bytes, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
    }

    isFresh(entry, nowMs) {
        return entry !== null && entry !== undefined && nowMs - entry.savedAt < FRESH_MS;
    }

    tryLock(nowMs) {
        GLib.mkdir_with_parents(this._dir, 0o700);
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                const out = this._lock.create(Gio.FileCreateFlags.NONE, null);
                out.write_all(new TextEncoder().encode(String(nowMs)), null);
                out.close(null);
                return true;
            } catch (e) {
                if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.EXISTS) || attempt > 0)
                    return false;
                let held = NaN;
                try {
                    const [, bytes] = this._lock.load_contents(null);
                    held = Number(new TextDecoder().decode(bytes).trim());
                } catch {}
                if (Number.isFinite(held) && nowMs - held < LOCK_STALE_MS)
                    return false;
                this.unlock();
            }
        }
        return false;
    }

    unlock() {
        try {
            this._lock.delete(null);
        } catch {}
    }
}

/**
 * Devolve uma leitura nova o bastante, consultando só quando preciso e
 * quando ninguém mais está consultando.
 * @param {{cache:ViewCache, refresh:()=>Promise<object>, nowMs:number, force:boolean}} o
 */
export async function ensureFresh({cache, refresh, nowMs, force}) {
    const entry = cache.read(nowMs);
    if (!force && cache.isFresh(entry, nowMs))
        return entry.view;
    if (!cache.tryLock(nowMs))
        return entry?.view ?? EMPTY_VIEW;
    try {
        const view = await refresh();
        cache.write(view, nowMs);
        return view;
    } finally {
        cache.unlock();
    }
}
