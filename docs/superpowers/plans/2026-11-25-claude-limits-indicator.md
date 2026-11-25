# Indicador de limites do Claude (GNOME) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extensão GNOME Shell 49 que mostra dois anéis (sessão 5h e semanal) com a % de uso do Claude na barra superior, com painel de detalhes no hover.

**Architecture:** Toda a lógica (parse da API, credenciais, contagem de tokens nos logs, estimativa, política de notificação, formatação, ciclo de atualização) fica em módulos ES puros sob `lib/`, testáveis com `gjs -m` fora do Shell. A camada de UI (`ui/`, `extension.js`) só desenha o que o `Controller` entrega e é verificada manualmente.

**Tech Stack:** GJS 1.86 (ES modules), GNOME Shell 49 (St, Clutter, PanelMenu, PopupMenu, MessageTray), Soup 3, Gio, Cairo.

**Spec:** `docs/superpowers/specs/2026-11-25-claude-limits-indicator-design.md`

## Global Constraints

- UUID da extensão: `claude-limits@simer`; `metadata.json` com `"shell-version": ["49"]`.
- Instalação: symlink de `extension/` → `~/.local/share/gnome-shell/extensions/claude-limits@simer`.
- Endpoint: `GET https://api.anthropic.com/api/oauth/usage` com headers `Authorization: Bearer <token>` e `anthropic-beta: oauth-2025-04-20`.
- Credenciais: `~/.claude/.credentials.json`, campo `claudeAiOauth.{accessToken, expiresAt (ms), subscriptionType}`. **Somente leitura. Nunca renovar token, nunca escrever nesse arquivo, nunca logar o token.**
- Logs: `~/.claude/projects/*/*.jsonl`.
- Estado persistido: `~/.cache/claude-limits/state.json`.
- Cores: `< 75` `#3b8eea`; `75–89` `#f5c542`; `≥ 90` `#e5484d`; sem dados `#888888`; trilho branco com alpha 0.22.
- Intervalo: 120 s; em HTTP 429, dobrar até no máximo 600 s; voltar a 120 s após sucesso.
- Limiar de notificação: 90%, uma vez por (janela `resets_at`, fonte `official|estimate`).
- URL do menu "Abrir uso no claude.ai": `https://claude.ai/settings/usage`.
- Textos da UI em pt-BR.
- Nada de I/O síncrono na thread do Shell (usar `Gio` async / `Soup` async).
- Node não está disponível; testes rodam com `gjs -m tests/run.js`.

## Review Focus

1. **Linhas duplicadas nos logs:** o Claude Code grava várias linhas para a mesma resposta (uma por bloco de conteúdo), todas com o mesmo `usage`. Contar cada `requestId` (ou `message.id`) uma única vez. *Teste na Task 3.*
2. **`five_hour` nulo ou com `resets_at` nulo** (sem sessão ativa): mostrar 0%, sem quebrar. *Teste na Task 2.*
3. **`credentials.json` lido no meio de uma escrita** (JSON inválido ou truncado): tratar como "sem token neste ciclo" e cair no fallback, sem exceção. *Teste na Task 2.*
4. **Janela resetou enquanto estava em fallback:** a base vira 0% e conta-se só o uso desde o reset. Nunca mostrar 81% de uma semana que já virou. *Teste na Task 4.*
5. **Estimativa acima de 100% ou calibração com tokens = 0:** limitar a 100%; sem calibração, mostrar só o oficial antigo, sem acréscimo. *Teste na Task 4.*

---

## Estrutura de arquivos

```
extension/
  metadata.json
  extension.js          enable/disable; cria Indicator e Controller
  stylesheet.css
  lib/thresholds.js     cor por %
  lib/format.js         textos de reset/idade em pt-BR
  lib/credentials.js    parse do credentials.json (texto → token|null)
  lib/usage.js          parse da resposta da API
  lib/tokens.js         contagem de tokens em texto JSONL (puro)
  lib/logscan.js        varredura async dos arquivos de log
  lib/estimate.js       oficial + acréscimo → Reading
  lib/notify.js         política de notificação
  lib/store.js          load/save do state.json (async)
  lib/api.js            cliente Soup
  lib/controller.js     ciclo de atualização (dependências injetadas)
  ui/ring.js            anel (St.DrawingArea + Cairo)
  ui/popup.js           painel do hover
tests/
  run.js                harness mínimo (descobre tests/*.test.js)
  *.test.js
  fixtures/
scripts/
  install.sh            cria o symlink e compila nada (não há schemas)
  smoke-api.js          chamada real à API (manual)
```

