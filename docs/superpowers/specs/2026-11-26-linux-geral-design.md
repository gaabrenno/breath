# Breath — Linux em geral (bandeja + comando `breath`) — Design

Data: 2026-11-26 · Status: aguardando aprovação

## Intenção

Abrir o Breath para o **público em geral** no Linux, não só para quem usa
GNOME 49. Quem usa KDE Plasma, XFCE, Cinnamon, MATE, Budgie, outras versões do
GNOME ou gerenciadores como Hyprland, Sway e i3 deve ver os limites do Claude
(sessão de 5h e semana) com a mesma lógica de hoje: cores, estimativa, aviso de
ritmo, notificação aos 90% e atualização automática. macOS e Windows ficam para
uma próxima etapa.

## Objetivos

1. **Ícones na bandeja** (padrão StatusNotifierItem): **dois ícones**, um por
   anel (sessão e semana), cada um com a % no centro e a mesma lógica de cores e
   tracejado da extensão.
2. **Detalhes** no menu dos ícones e na dica que aparece ao passar o mouse
   (tooltip): plano, aviso de ritmo, sessão, semanal (e Opus/Sonnet quando
   houver), horário de reset e idade do dado.
3. **Ações no menu**: "Atualizar agora" e "Abrir uso no claude.ai".
4. **Notificação aos 90%**, como hoje.
5. **Comando `breath`** para barras de status (waybar, polybar, i3blocks) e
   para o terminal.
6. **Instalador único** que descobre o ambiente e instala o que cabe nele.
7. **Atualização automática** que, fora do GNOME, já vale na hora (sem precisar
   sair da sessão).

## Fora do escopo

- macOS e Windows.
- Mudanças na extensão GNOME 49 (ela continua como está).
- Pacotes de distro (AUR, .deb, Flatpak) e suporte oficial a outras versões do
  GNOME como extensão.
- A bandeja antiga do X11 (XEmbed), usada por exemplo no i3bar e no tray do
  polybar. Quem usa esses programas fica com o comando `breath`.

## O que não pode acontecer

- Quebrar ou mudar o comportamento da extensão GNOME.
- Alterar `~/.claude/.credentials.json` ou mostrar o token em logs ou saídas.
- Martelar a API: a waybar chama o comando a cada poucos segundos, e isso não
  pode virar uma consulta à API a cada chamada.
- Deixar coisas instaladas pela metade quando falta um pré-requisito.

## Abordagens consideradas

- **A) GJS falando direto com a bandeja pelo D-Bus. Escolhida.** Reaproveita
  `extension/lib/` e os testes sem mudança, porque GLib, Gio e Soup funcionam no
  `gjs` comum, fora do GNOME Shell. A única dependência nova é o `gjs`. O
  protocolo do menu (dbusmenu) é escrito por nós.
- B) GJS + Gtk3 + AyatanaAppIndicator. Descartada: a biblioteca tem nome
  diferente em cada distro, depende do Gtk3 e só aceita o ícone como arquivo.
- C) Reescrever em Python ou Node. Descartada: duplicaria a lógica de ritmo,
  estimativa e calibração.

## Decisões tomadas na conversa

- Público-alvo: público geral → bandeja **e** comando `breath`, os dois nesta
  etapa.
- Abordagem A.
- Bandeja com **dois ícones** (um por anel, % no centro, sem a legenda
  "5h"/"sem").

## Como fica para quem usa

O comando de instalação continua o mesmo:

```bash
curl -fsSL https://raw.githubusercontent.com/gaabrenno/breath/main/install.sh | bash
```

| Ambiente | O que é instalado |
|---|---|
| GNOME Shell 49 | Extensão (como hoje) + comando `breath` |
| Qualquer outro ambiente gráfico | Bandeja + comando `breath` |
| `--cli` (escolha do usuário) | Só o comando `breath` |

Para forçar um modo: `… | bash -s -- --tray`, `--cli` ou `--gnome`.

Na bandeja aparecem `(42) (67)`, a sessão e depois a semana. Ao passar o mouse,
aparece a dica com os detalhes. Ao clicar, abre o menu:

```
Limites do Claude · Plano Max
⚠ Nesse ritmo, você vai esgotar seu limite semanal sexta de madrugada…
Sessão de 5h: 42% · reseta às 15:00
Semanal: 67% · reseta seg 09:00
Fonte: API /usage · atualizado há 1 min
─────────────
Atualizar agora
Abrir uso no claude.ai
```

As linhas de informação aparecem desativadas (não clicáveis). Os dois ícones
mostram o mesmo menu.

Comando:

```
$ breath
Limites do Claude · Plano Max
Sessão de 5h  42%  reseta às 15:00
Semanal       67%  reseta seg 09:00
⚠ Nesse ritmo, …
Fonte: API /usage · atualizado há 1 min

$ breath --short          # polybar / i3blocks
5h 42% · sem 67%

$ breath --waybar         # módulo custom da waybar
{"text":"42% · 67%","tooltip":"…","class":"ok","percentage":67}

$ breath --json           # a leitura completa, para scripts
$ breath refresh          # força uma consulta agora
$ breath --version
```

