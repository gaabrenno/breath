#!/usr/bin/env bash
# Breath: desinstalador.
#   curl -fsSL https://raw.githubusercontent.com/gaabrenno/breath/main/uninstall.sh | bash
# Tudo dentro de main(): um download interrompido não executa nada.

main() {
    set -u
    local dir=${BREATH_DIR:-$HOME/.local/share/breath}
    local uuid=breath@simer
    local link=$HOME/.local/share/gnome-shell/extensions/$uuid
    local units=$HOME/.config/systemd/user

    # 1) Desativa a extensão (fallback: tira da lista do gsettings).
    if ! gnome-extensions disable "$uuid" >/dev/null 2>&1; then
        local list
        list=$(gsettings get org.gnome.shell enabled-extensions 2>/dev/null || true)
        if [[ $list == *"'$uuid'"* ]]; then
            list=${list//", '$uuid'"/}
            list=${list//"'$uuid', "/}
            list=${list//"'$uuid'"/}
            [[ $list == "[]" ]] && list="@as []"
            gsettings set org.gnome.shell enabled-extensions "$list"
        fi
    fi

    # 2) Timer de atualização.
    systemctl --user disable --now breath-update.timer >/dev/null 2>&1 || true
    rm -f "$units/breath-update.timer" "$units/breath-update.service"
    systemctl --user daemon-reload >/dev/null 2>&1 || true

    # 3) Link (só se for link: nunca apaga uma pasta de verdade).
    if [ -L "$link" ]; then
        rm -f "$link"
    elif [ -e "$link" ]; then
        printf 'Aviso: %s não é um link; deixei como está.\n' "$link"
    fi

    # 4) Arquivos do Breath.
    rm -rf "$dir" "$HOME/.cache/breath"

    printf 'Breath removido. Encerre a sessão e entre de novo para tirá-lo da barra.\n'
}

main "$@"
