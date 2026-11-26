// Desenha o anel da bandeja (mesmo desenho de extension/ui/ring.js, sem a legenda)
// e devolve os pixels em ARGB32 big-endian, o formato do IconPixmap.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GdkPixbuf from 'gi://GdkPixbuf?version=2.0';
import Cairo from 'cairo';
import {colorFor} from '../extension/lib/thresholds.js';

const SIZES = [22, 32, 44];
// Anel fino e número grande: os painéis desenham o ícone com 16 a 22 px.
const BASE = 22, LINE = 2;

function rgba(hex, alpha = 1) {
    const v = parseInt(hex.slice(1), 16);
    return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255, alpha];
}

/** Pixels RGB(A) do GdkPixbuf → ARGB32 big-endian, sem padding de linha. */
export function rgbaToArgb(pixels, width, height, rowstride, hasAlpha) {
    const n = hasAlpha ? 4 : 3;
    const out = new Uint8Array(width * height * 4);
    let o = 0;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = y * rowstride + x * n;
            out[o++] = hasAlpha ? pixels[i + 3] : 255;
            out[o++] = pixels[i];
            out[o++] = pixels[i + 1];
            out[o++] = pixels[i + 2];
        }
    }
    return out;
}

/**
 * Deixa em tons de cinza (pelo maior canal) os pixels dentro do disco central.
 * O cairo desenha o texto com suavização por subpixel, que deixa franjas coloridas.
 * @param {Uint8Array} argb ARGB32 big-endian, alterado no lugar
 * @param {number} radiusFrac raio em fração da metade da largura
 */
export function grayInside(argb, width, height, radiusFrac) {
    const cx = width / 2, cy = height / 2, r2 = (radiusFrac * width / 2) ** 2;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 > r2)
                continue;
            const i = (y * width + x) * 4;
            const v = Math.max(argb[i + 1], argb[i + 2], argb[i + 3]);
            argb[i + 1] = argb[i + 2] = argb[i + 3] = v;
        }
    }
    return argb;
}

// Disco do número: até onde começa o anel (ver draw), com folga.
const DISC_FRAC = 0.8;

function draw(cr, size, r) {
    const s = size / BASE;
    const line = LINE * s;
    const c = size / 2, rad = size / 2 - line / 2;
    const {pct, source} = r;
    const hasData = source !== 'none' && pct !== null && pct !== undefined;
    const approx = source === 'stale' || source === 'estimate';

    // Trilha cinza: aparece em bandeja clara e escura.
    cr.setLineWidth(line);
    cr.setSourceRGBA(0.5, 0.5, 0.5, 0.45);
    cr.arc(c, c, rad, 0, 2 * Math.PI);
    cr.stroke();

    if (hasData && pct > 0) {
        cr.setSourceRGBA(...rgba(colorFor(pct), approx ? 0.6 : 1));
        cr.setLineCap(Cairo.LineCap.ROUND);
        if (approx)
            cr.setDash([2 * s, 1.5 * s], 0);
        const start = -Math.PI / 2;
        cr.arc(c, c, rad, start, start + 2 * Math.PI * Math.min(1, pct / 100));
        cr.stroke();
        cr.setDash([], 0);
    }

    // O número vai sobre um disco escuro: legível em painel claro ou escuro.
    // A estimativa já aparece no tracejado; o "~" fica no menu e no tooltip.
    const text = hasData ? `${Math.round(pct)}` : '–';
    cr.setSourceRGBA(0.12, 0.12, 0.12, 0.85);
    cr.arc(c, c, rad - line / 2, 0, 2 * Math.PI);
    cr.fill();
    cr.selectFontFace('Sans', Cairo.FontSlant.NORMAL, Cairo.FontWeight.BOLD);
    cr.setFontSize((text.length >= 3 ? 8.5 : 11.5) * s);
    const ext = cr.textExtents(text);
    cr.setSourceRGBA(1, 1, 1, hasData ? 1 : 0.8);
    cr.moveTo(c - ext.width / 2 - ext.xBearing, c - ext.height / 2 - ext.yBearing);
    cr.showText(text);
}

const PID = new Gio.Credentials().get_unix_pid();

/** PNG temporário do ícone; um por processo, para duas bandejas não se atropelarem na troca de versão. */
export function iconPath(size) {
    const base = GLib.getenv('XDG_RUNTIME_DIR') || GLib.get_tmp_dir();
    const dir = `${base}/breath`;
    GLib.mkdir_with_parents(dir, 0o700);
    return `${dir}/ring-${GLib.getenv('BREATH_ICON_TAG') ?? ''}${PID}-${size}.png`;
}

/**
 * @param {import('../extension/lib/estimate.js').Reading} r
 * @returns {{width:number, height:number, bytes:Uint8Array}[]}
 */
export function ringPixmaps(r) {
    return SIZES.map(size => {
        const surface = new Cairo.ImageSurface(Cairo.Format.ARGB32, size, size);
        const cr = new Cairo.Context(surface);
        try {
            draw(cr, size, r);
        } finally {
            cr.$dispose();
        }
        // O cairo do gjs não expõe os pixels: passa por PNG e GdkPixbuf.
        const path = iconPath(size);
        surface.writeToPNG(path);
        surface.finish();
        const pb = GdkPixbuf.Pixbuf.new_from_file(path);
        const bytes = grayInside(rgbaToArgb(pb.get_pixels(), pb.get_width(), pb.get_height(),
            pb.get_rowstride(), pb.get_has_alpha()), size, size, DISC_FRAC);
        return {width: size, height: size, bytes};
    });
}
