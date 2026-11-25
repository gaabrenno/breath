import GObject from 'gi://GObject';
import St from 'gi://St';
import Cairo from 'cairo';
import {colorFor} from '../lib/thresholds.js';

const RING = 22;          // diâmetro do anel (px lógicos)
const W = 24, H = 31;     // área total: anel + etiqueta
const LINE = 2.6;

function rgba(hex, alpha = 1) {
    const v = parseInt(hex.slice(1), 16);
    return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255, alpha];
}

function centerText(cr, text, cx, cy, size) {
    cr.selectFontFace('Ubuntu', Cairo.FontSlant.NORMAL, Cairo.FontWeight.BOLD);
    cr.setFontSize(size);
    const ext = cr.textExtents(text);
    cr.moveTo(cx - ext.width / 2 - ext.xBearing, cy - ext.height / 2 - ext.yBearing);
    cr.showText(text);
}

/** Anel de progresso com a % no centro e uma etiqueta embaixo (5h / sem). */
export const Ring = GObject.registerClass(
class Ring extends St.DrawingArea {
    _init(tag) {
        super._init({y_align: 2 /* Clutter.ActorAlign.CENTER */});
        this._tag = tag;
        this._reading = {pct: null, resetsAt: null, source: 'none', ageMs: 0, deltaPct: 0};
        const sf = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        this.set_size(W * sf, H * sf);
        this.connect('repaint', () => this._draw());
    }

    /** @param {import('../lib/estimate.js').Reading} reading */
    setReading(reading) {
        this._reading = reading;
        this.queue_repaint();
    }

    _draw() {
        const cr = this.get_context();
        try {
            const sf = St.ThemeContext.get_for_stage(global.stage).scale_factor;
            cr.scale(sf, sf);
            const {pct, source} = this._reading;
            const cx = W / 2, cy = RING / 2 + 0.5, r = RING / 2 - LINE / 2 - 0.4;
            const approx = source === 'stale' || source === 'estimate';
            const alpha = approx ? 0.6 : 1;

            cr.setLineWidth(LINE);
            cr.setSourceRGBA(1, 1, 1, 0.22);
            cr.arc(cx, cy, r, 0, 2 * Math.PI);
            cr.stroke();

            if (source !== 'none' && pct !== null && pct > 0) {
                cr.setSourceRGBA(...rgba(colorFor(pct), alpha));
                cr.setLineCap(Cairo.LineCap.ROUND);
                if (approx)
                    cr.setDash([2, 1.5], 0);
                const start = -Math.PI / 2;
                cr.arc(cx, cy, r, start, start + 2 * Math.PI * Math.min(1, pct / 100));
                cr.stroke();
                cr.setDash([], 0);
            }

            let text = '–';
            if (source !== 'none' && pct !== null)
                text = `${source === 'estimate' ? '~' : ''}${Math.round(pct)}`;
            cr.setSourceRGBA(1, 1, 1, source === 'none' ? 0.6 : 1);
            centerText(cr, text, cx, cy, text.length >= 3 ? 7 : 8.5);

            cr.setSourceRGBA(1, 1, 1, 0.7);
            centerText(cr, this._tag, cx, RING + 4.5, 6.5);
        } finally {
            cr.$dispose();
        }
    }
});
