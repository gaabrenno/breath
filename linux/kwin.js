// No Wayland, o app não pode posicionar a própria janela. No KDE, um script
// carregado no KWin coloca o painel de detalhes junto do cursor e o tira da
// barra de tarefas.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const PLUGIN = 'breath-place';
const GAP = 8;

/** Código do script do KWin (API do Plasma 6) para a janela "Breath" deste processo. */
export function kwinPlacementScript(pid) {
    return `
const PID = ${Number(pid)}, GAP = ${GAP};
function place(w) {
    if (!w || w.caption !== 'Breath' || w.pid !== PID)
        return;
    w.keepAbove = true;
    w.skipTaskbar = true;
    w.skipPager = true;
    w.skipSwitcher = true;
    const c = workspace.cursorPos;
    const a = workspace.clientArea(KWin.MaximizeArea, w);
    const g = w.frameGeometry;
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, hi));
    const x = clamp(Math.round(c.x - g.width / 2), a.x, a.x + a.width - g.width);
    const below = c.y < a.y + a.height / 2;
    const y = clamp(below ? c.y + GAP : c.y - g.height - GAP, a.y, a.y + a.height - g.height);
    w.frameGeometry = {x, y, width: g.width, height: g.height};
}
workspace.windowAdded.connect(place);
`;
}

function call(conn, path, iface, method, params, type) {
    return new Promise((resolve, reject) => {
        conn.call('org.kde.KWin', path, iface, method, params, type ? new GLib.VariantType(type) : null,
            Gio.DBusCallFlags.NONE, 5000, null, (c, res) => {
                try {
                    resolve(c.call_finish(res));
                } catch (e) {
                    reject(e);
                }
            });
    });
}

/**
 * Carrega o script no KWin, se o KWin estiver no barramento. Substitui o de
 * uma bandeja anterior (mesmo nome de plugin).
 * @returns {Promise<boolean>} true se carregou
 */
export async function loadKwinPlacement(conn, pid, dir) {
    const [hasKwin] = conn.call_sync('org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus',
        'NameHasOwner', new GLib.Variant('(s)', ['org.kde.KWin']), null, Gio.DBusCallFlags.NONE, 2000, null)
        .deepUnpack();
    if (!hasKwin)
        return false;
    GLib.mkdir_with_parents(dir, 0o700);
    const path = `${dir}/kwin-place.js`;
    GLib.file_set_contents(path, kwinPlacementScript(pid));
    const S = 'org.kde.kwin.Scripting';
    await call(conn, '/Scripting', S, 'unloadScript', new GLib.Variant('(s)', [PLUGIN]), '(b)');
    const [id] = (await call(conn, '/Scripting', S, 'loadScript', new GLib.Variant('(ss)', [path, PLUGIN]),
        '(i)')).deepUnpack();
    if (id < 0)
        return false;
    await call(conn, `/Scripting/Script${id}`, 'org.kde.kwin.Script', 'run', null, null);
    return true;
}
