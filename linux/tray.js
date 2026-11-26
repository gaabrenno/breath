// Bandeja do Breath fora do GNOME Shell: dois ícones (sessão e semana).
// Uso: gjs -m linux/tray.js
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import System from 'system';

import {StatusNotifierItem} from './sni.js';
import {DBusMenu, menuItems} from './dbusmenu.js';
import {ringPixmaps} from './icon.js';
import {tooltipFor} from './text.js';
import {ViewCache, ensureFresh} from './viewcache.js';
import {createRuntime, refreshView, paths, readConfig} from './runtime.js';
import {notify} from './notifier.js';
import {loadKwinPlacement} from './kwin.js';

const APP_NAME = 'io.github.gaabrenno.Breath';
const MENU_PATH = '/MenuBar';
const USAGE_PAGE = 'https://claude.ai/settings/usage';
const RESTART_DELAY_SEC = 5;

// Títulos em ordem alfabética: o KDE ordena a bandeja pelo título ("5" vem antes de "s").
export const ITEMS = [
    {kind: 'session', id: 'breath-session', title: 'Breath · 5h (sessão)', label: '5h'},
    {kind: 'weekly', id: 'breath-weekly', title: 'Breath · semana', label: 'sem'},
];

/**
 * Ordem de registro dos ícones. A extensão AppIndicator do GNOME Shell insere
 * cada ícone novo no começo; os outros painéis acrescentam no fim ou ordenam
 * pelo título.
 * @param {string|null} host nome do processo dono do StatusNotifierWatcher
 */
export function registrationOrder(host) {
    return host === 'gnome-shell' ? ['weekly', 'session'] : ['session', 'weekly'];
}

/** Processo dono do StatusNotifierWatcher (ex.: gnome-shell, plasmashell), ou null. */
function watcherHost(conn) {
    try {
        const r = conn.call_sync('org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus',
            'GetConnectionUnixProcessID', new GLib.Variant('(s)', ['org.kde.StatusNotifierWatcher']),
            null, Gio.DBusCallFlags.NONE, 2000, null);
        const [pid] = r.deepUnpack();
        const [, bytes] = GLib.file_get_contents(`/proc/${pid}/comm`);
        return new TextDecoder().decode(bytes).trim();
    } catch {
        return null;
    }
}

/** Roda fn; um erro vira uma linha de log em vez de derrubar a bandeja. */
export function safely(what, fn, log = m => printerr(m)) {
    try {
        return fn();
    } catch (e) {
        log(`breath: erro ao ${what} (${e.message})`);
        return undefined;
    }
}

/** Segundos até a próxima busca de atualização feita pela bandeja. */
export function nextUpdateDelay(runs) {
    return runs === 0 ? 120 : 3600;
}

function privateConnection() {
    const address = Gio.dbus_address_get_for_bus_sync(Gio.BusType.SESSION, null);
    return Gio.DBusConnection.new_for_address_sync(address,
        Gio.DBusConnectionFlags.AUTHENTICATION_CLIENT | Gio.DBusConnectionFlags.MESSAGE_BUS_CONNECTION,
        null, null);
}

class Tray {
    constructor(conn, repoDir) {
        this._conn = conn;
        this._repoDir = repoDir;
        this._cache = new ViewCache(paths().cacheDir);
        this._rt = createRuntime({onNotify: notify});
        // Cada ícone tem a sua conexão: os dois usam o caminho /StatusNotifierItem
        // e o menu precisa estar no mesmo serviço que o ícone.
        this._menus = [];
        const item = (id, title, label) => {
            const c = privateConnection();
            this._menus.push(new DBusMenu(c, MENU_PATH, a => this._onAction(a)));
            return new StatusNotifierItem({conn: c, id, title, label, menuPath: MENU_PATH,
                onActivate: (_x, _y, token) => this._togglePopup(token)});
        };
        this._items = {};
        for (const it of ITEMS)
            this._items[it.kind] = item(it.id, it.title, it.label);
        for (const m of this._menus)
            m.setItems(menuItems());
        this._view = null;
        this._popup = undefined; // carregado no primeiro clique (GTK4 é opcional)
        this._timer = 0;
    }

