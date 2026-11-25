# Indicador de limites do Claude na barra superior do GNOME — Design

Data: 2026-11-25 · Status: aprovado em conversa, aguardando revisão do documento

## Intenção

Ver, de relance e sem abrir o navegador ou o Claude Code, quanto já foi consumido do
limite da **sessão (janela de 5h)** e do **limite semanal** da conta Claude, e quando
cada um reseta. O widget vive na barra superior do Ubuntu, ao lado dos ícones de sistema.

## Ambiente-alvo

- Ubuntu 25.10, **GNOME Shell 49**, sessão **Wayland**.
- Claude Code instalado (`~/.local/bin/claude`) e logado via OAuth (plano atual: Pro).
- Disponíveis: `gjs`, `python3`. **Node não está instalado** (não usar).

## Objetivos

1. Dois anéis de progresso na barra: sessão 5h e semanal.
2. Painel de detalhes ao passar o mouse, com resets e fonte do dado.
3. Números iguais aos do claude.ai / `/usage` sempre que a API responder.
4. Continuar mostrando algo útil (estimativa) quando a API falhar.
5. Avisar antes de bater no limite (notificação a 90%).

## Não-objetivos (v1)

- Tela de preferências (cores, limiares, intervalo ficam fixos no código).
- Suporte a outras versões do GNOME além da 49 (declarar só `"49"` em `shell-version`).
- Histórico/gráfico de consumo.
- Publicação em extensions.gnome.org.
- Suporte a múltiplas contas.

## Anti-objetivos (seria falha mesmo funcionando)

- **Derrubar ou atrapalhar o login do Claude Code.** A extensão nunca renova o token,
  nunca escreve em `~/.credentials.json`.
- Vazar o token: nunca logar, nunca exibir, nunca enviar a outro host que não
  `api.anthropic.com`.
- Travar o GNOME Shell: nada de I/O síncrono pesado na thread principal.
- Mostrar estimativa como se fosse número oficial.

## Abordagens consideradas

| Abordagem | Prós | Contras | Decisão |
|---|---|---|---|
| **A. Extensão GNOME Shell (GJS + Cairo)** | Desenho nativo do anel na barra; hover real; tudo em um processo | Pode quebrar em upgrades do GNOME; testar no Wayland exige relogar ou sessão aninhada | **Escolhida** |
| B. Script Python + AppIndicator | Simples, estável entre versões | AppIndicator não tem hover; detalhes só no clique; anel teria que ser gerado como imagem | Descartada: contraria a interação desejada |
| C. Conky / widget de desktop | Muito flexível visualmente | Fica fora da barra superior | Descartada |

Fonte de dados: **endpoint do `/usage` (primário) + logs locais do Claude Code (fallback)**, escolhido pelo usuário.

## Decisões de interface (do usuário)

- **Layout B: dois anéis lado a lado**, sessão e semana, cada um com uma etiqueta
  pequena embaixo (`5h`, `sem`). Anel de ~22px numa barra de 32px, número inteiro da % no centro.
- Cores por limiar, aplicadas a cada anel individualmente:
  - `< 75%` azul `#3b8eea`
  - `75–89%` amarelo `#f5c542`
  - `≥ 90%` vermelho `#e5484d`
  - trilho: branco 22% de opacidade.
- **Hover** abre painel com (mockup em `.superpowers/mockups/layout.html`):
  - título "Limites do Claude · Plano <Pro/Max>"
  - **Sessão (janela de 5h)**: %, barra horizontal colorida, "Reseta às HH:MM · em Xh Ymin"
  - **Semanal (todos os modelos)**: %, barra, "Reseta <dia> DD <mês>, HH:MM · em Xd Yh"
  - **Semanal (Opus)** / **(Sonnet)**: só se o campo vier não-nulo na API
  - rodapé: "Fonte: API /usage · atualizado há Ns" ou, no fallback,
    "Oficial há 3h · +~4% estimado pelos logs"

## Decisões de comportamento (propostas pelo Claude, aprovadas pelo usuário)

- **Clique** abre menu com "Atualizar agora" e "Abrir uso no claude.ai"
  (`https://claude.ai/settings/usage`).
- **Atualização a cada 120s.** Também atualiza no clique em "Atualizar agora".
- **Token somente leitura**: lido de `~/.claude/.credentials.json` a cada ciclo
  (o Claude Code o renova por conta própria). Se `expiresAt` já passou ou a API
  responder 401/403/erro de rede/formato inesperado → modo fallback até o próximo
  ciclo com token válido. Token expirado é esperado e frequente (o Claude Code só
  renova quando roda), então o fallback é um estado normal, não exceção.
- **Fallback = último valor oficial + acréscimo estimado** (decisão do usuário):
  - base: o último valor oficial salvo (persistido em disco), com a idade dele;
  - acréscimo: uso do Claude Code nos logs **desde** a leitura oficial, convertido em %
    pela calibração (ver "Fonte de fallback");
  - exibição: anel **esmaecido/tracejado**; número com `~` se houver acréscimo,
    sem `~` se for só o valor oficial antigo; painel mostra "oficial há 3h" e,
    se houver, "+~4% estimado pelos logs do Claude Code";
  - se o `resets_at` da janela já passou desde a leitura oficial, a base dessa
    janela vira 0% e conta-se só o acréscimo desde o reset.
