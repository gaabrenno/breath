# Breath — Instalador de um comando e atualização automática — Design

Data: 2026-11-25 · Status: aguardando aprovação

## Intenção

Instalar o Breath em qualquer computador (meu ou de outras pessoas) com **um
comando só**, e manter todas as instalações **atualizadas sozinhas** sempre que
uma nova versão for **publicada** — sem terminal, git ou `git pull` manual.

## Decisões já tomadas na conversa

- **Abordagem A**: instalação separada + timer do systemd. Descartadas:
  B (a extensão se atualiza sozinha — lógica de download dentro do GNOME Shell)
  e C (extensions.gnome.org — revisão manual lenta, risco de recusa por ler
  credenciais de outro app e usar API não documentada, distribuição pública do
  token de terceiros).
- **Atualização por versões marcadas** (tags `vX.Y.Z`), não pela `main`: só chega
  aos usuários o que for explicitamente publicado.
- Frequência: **a cada hora e logo após o login**; notificação quando atualizar.
- O repositório precisa ser **público** para outras pessoas (o instalador baixa via
  `raw.githubusercontent.com` e clona por HTTPS). A decisão de quando abrir é do
  dono do repositório.

## Como fica para quem usa

```bash
curl -fsSL https://raw.githubusercontent.com/gaabrenno/breath/main/install.sh | bash
```

1. Confere pré-requisitos e explica o que falta, sem instalar nada pela metade:
   GNOME Shell 49, `git`, Claude Code logado (`~/.claude/.credentials.json`).
2. Clona o repositório em `~/.local/share/breath` e faz checkout da **última tag**.
3. Aponta `~/.local/share/gnome-shell/extensions/breath@simer` para
   `~/.local/share/breath/extension` e ativa a extensão.
4. Instala e liga o timer de atualização do usuário.
5. Diz para sair e entrar na sessão (Wayland).

Desinstalar: `~/.local/share/breath/uninstall.sh` (também via `curl … | bash`).
Remove extensão, timer, clone e `~/.cache/breath`.

## Atualização automática

- `breath-update.timer` (systemd `--user`): `OnStartupSec=2min`, `OnUnitActiveSec=1h`.
- `breath-update.service` roda `~/.local/share/breath/scripts/update.sh`:
  1. `git fetch --tags --prune --prune-tags` (sem rede → sai em silêncio);
  2. maior tag `v*` por versão semântica;
  3. se diferente da atual → checkout dela e notificação
     "Breath atualizado para vX.Y.Z — vale na próxima sessão".
- Para **voltar atrás**, publica-se uma versão nova com a correção (o atualizador
  sempre vai para a maior tag; apagar uma tag ruim também é respeitado, por causa do
  `--prune-tags`).
- O clone em `~/.local/share/breath` é só de uso; alterações locais nele são
  descartadas na próxima atualização.

## Publicar uma versão (dono do repositório)

`scripts/release.sh 1.1.0`: atualiza `version-name` no `metadata.json`, faz o
commit, cria a tag `v1.1.0` e envia `main` + tag. Recusa se a árvore estiver suja,
se não estiver na `main` ou se os testes falharem.

A primeira versão publicada será a **v1.0.0**, com o estado atual da `main`.

## Máquina de desenvolvimento

O instalador vale também aqui; a pasta `projects_work/limits` vira só
desenvolvimento. Para testar código não publicado, `scripts/dev-link.sh` aponta a
extensão para a pasta de desenvolvimento, e `scripts/dev-link.sh --off` volta para
a instalação normal. O atualizador nunca mexe no link: ele só atualiza o clone.

## Não-objetivos

- Suporte a outras versões do GNOME além da 49 (o instalador recusa com mensagem clara).
- Atualização sem relogar (limitação do GNOME no Wayland).
- Assinatura de versões, canal beta, interface gráfica de instalação.

## Anti-objetivos

- Deixar uma instalação pela metade (extensão ativa sem timer, link quebrado).
- O atualizador alterar qualquer coisa fora de `~/.local/share/breath` em uma
  atualização normal.
- Pedir `sudo`: tudo roda como usuário.

## Testes

Os scripts são testados em sandbox: `HOME` temporário, um repositório git local
fazendo papel do GitHub, e variáveis para pular as chamadas ao GNOME e ao
systemd (`BREATH_SKIP_SYSTEM=1`). Cenários: instalação com e sem pré-requisitos,
atualização para nova tag, sem tag nova, sem rede, tag removida, desinstalação.
Depois, verificação real nesta máquina (timer ativo, notificação, relogin).

## Decisões minhas para você conferir

- Caminho da instalação: `~/.local/share/breath`.
- `version-name` no `metadata.json` como fonte da versão exibida.
- URL do repositório sobrescrevível (`BREATH_REPO=…`) para quem quiser instalar de
  um fork ou de um repositório privado via SSH.