**Tipos compartilhados** (documentar em JSDoc em `lib/estimate.js`):

```js
/** @typedef {{pct:number, resetsAt:number|null}} Window   // resetsAt em ms epoch
 *  @typedef {{session:Window, weekly:Window, weeklyOpus:Window|null, weeklySonnet:Window|null}} Usage
 *  @typedef {{ts:number, plan:string, usage:Usage, tokens5h:number, tokens7d:number}} Official
 *  @typedef {{pct:number|null, resetsAt:number|null,
 *             source:'official'|'stale'|'estimate'|'none',
 *             ageMs:number, deltaPct:number}} Reading
 *  @typedef {{official:Official|null, notified:string[]}} State
 */
```

---

### Task 1: Esqueleto, harness de testes, thresholds e format

**Files:**
- Create: `extension/metadata.json`, `extension/lib/thresholds.js`, `extension/lib/format.js`, `tests/run.js`, `tests/thresholds.test.js`, `tests/format.test.js`, `.gitignore` (`.superpowers/`)

**Interfaces:**
- Produces:
  - `tests/run.js`: cada `tests/*.test.js` exporta `default` como `{[nome:string]: () => void|Promise<void>}`; o harness também exporta `assertEq(a, b, msg?)` (comparação via `JSON.stringify`) e `assert(cond, msg?)`. Imprime `PASS/FAIL nome` e sai com código 1 se algo falhar.
  - `colorFor(pct: number|null): string`, que retorna o hex.
  - `formatReset(resetsAtMs: number|null, nowMs: number): string`
  - `formatAge(ageMs: number): string`

- [ ] **Step 1:** `git init` na raiz do projeto, criar `.gitignore` com `.superpowers/`.
- [ ] **Step 2: Escrever os testes**

```js
// thresholds.test.js
'cores': () => {
  assertEq(colorFor(0), '#3b8eea'); assertEq(colorFor(74.9), '#3b8eea');
  assertEq(colorFor(75), '#f5c542'); assertEq(colorFor(89), '#f5c542');
  assertEq(colorFor(90), '#e5484d'); assertEq(colorFor(100), '#e5484d');
  assertEq(colorFor(null), '#888888');
}
// format.test.js  (fixar TZ: rodar com TZ=America/Sao_Paulo)
const now = Date.parse('2026-11-25T17:32:00-03:00');
'reset mesmo dia': () => assertEq(formatReset(Date.parse('2026-11-25T20:00:00-03:00'), now), 'Reseta às 20:00 · em 2h 28min'),
'reset outro dia': () => assertEq(formatReset(Date.parse('2026-11-27T09:00:00-03:00'), now), 'Reseta qui 27 nov, 09:00 · em 1d 15h'),
'sem reset': () => assertEq(formatReset(null, now), 'Sem sessão ativa'),
'idade': () => { assertEq(formatAge(40e3), 'há 40s'); assertEq(formatAge(5*60e3), 'há 5min'); assertEq(formatAge(3*3600e3+600e3), 'há 3h'); }
```

- [ ] **Step 3:** Rodar `TZ=America/Sao_Paulo gjs -m tests/run.js`. Esperado: FAIL (módulos não existem).
- [ ] **Step 4:** Implementar `thresholds.js`, `format.js` (dias e meses abreviados em pt-BR fixos no código: `dom seg ter qua qui sex sáb`, `jan … dez`) e `metadata.json` (`uuid`, `name: "Claude Limits"`, `description`, `shell-version: ["49"]`).
- [ ] **Step 5:** Rodar os testes de novo. Esperado: todos PASS.
- [ ] **Step 6:** Commit `feat: scaffold, test harness, thresholds and formatting`.

### Task 2: Credenciais e parse da API

**Files:**
- Create: `extension/lib/credentials.js`, `extension/lib/usage.js`, `tests/credentials.test.js`, `tests/usage.test.js`, `tests/fixtures/usage-pro.json` (cópia da resposta do spec, com `five_hour.utilization 5.0` e `seven_day.utilization 61.0`)

