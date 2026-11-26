// Menu da bandeja pelo protocolo com.canonical.dbusmenu (versão 3).
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const IFACE = `<node>
<interface name="com.canonical.dbusmenu">
  <method name="GetLayout">
    <arg type="i" direction="in"/><arg type="i" direction="in"/><arg type="as" direction="in"/>
    <arg type="u" direction="out"/><arg type="(ia{sv}av)" direction="out"/>
  </method>
  <method name="GetGroupProperties">
    <arg type="ai" direction="in"/><arg type="as" direction="in"/>
    <arg type="a(ia{sv})" direction="out"/>
  </method>
  <method name="GetProperty">
    <arg type="i" direction="in"/><arg type="s" direction="in"/><arg type="v" direction="out"/>
  </method>
  <method name="Event">
    <arg type="i" direction="in"/><arg type="s" direction="in"/><arg type="v" direction="in"/>
    <arg type="u" direction="in"/>
  </method>
  <method name="EventGroup">
    <arg type="a(isvu)" direction="in"/><arg type="ai" direction="out"/>
  </method>
  <method name="AboutToShow">
    <arg type="i" direction="in"/><arg type="b" direction="out"/>
  </method>
  <method name="AboutToShowGroup">
    <arg type="ai" direction="in"/><arg type="ai" direction="out"/><arg type="ai" direction="out"/>
  </method>
  <property name="Version" type="u" access="read"/>
  <property name="TextDirection" type="s" access="read"/>
  <property name="Status" type="s" access="read"/>
  <property name="IconThemePath" type="as" access="read"/>
  <signal name="ItemsPropertiesUpdated">
    <arg type="a(ia{sv})"/><arg type="a(ias)"/>
  </signal>
  <signal name="LayoutUpdated"><arg type="u"/><arg type="i"/></signal>
  <signal name="ItemActivationRequested"><arg type="i"/><arg type="u"/></signal>
</interface>
</node>`;

/**
 * Menu enxuto: os detalhes ficam no painel próprio. Ids fixos.
 * @returns {{id:number, label:string, enabled:boolean, type:'standard'|'separator', action?:string}[]}
 */
export function menuItems() {
    return [
        {id: 1, label: 'Ver detalhes', enabled: true, type: 'standard', action: 'details'},
        {id: 2, label: '', enabled: true, type: 'separator'},
        {id: 3, label: 'Atualizar agora', enabled: true, type: 'standard', action: 'refresh'},
        {id: 4, label: 'Abrir uso no claude.ai', enabled: true, type: 'standard', action: 'open'},
    ];
}

/**
 * Menu da bandeja no GNOME (AppIndicator): lá o clique simples sempre abre o menu,
 * então ele tem um único item e a abertura dele abre o painel de detalhes.
 * (Um item invisível não serve: o GNOME não abre menu sem item visível.)
 * Cada volta do item usa um id novo: a AppIndicator não readiciona um id removido.
 */
export function gnomeMenuItems(id) {
    return [{id, label: 'Abrindo os detalhes…', enabled: false, type: 'standard'}];
}

/**
 * GNOME (AppIndicator): o clique simples sempre abre o menu. Quando o menu atual
 * abre, abre o painel e esvazia o menu (ele some). Com o menu fechado, a AppIndicator
 * adia qualquer atualização do menu até ele abrir de novo, e um menu vazio não abre;
 * por isso, ao fechar, o ícone passa a apontar para o outro menu (a AppIndicator
 * recria o menu na hora quando a propriedade Menu muda).
 */
export class GnomeClickMenus {
    /**
     * @param {{paths:string[], setItems:(index:number, items:object[])=>void,
     *          setMenuPath:(path:string)=>void, openPopup:()=>void}} o
     */
    constructor({paths, setItems, setMenuPath, openPopup}) {
        Object.assign(this, {_paths: paths, _setItems: setItems, _setMenuPath: setMenuPath,
            _openPopup: openPopup});
        this._current = 0;
        this._nextId = 1;
    }

    get currentPath() {
        return this._paths[this._current];
    }

