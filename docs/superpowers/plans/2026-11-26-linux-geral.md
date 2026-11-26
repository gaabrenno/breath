# Breath para Linux em geral — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Levar o Breath a qualquer Linux: dois ícones na bandeja (StatusNotifierItem) e o comando `breath`, com um instalador que escolhe o modo sozinho.

**Architecture:** Um app GJS (`linux/`) reaproveita `extension/lib/` sem mudanças. A bandeja roda o `Controller` e grava a leitura em `~/.cache/breath/view.json`. O comando `bin/breath` lê esse cache e só consulta a API quando o cache está velho, usando uma trava. O instalador grava o modo em `~/.config/breath/install.conf`.

**Tech Stack:** GJS ≥ 1.68 (módulos ES), Gio D-Bus, Soup 3, cairo, GdkPixbuf 2, bash, systemd `--user` (opcional), autostart XDG.

**Spec:** `docs/superpowers/specs/2026-11-26-linux-geral-design.md`

## Global Constraints

- A extensão (`extension/extension.js`, `extension/ui/`, `extension/metadata.json`) **não muda**. `extension/lib/` só pode ganhar exportações novas, sem mudar comportamento.
- O token nunca aparece em log, saída, erro ou arquivo gravado por nós.
- O comando só consulta a API se `view.json` não existir ou tiver mais de **150 s** (ou com `breath refresh`).
- Trava `~/.cache/breath/refresh.lock`, criada de forma exclusiva. Uma trava com **60 s** ou mais é tratada como abandonada.
- Bandeja: dois itens, sessão e depois semana. `Category=ApplicationStatus`, `ItemIsMenu=true`, pixmaps de **22, 32 e 44 px**.
- Nome único no D-Bus: `io.github.gaabrenno.Breath`, com `ALLOW_REPLACEMENT | REPLACE`. Se perder o nome, a bandeja encerra.
- Troca de versão: a bandeja observa `<dir>/.git/HEAD` e, **5 s** depois de uma mudança, inicia uma bandeja nova.
- `~/.config/breath/install.conf` com `mode=gnome|tray|cli` e `updater=systemd|tray|none`.
- Atualizador pela bandeja (`updater=tray`): 2 min depois de iniciar e depois a cada 1 h.
- O instalador nunca usa `sudo` e nunca instala pacotes.
- Textos ao usuário em português, no mesmo tom do README. Cores e limiares vêm de `extension/lib/thresholds.js` (`warn` ≥ 75, `crit` ≥ 90).
- Testes: `TZ=America/Sao_Paulo gjs -m tests/run.js` e `bash tests/shell/run.sh` passam ao fim de cada tarefa.

## Review Focus

1. `view.json` corrompido ou pela metade → tratado como ausente, e o comando consulta a API em vez de quebrar (Tarefa 2).
2. Trava abandonada por um processo que travou (≥ 60 s) → ignorada, sem bloquear as consultas para sempre (Tarefa 2).
3. Comando sem credenciais e sem cache → `--waybar` ainda imprime um JSON válido com `class: "stale"` e `–` (Tarefa 1).
4. `~/.local/bin/breath` já existe e não é nosso link → o instalador não mexe e avisa (Tarefa 8).
5. Reinstalação trocando de modo (`gnome` → `tray`) → o link da extensão é removido e o autostart é criado. `install.conf` sobrevive ao `git clean` do `update.sh` (Tarefas 8 e 9).

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `linux/text.js` | Leitura → textos (menu, tooltip, terminal, `--short`, `--waybar`). Puro. |
| `linux/viewcache.js` | `view.json`, frescor, trava e `ensureFresh`. |
| `linux/runtime.js` | Monta o `Controller` fora do Shell (credenciais, Soup, logs, Store). |
| `linux/notifier.js` | Notificação pelo D-Bus. |
| `linux/cli.js` | Lê as opções e roda o comando. |
| `bin/breath` | Script executável: `exec gjs -m <dir>/linux/cli.js "$@"`. |
| `linux/icon.js` | Desenha o anel e devolve os pixels ARGB32. |
| `linux/dbusmenu.js` | Servidor `com.canonical.dbusmenu`. |
| `linux/sni.js` | Um `org.kde.StatusNotifierItem`. |
| `linux/tray.js` | Ponto de entrada da bandeja. |
| `install.sh`, `uninstall.sh`, `scripts/update.sh` | Modos, `install.conf`, autostart, link do comando. |

Tipos usados em todo o plano (já existem no núcleo):