**Interfaces:**
- Produces:
  - `parseCredentials(text: string, nowMs: number): {token:string, plan:string}|null`. Retorna null se o JSON for inválido, se faltar o campo ou se `expiresAt <= nowMs + 60_000`.
  - `parseUsage(obj: object): Usage`. Lança `Error('unexpected usage shape')` se `seven_day` estiver ausente ou se `utilization` não for numérico.

- [ ] **Step 1: Escrever os testes**

```js
'credencial válida': parseCredentials(JSON.stringify({claudeAiOauth:{accessToken:'t',expiresAt:now+3600e3,subscriptionType:'pro'}}), now) → {token:'t', plan:'pro'}
'expirada': expiresAt: now-1 → null
'expira em <60s': expiresAt: now+30e3 → null
'JSON truncado': parseCredentials('{"claudeAiOauth":{"acc', now) → null          // Review Focus 3
'sem claudeAiOauth': '{}' → null
'usage pro': parseUsage(fixture) → session {pct:5, resetsAt:Date.parse('2026-11-25T21:50:00.394462+00:00')}, weekly.pct 61, weeklyOpus null
'five_hour null': five_hour:null → session {pct:0, resetsAt:null}                 // Review Focus 2
'five_hour sem resets_at': {utilization:0, resets_at:null} → session {pct:0, resetsAt:null}
'formato inesperado': parseUsage({foo:1}) lança
'pct > 100 é limitado': seven_day.utilization 104 → weekly.pct 100
```

- [ ] **Step 2:** Rodar os testes. Esperado: FAIL.
- [ ] **Step 3:** Implementar os dois módulos. `resetsAt` vem de `Date.parse(resets_at)`. `pct` fica com `Math.min(100, Math.max(0, utilization))`, sem arredondar (o arredondamento é feito na UI).
- [ ] **Step 4:** Rodar os testes. Esperado: PASS.
- [ ] **Step 5:** Commit `feat: parse credentials and usage response`.

### Task 3: Contagem de tokens nos logs

**Files:**
- Create: `extension/lib/tokens.js`, `extension/lib/logscan.js`, `tests/tokens.test.js`, `tests/logscan.test.js`, `tests/fixtures/logs/projA/s1.jsonl`, `tests/fixtures/logs/projB/s2.jsonl`

**Interfaces:**
- Produces:
  - `TOKEN_WEIGHTS = {input:1, output:1, cacheCreation:1, cacheRead:0.1}`
  - `countTokensInText(text: string, fromMs: number, toMs: number, seen: Set<string>): number`. Usa `timestamp` da linha (ISO) dentro de `[fromMs, toMs)`; chave de deduplicação é `requestId ?? message.id`; ignora linhas sem `message.usage` e linhas que não são JSON.
  - `class LogScanner { constructor(rootDir: string); countTokens(fromMs: number, toMs: number): Promise<number> }`. Lista `rootDir/*/*.jsonl` com `Gio` async, ignora arquivos com `mtime < fromMs`, lê com `load_contents_async` e compartilha um único `seen` entre todos os arquivos.

- [ ] **Step 1: Escrever os testes**

```js
// linha mínima: {"timestamp":"2026-11-25T18:00:00Z","requestId":"r1","message":{"id":"m1","usage":{"input_tokens":10,"output_tokens":20,"cache_creation_input_tokens":100,"cache_read_input_tokens":1000}}}
'pondera tokens': uma linha r1 → 10+20+100+100 = 230
'dedup mesmo requestId': duas linhas r1 idênticas → 230                          // Review Focus 1
'fora da janela': timestamp antes de fromMs → 0
'linha lixo e sem usage': ignoradas, sem exceção
'scanner soma dois projetos': fixtures/logs com r1 em projA e r2 (=50) em projB → 280
'scanner dedup entre arquivos': r1 também em projB → continua 280
```

- [ ] **Step 2:** Rodar os testes. Esperado: FAIL.
- [ ] **Step 3:** Implementar. No `logscan.js`, embrulhar as APIs `Gio` `*_async` em Promise via `Gio._promisify`.
- [ ] **Step 4:** Rodar os testes. Esperado: PASS. No teste do scanner, os fixtures precisam ter mtime recente; usar `touch` no setup ou passar `fromMs = 0`.
- [ ] **Step 5:** Commit `feat: count Claude Code tokens from local logs`.

