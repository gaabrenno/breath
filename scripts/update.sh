#!/usr/bin/env bash
# Atualiza a instalação do Breath para a maior versão publicada (tag vX.Y.Z).
# Chamado pelo timer breath-update.timer. Sem rede, sai em silêncio com 0.
set -u
DIR=${BREATH_DIR:-$HOME/.local/share/breath}
cd "$DIR" 2>/dev/null || exit 0

git fetch --quiet --tags --prune --prune-tags --force origin 2>/dev/null || exit 0

latest=$(git tag -l 'v[0-9]*' | sort -V | tail -n 1)
[ -n "$latest" ] || exit 0
current=$(git describe --tags --exact-match 2>/dev/null || true)

if [ "$latest" != "$current" ]; then
    git -c advice.detachedHead=false checkout --quiet --force "$latest" || exit 0
    git clean -fdq
    notify-send "Breath atualizado para $latest — vale na próxima sessão" 2>/dev/null || true
    echo "Breath atualizado para $latest"
fi
exit 0
