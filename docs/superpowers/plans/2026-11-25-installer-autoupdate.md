# Breath — Instalador e atualização automática — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Instalar o Breath com um comando (`curl … | bash`) e mantê-lo atualizado sozinho a partir de versões marcadas (`vX.Y.Z`).

**Architecture:** Scripts bash na raiz e em `scripts/`. O clone de uso fica em `~/.local/share/breath`; um timer systemd `--user` roda `scripts/update.sh`, que faz checkout da maior tag. Os testes rodam em sandbox: `HOME` temporário, repositório bare local no papel do GitHub e *stubs* no `PATH` para `gnome-shell`, `gnome-extensions`, `gsettings`, `systemctl` e `notify-send`, que registram as chamadas num log.

**Tech Stack:** bash, git, systemd user units, GNOME Shell 49.

**Spec:** `docs/superpowers/specs/2026-11-25-installer-autoupdate-design.md`

## Global Constraints

- Instalação em `~/.local/share/breath` (sobrescrevível por `BREATH_DIR`); link `~/.local/share/gnome-shell/extensions/breath@simer` → `$BREATH_DIR/extension`.
- Repositório padrão `https://github.com/gaabrenno/breath.git`, sobrescrevível por `BREATH_REPO`.
- Tags de versão: `v[0-9]*`, ordenadas por versão semântica (`sort -V`).
- Timer: `OnStartupSec=2min`, `OnUnitActiveSec=1h`; unidades `breath-update.service` e `breath-update.timer` em `~/.config/systemd/user/`.
- Notificação: `Breath atualizado para vX.Y.Z — vale na próxima sessão`.
- GNOME Shell exigido: 49 (`gnome-shell --version` → `GNOME Shell 49.x`).
- Credenciais exigidas: `~/.claude/.credentials.json` com `claudeAiOauth`.
- Nunca usar `sudo`. Mensagens ao usuário em pt-BR.
- `update.sh` sempre sai com código 0 em falha de rede, para o systemd não marcar a unidade como falha.
- `metadata.json` ganha `"version-name"`; a primeira versão publicada é `1.0.0`.

## Review Focus

1. **`curl | bash` com download interrompido:** o script inteiro fica dentro de `main()`, chamada só na última linha, para que um download truncado não execute metade. *Teste na Task 2 (`install_truncated_runs_nothing`).*
2. **Rodar o instalador duas vezes:** a segunda execução funciona e atualiza, sem duplicar a entrada em `enabled-extensions`. *Teste na Task 2.*
3. **Já existe uma pasta real no caminho do link da extensão** (instalação manual antiga): recusar com mensagem e não apagar nada. *Teste na Task 2.*
4. **Timer disparando sem rede logo após o login:** sair com 0, sem notificação e sem alterar o checkout. *Teste na Task 1.*
5. **`gnome-extensions enable` falha no Wayland antes do relogin:** cair para `gsettings` e adicionar `breath@simer` uma única vez. *Teste na Task 2.*

---

### Task 1: Harness de testes de shell e `scripts/update.sh`

**Files:**
- Create: `tests/shell/run.sh`, `tests/shell/lib.sh`, `tests/shell/update.test.sh`, `scripts/update.sh`

**Interfaces:**
- Produces:
  - `tests/shell/run.sh [filtro]`: carrega cada `tests/shell/*.test.sh` e roda as funções `test_*` em subshell. Imprime `PASS`/`FAIL` e sai com 1 se alguma falhar.
  - `lib.sh`:
    - `sandbox`: cria `$HOME` temporário e `$STUBS` no `PATH`, e define `$SYSLOG`, onde cada stub grava `nome args` por linha.
    - `make_remote <tags...>`: cria um repositório bare `$REMOTE` com o conteúdo atual da árvore e as tags pedidas.
    - `add_tag <tag>`, `del_tag <tag>`: mexem nas tags do `$REMOTE`.
    - `assert_eq`, `assert_contains <arquivo> <texto>`, `assert_not_contains`.
  - `scripts/update.sh`: atualiza `$BREATH_DIR` (padrão `~/.local/share/breath`) para a maior tag. Sai com 0 em qualquer situação de rede.

