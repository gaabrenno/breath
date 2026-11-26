#!/usr/bin/env bash
# Atualiza a instalação do Breath para a maior versão publicada (tag vX.Y.Z).
# Chamado pelo timer breath-update.timer. Sem rede, sai em silêncio com 0.
set -u
DIR=${BREATH_DIR:-$HOME/.local/share/breath}
# Só age num clone de verdade: sem .git, o git subiria até um repositório pai (ex.: dotfiles no HOME).
[ -d "$DIR/.git" ] || exit 0
cd "$DIR" || exit 0
export GIT_DIR="$DIR/.git" GIT_WORK_TREE="$DIR"

git fetch --quiet --tags --prune --prune-tags --force origin 2>/dev/null || exit 0

latest=$(git tag -l 'v*' | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | sort -V | tail -n 1)
[ -n "$latest" ] || exit 0
current=$(git describe --tags --exact-match 2>/dev/null || true)

if [ "$latest" != "$current" ]; then
    git -c advice.detachedHead=false checkout --quiet --force "$latest" || exit 0
    git clean -fdq
    # Fora do GNOME, a bandeja se reinicia sozinha ao ver o checkout novo.
    mode=$(sed -n 's/^mode=//p' "${XDG_CONFIG_HOME:-$HOME/.config}/breath/install.conf" 2>/dev/null)
    if [ "${mode:-gnome}" = gnome ]; then
        notify-send "Breath atualizado para $latest — vale na próxima sessão" 2>/dev/null || true
    else
        notify-send "Breath atualizado para $latest" 2>/dev/null || true
    fi
    echo "Breath atualizado para $latest"
fi
exit 0