- **Notificação** (`Main.notify`) quando sessão ou semana cruza 90%, no máximo
  uma vez por janela **e por fonte** (chave = `resets_at` + `oficial|estimativa`).
  Dispara também com estimativa, com o texto dizendo "estimativa"; o aviso oficial
  ainda dispara depois. Estado de "já notificado" persistido em
  `~/.cache/claude-limits/state.json` (o GNOME desabilita extensões ao bloquear a tela).
  *(decisão do Claude)*
- Nunca houve leitura oficial (primeiro uso sem token válido): anéis cinza com `–`.

## Fonte primária: endpoint de uso

Verificado em 2026-11-25 (HTTP 200):

```
GET https://api.anthropic.com/api/oauth/usage
Authorization: Bearer <claudeAiOauth.accessToken>
anthropic-beta: oauth-2025-04-20
```

Campos usados da resposta:

```json
{
  "five_hour":  { "utilization": 5.0,  "resets_at": "2026-11-25T21:50:00.39+00:00" },
  "seven_day":  { "utilization": 61.0, "resets_at": "2026-11-30T04:00:00.39+00:00" },
  "seven_day_opus": null,
  "seven_day_sonnet": null
}
```

- `utilization` já é percentual (0–100). Arredondar para inteiro na barra.
- `five_hour` pode vir `null` ou com `resets_at` nulo quando não há sessão ativa → mostrar 0%.
- Existe também um array `limits[]` (`kind`, `percent`, `severity`, `resets_at`);
  **não** depender dele na v1, usar `five_hour`/`seven_day`.
- Endpoint **não documentado**: tratar qualquer formato inesperado como falha → fallback.
- Credenciais: `claudeAiOauth.{accessToken, expiresAt (ms epoch), subscriptionType}`.

## Fonte de fallback: logs locais

- Arquivos: `~/.claude/projects/*/*.jsonl`; cada linha com `message.usage` traz
  `input_tokens`, `output_tokens`, `cache_creation_input_tokens`,
  `cache_read_input_tokens`, além de `timestamp` e `message.model`.
- Métrica de consumo: soma ponderada de tokens na janela (ver calibração).
- **Último oficial + calibração**: a cada leitura bem-sucedida da API, salvar em
  `~/.cache/claude-limits/state.json`:
  `{ts, pct_5h, resets_at_5h, pct_7d, resets_at_7d, tokens_5h, tokens_7d}`, onde
  `tokens_*` é a soma de tokens dos logs dentro da janela correspondente
  (de `resets_at − 5h` / `resets_at − 7d` até `ts`). A taxa de conversão é
  `pct_por_token = pct / tokens` (usar a mais recente com `tokens > 0`).
- No fallback: `pct ≈ pct_oficial + tokens_desde_ts × pct_por_token` (ou só o
  acréscimo desde o reset, se a janela virou), limitado a 100.
- Limitação aceita: logs só enxergam o uso do Claude Code (não web/app); por isso
  o acréscimo é estimativa e é sinalizado como tal. A base oficial cobre tudo até `ts`.
- Desempenho: ler só arquivos com mtime dentro da janela de 7d; fazer de forma
  assíncrona (Gio async) ou em subprocesso; nunca bloquear o Shell.

## Arquitetura (proposta para o builder)

```
claude-limits@simer/
  metadata.json        uuid, name, shell-version ["49"]
  extension.js         enable/disable, PanelMenu.Button, timer, menu
  ring.js              St.DrawingArea + Cairo: anel, número, tracejado
  popup.js             painel do hover (St widgets)
  usage-api.js         leitura de credenciais + Soup 3 HTTP
  usage-local.js       leitura de logs + calibração
  stylesheet.css
```

- Indicador: `PanelMenu.Button` à direita (`Main.panel.addToStatusArea`).
- Hover: painel próprio (`St.BoxLayout` em `Main.layoutManager.addChrome`) mostrado em
  `enter-event` e escondido em `leave-event` com pequeno delay; o menu de clique é o
  `PopupMenu` padrão do botão.
- Ciclo: `GLib.timeout_add_seconds(120)`; remover timers, sessões Soup e o painel no `disable()`.
- ES modules (padrão GNOME 45+).

## Deixado para o builder

- Tratamento de 429 (recomendado: manter o último valor e dobrar o intervalo até 10 min).
- Leitura do `credentials.json` durante escrita pelo Claude Code (JSON inválido → tentar no próximo ciclo).
- Sobreposição hover × menu de clique (esconder o painel de hover enquanto o menu estiver aberto).

- Ponderação exata de tokens no fallback (ex.: incluir ou não `cache_read`).
- Formatação de datas (pt-BR, usar locale do sistema).
- Delay e posicionamento exatos do painel do hover.
- Estratégia de teste no Wayland (`dbus-run-session gnome-shell --devkit` ou sessão aninhada).

## Critérios de sucesso

- Com a API ok: % dos anéis = % do `/usage`, cores corretas nos três limiares.
- Token expirado / sem rede: anéis esmaecidos com o último valor oficial e a idade dele
  (mais acréscimo `~` se houver uso no Code), sem erros no `journalctl`.
- Notificação de 90% não se repete após bloquear/desbloquear a tela.
- Desligar a extensão remove tudo da barra, sem vazamento de timers.
- Claude Code continua logado e funcionando após dias de uso da extensão.