### Task 4: Estimativa e política de notificação

**Files:**
- Create: `extension/lib/estimate.js`, `extension/lib/notify.js`, `tests/estimate.test.js`, `tests/notify.test.js`

**Interfaces:**
- Consumes: `Usage` (Task 2); `countTokens(fromMs, toMs): Promise<number>` (Task 3).
- Produces:
  - `officialReadings(official: Official, nowMs): {session:Reading, weekly:Reading}`, com `source:'official'`, `ageMs = now - ts` e `deltaPct 0`.
  - `async estimateReadings(official: Official|null, countTokens, nowMs): {session:Reading, weekly:Reading}`
  - `notificationsFor(readings, notified: string[]): {key:string, kind:'session'|'weekly', reading:Reading}[]`. Chave: `${kind}:${resetsAt}:${source==='official'?'official':'estimate'}`. Só considera `pct >= 90` e chaves que ainda não estão em `notified`. Fontes `stale` contam como `official`.

Algoritmo de `estimateReadings`, por janela (`session` usa 5h, `weekly` usa 7d, com as respectivas `tokens5h` e `tokens7d` do `official`):

```
se official == null → {pct:null, source:'none'}
w = official.usage[janela]; rate = tokensJanela > 0 ? w.pct / tokensJanela : null
se w.resetsAt != null && now >= w.resetsAt:            // janela virou (Review Focus 4)
    base = 0; desde = w.resetsAt; novoReset = w.resetsAt + duração
senão: base = w.pct; desde = official.ts; novoReset = w.resetsAt
delta = rate ? (await countTokens(desde, now)) * rate : 0
pct = min(100, base + delta)                            // Review Focus 5
source = delta > 0 ? 'estimate' : 'stale'
```

- [ ] **Step 1: Escrever os testes** (com `countTokens` falso, que retorna um valor fixo e registra o `fromMs` recebido)

```js
'sem oficial': estimateReadings(null, …) → session {pct:null, source:'none'}
'stale sem uso novo': official pct 61, countTokens→0 → weekly {pct:61, source:'stale', deltaPct:0, ageMs: now-ts}
'acréscimo': tokens7d 1000, pct 61, countTokens→100 → weekly {pct:67.1, source:'estimate', deltaPct:6.1}
'janela virou': session resetsAt < now, pct 80 → pct = só o acréscimo; countTokens chamado com fromMs = resetsAt; resetsAt novo = antigo + 5h
'sem calibração': tokens5h 0 → deltaPct 0, source 'stale'
'limita 100': pct 95, delta 20 → 100
'notifica oficial ≥90': weekly official 91 → 1 item, key 'weekly:<resetsAt>:official'
'não repete': key já em notified → []
'estimativa depois oficial': notified tem ':estimate' e chega official → notifica
'abaixo de 90': 89.9 → []
```

- [ ] **Step 2:** Rodar os testes. Esperado: FAIL.
- [ ] **Step 3:** Implementar seguindo o algoritmo acima.
- [ ] **Step 4:** Rodar os testes. Esperado: PASS.
- [ ] **Step 5:** Commit `feat: fallback estimation and notification policy`.

### Task 5: Store, cliente da API e Controller

**Files:**
- Create: `extension/lib/store.js`, `extension/lib/api.js`, `extension/lib/controller.js`, `tests/store.test.js`, `tests/controller.test.js`, `scripts/smoke-api.js`

**Interfaces:**
- Consumes: todos os módulos de `lib/` das Tasks 1–4.
- Produces:
  - `class Store { constructor(path: string); load(): Promise<State>; save(state: State): Promise<void> }`. `load` de arquivo inexistente ou inválido retorna `{official:null, notified:[]}`. `save` cria o diretório e grava de forma atômica (`replace_contents_async`). `notified` é podado para as últimas 20 chaves.
  - `class ApiError extends Error { status: number }`
  - `fetchUsage(session: Soup.Session, token: string): Promise<object>`. Lança `ApiError` com o status HTTP quando a resposta não for 200.
  - `class Controller`
    - `constructor({readCredentialsText: () => Promise<string>, fetchUsage: (token) => Promise<object>, countTokens, store: Store, now: () => number, onUpdate: (view) => void, onNotify: (title, body) => void})`
    - `refresh(): Promise<void>`
    - `get nextIntervalSec(): number`
  - `view = {plan:string|null, session:Reading, weekly:Reading, weeklyOpus:Reading|null, weeklySonnet:Reading|null, fetchedAt:number|null}`

