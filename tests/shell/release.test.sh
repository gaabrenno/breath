setup_release() {
    sandbox; make_remote "$@"
    export BREATH_TEST_CMD=true
}
# Nota da versão no CHANGELOG.md do repositório de trabalho (commitada).
add_notes() {
    printf '# Novidades do Breath\n\n## v%s (2026-11-26)\n\n### %s\n\n- %s\n\n## v0.0.1 (2026-01-01)\n\n### Correções\n\n- antiga\n' \
        "$1" "${2:-Novidades}" "${3:-algo novo}" > "$WORK/CHANGELOG.md"
    git -C "$WORK" add CHANGELOG.md && git -C "$WORK" commit -qm "notas $1"
}
release() { (cd "$WORK" && bash scripts/release.sh "$@") > "$HOME/out.txt" 2>&1; }
remote_tags() { git --git-dir="$REMOTE" tag -l; }

test_release_ok() {
    setup_release v1.0.0
    add_notes 1.2.3
    release 1.2.3 || { cat "$HOME/out.txt"; fail "saída != 0"; }
    assert_contains "$WORK/extension/metadata.json" '"version-name": "1.2.3"'
    remote_tags | grep -qx v1.2.3 || fail "tag não chegou ao remoto"
    assert_eq "$(git --git-dir="$REMOTE" log -1 --format=%s main)" "release: v1.2.3"
    assert_eq "$(git --git-dir="$REMOTE" cat-file -t v1.2.3)" tag   # anotada
}
test_release_bad_version() {
    setup_release
    release 1.2 && fail "deveria recusar"
    release v1.2.3 && fail "deveria recusar"
    assert_eq "$(remote_tags)" ""
}
test_release_dirty_tree() {
    setup_release
    echo x >> "$WORK/README.md"
    release 1.0.0 && fail "deveria recusar"
    assert_contains "$HOME/out.txt" "alterações não commitadas"
    assert_eq "$(remote_tags)" ""
}
test_release_not_main() {
    setup_release
    git -C "$WORK" checkout -qb outra
    release 1.0.0 && fail "deveria recusar"
    assert_contains "$HOME/out.txt" "main"
}
test_release_tag_exists() {
    setup_release v1.0.0
    release 1.0.0 && fail "deveria recusar"
    assert_contains "$HOME/out.txt" "já existe"
}
test_release_tests_fail() {
    setup_release
    add_notes 1.0.0
    local before; before=$(git -C "$WORK" rev-parse HEAD)
    BREATH_TEST_CMD=false release 1.0.0 && fail "deveria recusar"
    assert_eq "$(git -C "$WORK" rev-parse HEAD)" "$before"
    assert_eq "$(git -C "$WORK" tag -l)" ""
}

test_release_lower_version_refused() {
    setup_release v1.2.0
    release 1.0.1 && fail "deveria recusar versão menor"
    assert_contains "$HOME/out.txt" "maior"
    remote_tags | grep -qx v1.0.1 && fail "publicou v1.0.1"
    true
}
test_release_commit_failure_publishes_nothing() {
    setup_release
    add_notes 1.0.0
    printf '#!/bin/sh\nexit 1\n' > "$WORK/.git/hooks/pre-commit"; chmod +x "$WORK/.git/hooks/pre-commit"
    release 1.0.0 && fail "deveria falhar"
    assert_eq "$(git -C "$WORK" tag -l)" ""
    assert_eq "$(remote_tags)" ""
}

test_release_requires_notes() {
    setup_release v1.0.0
    release 1.2.3 && fail "deveria recusar sem nota"
    assert_contains "$HOME/out.txt" "CHANGELOG.md"
    assert_eq "$(remote_tags)" "v1.0.0"
}
test_release_creates_github_release() {
    setup_release v1.0.0
    add_notes 1.2.3 Correções "conserta o anel"
    release 1.2.3 || { cat "$HOME/out.txt"; fail "saída != 0"; }
    assert_contains "$SYSLOG" "gh release create v1.2.3"
    assert_contains "$SYSLOG" "--title Breath v1.2.3"
    assert_contains "$HOME/gh-notes.md" "### Correções"
    assert_contains "$HOME/gh-notes.md" "conserta o anel"
    assert_not_contains "$HOME/gh-notes.md" "antiga"
    assert_not_contains "$HOME/gh-notes.md" "## v1.2.3"
}
test_release_gh_failure_keeps_tag() {
    setup_release v1.0.0
    add_notes 1.2.3
    FAKE_GH_FAIL=1 release 1.2.3 || { cat "$HOME/out.txt"; fail "a tag já foi publicada: não deveria falhar"; }
    remote_tags | grep -qx v1.2.3 || fail "tag não chegou ao remoto"
    assert_contains "$HOME/out.txt" "gh release create v1.2.3"
}