```js
// Reading: {pct:number|null, resetsAt:number|null, source:'official'|'stale'|'estimate'|'none', ageMs:number, deltaPct:number}
// View:    {plan:string|null, session:Reading, weekly:Reading, weeklyOpus:Reading|null, weeklySonnet:Reading|null, fetchedAt:number|null}
// paceWarning(view, nowMs) → {level:'blue'|'yellow'|'red', title?:string, text:string, secondary?:{level, text}} | null
```

---

### Task 1: Textos (`linux/text.js`)

**Files:**
- Create: `linux/text.js`
- Test: `tests/text.test.js`

**Interfaces:**
- Consumes: `formatReset`, `formatAge` (`extension/lib/format.js`), `paceWarning` (`extension/lib/pace.js`), `colorFor`/limiares (`extension/lib/thresholds.js`).
- Produces:
  - `pctLabel(r: Reading) → string`: `'–'` sem dados; `'~42%'` na estimativa; `'42%'` nos outros casos.
  - `levelOf(view: View) → 'ok'|'warn'|'crit'|'stale'`: pelo pior anel. `stale` se algum anel for `estimate` ou `none`, ou se o pior for `stale` abaixo de 75.
  - `detailLines(view: View, nowMs) → {title:string, warning:string|null, secondary:string|null, rows:{label, pct, reset}[], footer:string}`: o mesmo conteúdo e as mesmas frases do `ui/popup.js` (título com plano, rótulos `Sessão (janela de 5h)`, `Semanal (todos os modelos)`, `Semanal (Opus)`, `Semanal (Sonnet)`, rodapé `Fonte: API /usage · atualizado …` / `Oficial … · +~N% estimado pelos logs` / `Sem dados ainda`).
  - `terminalReport(view, nowMs) → string`: o título, o aviso de ritmo (`⚠ ` + título + texto), uma linha por janela (rótulo alinhado, %, reset) e o rodapé.
  - `shortLine(view) → string`: `'5h 42% · sem 67%'`.
  - `waybarJson(view, nowMs) → string`: `{"text":"42% · 67%","tooltip":<terminalReport>,"class":<levelOf>,"percentage":<maior pct arredondado ou 0>}`.
  - `tooltipFor(kind:'session'|'weekly', view, nowMs) → {title:string, body:string}`: título `'Sessão de 5h: 42%'` / `'Semanal: 67%'`; o corpo é o `terminalReport` sem o título.
  - `EMPTY_VIEW: View`: os dois anéis com `source:'none'`.

- [ ] **Step 1: Escrever os testes que falham**, no formato `export default {nome: fn}` de `tests/format.test.js`, com `now = Date.parse('2026-11-25T17:32:00-03:00')`:
  - `pctLabel` para `official 42.4` → `'42%'`, `estimate 42` → `'~42%'`, `none` → `'–'`.
  - `levelOf`: 42/67 oficial → `'ok'`; 80/10 → `'warn'`; 10/95 → `'crit'`; sessão estimada → `'stale'`; `EMPTY_VIEW` → `'stale'`.
  - `shortLine` 42/67 → `'5h 42% · sem 67%'`.
  - `waybarJson(EMPTY_VIEW, now)` → `JSON.parse` funciona, `text === '– · –'`, `class === 'stale'`, `percentage === 0`.
  - `waybarJson` 42/67 → `class === 'ok'`, `percentage === 67`.
  - `detailLines` com reset às 20:00 → `rows[0].reset === 'Reseta às 20:00 · em 2h 28min'`; com `weeklyOpus` → 3 linhas; título com `plan:'max'` → `'Limites do Claude · Plano Max'`.
  - `tooltipFor('weekly', …).title === 'Semanal: 67%'`.

- [ ] **Step 2: Rodar e ver falhar:** `TZ=America/Sao_Paulo gjs -m tests/run.js text`. Esperado: erro de importação de `linux/text.js`.
- [ ] **Step 3: Implementar `linux/text.js`** com as assinaturas acima. Não importar nada de `gi://`.
- [ ] **Step 4: Rodar e ver passar:** o mesmo comando; esperado `0 failed`.
- [ ] **Step 5: Commit:** `git add linux/text.js tests/text.test.js && git commit -m "feat(linux): textos de menu, tooltip, terminal e waybar"`

---

### Task 2: Cache da leitura e trava (`linux/viewcache.js`)

**Files:**
- Create: `linux/viewcache.js`
- Test: `tests/viewcache.test.js`