    start() {
        const cached = this._cache.read(Date.now());
        if (cached)
            safely('mostrar a última leitura', () => this._render(cached.view));
        // Um de cada vez, para a ordem na bandeja não depender de quem responde antes.
        const [first, second] = registrationOrder(watcherHost(this._conn));
        this._items[first].register(() => this._items[second].register());
        this._tick();
        this._watchVersion();
        // No KDE, o painel de detalhes abre junto do cursor (o app não pode se posicionar no Wayland).
        const runtimeDir = `${GLib.getenv('XDG_RUNTIME_DIR') || GLib.get_tmp_dir()}/breath`;
        loadKwinPlacement(this._conn, new Gio.Credentials().get_unix_pid(), runtimeDir)
            .catch(e => printerr(`breath: não consegui ajustar a posição do painel no KWin (${e.message})`));
        if (readConfig(paths().configPath).updater === 'tray')
            this._scheduleUpdate(0);
    }

    _render(view) {
        const now = Date.now();
        for (const kind of ['session', 'weekly'])
            this._items[kind].update({pixmaps: ringPixmaps(view[kind]), tooltip: tooltipFor(kind, view, now)});
        this._view = view;
        if (this._popup?.visible)
            this._popup.update(view);
    }

    async _tick() {
        if (this._timer) {
            GLib.source_remove(this._timer);
            this._timer = 0;
        }
        try {
            const view = await ensureFresh({cache: this._cache, refresh: () => refreshView(this._rt),
                nowMs: Date.now(), force: true});
            safely('desenhar os ícones', () => this._render(view));
        } catch (e) {
            printerr(`breath: erro no ciclo (${e.name})`);
        }
        if (this._timer)
            return;
        this._timer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, this._rt.controller.nextIntervalSec, () => {
            this._timer = 0;
            this._tick();
            return GLib.SOURCE_REMOVE;
        });
    }

    async _togglePopup(activationToken = null) {
        if (this._popup === undefined) {
            try {
                const {DetailsPopup} = await import('./popup.js');
                this._popup = new DetailsPopup();
            } catch (e) {
                this._popup = null;
                printerr(`breath: painel de detalhes indisponível; instale o GTK4 (${e.message})`);
            }
        }
        if (this._popup && this._view)
            safely('abrir os detalhes', () => this._popup.toggle(this._view, activationToken));
    }

    _onAction(action) {
        if (action === 'details') {
            this._togglePopup();
        } else if (action === 'refresh') {
            this._tick();
        } else if (action === 'open') {
            try {
                Gio.AppInfo.launch_default_for_uri(USAGE_PAGE, null);
            } catch (e) {
                printerr(`breath: não consegui abrir o navegador (${e.message})`);
            }
        }
    }

    /** Checkout de uma versão nova muda .git/HEAD: inicia uma bandeja nova, que toma o nome. */
    _watchVersion() {
        const head = Gio.File.new_for_path(`${this._repoDir}/.git/HEAD`);
        if (!head.query_exists(null))
            return;
        this._monitor = head.monitor_file(Gio.FileMonitorFlags.NONE, null);
        this._restartTimer = 0;
        this._monitor.connect('changed', () => {
            if (this._restartTimer)
                GLib.source_remove(this._restartTimer);
            this._restartTimer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, RESTART_DELAY_SEC, () => {
                this._restartTimer = 0;
                try {
                    GLib.spawn_async(null, ['gjs', '-m', `${this._repoDir}/linux/tray.js`], null,
                        GLib.SpawnFlags.SEARCH_PATH, null);
                } catch (e) {
                    printerr(`breath: não consegui reiniciar a bandeja (${e.message})`);
                }
                return GLib.SOURCE_REMOVE;
            });
        });
    }

    _scheduleUpdate(runs) {
        GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, nextUpdateDelay(runs), () => {
            try {
                GLib.spawn_async(null, [`${this._repoDir}/scripts/update.sh`], null,
                    GLib.SpawnFlags.STDOUT_TO_DEV_NULL | GLib.SpawnFlags.STDERR_TO_DEV_NULL, null);
            } catch (e) {
                printerr(`breath: não consegui buscar atualizações (${e.message})`);
            }
            this._scheduleUpdate(runs + 1);
            return GLib.SOURCE_REMOVE;
        });
    }
}

function main() {
    const repoDir = GLib.path_get_dirname(GLib.path_get_dirname(System.programPath));
    const loop = new GLib.MainLoop(null, false);
    const conn = Gio.DBus.session;
    let tray = null;
    Gio.bus_own_name_on_connection(conn, APP_NAME,
        Gio.BusNameOwnerFlags.ALLOW_REPLACEMENT | Gio.BusNameOwnerFlags.REPLACE,
        () => {
            safely('iniciar a bandeja', () => {
                tray ??= new Tray(conn, repoDir);
                tray.start();
            });
        },
        () => loop.quit()); // outra bandeja tomou o nome (ou não conseguimos): encerra
    loop.run();
}

if (System.programPath && import.meta.url === `file://${System.programPath}`) {
    main();
    System.exit(0);
}
