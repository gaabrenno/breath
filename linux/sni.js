// Um ícone de bandeja pelo protocolo StatusNotifierItem (KDE, XFCE, Cinnamon,
// MATE, Budgie, waybar e GNOME com a extensão AppIndicator).
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const WATCHER = 'org.kde.StatusNotifierWatcher';
const PATH = '/StatusNotifierItem';

const IFACE = `<node>
<interface name="org.kde.StatusNotifierItem">
  <property name="Category" type="s" access="read"/>
  <property name="Id" type="s" access="read"/>
  <property name="Title" type="s" access="read"/>
  <property name="Status" type="s" access="read"/>
  <property name="WindowId" type="i" access="read"/>
  <property name="IconName" type="s" access="read"/>
  <property name="IconThemePath" type="s" access="read"/>
  <property name="IconPixmap" type="a(iiay)" access="read"/>
  <property name="OverlayIconName" type="s" access="read"/>
  <property name="AttentionIconName" type="s" access="read"/>
  <property name="ToolTip" type="(sa(iiay)ss)" access="read"/>
  <property name="ItemIsMenu" type="b" access="read"/>
  <property name="Menu" type="o" access="read"/>
  <property name="XAyatanaLabel" type="s" access="read"/>
  <property name="XAyatanaLabelGuide" type="s" access="read"/>
  <method name="ContextMenu"><arg type="i" direction="in"/><arg type="i" direction="in"/></method>
  <method name="Activate"><arg type="i" direction="in"/><arg type="i" direction="in"/></method>
  <method name="SecondaryActivate"><arg type="i" direction="in"/><arg type="i" direction="in"/></method>
  <method name="Scroll"><arg type="i" direction="in"/><arg type="s" direction="in"/></method>
  <signal name="NewTitle"/>
  <signal name="NewIcon"/>
  <signal name="NewToolTip"/>
  <signal name="NewStatus"><arg type="s"/></signal>
  <signal name="XAyatanaNewLabel"><arg type="s"/><arg type="s"/></signal>
</interface>
</node>`;

let counter = 0;

export class StatusNotifierItem {
    /**
     * label: texto curto ao lado do ícone, nos painéis que aceitam (ex.: AppIndicator do GNOME).
     * @param {{conn:Gio.DBusConnection, id:string, title:string, label:string, menuPath:string,
     *          onActivate:()=>void}} o
     */
    constructor({conn, id, title, label = '', menuPath, onActivate}) {
        this._label = label;
        this._conn = conn;
        this._id = id;
        this._title = title;
        this._menuPath = menuPath;
        this._onActivate = onActivate;
        this._pixmaps = [];
        this._tooltip = {title, body: ''};
        this._busName = `org.kde.StatusNotifierItem-${new Gio.Credentials().get_unix_pid()}-${++counter}`;
        this._impl = Gio.DBusExportedObject.wrapJSObject(IFACE, this);
        this._impl.export(conn, PATH);
        this._ownId = 0;
        this._watchId = 0;
    }

    /** Pede o nome no barramento e se registra no watcher sempre que ele aparecer. */
    register() {
        this._ownId = Gio.bus_own_name_on_connection(this._conn, this._busName, Gio.BusNameOwnerFlags.NONE,
            () => {
                this._watchId = Gio.bus_watch_name_on_connection(this._conn, WATCHER,
                    Gio.BusNameWatcherFlags.NONE, () => this._registerWithWatcher(), null);
            }, null);
    }

    _registerWithWatcher() {
        this._conn.call(WATCHER, '/StatusNotifierWatcher', WATCHER, 'RegisterStatusNotifierItem',
            new GLib.Variant('(s)', [this._busName]), null, Gio.DBusCallFlags.NONE, -1, null,
            (c, res) => {
                try {
                    c.call_finish(res);
                } catch (e) {
                    printerr(`breath: não consegui registrar o ícone na bandeja (${e.message})`);
                }
            });
    }

    /** @param {{pixmaps:{width:number,height:number,bytes:Uint8Array}[], tooltip:{title:string, body:string}}} u */
    update({pixmaps, tooltip}) {
        this._pixmaps = pixmaps;
        this._tooltip = tooltip;
        this._impl.emit_signal('NewIcon', null);
        this._impl.emit_signal('NewToolTip', null);
    }

    destroy() {
        if (this._watchId)
            Gio.bus_unwatch_name(this._watchId);
        if (this._ownId)
            Gio.bus_unown_name(this._ownId);
        this._impl.unexport();
    }

    _pixmapList() {
        return this._pixmaps.map(p => [p.width, p.height, p.bytes]);
    }

    get Category() {
        return 'ApplicationStatus';
    }

    get Id() {
        return this._id;
    }

    get Title() {
        return this._title;
    }

    get Status() {
        return 'Active';
    }

    get WindowId() {
        return 0;
    }

    get IconName() {
        return '';
    }

    get IconThemePath() {
        return '';
    }

    get IconPixmap() {
        return new GLib.Variant('a(iiay)', this._pixmapList());
    }

    get OverlayIconName() {
        return '';
    }

    get AttentionIconName() {
        return '';
    }

    get ToolTip() {
        return new GLib.Variant('(sa(iiay)ss)', ['', [], this._tooltip.title, this._tooltip.body]);
    }

    get XAyatanaLabel() {
        return this._label;
    }

    get XAyatanaLabelGuide() {
        return 'sem';
    }

    get ItemIsMenu() {
        return true;
    }

    get Menu() {
        return new GLib.Variant('o', this._menuPath);
    }

    ContextMenu(_x, _y) {}

    Activate(_x, _y) {
        this._onActivate();
    }

    SecondaryActivate(_x, _y) {}

    Scroll(_delta, _orientation) {}
}