**Interfaces:**
- Produces:
  - `export const FRESH_MS = 150e3, LOCK_STALE_MS = 60e3;`
  - `class ViewCache { constructor(dir: string) }`. Os arquivos são `<dir>/view.json` e `<dir>/refresh.lock`.
    - `read(nowMs) → {view: View, savedAt: number}|null`: devolve `null` se o arquivo faltar, estiver inválido ou não tiver `session`/`weekly`. Soma `nowMs - savedAt` ao `ageMs` de cada leitura que não seja `none`, para a idade ficar certa.
    - `write(view, nowMs) → void`: grava `{savedAt, view}` de forma atômica (`replace_contents`) e cria a pasta se preciso.
    - `isFresh(entry, nowMs) → boolean`: `entry !== null && nowMs - entry.savedAt < FRESH_MS`.
    - `tryLock(nowMs) → boolean`: cria o arquivo com `Gio.File.create` (exclusivo), com `nowMs` dentro. Se o arquivo já existir com `nowMs - conteúdo ≥ LOCK_STALE_MS` (ou conteúdo inválido), apaga e tenta uma vez de novo.
    - `unlock() → void`: apaga, ignorando erros.
  - `async ensureFresh({cache: ViewCache, refresh: () => Promise<View>, nowMs: number, force: boolean}) → View`:
    1. lê o cache; se estiver fresco e `!force`, devolve.
    2. se `tryLock` falhar, devolve a leitura do cache ou `EMPTY_VIEW`.
    3. senão, faz `view = await refresh()`, `cache.write(view, nowMs)`, `unlock()` (num `finally`) e devolve `view`.

- [ ] **Step 1: Testes que falham**, usando uma pasta de `GLib.dir_make_tmp('breath-XXXXXX')`:
  - `write` e depois `read` (com `now + 30e3`) devolvem a mesma `view`, com `session.ageMs` somando 30e3.
  - `read` com arquivo `'{"savedAt":'` (cortado) → `null`. **(Review Focus 1)**
  - `isFresh` com 149 s → `true`; com 150 s → `false`.
  - `tryLock` duas vezes → `true` e depois `false`; após `unlock` → `true`.
  - Trava gravada com `now - 61e3` → `tryLock(now)` devolve `true`. **(Review Focus 2)**
  - `ensureFresh` com cache fresco → `refresh` não é chamado.
  - `ensureFresh` com cache velho → chama `refresh` uma vez, grava, e a trava não fica para trás.
  - `ensureFresh` com trava recente de outro processo → não chama `refresh` e devolve o cache velho.
  - `ensureFresh` com `refresh` que lança erro → o erro sobe e a trava é removida.
- [ ] **Step 2: Rodar e ver falhar:** `TZ=America/Sao_Paulo gjs -m tests/run.js viewcache`
- [ ] **Step 3: Implementar `linux/viewcache.js`** com as assinaturas acima (Gio síncrono basta: arquivos pequenos).
- [ ] **Step 4: Rodar e ver passar.**
- [ ] **Step 5: Commit:** `feat(linux): cache da leitura e trava de consulta`

---

### Task 3: Montagem fora do Shell e notificação (`linux/runtime.js`, `linux/notifier.js`)

**Files:**
- Create: `linux/runtime.js`, `linux/notifier.js`
- Test: `tests/runtime.test.js`

**Interfaces:**
- Consumes: `Controller` (`extension/lib/controller.js`), `Store`, `LogScanner`, `fetchUsage`.
- Produces:
  - `paths() → {home, creds, projects, cacheDir, statePath, configPath}`: `cacheDir = <XDG cache>/breath`, `statePath = <cacheDir>/state.json` (o mesmo da extensão), `configPath = <XDG config>/breath/install.conf`.
  - `createRuntime({onNotify: (title, body)=>void}) → {controller: Controller, lastView: () => View|null}`: monta o `Controller` igual ao `enable()` da extensão (`Soup.Session({timeout: 15})`, credenciais com `load_contents_async`, `LogScanner(projects)`, `Store(statePath)`, `now: Date.now`), com um `onUpdate` que guarda a última `View`.
  - `refreshView(runtime) → Promise<View>`: `await runtime.controller.refresh()` e devolve `runtime.lastView() ?? EMPTY_VIEW`. É o `refresh` que a bandeja e o comando passam para `ensureFresh`.
  - `readConfig(path) → {mode: 'gnome'|'tray'|'cli'|null, updater: 'systemd'|'tray'|'none'|null}`: lê `chave=valor`; chaves desconhecidas são ignoradas, e o arquivo ausente dá tudo `null`.
  - `notify(title, body) → void` (`linux/notifier.js`): `org.freedesktop.Notifications.Notify` no barramento de sessão, `app_name 'Breath'`, ícone `''`, timeout `-1`. Qualquer erro é ignorado em silêncio.