`class` na waybar: `ok`, `warn` (≥75%), `crit` (≥90%) ou `stale`
(estimativa ou sem dados), sempre pelo pior dos dois anéis. A % de
`percentage` também é a do pior anel. A estimativa ganha `~` na frente, como
nos anéis.

## Arquitetura

```
extension/lib/        núcleo, compartilhado, sem mudanças de comportamento
extension/            extensão GNOME (inalterada)
linux/
  tray.js             ponto de entrada da bandeja (gjs -m)
  sni.js              um StatusNotifierItem no D-Bus
  dbusmenu.js         o menu (com.canonical.dbusmenu)
  icon.js             desenha o anel e devolve os pixels ARGB32
  notifier.js         org.freedesktop.Notifications pelo D-Bus
  text.js             leitura → textos (menu, tooltip, CLI, waybar); puro
  viewcache.js        lê/grava ~/.cache/breath/view.json e a trava de consulta
bin/breath            o comando (script gjs)
```

O comando e a bandeja usam a mesma montagem do `Controller` que a extensão faz
hoje (credenciais, `fetchUsage` com Soup, `LogScanner`, `Store`). Essa montagem
sai de `extension.js` para uma função compartilhada (`linux/runtime.js`) que só
a bandeja e o comando usam. **A extensão não é alterada.**

### Quem consulta a API

- A **bandeja** roda o ciclo de sempre (a cada 120 s, com recuo em caso de 429)
  e, a cada atualização, grava a leitura em `~/.cache/breath/view.json` (junto
  com o horário em que foi gravada).
- O **comando** lê `view.json`. Só faz uma consulta quando o arquivo não existe
  ou tem mais de **150 s**, ou com `breath refresh`. Com a bandeja rodando, o
  comando praticamente nunca consulta a API.
- **Trava**: antes de consultar, quem for consultar cria
  `~/.cache/breath/refresh.lock` de forma exclusiva. Se o arquivo já existir e
  tiver menos de 60 s, não consulta e usa o `view.json` que houver. Isso evita
  duas consultas ao mesmo tempo e uma notificação repetida porque um processo
  sobrescreveu o `state.json` do outro.
- O comando também dispara a notificação dos 90%, porque quem só usa a waybar
  também deve recebê-la. A lista de "já notificado" é a mesma do `state.json`.

### A bandeja

- **Dois itens StatusNotifierItem** registrados em sequência (sessão, depois
  semana) no `org.kde.StatusNotifierWatcher`. Se o watcher não existir, a
  bandeja espera o nome aparecer no D-Bus e se registra quando ele surgir.
- `Category=ApplicationStatus`, `ItemIsMenu=true` (o clique esquerdo abre o
  menu onde o ambiente respeita isso), `Activate` também abre o menu ou, se não
  der, não faz nada.
- **Ícone** em `IconPixmap` nos tamanhos 22, 32 e 44 px. Desenho igual ao do
  `ring.js`, sem a legenda: trilha clara, arco colorido, tracejado e mais
  transparente quando é estimativa ou dado antigo, `~` antes do número na
  estimativa e `–` sem dados.
  - Como o cairo do GJS não dá acesso aos pixels, o `icon.js` desenha com cairo,
    grava um PNG em `$XDG_RUNTIME_DIR/breath/`, lê com `GdkPixbuf` e converte
    RGBA → ARGB32 na ordem de bytes da rede. *Decisão minha:* isso aproveita o
    texto com fonte do sistema e o mesmo desenho da extensão.
  - A cor da trilha e do número precisa funcionar em bandeja clara e escura:
    número branco com contorno escuro (ou o contrário). *Decisão minha.*
- **Tooltip** (`ToolTip`): título "Sessão de 5h: 42%" (ou "Semanal: 67%") e o
  resto dos detalhes no corpo. Emite `NewIcon`, `NewToolTip` e
  `LayoutUpdated` a cada atualização.
- **Instância única**: a bandeja pede o nome `io.github.gaabrenno.Breath` no
  D-Bus com `ALLOW_REPLACEMENT | REPLACE`. Se perder o nome, encerra. Isso
  serve tanto para não abrir duas vezes quanto para trocar de versão.

### Notificação

`org.freedesktop.Notifications.Notify` pelo D-Bus, com o mesmo título e texto
de hoje. Sem serviço de notificação, ignora em silêncio.

### Início automático e atualização

- A bandeja inicia pelo **autostart do XDG**: `~/.config/autostart/breath.desktop`
  com `Exec=gjs -m <dir>/linux/tray.js`. *Decisão minha:* funciona em KDE,
  XFCE, Cinnamon, MATE e Budgie. O `graphical-session.target` do systemd não é
  alcançado em todos eles. O instalador também já inicia a bandeja na hora, sem
  precisar sair da sessão.
