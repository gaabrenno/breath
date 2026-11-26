// Menu da bandeja pelo protocolo com.canonical.dbusmenu (versão 3).
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {detailLines} from './text.js';

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

const ROW_LABELS = ['Sessão de 5h', 'Semanal', 'Semanal (Opus)', 'Semanal (Sonnet)'];

/**
 * Itens do menu: detalhes (desativados), separador e as duas ações.
 * @returns {{id:number, label:string, enabled:boolean, type:'standard'|'separator', action?:string}[]}
 */
export function menuItems(view, nowMs) {
    const d = detailLines(view, nowMs);
    const info = [d.title];
    if (d.warning)
        info.push(`⚠ ${d.warning}`);
    if (d.secondary)
        info.push(`• ${d.secondary}`);
    d.rows.forEach((r, k) => info.push(`${ROW_LABELS[k]}: ${r.pct} · ${r.reset}`));
    info.push(d.footer);
    const items = info.map(label => ({label, enabled: false, type: 'standard'}));
    items.push({label: '', enabled: true, type: 'separator'});
    items.push({label: 'Atualizar agora', enabled: true, type: 'standard', action: 'refresh'});
    items.push({label: 'Abrir uso no claude.ai', enabled: true, type: 'standard', action: 'open'});
    return items.map((it, k) => ({id: k + 1, ...it}));
}

function itemProps(it) {
    const p = {
        'visible': GLib.Variant.new_boolean(true),
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
    constructor(conn, path, onAction) {
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
