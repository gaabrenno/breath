// Comando `breath`: mostra os limites do Claude no terminal ou em barras de status.
import GLib from 'gi://GLib';
import System from 'system';

import {ViewCache, ensureFresh} from './viewcache.js';
import {createRuntime, refreshView, paths} from './runtime.js';
import {notify} from './notifier.js';
import {terminalReport, shortLine, waybarJson, EMPTY_VIEW} from './text.js';

const FORMATS = {'--short': 'short', '--waybar': 'waybar', '--json': 'json', '--text': 'text'};

const HELP = `Uso: breath [status|refresh] [--short|--waybar|--json]
       breath --version

  status     mostra os limites (padrão); só consulta a API se o dado tiver mais de 150 s
  refresh    consulta a API agora
  --short    uma linha, para polybar e i3blocks
  --waybar   JSON para o módulo custom da waybar
  --json     a leitura completa, para scripts`;

/** @returns {{cmd:string, format:string}|{error:string}} */
export function parseArgs(argv) {
    let cmd = 'status', format = 'text';
    for (const a of argv) {
        if (a === 'status' || a === 'refresh')
            cmd = a;
        else if (a === 'version' || a === '--version')
            return {cmd: 'version', format};
        else if (a === '-h' || a === '--help' || a === 'help')
            return {cmd: 'help', format};
        else if (FORMATS[a])
            format = FORMATS[a];
        else
            return {error: `opção desconhecida: ${a}`};
    }
    return {cmd, format};
}

export function render(format, view, nowMs, version) {
    switch (format) {
    case 'short': return shortLine(view);
    case 'waybar': return waybarJson(view, nowMs);
    case 'json': return JSON.stringify({version, ...view}, null, 2);
    default: return terminalReport(view, nowMs);
    }
}

export function readVersion(repoDir) {
    try {
        const [, bytes] = GLib.file_get_contents(`${repoDir}/extension/metadata.json`);
        return JSON.parse(new TextDecoder().decode(bytes))['version-name'] ?? 'dev';
    } catch {
        return 'dev';
    }
}

async function main(argv) {
    const repoDir = GLib.path_get_dirname(GLib.path_get_dirname(System.programPath));
    const args = parseArgs(argv);
    if (args.error) {
        printerr(`breath: ${args.error}\n\n${HELP}`);
        return 2;
    }
    const version = readVersion(repoDir);
    if (args.cmd === 'help') {
        print(HELP);
        return 0;
    }
    if (args.cmd === 'version') {
        print(`breath ${version}`);
        return 0;
    }
    const cache = new ViewCache(paths().cacheDir);
    const nowMs = Date.now();
    let view;
    try {
        const rt = createRuntime({onNotify: notify});
        view = await ensureFresh({cache, refresh: () => refreshView(rt), nowMs, force: args.cmd === 'refresh'});
    } catch (e) {
        printerr(`breath: não consegui atualizar (${e.name})`);
        view = cache.read(nowMs)?.view ?? EMPTY_VIEW;
    }
    print(render(args.format, view, nowMs, version));
    return 0;
}

if (System.programPath && import.meta.url === `file://${System.programPath}`) {
    const loop = new GLib.MainLoop(null, false);
    let code = 0;
    main(System.programArgs).then(c => {
        code = c;
    }).catch(e => {
        printerr(`breath: erro (${e.name})`);
        code = 1;
    }).finally(() => loop.quit());
    loop.run();
    System.exit(code);
}