- [ ] **Step 1: Escrever os testes** em `update.test.sh`. Cada um começa com `sandbox; make_remote v1.0.0; git clone -q $REMOTE $BREATH_DIR; checkout v1.0.0`.
  - `test_update_to_new_tag`: `add_tag v1.1.0` → `describe --tags` = `v1.1.0`; o `$SYSLOG` contém `notify-send Breath atualizado para v1.1.0 — vale na próxima sessão`.
  - `test_no_new_tag_is_noop`: nada muda e não há `notify-send` no log.
  - `test_semver_order`: tags `v1.9.0` e `v1.10.0` → vai para `v1.10.0`.
  - `test_removed_tag_falls_back`: em `v1.1.0`, `del_tag v1.1.0` → vai para `v1.0.0` e notifica.
  - `test_offline_exits_zero`: `BREATH_REPO` aponta para um caminho inexistente (`git remote set-url`) → código 0, checkout inalterado e sem notificação.
  - `test_local_changes_discarded`: com arquivo alterado no clone e `add_tag v1.1.0` → checkout em `v1.1.0` e árvore limpa.
- [ ] **Step 2:** Rodar `bash tests/shell/run.sh update`. Esperado: FAIL (`update.sh` não existe).
- [ ] **Step 3:** Implementar `update.sh`: `git fetch --tags --prune --prune-tags --force -q || exit 0`; maior tag com `git tag -l 'v[0-9]*' | sort -V | tail -1`; atual com `git describe --tags --exact-match 2>/dev/null`; se forem diferentes, `git -c advice.detachedHead=false checkout -q --force <tag>`, depois `git clean -fdq` e `notify-send`. Usar `set -u`, sem `set -e` global.
- [ ] **Step 4:** Rodar os testes de novo. Esperado: PASS.
- [ ] **Step 5:** Commit `feat: atualizador por tags com harness de testes de shell`.

### Task 2: `install.sh` e unidades systemd

**Files:**
- Create: `install.sh` (raiz), `systemd/breath-update.service`, `systemd/breath-update.timer`, `tests/shell/install.test.sh`
- Delete: `scripts/install.sh`, substituído por este.

**Interfaces:**
- Consumes: `scripts/update.sh` (Task 1), que a unidade `ExecStart=%h/.local/share/breath/scripts/update.sh` executa.
- Produces: `install.sh`, autocontido (roda via stdin). Variáveis: `BREATH_REPO` e `BREATH_DIR`. Códigos de saída: 0 em sucesso, 1 em pré-requisito faltando ou conflito.

Fluxo, dentro de `main()`:
1. Checagens com mensagem pt-BR e saída 1, **antes** de criar qualquer arquivo:
   - `git` ausente;
   - `gnome-shell --version` diferente de 49;
   - credenciais do Claude Code ausentes (mensagem: "Faça login no Claude Code: rode `claude` e use /login").
2. Clone em `$BREATH_DIR`. Se já existir, roda `fetch`. Faz checkout da maior tag; sem tags, sai com 1 ("nenhuma versão publicada").
3. Link: se o caminho for um diretório real, recusa com saída 1. Se for um link ou não existir, `ln -sfn`.
4. Copia as unidades para `~/.config/systemd/user/`, roda `systemctl --user daemon-reload` e `systemctl --user enable --now breath-update.timer`.
5. Ativa a extensão com `gnome-extensions enable breath@simer`. Se falhar, lê `gsettings get org.gnome.shell enabled-extensions` e adiciona `'breath@simer'` só se ainda não estiver na lista.
6. Mensagem final: versão instalada e "Encerre a sessão e entre de novo para ativar".

