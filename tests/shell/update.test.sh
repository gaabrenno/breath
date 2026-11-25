setup_update() {
    sandbox
    make_remote "$@"
    git clone -q "$REMOTE" "$BREATH_DIR"
    git -C "$BREATH_DIR" -c advice.detachedHead=false checkout -q "${1}"
}
run_update() { bash "$REPO_ROOT/scripts/update.sh"; }

test_update_to_new_tag() {
    setup_update v1.0.0
    add_tag v1.1.0
    run_update || fail "saída != 0"
    assert_eq "$(current_tag)" v1.1.0
    assert_contains "$SYSLOG" "notify-send Breath atualizado para v1.1.0 — vale na próxima sessão"
}
test_no_new_tag_is_noop() {
    setup_update v1.0.0
    run_update || fail "saída != 0"
    assert_eq "$(current_tag)" v1.0.0
    assert_not_contains "$SYSLOG" notify-send
}
test_semver_order() {
    setup_update v1.9.0
    add_tag v1.10.0
    run_update
    assert_eq "$(current_tag)" v1.10.0
}
test_removed_tag_falls_back() {
    setup_update v1.0.0
    add_tag v1.1.0
    run_update
    del_tag v1.1.0
    : > "$SYSLOG"
    run_update
    assert_eq "$(current_tag)" v1.0.0
    assert_contains "$SYSLOG" "atualizado para v1.0.0"
}
test_offline_exits_zero() {
    setup_update v1.0.0
    git -C "$BREATH_DIR" remote set-url origin "$HOME/nao-existe.git"
    run_update || fail "deveria sair com 0 sem rede"
    assert_eq "$(current_tag)" v1.0.0
    assert_not_contains "$SYSLOG" notify-send
}
test_local_changes_discarded() {
    setup_update v1.0.0
    echo lixo >> "$BREATH_DIR/README.md"
    touch "$BREATH_DIR/sobra.txt"
    add_tag v1.1.0
    run_update
    assert_eq "$(current_tag)" v1.1.0
    assert_eq "$(git -C "$BREATH_DIR" status --porcelain)" ""
}
