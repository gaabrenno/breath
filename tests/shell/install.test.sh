LINK() { echo "$HOME/.local/share/gnome-shell/extensions/breath@simer"; }
UNITS() { echo "$HOME/.config/systemd/user"; }
run_install() { bash "$REPO_ROOT/install.sh" > "$HOME/out.txt" 2>&1; }
assert_nothing_created() {
    [ ! -e "$BREATH_DIR" ] || fail "não deveria clonar"
    [ ! -e "$(UNITS)/breath-update.timer" ] || fail "não deveria instalar unidades"
    [ ! -e "$(LINK)" ] || fail "não deveria criar link"
    assert_not_contains "$SYSLOG" systemctl
}

test_install_ok() {
    sandbox; make_remote v1.0.0 v1.1.0
    run_install || { cat "$HOME/out.txt"; fail "saída != 0"; }
    assert_eq "$(current_tag)" v1.1.0
    assert_eq "$(readlink "$(LINK)")" "$BREATH_DIR/extension"
    [ -f "$(UNITS)/breath-update.service" ] && [ -f "$(UNITS)/breath-update.timer" ] || fail "unidades ausentes"
    assert_contains "$(UNITS)/breath-update.timer" "OnUnitActiveSec=1h"
    assert_contains "$SYSLOG" "systemctl --user daemon-reload"
    assert_contains "$SYSLOG" "systemctl --user enable --now breath-update.timer"
    assert_contains "$SYSLOG" "gnome-extensions enable breath@simer"
    assert_contains "$HOME/out.txt" "v1.1.0"
    assert_contains "$HOME/out.txt" "Encerre a sessão e entre de novo"
}
test_missing_git() {
    sandbox; make_remote v1.0.0
    PATH=$STUBS:/nonexistent /bin/bash "$REPO_ROOT/install.sh" > "$HOME/out.txt" 2>&1 && fail "deveria falhar"
    assert_contains "$HOME/out.txt" "git"
    assert_nothing_created
}
test_wrong_gnome() {
    sandbox; make_remote v1.0.0
    FAKE_GNOME=46 run_install && fail "deveria falhar"
    assert_contains "$HOME/out.txt" "GNOME Shell 49"
    assert_nothing_created
}
test_no_credentials() {
    sandbox; make_remote v1.0.0
    rm "$HOME/.claude/.credentials.json"
    run_install && fail "deveria falhar"
    assert_contains "$HOME/out.txt" "/login"
    assert_nothing_created
}
test_no_tags() {
    sandbox; make_remote
    run_install && fail "deveria falhar"
    assert_contains "$HOME/out.txt" "nenhuma versão publicada"
    [ ! -e "$(LINK)" ] || fail "não deveria criar link"
}
test_rerun_idempotent() {
    sandbox; make_remote v1.0.0
    export FAKE_EXT_FAIL=1
    run_install || fail "1ª execução"
    add_tag v1.1.0
    run_install || fail "2ª execução"
    assert_eq "$(current_tag)" v1.1.0
    assert_eq "$(grep -o "breath@simer" "$HOME/.gsettings" | wc -l)" 1
}
test_gsettings_appends_to_existing_list() {
    sandbox; make_remote v1.0.0
    echo "['ding@rastersoft.com']" > "$HOME/.gsettings"
    FAKE_EXT_FAIL=1 run_install || fail "saída != 0"
    assert_eq "$(cat "$HOME/.gsettings")" "['ding@rastersoft.com', 'breath@simer']"
}
test_real_dir_at_link_refuses() {
    sandbox; make_remote v1.0.0
    mkdir -p "$(LINK)"; touch "$(LINK)/meu-arquivo"
    run_install && fail "deveria recusar"
    [ -f "$(LINK)/meu-arquivo" ] || fail "apagou a pasta do usuário"
    assert_not_contains "$SYSLOG" systemctl
}
test_install_truncated_runs_nothing() {
    sandbox; make_remote v1.0.0
    n=$(wc -l < "$REPO_ROOT/install.sh")
    head -n $((n / 2)) "$REPO_ROOT/install.sh" | bash > "$HOME/out.txt" 2>&1
    assert_nothing_created
}
test_install_via_stdin() {
    sandbox; make_remote v1.0.0
    bash < "$REPO_ROOT/install.sh" > "$HOME/out.txt" 2>&1 || { cat "$HOME/out.txt"; fail "via stdin falhou"; }
    assert_eq "$(current_tag)" v1.0.0
}

test_reenable_clears_disabled_extensions() {
    sandbox; make_remote v1.0.0
    echo "['outra@x', 'breath@simer']" > "$HOME/.gsettings-disabled-extensions"
    FAKE_EXT_FAIL=1 run_install || fail "saída != 0"
    assert_eq "$(cat "$HOME/.gsettings-disabled-extensions")" "['outra@x']"
    assert_contains "$HOME/.gsettings" "'breath@simer'"
}
test_install_ignores_non_release_tags() {
    sandbox; make_remote v1.0.0 v1.1.0-rc1 v9-test
    run_install || fail "saída != 0"
    assert_eq "$(current_tag)" v1.0.0
}
test_service_has_timeout() {
    sandbox; make_remote v1.0.0
    run_install || fail "saída != 0"
    assert_contains "$(UNITS)/breath-update.service" "TimeoutStartSec="
}
test_regular_file_at_link_refuses() {
    sandbox; make_remote v1.0.0
    mkdir -p "$(dirname "$(LINK)")"; echo meu > "$(LINK)"
    run_install && fail "deveria recusar"
    assert_eq "$(cat "$(LINK)")" meu
}