    /** Itens iniciais de cada menu. */
    initialItems() {
        return gnomeMenuItems(this._nextId++);
    }

    onRoot(index, ev) {
        if (index !== this._current)
            return; // evento atrasado do menu que já saiu de uso
        if (ev === 'opened') {
            this._openPopup();
            this._setItems(index, []);
        } else {
            this._setItems(index, gnomeMenuItems(this._nextId++));
            this._current = 1 - index;
            this._setMenuPath(this.currentPath);
        }
    }
}

/** 'opened' / 'closed' quando o evento é do menu raiz (id 0); senão null. */
export function rootEvent(id, eventId) {
    return id === 0 && (eventId === 'opened' || eventId === 'closed') ? eventId : null;
}

function itemProps(it) {
    const p = {
        'visible': GLib.Variant.new_boolean(it.visible !== false),
        'enabled': GLib.Variant.new_boolean(it.enabled),
    };
    if (it.type === 'separator')
        p['type'] = GLib.Variant.new_string('separator');
    else
        p['label'] = GLib.Variant.new_string(it.label.replace(/_/g, '__'));
    return p;
}

const node = (id, props, children = []) =>
    new GLib.Variant('(ia{sv}av)', [id, props, children]);

const rootProps = () => ({'children-display': GLib.Variant.new_string('submenu')});

/** @returns {GLib.Variant} de tipo (u(ia{sv}av)) */
export function layoutVariant(items, revision) {
    const children = items.map(it => node(it.id, itemProps(it)));
    return new GLib.Variant('(u(ia{sv}av))', [revision, [0, rootProps(), children]]);
}

export class DBusMenu {
    /**
     * @param {Gio.DBusConnection} conn
     * @param {string} path
     * @param {(action:string)=>void} onAction
     */
    /** onRoot('opened'|'closed'): o painel abriu ou fechou o menu. */
    constructor(conn, path, onAction, onRoot = () => {}) {
        this._onRoot = onRoot;
        this._items = [];
        this._revision = 1;
        this._onAction = onAction;
        this._impl = Gio.DBusExportedObject.wrapJSObject(IFACE, this);
        this._impl.export(conn, path);
    }

    setItems(items) {
        this._items = items;
        this._revision++;
        this._impl.emit_signal('LayoutUpdated', new GLib.Variant('(ui)', [this._revision, 0]));
    }

    destroy() {
        this._impl.unexport();
    }

    get Version() {
        return 3;
    }

    get TextDirection() {
        return 'ltr';
    }

    get Status() {
        return 'normal';
    }

    get IconThemePath() {
        return [];
    }

    _props(id) {
        if (id === 0)
            return rootProps();
        const it = this._items.find(i => i.id === id);
        return it ? itemProps(it) : null;
    }

    GetLayout(parentId, _depth, _names) {
        if (parentId === 0)
            return layoutVariant(this._items, this._revision);
        const props = this._props(parentId) ?? {};
        return new GLib.Variant('(u(ia{sv}av))', [this._revision, [parentId, props, []]]);
    }

    GetGroupProperties(ids, _names) {
        const out = [];
        for (const id of ids) {
            const p = this._props(id);
            if (p)
                out.push([id, p]);
        }
        return new GLib.Variant('(a(ia{sv}))', [out]);
    }

    GetProperty(id, name) {
        const v = this._props(id)?.[name];
        if (!v)
            throw new Error(`propriedade desconhecida: ${name}`);
        return new GLib.Variant('(v)', [v]);
    }

    Event(id, eventId, _data, _ts) {
        const root = rootEvent(id, eventId);
        if (root)
            this._onRoot(root);
        if (eventId !== 'clicked')
            return;
        const it = this._items.find(i => i.id === id);
        if (it?.action)
            this._onAction(it.action);
    }

    EventGroup(events) {
        const errors = [];
        for (const [id, eventId, data, ts] of events) {
            if (this._items.some(i => i.id === id))
                this.Event(id, eventId, data, ts);
            else
                errors.push(id);
        }
        return errors;
    }

    AboutToShow(_id) {
        return false;
    }

    AboutToShowGroup(_ids) {
        return [[], []];
    }
}