Fluxo do `refresh()`:

1. Lê as credenciais.
2. Se houver token, chama `fetchUsage` e em seguida `parseUsage`.
3. No sucesso:
   - conta `tokens5h` e `tokens7d` nas janelas `[resetsAt−5h, now)` e `[resetsAt−7d, now)`; se `resetsAt` for null, usa `[now−5h, now)`;
   - salva `official`;
   - gera as readings com `officialReadings`.
4. Em qualquer falha (sem token, `ApiError`, rede, formato inesperado), usa `estimateReadings`.
5. Calcula `notificationsFor`. Para cada item, chama `onNotify` e adiciona a chave a `notified`. Salva o estado.
6. Chama `onUpdate(view)`.

Intervalo: começa em 120. Em 429, dobra até no máximo 600. Em sucesso, volta a 120. Nenhum outro erro mexe no intervalo.

Textos da notificação:
- `title`: `"Claude: 90% do limite"`
- `body`: `"Sessão de 5h em 91%"` ou `"Semanal em 92% (estimativa)"`

- [ ] **Step 1: Escrever os testes** (store com diretório temporário criado via `GLib.dir_make_tmp`; controller com dependências falsas)

```js
'store vazio': load em caminho inexistente → {official:null, notified:[]}
'store ida e volta': save → load igual
'store corrompido': arquivo 'xx' → estado vazio
'sucesso': fetch ok → onUpdate com session.source 'official', store.official salvo, intervalo 120
'sem token': credenciais expiradas → fetch não é chamado, readings via estimativa
'401': fetch lança ApiError(401) → fallback, intervalo 120
'429 backoff': três 429 seguidos → 240, 480, 600; depois sucesso → 120
'notificação única': duas chamadas com weekly 91 oficial → onNotify chamado 1 vez
'token nunca logado': capturar `log`/`console` durante refresh; nenhuma saída contém o token
```

- [ ] **Step 2:** Rodar os testes. Esperado: FAIL.
- [ ] **Step 3:** Implementar `store.js`, `api.js` (`Soup.Message.new('GET', URL)`, headers do Global Constraints, `send_and_read_async`, `JSON.parse` do corpo em UTF-8) e `controller.js`.
- [ ] **Step 4:** Rodar os testes. Esperado: PASS.
- [ ] **Step 5:** Escrever `scripts/smoke-api.js`: lê as credenciais reais, chama `fetchUsage` + `parseUsage` e imprime só as % e os resets, nunca o token. Rodar `gjs -m scripts/smoke-api.js`. Esperado: algo como `session 5% … weekly 61% …`.
- [ ] **Step 6:** Commit `feat: store, API client and refresh controller`.

### Task 6: UI e extensão

**Files:**
- Create: `extension/ui/ring.js`, `extension/ui/popup.js`, `extension/extension.js`, `extension/stylesheet.css`, `scripts/install.sh`

**Interfaces:**
- Consumes: `Controller`, `view` e `Reading` (Task 5); `colorFor`, `formatReset` e `formatAge` (Task 1).
- Produces:
  - `Ring`: subclasse GObject de `St.DrawingArea`, com `setReading(reading: Reading, tag: string)`. Tamanho 22×22 mais uma etiqueta de 7–8px embaixo.
  - `UsagePopup`: `St.BoxLayout`, com `update(view, nowMs)`, `showAt(actor)` e `hide()`.
  - `default class ClaudeLimitsExtension extends Extension` com `enable()` e `disable()`.

