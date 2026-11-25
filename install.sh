#!/usr/bin/env bash
# Breath: instalador de um comando.
#   curl -fsSL https://raw.githubusercontent.com/gaabrenno/breath/main/install.sh | bash
# Tudo fica dentro de main(), chamada só na última linha: um download
# interrompido no meio não executa nada.

main() {
    set -u
    local repo=${BREATH_REPO:-https://github.com/gaabrenno/breath.git}
    local dir=${BREATH_DIR:-$HOME/.local/share/breath}
    local uuid=breath@simer
    local link=$HOME/.local/share/gnome-shell/extensions/$uuid
    local units=$HOME/.config/systemd/user

    say() { printf '%s\n' "$*"; }
    die() { printf 'Erro: %s\n' "$*" >&2; exit 1; }

    # 1) Pré-requisitos, antes de criar qualquer arquivo.
    command -v git >/dev/null 2>&1 ||
        die "o git não está instalado. Instale com: sudo apt install git"
    local gs
    gs=$(gnome-shell --version 2>/dev/null || true)
    [[ $gs =~ ^GNOME\ Shell\ 49(\.|$) ]] ||
        die "o Breath requer GNOME Shell 49 (encontrado: ${gs:-nenhum})."
    grep -q '"claudeAiOauth"' "$HOME/.claude/.credentials.json" 2>/dev/null ||
        die "não encontrei o login do Claude Code. Instale o Claude Code, rode 'claude' e use /login."
    if [ -d "$link" ] && [ ! -L "$link" ]; then
        die "já existe uma pasta em $link (instalação manual?). Remova-a e rode o instalador de novo."
    fi

    # 2) Clone (ou atualização) e checkout da última versão publicada.
    if [ -d "$dir/.git" ]; then
        git -C "$dir" remote set-url origin "$repo"
        git -C "$dir" fetch --quiet --tags --prune --prune-tags --force origin ||
            die "não consegui buscar $repo"
    else
        mkdir -p "$(dirname "$dir")"
        git clone --quiet "$repo" "$dir" || die "não consegui clonar $repo"
    fi
    local tag
    tag=$(git -C "$dir" tag -l 'v[0-9]*' | sort -V | tail -n 1)
    [ -n "$tag" ] || die "nenhuma versão publicada em $repo ainda."
    git -C "$dir" -c advice.detachedHead=false checkout --quiet --force "$tag" ||
        die "não consegui usar a versão $tag"
    git -C "$dir" clean -fdq

    # 3) Link da extensão.
    mkdir -p "$(dirname "$link")"
    ln -sfn "$dir/extension" "$link"

    # 4) Timer de atualização automática.
    mkdir -p "$units"
    sed "s|@BREATH_DIR@|$dir|g" "$dir/systemd/breath-update.service" > "$units/breath-update.service"
    cp "$dir/systemd/breath-update.timer" "$units/breath-update.timer"
    systemctl --user daemon-reload
    systemctl --user enable --now breath-update.timer >/dev/null 2>&1 ||
        say "Aviso: não consegui ligar o timer de atualização (systemctl --user)."

    # 5) Ativa a extensão (no Wayland, antes do relogin, cai no gsettings).
    if ! gnome-extensions enable "$uuid" >/dev/null 2>&1; then
        local list
        list=$(gsettings get org.gnome.shell enabled-extensions 2>/dev/null || echo "@as []")
        if [[ $list != *"'$uuid'"* ]]; then
            if [[ $list == "@as []" || $list == "[]" ]]; then
                list="['$uuid']"
            else
                list="${list%]}, '$uuid']"
            fi
            gsettings set org.gnome.shell enabled-extensions "$list"
        fi
    fi

    say "Breath $tag instalado em $dir."
    say "Atualizações automáticas ligadas (a cada hora)."
    say "Encerre a sessão e entre de novo para ativar a extensão."
}

main "$@"
