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

test_ignores_non_release_tags() {
    setup_update v1.0.0
    add_tag v1.1.0-rc1
    add_tag v9-test
    run_update
    assert_eq "$(current_tag)" v1.0.0
    assert_not_contains "$SYSLOG" notify-send
}
test_not_a_git_repo_touches_nothing() {
    sandbox
    # HOME é um repositório git (dotfiles) com uma tag v*; BREATH_DIR existe mas não é clone.
    git -C "$HOME" init -q -b main
    echo dot > "$HOME/.meu-dotfile"; git -C "$HOME" add .meu-dotfile; git -C "$HOME" commit -qm dots
    git -C "$HOME" tag v9.9.9
    git init -q --bare "$HOME/dots.git"
    git -C "$HOME" remote add origin "$HOME/dots.git"
    git -C "$HOME" push -q origin main v9.9.9
    git -C "$HOME" checkout -q -b outra
    git -C "$HOME" commit -q --allow-empty -m wip
    echo novo > "$HOME/.meu-dotfile"; touch "$HOME/nao-rastreado"
    mkdir -p "$BREATH_DIR"
    run_update || fail "saída != 0"
    assert_eq "$(cat "$HOME/.meu-dotfile")" novo
    [ -f "$HOME/nao-rastreado" ] || fail "git clean rodou no HOME"
}
