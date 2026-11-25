setup_release() {
    sandbox; make_remote "$@"
    export BREATH_TEST_CMD=true
}
release() { (cd "$WORK" && bash scripts/release.sh "$@") > "$HOME/out.txt" 2>&1; }
remote_tags() { git --git-dir="$REMOTE" tag -l; }

test_release_ok() {
    setup_release v1.0.0
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
    local before; before=$(git -C "$WORK" rev-parse HEAD)
    BREATH_TEST_CMD=false release 1.0.0 && fail "deveria recusar"
    assert_eq "$(git -C "$WORK" rev-parse HEAD)" "$before"
    assert_eq "$(git -C "$WORK" tag -l)" ""
}
