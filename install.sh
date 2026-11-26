#!/usr/bin/env bash
# Breath: instalador de um comando.
#   curl -fsSL https://raw.githubusercontent.com/gaabrenno/breath/main/install.sh | bash
#   ... | bash -s -- --tray      (força um modo: --gnome, --tray ou --cli)
# Tudo fica dentro de main(), chamada só na última linha: um download
# interrompido no meio não executa nada.

main() {
    set -u
    local repo=${BREATH_REPO:-https://github.com/gaabrenno/breath.git}
    local dir=${BREATH_DIR:-$HOME/.local/share/breath}
    local uuid=breath@simer
    local link=$HOME/.local/share/gnome-shell/extensions/$uuid
    local units=$HOME/.config/systemd/user
    local config=${XDG_CONFIG_HOME:-$HOME/.config}
    local autostart=$config/autostart/breath.desktop
    local bin=$HOME/.local/bin/breath

    say() { printf '%s\n' "$*"; }
    die() { printf 'Erro: %s\n' "$*" >&2; exit 1; }

    # Desativa a extensão (fallback: tira da lista do gsettings).
    disable_extension() {
        gnome-extensions disable "$uuid" >/dev/null 2>&1 && return
        local list
        list=$(gsettings get org.gnome.shell enabled-extensions 2>/dev/null || true)
        if [[ $list == *"'$uuid'"* ]]; then
            list=${list//", '$uuid'"/}
            list=${list//"'$uuid', "/}
            list=${list//"'$uuid'"/}
            [[ $list == "[]" ]] && list="@as []"
            gsettings set org.gnome.shell enabled-extensions "$list"
        fi
    }

    # 1) Modo e pré-requisitos, antes de criar qualquer arquivo.
    local mode=""
    local arg
    for arg in "$@"; do
        case $arg in
            --gnome|--tray|--cli) mode=${arg#--} ;;
            *) die "opção desconhecida: $arg (use --gnome, --tray ou --cli)" ;;
        esac
    done

    command -v git >/dev/null 2>&1 ||
        die "o git não está instalado. Instale com: sudo apt install git"

    local gs in_gnome=0 gnome49=0
    gs=$(gnome-shell --version 2>/dev/null || true)
    [[ ${XDG_CURRENT_DESKTOP:-} == *GNOME* ]] && in_gnome=1
    [[ $gs =~ ^GNOME\ Shell\ 49(\.|$) ]] && gnome49=1
    if [ -z "$mode" ]; then
        if [ $in_gnome = 1 ] && [ $gnome49 = 1 ]; then
            mode=gnome
        elif [ -n "${WAYLAND_DISPLAY:-}${DISPLAY:-}" ]; then
            mode=tray
        else
            mode=cli
        fi
    fi

    if [ "$mode" = gnome ]; then
        [ $gnome49 = 1 ] ||
            die "a extensão do Breath requer GNOME Shell 49 (encontrado: ${gs:-nenhum}). Use --tray para os ícones na bandeja."
    fi
    grep -q '"claudeAiOauth"' "$HOME/.claude/.credentials.json" 2>/dev/null ||
        die "não encontrei o login do Claude Code. Instale o Claude Code, rode 'claude' e use /login."
    if [ "$mode" = gnome ] && [ -e "$link" ] && [ ! -L "$link" ]; then
        die "já existe uma pasta ou arquivo em $link (instalação manual?). Remova e rode o instalador de novo."
    fi
    if [ "$mode" != gnome ]; then
        gjs -c "imports.gi.versions.Soup='3.0'; imports.gi.versions.GdkPixbuf='2.0'; imports.gi.Soup; imports.gi.GdkPixbuf" \
            >/dev/null 2>&1 || die "$(cat <<'MSG'
o Breath precisa do gjs com as bibliotecas Soup 3 e GdkPixbuf. Instale com:
  Ubuntu/Debian: sudo apt install gjs gir1.2-soup-3.0 gir1.2-gdkpixbuf-2.0
  Fedora:        sudo dnf install gjs
  Arch:          sudo pacman -S gjs libsoup3
  openSUSE:      sudo zypper install gjs
e rode o instalador de novo.
MSG
)"
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
    tag=$(git -C "$dir" tag -l 'v*' | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | sort -V | tail -n 1)
    [ -n "$tag" ] || die "nenhuma versão publicada em $repo ainda."
    git -C "$dir" -c advice.detachedHead=false checkout --quiet --force "$tag" ||
        die "não consegui usar a versão $tag"
    git -C "$dir" clean -fdq

    # 3) O que é de cada modo (e limpeza do modo anterior, numa reinstalação).
    if [ "$mode" = gnome ]; then
        if [ -e "$autostart" ]; then
            rm -f "$autostart"
            pkill -f "$dir/linux/tray.js" >/dev/null 2>&1 || true
        fi
        mkdir -p "$(dirname "$link")"
        ln -sfn "$dir/extension" "$link"
        # Ativa a extensão (no Wayland, antes do relogin, cai no gsettings).
        # disabled-extensions tem precedência no GNOME 49: tira o Breath de lá.
        if ! gnome-extensions enable "$uuid" >/dev/null 2>&1; then
            local list
            if list=$(gsettings get org.gnome.shell disabled-extensions 2>/dev/null) && [[ $list == *"'$uuid'"* ]]; then
                list=${list//", '$uuid'"/}
                list=${list//"'$uuid', "/}
                list=${list//"'$uuid'"/}
                [[ $list == "[]" ]] && list="@as []"
                gsettings set org.gnome.shell disabled-extensions "$list"
            fi
            list=$(gsettings get org.gnome.shell enabled-extensions 2>/dev/null) || list=SKIP
            if [[ $list != SKIP && $list != *"'$uuid'"* ]]; then
                if [[ $list == "@as []" || $list == "[]" ]]; then
                    list="['$uuid']"
                else
                    list="${list%]}, '$uuid']"
                fi
                gsettings set org.gnome.shell enabled-extensions "$list"
            fi
        fi
    else
        if [ -L "$link" ]; then
            disable_extension
            rm -f "$link"
        fi
        if [ "$mode" = tray ]; then
            mkdir -p "$(dirname "$autostart")"
            cat > "$autostart" <<EOF
[Desktop Entry]
Type=Application
Name=Breath
Comment=Limites do Claude na bandeja
Exec=gjs -m $dir/linux/tray.js
NoDisplay=true
X-GNOME-Autostart-enabled=true
EOF
            setsid -f gjs -m "$dir/linux/tray.js" >/dev/null 2>&1 < /dev/null || true
        elif [ -e "$autostart" ]; then
            rm -f "$autostart"
            pkill -f "$dir/linux/tray.js" >/dev/null 2>&1 || true
        fi
    fi

    # 4) Comando `breath`.
    if [ -L "$bin" ] && [[ $(readlink "$bin") == "$dir"/* ]] || { [ ! -e "$bin" ] && [ ! -L "$bin" ]; }; then
        mkdir -p "$(dirname "$bin")"
        ln -sfn "$dir/bin/breath" "$bin"
    else
        say "Aviso: já existe $bin e não é do Breath; deixei como está. Use $dir/bin/breath."
    fi
    case ":$PATH:" in
        *":$HOME/.local/bin:"*) ;;
        *) say "Aviso: ~/.local/bin não está no seu PATH. Adicione para usar o comando breath." ;;
    esac

    # 5) Atualização automática.
    local updater
    if systemctl --user show-environment >/dev/null 2>&1; then
        updater=systemd
        mkdir -p "$units"
        sed "s|@BREATH_DIR@|$dir|g" "$dir/systemd/breath-update.service" > "$units/breath-update.service"
        cp "$dir/systemd/breath-update.timer" "$units/breath-update.timer"
        systemctl --user daemon-reload
        systemctl --user enable --now breath-update.timer >/dev/null 2>&1 ||
            say "Aviso: não consegui ligar o timer de atualização (systemctl --user)."
    elif [ "$mode" = tray ]; then
        updater=tray
    else
        updater=none
        say "Aviso: sem systemd, as atualizações automáticas ficam desligadas. Para atualizar, rode o instalador de novo."
    fi

    # 6) Modo instalado (fora do clone: o git clean do atualizador apagaria).
    mkdir -p "$config/breath"
    printf 'mode=%s\nupdater=%s\n' "$mode" "$updater" > "$config/breath/install.conf"

    say "Breath $tag instalado em $dir."
    [ "$updater" = none ] || say "Atualizações automáticas ligadas (a cada hora)."
    case $mode in
        gnome)
            say "Encerre a sessão e entre de novo para ativar a extensão." ;;
        tray)
            [ $in_gnome = 1 ] && say "No GNOME, os ícones precisam da extensão \"AppIndicator and KStatusNotifierItem Support\" ligada (o Ubuntu já traz)."
            say "Os ícones já devem aparecer na bandeja." ;;
        cli)
            say "Use: breath   (ou breath --short / breath --waybar)"
            say "Na waybar: \"custom/breath\": {\"exec\": \"breath --waybar\", \"return-type\": \"json\", \"interval\": 30}" ;;
    esac
}

main "$@"