- [ ] **Step 1: Testes que falham** para `readConfig`: um arquivo com `mode=tray\nupdater=none\nx=y` → `{mode:'tray', updater:'none'}`; arquivo ausente → `{mode:null, updater:null}`; `mode=foo` → `mode:null`.
- [ ] **Step 2: Rodar e ver falhar:** `… gjs -m tests/run.js runtime`
- [ ] **Step 3: Implementar** `runtime.js` e `notifier.js`.
- [ ] **Step 4: Rodar e ver passar.** Depois, um teste manual: um script temporário no scratchpad que importe `createRuntime` + `refreshView` e imprima `shortLine(view)`. Esperado: `5h N% · sem M%` com os números reais e o token em nenhum lugar da saída.
- [ ] **Step 5: Commit:** `feat(linux): montagem do controller fora do Shell e notificação via D-Bus`

---

### Task 4: Comando `breath` (`linux/cli.js`, `bin/breath`)

**Files:**
- Create: `linux/cli.js`, `bin/breath` (executável)
- Test: `tests/cli.test.js`

**Interfaces:**
- Consumes: `ensureFresh`, `ViewCache` (Tarefa 2), `createRuntime`, `refreshView`, `paths` (Tarefa 3), `notify` (Tarefa 3), funções de texto (Tarefa 1).
- Produces:
  - `parseArgs(argv: string[]) → {cmd:'status'|'refresh'|'version'|'help', format:'text'|'short'|'waybar'|'json'} | {error: string}`.
    - `[]` → status/text; `['status','--waybar']` e `['--waybar']` → status/waybar; `['refresh']` → refresh/text; `['--version']`/`['version']` → version; `['-h']`/`['--help']` → help; outra coisa → `{error: 'opção desconhecida: X'}`.
  - `render(format, view, nowMs, version) → string`: `text` → `terminalReport`; `short` → `shortLine`; `waybar` → `waybarJson`; `json` → `JSON.stringify({version, ...view}, null, 2)`.
  - `readVersion(repoDir) → string`: o `version-name` de `extension/metadata.json`; se não ler, devolve `'dev'`.
  - Programa: `refresh` usa `force: true`. Erro de opção → mensagem de ajuda no stderr e código 2. Erro na consulta → imprime o que houver no cache (ou `EMPTY_VIEW`) e sai com código 0, para não quebrar a barra.
  - `bin/breath`: resolve o próprio caminho seguindo links (`readlink -f`) e roda `exec gjs -m "$dir/../linux/cli.js" "$@"`.

- [ ] **Step 1: Testes que falham** para `parseArgs` (todos os casos acima) e para `render('json', EMPTY_VIEW, now, '1.2.0')` → `JSON.parse(...).version === '1.2.0'`.
- [ ] **Step 2: Rodar e ver falhar:** `… gjs -m tests/run.js cli`
- [ ] **Step 3: Implementar** `linux/cli.js` (lógica + `main` executado só quando for o módulo principal, por exemplo verificando `import.meta.url` contra `ARGV`/`System.programPath`) e `bin/breath`.
- [ ] **Step 4: Rodar e ver passar**, depois o teste manual:
  - `bin/breath` → relatório com números reais.
  - `bin/breath --waybar | python3 -m json.tool` → JSON válido.
  - Rodar `bin/breath --short` duas vezes seguidas. A segunda deve ser instantânea, sem consulta (conferir que o `savedAt` de `~/.cache/breath/view.json` não mudou).
  - `bin/breath --xyz; echo $?` → `2`.
- [ ] **Step 5: Commit:** `feat(linux): comando breath (texto, --short, --waybar, --json, refresh)`

---

### Task 5: Ícone (`linux/icon.js`)

**Files:**
- Create: `linux/icon.js`
- Test: `tests/icon.test.js`

