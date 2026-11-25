import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {colorFor} from '../lib/thresholds.js';
import {formatReset, formatAge} from '../lib/format.js';
import {paceWarning} from '../lib/pace.js';

const BAR_W = 268;
// Um valor representativo de cada nível, para reaproveitar a mesma paleta dos anéis.
const LEVEL_PCT = {blue: 0, yellow: 75, red: 90};

const cap = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');

/** Painel de detalhes exibido ao passar o mouse sobre os anéis. */
export const UsagePopup = GObject.registerClass(
class UsagePopup extends St.BoxLayout {
    _init() {
        super._init({style_class: 'breath-popup', vertical: true, reactive: false, visible: false});
        this._title = new St.Label({style_class: 'breath-title'});
        this._warning = new St.Label({style_class: 'breath-warning', visible: false});
        this._warning.clutter_text.line_wrap = true;
        this._warning.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
        this._warning.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
        this._secondary = new St.Label({style_class: 'breath-warning-secondary', visible: false});
        this._secondary.clutter_text.line_wrap = true;
        this._secondary.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
        this._secondary.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
        this._rows = new St.BoxLayout({vertical: true});
        this._footer = new St.Label({style_class: 'breath-footer'});
        this.add_child(this._title);
        this.add_child(this._warning);
        this.add_child(this._secondary);
        this.add_child(this._rows);
        this.add_child(this._footer);
    }

    _row(label, r, nowMs) {
        const box = new St.BoxLayout({vertical: true, style_class: 'breath-row'});
        const top = new St.BoxLayout();
        top.add_child(new St.Label({text: label, x_expand: true}));
        const pctText = r.pct === null ? '–' : `${r.source === 'estimate' ? '~' : ''}${Math.round(r.pct)}%`;
        top.add_child(new St.Label({text: pctText, style_class: 'breath-pct'}));
        box.add_child(top);

        const track = new St.Widget({style_class: 'breath-track', width: BAR_W});
        const fillW = Math.round(BAR_W * Math.min(100, r.pct ?? 0) / 100);
        track.add_child(new St.Widget({
            style_class: 'breath-fill', width: fillW,
            style: `background-color: ${colorFor(r.pct)};${r.source === 'official' ? '' : ' opacity: 160;'}`,
        }));
        box.add_child(track);
        box.add_child(new St.Label({text: formatReset(r.resetsAt, nowMs), style_class: 'breath-reset'}));
        return box;
    }

    update(view, nowMs) {
        this._title.text = view.plan ? `Limites do Claude · Plano ${cap(view.plan)}` : 'Limites do Claude';
        const pace = paceWarning(view, nowMs);
        this._warning.visible = pace !== null;
        if (pace) {
            for (const lvl of ['blue', 'yellow', 'red'])
                this._warning.remove_style_class_name(`breath-warning-${lvl}`);
            this._warning.add_style_class_name(`breath-warning-${pace.level}`);
            const body = GLib.markup_escape_text(pace.text, -1);
            this._warning.clutter_text.set_markup(pace.title
                ? `<b>${GLib.markup_escape_text(pace.title, -1)}</b> ${body}` : body);
        }
        const sec = pace?.secondary ?? null;
        this._secondary.visible = sec !== null;
        if (sec) {
            this._secondary.clutter_text.set_markup(
                `<span foreground="${colorFor(LEVEL_PCT[sec.level])}">●</span>  ${GLib.markup_escape_text(sec.text, -1)}`);
        }

        this._rows.destroy_all_children();
        this._rows.add_child(this._row('Sessão (janela de 5h)', view.session, nowMs));
        this._rows.add_child(this._row('Semanal (todos os modelos)', view.weekly, nowMs));
        if (view.weeklyOpus)
            this._rows.add_child(this._row('Semanal (Opus)', view.weeklyOpus, nowMs));
        if (view.weeklySonnet)
            this._rows.add_child(this._row('Semanal (Sonnet)', view.weeklySonnet, nowMs));

        const s = view.session.source;
        if (s === 'none' || view.fetchedAt === null) {
            this._footer.text = 'Sem dados ainda';
        } else {
            const age = formatAge(nowMs - view.fetchedAt);
            if (s === 'official') {
                this._footer.text = `Fonte: API /usage · atualizado ${age}`;
            } else {
                const delta = Math.round(Math.max(view.session.deltaPct, view.weekly.deltaPct));
                this._footer.text = delta > 0
                    ? `Oficial ${age} · +~${delta}% estimado pelos logs`
                    : `Oficial ${age}`;
            }
        }
    }

    /** Posiciona abaixo do ator (botão da barra), sem sair do monitor. */
    showAt(actor) {
        const [x, y] = actor.get_transformed_position();
        const [w, h] = actor.get_transformed_size();
        const mon = Main.layoutManager.findMonitorForActor(actor) ?? Main.layoutManager.primaryMonitor;
        this.show();
        const [, natW] = this.get_preferred_width(-1);
        const px = Math.max(mon.x + 4, Math.min(x + w / 2 - natW / 2, mon.x + mon.width - natW - 4));
        this.set_position(Math.round(px), Math.round(y + h + 4));
        this.ease({opacity: 255, duration: 120, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
    }

    hide() {
        this.opacity = 0;
        super.hide();
    }
});
