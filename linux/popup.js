// Painel de detalhes da bandeja (GTK4), no mesmo visual do painel da extensão
// (extension/stylesheet.css). Abre no clique; fecha com Esc ou ao perder o foco.
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk?version=4.0';
import Gdk from 'gi://Gdk?version=4.0';
import {popupModel} from './text.js';

Gtk.init();

const WIDTH = 300, BAR_H = 6;
// Só fecha ao perder o foco depois de ficar ativo esse tempo: ao abrir, o
// compositor pode dar e tirar o foco num instante (prevenção de roubo de foco).
const ARM_MS = 400;

const CSS = `
window.breath { background: none; }
.breath-popup {
  background-color: #2b2b2b; color: #eeeeee; border-radius: 14px;
  padding: 14px 16px; font-size: 10pt; border: 1px solid #3a3a3a;
}
.breath-title { font-weight: bold; color: #ffffff; padding-bottom: 6px; }
.breath-warning { border-radius: 8px; padding: 8px 10px; margin-bottom: 6px; font-size: 9.5pt; }
.breath-warning-blue   { background-color: rgba(59, 142, 234, 0.16); color: #cfe3fb; }
.breath-warning-yellow { background-color: rgba(245, 197, 66, 0.14); color: #f3e3b0; }
.breath-warning-red    { background-color: rgba(229, 72, 77, 0.18);  color: #f8c9cb; }
.breath-warning-secondary { color: #bbbbbb; font-size: 9pt; padding: 0 2px 10px 2px; }
.breath-row { padding-bottom: 8px; }
.breath-pct { font-weight: bold; }
.breath-reset { color: #aaaaaa; font-size: 9pt; }
.breath-footer { color: #999999; font-size: 8.5pt; border-top: 1px solid #3a3a3a; padding-top: 8px; }
.breath-actions { padding-top: 6px; }
.breath-actions button {
  background: #3a3a3a; color: #eeeeee; border: none; box-shadow: none;
  border-radius: 8px; padding: 4px 10px; font-size: 9pt; min-height: 0;
}
.breath-actions button:hover { background: #474747; }
`;

const LEVEL_COLOR = {blue: '#3b8eea', yellow: '#f5c542', red: '#e5484d'};

let cssLoaded = false;

function label(text, cls, {wrap = false, markup = false} = {}) {
    const l = new Gtk.Label({xalign: 0, wrap, max_width_chars: 1, hexpand: true});
    if (wrap)
        l.set_size_request(WIDTH, -1);
    if (markup)
        l.set_markup(text);
    else
        l.set_text(text);
    if (cls)
        l.add_css_class(cls);
    return l;
}

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function rgb(hex) {
    const v = parseInt(hex.slice(1), 16);
    return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}

function bar(fraction, color, dim) {
    const area = new Gtk.DrawingArea({content_width: WIDTH, content_height: BAR_H});
    area.set_draw_func((_a, cr, w, h) => {
        const pill = width => {
            const r = h / 2;
            cr.newSubPath();
            cr.arc(r, r, r, Math.PI / 2, 3 * Math.PI / 2);
            cr.arc(Math.max(r, width - r), r, r, -Math.PI / 2, Math.PI / 2);
            cr.closePath();
            cr.fill();
        };
        cr.setSourceRGBA(0x44 / 255, 0x44 / 255, 0x44 / 255, 1);
        pill(w);
        if (fraction > 0) {
            cr.setSourceRGBA(...rgb(color), dim ? 0.63 : 1);
            pill(Math.max(h, w * fraction));
        }
        cr.$dispose();
    });
    return area;
}

export class DetailsPopup {
    /** @param {(action:'refresh'|'open')=>void} onAction botões do painel */
    constructor(onAction = () => {}) {
        this._onAction = onAction;
        if (!cssLoaded) {
            const provider = new Gtk.CssProvider();
            provider.load_from_string(CSS);
            Gtk.StyleContext.add_provider_for_display(Gdk.Display.get_default(), provider,
                Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
            cssLoaded = true;
        }
        this._win = new Gtk.Window({title: 'Breath', decorated: false, resizable: false});
        this._win.add_css_class('breath');
        this._win.connect('close-request', () => {
            this._win.set_visible(false);
            return true; // reaproveita a janela
        });
        const keys = new Gtk.EventControllerKey();
        keys.connect('key-pressed', (_c, keyval) => {
            if (keyval === Gdk.KEY_Escape)
                this.hide();
            return false;
        });
        this._win.add_controller(keys);
        this._armed = false;
        this._armTimer = 0;
        this._win.connect('notify::is-active', () => {
            if (this._win.is_active) {
                if (!this._armTimer && !this._armed) {
                    this._armTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ARM_MS, () => {
                        this._armTimer = 0;
                        this._armed = this._win.is_active;
                        return GLib.SOURCE_REMOVE;
                    });
                }
            } else if (this._armed) {
                this.hide();
            }
        });
        this._view = null;
    }

    get visible() {
        return this._win.get_visible();
    }

    hide() {
        this._armed = false;
        if (this._armTimer) {
            GLib.source_remove(this._armTimer);
            this._armTimer = 0;
        }
        this._win.set_visible(false);
    }

    /**
     * Abre (ou fecha, se já aberto) com a leitura dada.
     * @param {string|null} activationToken token xdg-activation do painel, se houver
     */
    toggle(view, activationToken = null) {
        if (this.visible) {
            this.hide();
            return;
        }
        this.update(view);
        if (activationToken)
            this._win.set_startup_id(activationToken);
        this._win.present();
    }

    update(view) {
        this._view = view;
        const m = popupModel(view, Date.now());
        const box = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL, spacing: 6});
        box.add_css_class('breath-popup');
        box.append(label(m.title, 'breath-title'));
        if (m.warning) {
            const w = label(m.warning.title
                ? `<b>${esc(m.warning.title)}</b> ${esc(m.warning.text)}` : esc(m.warning.text),
            'breath-warning', {wrap: true, markup: true});
            w.add_css_class(`breath-warning-${m.warning.level}`);
            box.append(w);
        }
        if (m.secondary) {
            box.append(label(`<span foreground="${LEVEL_COLOR[m.secondary.level]}">●</span>  ${esc(m.secondary.text)}`,
                'breath-warning-secondary', {wrap: true, markup: true}));
        }
        for (const r of m.rows) {
            const row = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL, spacing: 4});
            row.add_css_class('breath-row');
            const top = new Gtk.Box({spacing: 6});
            top.append(label(r.label));
            const pct = new Gtk.Label({label: r.pct, xalign: 1});
            pct.add_css_class('breath-pct');
            top.append(pct);
            row.append(top);
            row.append(bar(r.fraction, r.color, r.dim));
            row.append(label(r.reset, 'breath-reset'));
            box.append(row);
        }
        box.append(label(m.footer, 'breath-footer'));
        const actions = new Gtk.Box({spacing: 6, halign: Gtk.Align.END});
        actions.add_css_class('breath-actions');
        for (const [text, action] of [['Atualizar agora', 'refresh'], ['Abrir uso no claude.ai', 'open']]) {
            const b = new Gtk.Button({label: text});
            b.connect('clicked', () => this._onAction(action));
            actions.append(b);
        }
        box.append(actions);
        this._win.set_child(box);
    }
}
