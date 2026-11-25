import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {colorFor} from '../lib/thresholds.js';
import {formatReset, formatAge} from '../lib/format.js';

const BAR_W = 268;

const cap = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');

/** Painel de detalhes exibido ao passar o mouse sobre os anéis. */
export const UsagePopup = GObject.registerClass(
class UsagePopup extends St.BoxLayout {
    _init() {
        super._init({style_class: 'claude-limits-popup', vertical: true, reactive: false, visible: false});
        this._title = new St.Label({style_class: 'claude-limits-title'});
        this._rows = new St.BoxLayout({vertical: true});
        this._footer = new St.Label({style_class: 'claude-limits-footer'});
        this.add_child(this._title);
        this.add_child(this._rows);
        this.add_child(this._footer);
    }

    _row(label, r, nowMs) {
        const box = new St.BoxLayout({vertical: true, style_class: 'claude-limits-row'});
        const top = new St.BoxLayout();
        top.add_child(new St.Label({text: label, x_expand: true}));
        const pctText = r.pct === null ? '–' : `${r.source === 'estimate' ? '~' : ''}${Math.round(r.pct)}%`;
        top.add_child(new St.Label({text: pctText, style_class: 'claude-limits-pct'}));
        box.add_child(top);

        const track = new St.Widget({style_class: 'claude-limits-track', width: BAR_W});
        const fillW = Math.round(BAR_W * Math.min(100, r.pct ?? 0) / 100);
        track.add_child(new St.Widget({
            style_class: 'claude-limits-fill', width: fillW,
            style: `background-color: ${colorFor(r.pct)};${r.source === 'official' ? '' : ' opacity: 160;'}`,
        }));
        box.add_child(track);
        box.add_child(new St.Label({text: formatReset(r.resetsAt, nowMs), style_class: 'claude-limits-reset'}));
        return box;
    }

    update(view, nowMs) {
        this._title.text = view.plan ? `Limites do Claude · Plano ${cap(view.plan)}` : 'Limites do Claude';
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