**Interfaces:**
- Consumes: `colorFor` (`thresholds.js`).
- Produces:
  - `rgbaToArgb(pixels: Uint8Array, width, height, rowstride, hasAlpha: boolean) → Uint8Array`: saída com `width*height*4` bytes, em ARGB32 big-endian (`A,R,G,B` por pixel), sem padding de linha. Sem alpha → `A = 255`.
  - `ringPixmaps(r: Reading) → {width, height, bytes: Uint8Array}[]`: tamanhos 22, 32 e 44. O desenho é o do `extension/ui/ring.js` sem a legenda, com o anel ocupando todo o quadrado. O número (`'~42'`, `'42'`, `'–'`) fica em branco com contorno escuro de 1 px (`strokePreserve`) para ler em bandeja clara e escura. Caminho: cairo `ImageSurface` → `writeToPNG` em `$XDG_RUNTIME_DIR/breath/ring-<size>.png` (ou `GLib.get_tmp_dir()` sem `XDG_RUNTIME_DIR`) → `GdkPixbuf.Pixbuf.new_from_file` → `rgbaToArgb`.

- [ ] **Step 1: Testes que falham:**
  - `rgbaToArgb` de 1 pixel `[10,20,30,40]` → `[40,10,20,30]`.
  - 2×1 com `rowstride` 12 (4 bytes de padding no fim da linha) e `hasAlpha` → 8 bytes, sem o padding.
  - 1×1 RGB (`hasAlpha=false`, `[1,2,3]`) → `[255,1,2,3]`.
  - `ringPixmaps({pct:42, source:'official', …})` → 3 itens com larguras `[22,32,44]` e `bytes.length === w*w*4`; algum pixel tem a cor de `colorFor(42)` (com tolerância de ±8 por canal).
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Rodar e ver passar.** Teste manual: abrir os PNGs gerados para 42 oficial, 80 estimativa (tracejado + `~`) e sem dados, e conferir que estão legíveis em 22 px.
- [ ] **Step 5: Commit:** `feat(linux): desenho do anel para a bandeja`

---

### Task 6: Menu D-Bus (`linux/dbusmenu.js`)

**Files:**
- Create: `linux/dbusmenu.js`
- Test: `tests/dbusmenu.test.js`

**Interfaces:**
- Consumes: `detailLines` (Tarefa 1).
- Produces:
  - `menuItems(view, nowMs) → {id:number, label:string, enabled:boolean, type:'standard'|'separator', action?:'refresh'|'open'}[]`. Na ordem: título, aviso (se houver), aviso secundário (se houver), uma linha por janela (`'Sessão de 5h: 42% · Reseta às 15:00 · em 1h'`), rodapé, separador, `'Atualizar agora'` (`action:'refresh'`) e `'Abrir uso no claude.ai'` (`action:'open'`). Os ids são estáveis por posição a partir de 1; o 0 é a raiz.
  - `class DBusMenu { constructor(conn: Gio.DBusConnection, path: string, onAction: (action)=>void); setItems(items); destroy() }`. Implementa `com.canonical.dbusmenu` versão 3: `GetLayout`, `GetGroupProperties`, `GetProperty`, `Event` (só `clicked` chama `onAction`), `EventGroup`, `AboutToShow` (→ `false`), `AboutToShowGroup`, propriedades `Version=3`, `TextDirection='ltr'`, `Status='normal'`, `IconThemePath=[]`, sinais `LayoutUpdated(revision, 0)` e `ItemsPropertiesUpdated`. Cada `setItems` incrementa a revisão e emite `LayoutUpdated`.
  - `layoutVariant(items, revision) → GLib.Variant` de tipo `(u(ia{sv}av))`, exportado para teste.

- [ ] **Step 1: Testes que falham:**
  - `menuItems` de uma view sem aviso → os 2 últimos têm `action` `refresh` e `open`, o anterior é `separator`, e todas as linhas de informação têm `enabled:false`.
  - Os ids são `1..n` e não se repetem.
  - `layoutVariant(items, 7).deepUnpack()[0] === 7`; a raiz tem `children-display='submenu'` e `n` filhos.
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar.** O XML de introspecção fica como string no próprio módulo.
- [ ] **Step 4: Rodar e ver passar.**
- [ ] **Step 5: Commit:** `feat(linux): menu da bandeja via dbusmenu`

---

### Task 7: Item da bandeja e app (`linux/sni.js`, `linux/tray.js`)

**Files:**
- Create: `linux/sni.js`, `linux/tray.js`
- Test: `tests/tray.test.js` (só a lógica pura)

