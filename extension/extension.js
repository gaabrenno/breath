import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import Soup from 'gi://Soup?version=3.0';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {Controller} from './lib/controller.js';
import {Store} from './lib/store.js';
import {LogScanner} from './lib/logscan.js';
import {fetchUsage} from './lib/api.js';
import {Ring} from './ui/ring.js';
import {UsagePopup} from './ui/popup.js';

Gio._promisify(Gio.File.prototype, 'load_contents_async');

const HOVER_DELAY_MS = 250;
const USAGE_PAGE = 'https://claude.ai/settings/usage';

export default class ClaudeLimitsExtension extends Extension {
    enable() {
        const home = GLib.get_home_dir();
        const credsFile = Gio.File.new_for_path(`${home}/.claude/.credentials.json`);
        const scanner = new LogScanner(`${home}/.claude/projects`);
        this._session = new Soup.Session({timeout: 15});

        // Indicador
        this._button = new PanelMenu.Button(0.5, 'Breath', false);
        this._button.add_style_class_name('breath-button');
        const box = new St.BoxLayout({style_class: 'breath-box'});
        this._ringSession = new Ring('5h');
        this._ringWeekly = new Ring('sem');
        box.add_child(this._ringSession);
        box.add_child(this._ringWeekly);
        this._button.add_child(box);

        // Menu de clique
        const refreshItem = new PopupMenu.PopupMenuItem('Atualizar agora');
        refreshItem.connect('activate', () => this._tick());
        this._button.menu.addMenuItem(refreshItem);
        const openItem = new PopupMenu.PopupMenuItem('Abrir uso no claude.ai');
        openItem.connect('activate', () => {
            Gio.AppInfo.launch_default_for_uri(USAGE_PAGE, global.create_app_launch_context(0, -1));
        });
        this._button.menu.addMenuItem(openItem);
        this._button.menu.connect('open-state-changed', (_m, open) => {
            if (open)
                this._hidePopup();
        });

        // Painel do hover
        this._popup = new UsagePopup();
        Main.uiGroup.add_child(this._popup);
        // `hover` (track_hover) não pisca ao passar pelos filhos, ao contrário de enter/leave.
        this._button.connect('notify::hover', () => {
            if (this._button.hover)
                this._scheduleShow();
            else
                this._hidePopup();
        });

        Main.panel.addToStatusArea('breath', this._button, 1, 'left');

        this._view = null;
        this._controller = new Controller({
            readCredentialsText: async () => {
                const [bytes] = await credsFile.load_contents_async(null);
                return new TextDecoder().decode(bytes);
            },
            fetchUsage: token => fetchUsage(this._session, token),
            countTokens: (from, to) => scanner.countTokens(from, to),
            store: new Store(`${GLib.get_user_cache_dir()}/breath/state.json`),
            now: () => Date.now(),
            onUpdate: view => this._render(view),
            onNotify: (title, body) => Main.notify(title, body),
        });
        this._tick();
    }

    disable() {
        if (this._timer) {
            GLib.source_remove(this._timer);
            this._timer = 0;
        }
        if (this._hoverTimer) {
            GLib.source_remove(this._hoverTimer);
            this._hoverTimer = 0;
        }
        this._session?.abort();
        this._session = null;
        this._popup?.destroy();
        this._popup = null;
        this._button?.destroy();
        this._button = null;
        this._ringSession = this._ringWeekly = null;
        this._controller = null;
        this._view = null;
    }

    async _tick() {
        const controller = this._controller;
        if (!controller)
            return;
        if (this._timer) {
            GLib.source_remove(this._timer);
            this._timer = 0;
        }
        try {
            await controller.refresh();
        } catch (e) {
            console.warn(`breath: erro no ciclo (${e.name})`);
        }
        if (this._controller !== controller || this._timer)
            return; // desabilitada ou já reagendada no meio tempo
        this._timer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, controller.nextIntervalSec, () => {
            this._timer = 0;
            this._tick();
            return GLib.SOURCE_REMOVE;
        });
    }

    _render(view) {
        if (!this._button)
            return;
        this._view = view;
        this._ringSession.setReading(view.session);
        this._ringWeekly.setReading(view.weekly);
        if (this._popup.visible)
            this._popup.update(view, Date.now());
    }

    _scheduleShow() {
        if (this._hoverTimer)
            return;
        this._hoverTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, HOVER_DELAY_MS, () => {
            this._hoverTimer = 0;
            if (this._button && !this._button.menu.isOpen && this._view) {
                this._popup.update(this._view, Date.now());
                this._popup.showAt(this._button);
            }
            return GLib.SOURCE_REMOVE;
        });
    }

    _hidePopup() {
        if (this._hoverTimer) {
            GLib.source_remove(this._hoverTimer);
            this._hoverTimer = 0;
        }
        this._popup?.hide();
    }
}
