// Monta o Controller fora do GNOME Shell (bandeja e comando `breath`).
// Mesma montagem do enable() da extensão, com GLib/Gio/Soup do gjs comum.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';

import {Controller} from '../extension/lib/controller.js';
import {Store} from '../extension/lib/store.js';
import {LogScanner} from '../extension/lib/logscan.js';
import {fetchUsage} from '../extension/lib/api.js';
import {EMPTY_VIEW} from './text.js';

Gio._promisify(Gio.File.prototype, 'load_contents_async');

const MODES = ['gnome', 'tray', 'cli'];
const UPDATERS = ['systemd', 'tray', 'none'];

export function paths() {
    const home = GLib.get_home_dir();
    const cacheDir = `${GLib.get_user_cache_dir()}/breath`;
    return {
        home,
        creds: `${home}/.claude/.credentials.json`,
        projects: `${home}/.claude/projects`,
        cacheDir,
        statePath: `${cacheDir}/state.json`,
        configPath: `${GLib.get_user_config_dir()}/breath/install.conf`,
    };
}

/** Lê ~/.config/breath/install.conf (chave=valor). */
export function readConfig(path) {
    const out = {mode: null, updater: null};
    let text;
    try {
        const [, bytes] = GLib.file_get_contents(path);
        text = new TextDecoder().decode(bytes);
    } catch {
        return out;
    }
    for (const line of text.split('\n')) {
        const [k, v] = line.split('=', 2).map(s => s?.trim());
        if (k === 'mode' && MODES.includes(v))
            out.mode = v;
        else if (k === 'updater' && UPDATERS.includes(v))
            out.updater = v;
    }
    return out;
}

/**
 * @param {{onNotify:(title:string, body:string)=>void}} o
 * @returns {{controller:Controller, lastView:()=>object|null}}
 */
export function createRuntime({onNotify}) {
    const p = paths();
    const credsFile = Gio.File.new_for_path(p.creds);
    const session = new Soup.Session({timeout: 15});
    const scanner = new LogScanner(p.projects);
    let last = null;
    const controller = new Controller({
        readCredentialsText: async () => {
            const [bytes] = await credsFile.load_contents_async(null);
            return new TextDecoder().decode(bytes);
        },
        fetchUsage: token => fetchUsage(session, token),
        countTokens: (from, to) => scanner.countTokens(from, to),
        store: new Store(p.statePath),
        now: () => Date.now(),
        onUpdate: view => {
            last = view;
        },
        onNotify,
        log: m => printerr(m),
        reloadState: true, // bandeja e comando dividem o state.json
    });
    return {controller, lastView: () => last};
}

/** Uma consulta completa; devolve a View resultante. */
export async function refreshView(runtime) {
    await runtime.controller.refresh();
    return runtime.lastView() ?? EMPTY_VIEW;
}