- **Troca de versão sem sair da sessão**: a bandeja observa `<dir>/.git/HEAD`
  (que muda no checkout de uma tag nova). Quando muda, espera 5 s e inicia uma
  bandeja nova com o código novo. A nova toma o nome no D-Bus e a antiga
  encerra. *Decisão minha:* não depende do systemd, então funciona também onde
  ele não existe. O `update.sh` não precisa reiniciar nada.
- **Modo instalado** fica em `~/.config/breath/install.conf` (`mode=gnome|tray|cli`,
  `updater=systemd|tray|none`). Não pode ficar dentro do clone, porque o
  `git clean` do atualizador apagaria o arquivo.
- O `update.sh` lê o modo para a mensagem: "vale na próxima sessão" no
  `gnome`, "Breath atualizado para vX.Y.Z" nos outros.
- **Sem systemd** (modo `tray`): a própria bandeja roda `scripts/update.sh` 2 min
  depois de iniciar e depois a cada hora (`updater=tray`). No modo `cli` sem
  systemd, não há atualização automática, e o instalador avisa.

### Instalador

Ordem: primeiro checa tudo, depois instala.

1. **Modo**: a opção passada (`--gnome`/`--tray`/`--cli`) ou a detecção: GNOME
   Shell 49 na sessão atual → `gnome`; havendo sessão gráfica (`$WAYLAND_DISPLAY`
   ou `$DISPLAY`) → `tray`; caso contrário (ex.: via SSH) → `cli`.
2. **Pré-requisitos**: `git` e o login do Claude Code (como hoje). No `gnome`,
   GNOME 49 (como hoje). No `tray` e no `cli`: `gjs` que rode módulos (`-m`) e
   as bibliotecas Soup 3 e GdkPixbuf. Um teste de `gjs -c` confere as duas. A
   mensagem de erro sugere o pacote certo para apt, dnf, pacman e zypper.
   *Decisão minha:* o instalador nunca usa `sudo` nem instala pacotes do
   sistema; só explica o que instalar.
3. **GNOME em versão diferente da 49** → modo `tray`, com o aviso de que a
   extensão "AppIndicator and KStatusNotifierItem Support" precisa estar ligada
   (o Ubuntu já traz).
4. Clone e checkout da última tag (como hoje).
5. **Comando**: link `~/.local/bin/breath` → `<dir>/bin/breath`. Se
   `~/.local/bin` não estiver no `PATH`, avisa. Se já existir um `breath` ali
   que não seja nosso link, não mexe e avisa.
6. Modo `gnome`: extensão como hoje. Modo `tray`: autostart + inicia a bandeja
   agora (`setsid`, saída descartada). Ao **trocar de modo** numa reinstalação,
   remove o que o modo anterior instalou (link da extensão ou autostart).
7. Timer de atualização do systemd quando houver `systemctl --user`. Senão,
   `updater=tray` ou `none`.
8. Grava `install.conf` e mostra uma mensagem final de acordo com o modo. No
   `cli`, mostra o exemplo da waybar.

### Desinstalador

Além do que já faz: encerra a bandeja (pede o nome no D-Bus com `REPLACE`
usando um processo descartável, ou `pkill -f <dir>/linux/tray.js`), remove o
autostart, o link `~/.local/bin/breath` (só se for nosso link) e
`~/.config/breath`.

### README

- Compatibilidade: tabela de ambientes (GNOME 49 = extensão, demais = bandeja,
  tiling = comando).
- Exemplos de configuração para waybar, polybar e i3blocks.
- FAQ "Funciona na minha distro?" atualizada, com os pacotes de `gjs` por
  distro.

## Testes

- **Automáticos (gjs)**: `text.js` (menu, tooltip, `--short`, `--waybar`,
  `--json`), `viewcache.js` (frescor, trava velha e nova), o modelo do menu do
  `dbusmenu.js` (layout e ids) e a conversão RGBA → ARGB do `icon.js`.
- **Automáticos (shell)**, no esquema de `tests/shell`: detecção de modo, as
  opções `--gnome/--tray/--cli`, mensagens de pré-requisito por distro, troca de
  modo, link do comando, `install.conf` sobrevivendo ao `update.sh`, mensagem do
  `update.sh` por modo e o desinstalador.
- **Manuais** (lista no PR): KDE Plasma 6 e XFCE (com o plugin de bandeja que
  aceita StatusNotifierItem), GNOME com a extensão AppIndicator e waybar no
  Hyprland ou Sway. Em cada um: ícones, cores, tooltip, menu, ações,
  notificação e troca de versão sem sair da sessão.

## Fica a critério de quem implementar

- O formato exato do `--json` (desde que tenha a leitura completa e a versão).
- O tamanho da fonte e os detalhes do desenho nos 22 px, desde que dê para ler.
- Como dividir `linux/runtime.js` e `viewcache.js` internamente.

## Riscos

- **Ordem dos dois ícones**: alguns ambientes ordenam a bandeja por conta
  própria. Aceito na conversa.
- **Tooltip**: cada ambiente mostra de um jeito. O menu tem os mesmos detalhes,
  então nada se perde.
- **Endpoint de uso não documentado**: igual a hoje.
