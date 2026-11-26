// Notificação pelo serviço padrão do desktop (org.freedesktop.Notifications).
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

/** Mostra uma notificação; sem serviço de notificação, não faz nada. */
export function notify(title, body) {
    try {
        Gio.DBus.session.call(
            'org.freedesktop.Notifications', '/org/freedesktop/Notifications',
            'org.freedesktop.Notifications', 'Notify',
            new GLib.Variant('(susssasa{sv}i)', ['Breath', 0, '', title, body, [], {}, -1]),
            null, Gio.DBusCallFlags.NONE, -1, null, (conn, res) => {
                try {
                    conn.call_finish(res);
                } catch {}
            });
    } catch {}
}