**Interfaces:**
- Consumes: `ringPixmaps` (T5), `DBusMenu`, `menuItems` (T6), `tooltipFor` (T1), `ViewCache`, `ensureFresh` (T2), `createRuntime`, `refreshView`, `paths`, `readConfig`, `notify` (T3).
- Produces:
  - `class StatusNotifierItem { constructor({conn, id, title, menuPath, onActivate}); update({pixmaps, tooltip:{title, body}}); register(); destroy() }` em `linux/sni.js`. Exporta em `/StatusNotifierItem` com um nome de barramento próprio (`org.kde.StatusNotifierItem-<pid>-<n>`). Propriedades: `Category`, `Id`, `Title`, `Status='Active'`, `IconName=''`, `IconPixmap`, `ToolTip (sa(iiay)ss)`, `ItemIsMenu=true`, `Menu` (o caminho do objeto). Métodos: `Activate`, `SecondaryActivate`, `ContextMenu`, `Scroll` (sem efeito, exceto `Activate`, que chama `onActivate`). `update` emite `NewIcon` e `NewToolTip`. `register` chama `org.kde.StatusNotifierWatcher.RegisterStatusNotifierItem(busName)` e, com `Gio.bus_watch_name`, registra de novo sempre que o watcher (re)aparecer.
  - `linux/tray.js` (ponto de entrada, sem exportações além de `nextUpdateDelay`):
    1. `Gio.bus_own_name(SESSION, 'io.github.gaabrenno.Breath', ALLOW_REPLACEMENT|REPLACE, …)`; ao perder o nome → `loop.quit()`.
    2. Cria um `DBusMenu` compartilhado e dois `StatusNotifierItem` (`breath-session` com título `'Breath · Sessão de 5h'`, depois `breath-weekly` com título `'Breath · Semanal'`). `onActivate` não faz nada.
    3. Ciclo igual ao `_tick` da extensão (próximo tick em `controller.nextIntervalSec`). Cada tick faz `view = await ensureFresh({cache, refresh: () => refreshView(rt), nowMs: Date.now(), force: true})` e atualiza os ícones, os tooltips e o menu com essa `view`. Assim a bandeja usa a mesma trava e o mesmo `view.json` que o comando. `onNotify` usa `notify`. Ao iniciar, mostra o cache (se houver) antes do primeiro tick.
    4. Ações do menu: `refresh` → um tick imediato; `open` → `Gio.AppInfo.launch_default_for_uri('https://claude.ai/settings/usage', null)`.
    5. Observa `<repo>/.git/HEAD` com `Gio.File.monitor_file`. A uma mudança, espera 5 s (reiniciando a espera a cada nova mudança) e roda `GLib.spawn_async(['gjs','-m', <repo>/linux/tray.js])`. A bandeja nova toma o nome e a antiga encerra pelo passo 1.
    6. Se `readConfig().updater === 'tray'`: roda `<repo>/scripts/update.sh` (assíncrono, saída descartada) em `nextUpdateDelay(0) = 120 s` e depois a cada 3600 s.
  - `nextUpdateDelay(runs: number) → number`: `120` se `runs === 0`, senão `3600`.

- [ ] **Step 1: Teste que falha:** `nextUpdateDelay(0) === 120`, `nextUpdateDelay(5) === 3600`.
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar** `sni.js` e `tray.js`. Para o `tray.js` poder ser importado no teste sem iniciar nada, o `main()` só roda quando ele for o programa principal (mesmo esquema da Tarefa 4).
- [ ] **Step 4: Rodar os testes e fazer a verificação manual** com `gjs -m linux/tray.js` nesta máquina (GNOME com a extensão AppIndicator ligada, ou num KDE de teste):
  - aparecem dois ícones, `(N)` e `(M)`, com as cores certas;
  - o tooltip mostra os detalhes; o menu abre, e "Atualizar agora" e "Abrir uso no claude.ai" funcionam;
  - rodar uma segunda vez `gjs -m linux/tray.js` → a primeira encerra e fica só um par de ícones;
  - `touch .git/HEAD` → depois de ~5 s, a bandeja é reiniciada (o PID muda), sem ícones duplicados;
  - com a bandeja rodando, `bin/breath --short` não faz consulta (o `savedAt` vem da bandeja).
- [ ] **Step 5: Commit:** `feat(linux): bandeja com dois ícones (StatusNotifierItem)`

---

### Task 8: Instalador com modos (`install.sh`)

**Files:**
- Modify: `install.sh`
- Modify: `tests/shell/lib.sh` (stubs), `tests/shell/install.test.sh`

