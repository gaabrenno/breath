# Utilitários dos testes de shell. Tudo roda num HOME temporário.
export GIT_AUTHOR_NAME=test GIT_AUTHOR_EMAIL=t@example.com GIT_COMMITTER_NAME=test GIT_COMMITTER_EMAIL=t@example.com

fail() { echo "ASSERT: $*" >&2; exit 1; }
assert_eq() { [ "$1" = "$2" ] || fail "esperado '$2', veio '$1' ${3:-}"; }
assert_contains() { grep -qF -- "$2" "$1" 2>/dev/null || { echo "--- $1:"; cat "$1" 2>/dev/null; fail "'$1' não contém '$2'"; }; }
assert_not_contains() { ! grep -qF -- "$2" "$1" 2>/dev/null || fail "'$1' contém '$2'"; }

# Cria HOME temporário, stubs no PATH e o log de chamadas $SYSLOG.
sandbox() {
    export HOME; HOME=$(mktemp -d)
    export STUBS=$HOME/stubs SYSLOG=$HOME/sys.log BREATH_DIR=$HOME/.local/share/breath
    mkdir -p "$STUBS"
    : > "$SYSLOG"
    for cmd in systemctl notify-send; do
        printf '#!/usr/bin/env bash\necho "%s $*" >> "$SYSLOG"\n' "$cmd" > "$STUBS/$cmd"
    done
    cat > "$STUBS/gnome-shell" <<'S'
#!/usr/bin/env bash
echo "GNOME Shell ${FAKE_GNOME:-49}.0"
S
    cat > "$STUBS/gnome-extensions" <<'S'
#!/usr/bin/env bash
echo "gnome-extensions $*" >> "$SYSLOG"
exit "${FAKE_EXT_FAIL:-0}"
S
    cat > "$STUBS/gsettings" <<'S'
#!/usr/bin/env bash
echo "gsettings $*" >> "$SYSLOG"
# enabled-extensions fica em ~/.gsettings; outras chaves em ~/.gsettings-<chave>
f=$HOME/.gsettings
[ "${3:-}" = enabled-extensions ] || f=$HOME/.gsettings-${3:-}
case $1 in
    get) cat "$f" 2>/dev/null || echo "@as []" ;;
    set) printf '%s\n' "$4" > "$f" ;;
esac
S
    chmod +x "$STUBS"/*
    export PATH=$STUBS:$PATH
    mkdir -p "$HOME/.claude"
    echo '{"claudeAiOauth":{"accessToken":"x","expiresAt":1}}' > "$HOME/.claude/.credentials.json"
}

# Repositório bare $REMOTE (o "GitHub") com a árvore atual do projeto e as tags pedidas.
make_remote() {
    export REMOTE=$HOME/remote.git WORK=$HOME/work
    mkdir -p "$WORK"
    (cd "$REPO_ROOT" && git ls-files -co --exclude-standard -z | xargs -0 tar cf -) | tar xf - -C "$WORK"
    git -C "$WORK" init -q -b main
    git -C "$WORK" add -A && git -C "$WORK" commit -qm init
    git init -q --bare -b main "$REMOTE"
    git -C "$WORK" remote add origin "$REMOTE"
    git -C "$WORK" push -q origin main
    for t in "$@"; do add_tag "$t"; done
    export BREATH_REPO=$REMOTE
}
add_tag() {
    git -C "$WORK" commit -q --allow-empty -m "release $1"
    git -C "$WORK" tag "$1"
    git -C "$WORK" push -q origin main "$1"
}
del_tag() {
    git -C "$WORK" tag -d "$1" >/dev/null
    git -C "$WORK" push -q origin ":refs/tags/$1"
}
current_tag() { git -C "$BREATH_DIR" describe --tags --exact-match 2>/dev/null; }