Regras de desenho do anel:
- Trilho: círculo completo em branco com alpha 0.22, linha de 2.6px.
- Arco: começa em −90°, com comprimento `pct/100` e cor `colorFor(pct)`.
- Fontes `stale` e `estimate`: arco tracejado (`cr.setDash([2,1.5],0)`) e alpha 0.6.
- Fonte `none`: só o trilho, cinza, com `–` no centro.
- Número no centro: `Math.round(pct)`, com prefixo `~` quando `source==='estimate'`, em negrito, branco, tamanho ~8.5px. O `~` pode reduzir a fonte.
- Etiquetas: `5h` e `sem`.

Conteúdo do painel, igual ao mockup em `.superpowers/mockups/layout.html`:
- Título: `Limites do Claude · Plano Pro`, com o plano capitalizado.
- Linhas, cada uma com rótulo, %, barra colorida e `formatReset`:
  - `Sessão (janela de 5h)`
  - `Semanal (todos os modelos)`
  - `Semanal (Opus)` e `Semanal (Sonnet)`, só quando vierem não nulas
- Rodapé:
  - fonte `official`: `Fonte: API /usage · atualizado ${formatAge}`
  - caso contrário: `Oficial ${formatAge} · +~${deltaPct arredondado}% estimado pelos logs`; se `deltaPct` for 0, só `Oficial ${formatAge}`
  - fonte `none`: `Sem dados ainda`

Comportamento:
- O indicador é um `PanelMenu.Button`, adicionado com `Main.panel.addToStatusArea('claude-limits', btn)`.
- **Hover:**
  - `enter-event` agenda a exibição do painel em 250 ms; `leave-event` esconde.
  - O painel é adicionado com `Main.layoutManager.addTopChrome`, abaixo da barra e alinhado ao botão sem sair da tela.
  - O painel não aparece enquanto `btn.menu.isOpen`.
- **Menu** (clique): `Atualizar agora` (chama `controller.refresh()` e reagenda o timer) e `Abrir uso no claude.ai` (`Gio.AppInfo.launch_default_for_uri`).
- **Timer:** `GLib.timeout_add_seconds`, reagendado a cada ciclo com `controller.nextIntervalSec`.
- **Notificação:** `Main.notify(title, body)`.
- **`disable()`:** remove o timer, cancela a sessão Soup (`session.abort()`), destrói o painel e o botão e zera todas as referências.
- **Leitura das credenciais:** `Gio.File.load_contents_async` em `~/.claude/.credentials.json`. Não pode haver nenhum `log` com conteúdo do arquivo.

`scripts/install.sh`:
- cria `ln -sfn "$PWD/extension" ~/.local/share/gnome-shell/extensions/claude-limits@simer`;
- imprime as instruções para recarregar.

- [ ] **Step 1:** Implementar `ring.js`, `popup.js`, `extension.js` e `stylesheet.css` (painel: fundo `#2b2b2b`, `border-radius 14px`, padding 14/16, largura 300px).
- [ ] **Step 2:** Rodar `gjs -m tests/run.js`. Esperado: tudo continua PASS, porque a UI não é importada pelos testes.
- [ ] **Step 3:** Rodar `bash scripts/install.sh`. No Wayland é preciso **encerrar a sessão e entrar de novo**. Depois, `gnome-extensions enable claude-limits@simer`. Alternativa sem relogar: `sudo apt install mutter-dev-bin` e `dbus-run-session gnome-shell --devkit --wayland`.
- [ ] **Step 4: Verificação manual** (`journalctl -f -o cat /usr/bin/gnome-shell` aberto em paralelo):
  - Os dois anéis aparecem à esquerda dos ícones de sistema, com os mesmos valores que o `/usage` do Claude Code.
  - Hover: o painel aparece em ~250 ms e some ao sair. O clique abre o menu e não abre o painel.
  - "Atualizar agora" muda o "atualizado há" para segundos.
  - Fallback: mover temporariamente o acesso à rede (`nmcli networking off`) e clicar em "Atualizar agora". Os anéis ficam tracejados e o rodapé mostra `Oficial há …`. Religar a rede.
  - Cores: em `lib/thresholds.js`, forçar temporariamente o `pct` exibido para 80 e depois 95. Verificar amarelo e vermelho e reverter.
  - `gnome-extensions disable claude-limits@simer`: tudo some e nenhum erro aparece no journal.
  - O Claude Code continua logado: `claude -p "ok"` funciona.
- [ ] **Step 5:** Commit `feat: panel rings, hover popup and extension wiring`.