- [ ] **Step 1: Escrever os testes** (stubs: `gnome-shell` imprime `GNOME Shell 49.0` por padrão, e `FAKE_GNOME=46` muda a versão; `gnome-extensions` falha se `FAKE_EXT_FAIL=1`; `gsettings get` lê de `$HOME/.gsettings`)
  - `test_install_ok`:
    - existe o clone em `v1.1.0` (o remoto tem `v1.0.0` e `v1.1.0`);
    - o link aponta para `$BREATH_DIR/extension`;
    - as unidades estão copiadas;
    - o log contém `systemctl --user enable --now breath-update.timer` e `gnome-extensions enable breath@simer`.
  - `test_missing_git` (com `PATH` sem git), `test_wrong_gnome`, `test_no_credentials`: em cada um, a saída é 1, a mensagem certa aparece e **nenhum** arquivo é criado (`$BREATH_DIR` e as unidades não existem).
  - `test_no_tags`: saída 1 com "nenhuma versão publicada".
  - `test_rerun_idempotent`: rodar duas vezes com `FAKE_EXT_FAIL=1` → `breath@simer` aparece uma única vez em `$HOME/.gsettings`. *(Review Focus 2 e 5)*
  - `test_real_dir_at_link_refuses`: com `mkdir -p` no caminho do link → saída 1 e o diretório intacto. *(Review Focus 3)*
  - `test_install_truncated_runs_nothing`: alimentar o bash só com a primeira metade das linhas → nada criado, e o log sem nenhuma chamada. *(Review Focus 1)*
  - `test_install_via_stdin`: `bash < install.sh` funciona igual a `bash install.sh`.
- [ ] **Step 2:** Rodar `bash tests/shell/run.sh install`. Esperado: FAIL.
- [ ] **Step 3:** Implementar `install.sh` e as unidades. O `.service` é `Type=oneshot`; o `.timer` tem `OnStartupSec=2min`, `OnUnitActiveSec=1h` e `[Install] WantedBy=timers.target`. Remover `scripts/install.sh` e atualizar as referências a ele no README.
- [ ] **Step 4:** Rodar todos os testes de shell e o `gjs -m tests/run.js`. Esperado: tudo PASS.
- [ ] **Step 5:** Commit `feat: instalador de um comando com timer de atualização`.

### Task 3: `uninstall.sh` e `scripts/dev-link.sh`

**Files:**
- Create: `uninstall.sh`, `scripts/dev-link.sh`, `tests/shell/uninstall.test.sh`

**Interfaces:**
- Consumes: os caminhos da Task 2.
- Produces:
  - `uninstall.sh`, autocontido e dentro de `main()`. Ordem:
    1. `gnome-extensions disable breath@simer`; se falhar, remove a entrada do `gsettings`.
    2. `systemctl --user disable --now breath-update.timer` e remove as unidades, seguido de `daemon-reload`.
    3. Remove o link, só se for link.
    4. Remove `$BREATH_DIR` e `~/.cache/breath`.
  - `scripts/dev-link.sh [--off]`: sem argumento, aponta o link para o `extension/` do repositório onde o script está; com `--off`, aponta de volta para `$BREATH_DIR/extension`. Recusa se o caminho do link for um diretório real.

- [ ] **Step 1: Escrever os testes:**
  - `test_uninstall_removes_all`: depois do `install.sh`, o `uninstall.sh` deixa sem link, sem unidades, sem `$BREATH_DIR` e sem cache; o log contém `disable --now breath-update.timer`.
  - `test_uninstall_when_not_installed`: saída 0, sem erros.
  - `test_uninstall_keeps_real_dir`: um diretório real no caminho do link não é apagado.
  - `test_devlink_on_off`: o link aponta para o repositório e, com `--off`, volta para `$BREATH_DIR/extension`.
- [ ] **Step 2:** Rodar os testes. Esperado: FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Rodar todos os testes. Esperado: PASS.
- [ ] **Step 5:** Commit `feat: desinstalador e alternância para desenvolvimento`.