**Interfaces:**
- Consumes: `bin/breath`, `linux/tray.js`.
- Produces:
  - Opções: `--gnome`, `--tray`, `--cli` (vale a última). Opção inválida → erro antes de criar qualquer coisa.
  - Detecção, sem opção: `gnome-shell --version` 49 **e** `$XDG_CURRENT_DESKTOP` contém `GNOME` → `gnome`; senão, `$WAYLAND_DISPLAY` ou `$DISPLAY` presente → `tray`; senão → `cli`.
  - Pré-requisito de `tray`/`cli`: `gjs -c "imports.gi.versions.Soup='3.0'; imports.gi.versions.GdkPixbuf='2.0'; imports.gi.Soup; imports.gi.GdkPixbuf"` com sucesso. Se falhar, a mensagem contém `gjs` e as linhas `Ubuntu/Debian: sudo apt install gjs gir1.2-soup-3.0 gir1.2-gdkpixbuf-2.0`, `Fedora: sudo dnf install gjs`, `Arch: sudo pacman -S gjs libsoup3` e `openSUSE: sudo zypper install gjs`.
  - O GNOME 49 só é exigido no modo `gnome`. Num GNOME de outra versão (`XDG_CURRENT_DESKTOP` com `GNOME` e versão ≠ 49) → modo `tray` com o aviso sobre "AppIndicator and KStatusNotifierItem Support".
  - Link `~/.local/bin/breath` → `$dir/bin/breath` em todos os modos. Se existir algo ali que não seja um link para dentro de `$dir`, não mexe e avisa `já existe ~/.local/bin/breath`. Se `~/.local/bin` não estiver no `PATH`, avisa.
  - Modo `tray`: grava `~/.config/autostart/breath.desktop` (`[Desktop Entry]`, `Type=Application`, `Name=Breath`, `Exec=gjs -m <dir>/linux/tray.js`, `X-GNOME-Autostart-enabled=true`, `NoDisplay=true`) e roda `setsid -f gjs -m <dir>/linux/tray.js >/dev/null 2>&1`.
  - Trocar de modo: entrando em `tray`/`cli`, remove o link da extensão (só se for link) e a desativa como o `uninstall.sh` faz; entrando em `gnome`/`cli`, remove o autostart.
  - Timer do systemd como hoje, se `systemctl --user` responder (`systemctl --user show-environment` com sucesso); senão, `updater=tray` no modo `tray` e `updater=none` no `cli` (com aviso).
  - Grava `~/.config/breath/install.conf` com `mode=…` e `updater=…`.
  - Mensagem final por modo: `gnome` → a de hoje; `tray` → `Os ícones já devem aparecer na bandeja.`; `cli` → `Use: breath` e um exemplo de módulo da waybar (`"custom/breath": {"exec": "breath --waybar", "return-type": "json", "interval": 30}`).

- [ ] **Step 1: Atualizar os stubs** em `tests/shell/lib.sh`: `sandbox` exporta `XDG_CURRENT_DESKTOP=GNOME`, limpa `WAYLAND_DISPLAY`/`DISPLAY`, e cria os stubs `gjs` (registra no `$SYSLOG`; sai com `${FAKE_GJS_FAIL:-0}`) e `setsid` (registra no `$SYSLOG`, não executa). O stub de `systemctl` sai com `${FAKE_NO_SYSTEMD:-0}` em `show-environment`.
- [ ] **Step 2: Testes que falham** em `install.test.sh`:
  - `test_wrong_gnome` passa a esperar: sai com 0, modo `tray`, saída contém `AppIndicator`.
  - `test_mode_tray_kde`: `XDG_CURRENT_DESKTOP=KDE WAYLAND_DISPLAY=wayland-0` → `install.conf` contém `mode=tray`, `updater=systemd`; o autostart existe com `Exec=gjs -m $BREATH_DIR/linux/tray.js`; o `SYSLOG` contém `setsid`; não há link da extensão.
  - `test_mode_cli_headless`: sem `DISPLAY`/`WAYLAND_DISPLAY` e `XDG_CURRENT_DESKTOP=` → `mode=cli`, sem autostart, saída contém `breath --waybar`.
  - `test_flag_cli` (`bash install.sh --cli` num GNOME 49) → `mode=cli`, sem o link da extensão.
  - `test_bad_flag` (`--xyz`) → falha e `assert_nothing_created`.
  - `test_missing_gjs` (KDE, `FAKE_GJS_FAIL=1`) → falha, saída contém `sudo apt install gjs` e `pacman`, `assert_nothing_created`.
  - `test_cli_link`: `readlink ~/.local/bin/breath` = `$BREATH_DIR/bin/breath`.
  - `test_cli_link_foreign` **(Review Focus 4)**: um arquivo comum em `~/.local/bin/breath` → continua igual, saída contém `já existe`.
  - `test_switch_gnome_to_tray` **(Review Focus 5)**: instala em GNOME 49 e depois roda de novo com `--tray` → o link da extensão sumiu, o autostart existe e `mode=tray`.
  - `test_no_systemd_tray` (`FAKE_NO_SYSTEMD=1`, KDE) → `updater=tray` e nenhum `enable --now` no `SYSLOG`.
