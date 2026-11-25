#!/usr/bin/env bash
# Alterna a extensão entre a pasta de desenvolvimento e a instalação normal.
#   scripts/dev-link.sh        → usa o extension/ deste repositório
#   scripts/dev-link.sh --off  → volta para ~/.local/share/breath
set -u
repo=$(cd "$(dirname "$0")/.." && pwd)
dir=${BREATH_DIR:-$HOME/.local/share/breath}
link=$HOME/.local/share/gnome-shell/extensions/breath@simer

if [ -d "$link" ] && [ ! -L "$link" ]; then
    echo "Erro: $link é uma pasta de verdade; não vou mexer nela." >&2
    exit 1
fi
if [ "${1:-}" = "--off" ]; then
    target=$dir/extension
else
    target=$repo/extension
fi
mkdir -p "$(dirname "$link")"
ln -sfn "$target" "$link"
echo "Extensão apontando para $target (vale na próxima sessão ou no GNOME de teste)."