### Task 4: `scripts/release.sh` e `version-name`

**Files:**
- Create: `scripts/release.sh`, `tests/shell/release.test.sh`
- Modify: `extension/metadata.json` (acrescentar `"version-name": "0.0.0"`, que o primeiro release troca para `1.0.0`)

**Interfaces:**
- Produces: `scripts/release.sh X.Y.Z`. Recusa, com saída 1, quando:
  - o formato não é `X.Y.Z`;
  - a árvore está suja;
  - a branch não é `main`;
  - a tag `vX.Y.Z` já existe;
  - os testes falham. O comando de teste vem de `BREATH_TEST_CMD`, com padrão `TZ=America/Sao_Paulo gjs -m tests/run.js && bash tests/shell/run.sh`.

  Quando passa nas checagens:
  1. grava o `version-name` no `metadata.json`;
  2. faz o commit `release: vX.Y.Z`;
  3. cria a tag anotada `vX.Y.Z`;
  4. roda `git push origin main vX.Y.Z`.

- [ ] **Step 1: Escrever os testes**, num clone do `$REMOTE` com `BREATH_TEST_CMD=true`:
  - `test_release_ok`: o `metadata.json` tem `"version-name": "1.2.3"`, a tag `v1.2.3` existe no remoto e o último commit é `release: v1.2.3`.
  - `test_release_bad_version`: com `1.2` → saída 1.
  - `test_release_dirty_tree`: saída 1 e nenhuma tag criada.
  - `test_release_not_main`: saída 1.
  - `test_release_tag_exists`: saída 1.
  - `test_release_tests_fail`: com `BREATH_TEST_CMD=false` → saída 1, sem commit e sem tag.
- [ ] **Step 2:** Rodar os testes. Esperado: FAIL.
- [ ] **Step 3:** Implementar. Editar o `version-name` com `python3 -I` ou `sed` ancorado na chave.
- [ ] **Step 4:** Rodar os testes. Esperado: PASS.
- [ ] **Step 5:** Commit `feat: script de publicação de versões`.

### Task 5: README, primeira versão e instalação real

**Files:**
- Modify: `README.md`

- [ ] **Step 1: README.**
  - Nova seção **"Conexão com o Claude: sem login"**, com o conteúdo:
    - o Breath não pede login e não acessa a conta diretamente: ele **lê, só para leitura, o token da sessão local do Claude Code** em `~/.claude/.credentials.json` e consulta o uso com ele;
    - não altera o arquivo e não renova o token;
    - segue a conta logada no Claude Code, se você trocar de conta;
    - requisitos: Claude Code instalado e logado com uma assinatura Pro ou Max;
    - limitações: quem usa só o claude.ai não consegue usar; contas com chave de API do Console não têm esses limites; com o token expirado, o painel mostra o último valor oficial com a idade até o Claude Code ser aberto de novo.
  - Seção **Instalação** reescrita com o `curl … | bash`, a desinstalação, as atualizações automáticas e como desligá-las (`systemctl --user disable --now breath-update.timer`).
  - Seção **Desenvolvimento** com `dev-link.sh`, `release.sh` e os testes de shell.
- [ ] **Step 2:** Rodar todas as suítes. Esperado: PASS. Fazer o commit `docs: conexão sem login, instalação e atualização no README` e o push da `main`.
- [ ] **Step 3:** Rodar `scripts/release.sh 1.0.0`. Esperado: a tag `v1.0.0` no GitHub.
- [ ] **Step 4: Instalação real nesta máquina.** O repositório é privado, então: `BREATH_REPO=git@github.com:gaabrenno/breath.git bash install.sh`. Esperado:
  - o clone em `~/.local/share/breath` está em `v1.0.0`;
  - o link aponta para ele;
  - `systemctl --user list-timers breath-update.timer` mostra a próxima execução;
  - `systemctl --user start breath-update.service` termina com `status=0` e sem notificação, porque já está na última versão.