- [ ] **Step 3: Rodar e ver falhar:** `bash tests/shell/run.sh install`
- [ ] **Step 4: Implementar** em `install.sh`, mantendo tudo dentro de `main()` e todas as checagens antes da primeira escrita.
- [ ] **Step 5: Rodar e ver passar** (inclusive os testes antigos de `install.test.sh`).
- [ ] **Step 6: Commit:** `feat(install): modos gnome/tray/cli, comando breath e install.conf`

---

### Task 9: Atualizador e desinstalador

**Files:**
- Modify: `scripts/update.sh`, `uninstall.sh`
- Modify: `tests/shell/update.test.sh`, `tests/shell/uninstall.test.sh`

**Interfaces:**
- Consumes: `~/.config/breath/install.conf` (T8).
- Produces:
  - `update.sh`: lê `mode` de `${XDG_CONFIG_HOME:-$HOME/.config}/breath/install.conf` (sem o arquivo → `gnome`, compatível com instalações antigas). Mensagem: `gnome` → a de hoje; outro modo → `Breath atualizado para $latest`.
  - `uninstall.sh`, além do que já faz: `pkill -f "$dir/linux/tray.js"` (ignorando falha), remove `~/.config/autostart/breath.desktop`, remove `~/.local/bin/breath` **só** se for um link para dentro de `$dir`, e remove `~/.config/breath`. A mensagem final no modo `tray`/`cli` não fala em encerrar a sessão.

- [ ] **Step 1: Testes que falham:**
  - `update.test.sh`: com `install.conf` `mode=tray` e uma tag nova → o `notify-send` no `SYSLOG` contém `Breath atualizado para v1.1.0` e **não** contém `próxima sessão`; sem `install.conf` → a mensagem de hoje; `install.conf` continua existindo depois do update **(Review Focus 5)**.
  - `uninstall.test.sh`: depois de instalar com `--tray`, o desinstalador remove o autostart, `~/.local/bin/breath` e `~/.config/breath`, e há `pkill` no `SYSLOG` (adicionar o stub `pkill` em `lib.sh`); um `~/.local/bin/breath` que não é nosso continua lá.
- [ ] **Step 2: Rodar e ver falhar:** `bash tests/shell/run.sh update` e `… uninstall`
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Rodar a suíte toda:** `bash tests/shell/run.sh` e `TZ=America/Sao_Paulo gjs -m tests/run.js` → `0 failed`.
- [ ] **Step 5: Commit:** `feat: atualizador e desinstalador cientes do modo`

---

### Task 10: README e verificação final

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Atualizar o README:**
  - O subtítulo deixa de dizer "na barra do Ubuntu" e passa a dizer "na barra do seu Linux".
  - A linha de compatibilidade passa a ser `Linux (GNOME, KDE, XFCE, Cinnamon…) · Claude Code com assinatura Pro ou Max`.
  - Nova seção **"Onde funciona"**, com a tabela de modos da spec e as opções `--gnome/--tray/--cli` (`curl … | bash -s -- --cli`).
  - Nova seção **"Comando `breath`"**, com exemplos de waybar (o da Tarefa 8), polybar (`type = custom/script`, `exec = breath --short`, `interval = 30`) e i3blocks (`command=breath --short`, `interval=30`).
  - FAQ "Funciona na minha distro?" atualizada, com os pacotes de `gjs` por distro; FAQ "Como funcionam as atualizações?" explicando que, fora do GNOME, a versão nova vale na hora.
  - "Para desenvolvedores": como rodar a bandeja localmente (`gjs -m linux/tray.js`) e ver os logs.
- [ ] **Step 2: Verificação final:** as duas suítes passam; rodar `bash install.sh --tray` de verdade com `BREATH_REPO` apontando para um clone local com uma tag de teste. Conferir os ícones, o menu, `breath --waybar`, o `install.conf`, e depois `uninstall.sh`. Anotar no PR a lista de testes manuais da spec (KDE Plasma 6, XFCE, GNOME + AppIndicator, waybar), separando o que foi testado do que falta.
- [ ] **Step 3: Commit:** `docs: README para Linux em geral (bandeja e comando breath)`
