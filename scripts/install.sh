#!/usr/bin/env bash
# Instala a extensão como symlink para o diretório local do GNOME Shell.
set -euo pipefail
cd "$(dirname "$0")/.."
UUID=breath@simer
DEST="$HOME/.local/share/gnome-shell/extensions/$UUID"
mkdir -p "$(dirname "$DEST")"
ln -sfn "$PWD/extension" "$DEST"
echo "Instalada em $DEST -> $PWD/extension"
echo
echo "Wayland: encerre a sessão e entre de novo; depois rode:"
echo "  gnome-extensions enable $UUID"
echo "Teste sem relogar (GNOME aninhado):"
echo "  dbus-run-session gnome-shell --devkit --wayland"
