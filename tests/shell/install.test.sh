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
    FAKE_GNOME=46 WAYLAND_DISPLAY=wayland-0 run_install || { cat "$HOME/out.txt"; fail "saída != 0"; }
    assert_contains "$(CONF)" "mode=tray"
    assert_contains "$HOME/out.txt" "AppIndicator"
    [ ! -e "$(LINK)" ] || fail "não deveria criar link da extensão"
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

CONF() { echo "$HOME/.config/breath/install.conf"; }
AUTOSTART() { echo "$HOME/.config/autostart/breath.desktop"; }
BIN() { echo "$HOME/.local/bin/breath"; }

test_gnome_writes_conf() {
    sandbox; make_remote v1.0.0
    run_install || fail "saída != 0"
    assert_contains "$(CONF)" "mode=gnome"
    assert_contains "$(CONF)" "updater=systemd"
    [ ! -e "$(AUTOSTART)" ] || fail "não deveria criar autostart"
}
test_mode_tray_kde() {
    sandbox; make_remote v1.0.0
    XDG_CURRENT_DESKTOP=KDE WAYLAND_DISPLAY=wayland-0 run_install || { cat "$HOME/out.txt"; fail "saída != 0"; }
    assert_contains "$(CONF)" "mode=tray"
    assert_contains "$(CONF)" "updater=systemd"
    assert_contains "$(AUTOSTART)" "Exec=gjs -m $BREATH_DIR/linux/tray.js"
    assert_contains "$SYSLOG" "setsid"
    assert_contains "$SYSLOG" "systemctl --user enable --now breath-update.timer"
    assert_not_contains "$SYSLOG" "gnome-extensions enable"
    [ ! -e "$(LINK)" ] || fail "não deveria criar link da extensão"
    assert_contains "$HOME/out.txt" "bandeja"
}
test_mode_cli_headless() {
    sandbox; make_remote v1.0.0
    XDG_CURRENT_DESKTOP= run_install || { cat "$HOME/out.txt"; fail "saída != 0"; }
    assert_contains "$(CONF)" "mode=cli"
    [ ! -e "$(AUTOSTART)" ] || fail "não deveria criar autostart"
    assert_contains "$HOME/out.txt" "breath --waybar"
}
test_flag_cli() {
    sandbox; make_remote v1.0.0
    bash "$REPO_ROOT/install.sh" --cli > "$HOME/out.txt" 2>&1 || { cat "$HOME/out.txt"; fail "saída != 0"; }
    assert_contains "$(CONF)" "mode=cli"
    [ ! -e "$(LINK)" ] || fail "não deveria criar link da extensão"
}
test_flag_via_stdin() {
    sandbox; make_remote v1.0.0
    bash -s -- --cli < "$REPO_ROOT/install.sh" > "$HOME/out.txt" 2>&1 || { cat "$HOME/out.txt"; fail "saída != 0"; }
    assert_contains "$(CONF)" "mode=cli"
}
test_bad_flag() {
    sandbox; make_remote v1.0.0
    bash "$REPO_ROOT/install.sh" --xyz > "$HOME/out.txt" 2>&1 && fail "deveria falhar"
    assert_contains "$HOME/out.txt" "--xyz"
    assert_nothing_created
}
test_missing_gjs() {
    sandbox; make_remote v1.0.0
    XDG_CURRENT_DESKTOP=KDE WAYLAND_DISPLAY=wayland-0 FAKE_GJS_FAIL=1 run_install && fail "deveria falhar"
    assert_contains "$HOME/out.txt" "sudo apt install gjs"
    assert_contains "$HOME/out.txt" "pacman"
    assert_nothing_created
    [ ! -e "$(CONF)" ] || fail "não deveria gravar install.conf"
}
test_cli_link() {
    sandbox; make_remote v1.0.0
    run_install || fail "saída != 0"
    assert_eq "$(readlink "$(BIN)")" "$BREATH_DIR/bin/breath"
}
test_cli_link_foreign() {
    sandbox; make_remote v1.0.0
    mkdir -p "$(dirname "$(BIN)")"; echo meu > "$(BIN)"
    run_install || fail "saída != 0"
    assert_eq "$(cat "$(BIN)")" meu
    assert_contains "$HOME/out.txt" "já existe"
}
test_path_warning() {
    sandbox; make_remote v1.0.0
    run_install || fail "saída != 0"
    assert_contains "$HOME/out.txt" "PATH"
}
test_switch_gnome_to_tray() {
    sandbox; make_remote v1.0.0
    run_install || fail "1ª execução"
    [ -L "$(LINK)" ] || fail "sem link da extensão na 1ª"
    bash "$REPO_ROOT/install.sh" --tray > "$HOME/out.txt" 2>&1 || { cat "$HOME/out.txt"; fail "2ª execução"; }
    [ ! -e "$(LINK)" ] && [ ! -L "$(LINK)" ] || fail "link da extensão ficou"
    [ -f "$(AUTOSTART)" ] || fail "sem autostart"
    assert_contains "$(CONF)" "mode=tray"
    assert_contains "$SYSLOG" "gnome-extensions disable breath@simer"
}
test_switch_tray_to_gnome() {
    sandbox; make_remote v1.0.0
    bash "$REPO_ROOT/install.sh" --tray > "$HOME/out.txt" 2>&1 || fail "1ª execução"
    run_install || fail "2ª execução"
    [ ! -e "$(AUTOSTART)" ] || fail "autostart ficou"
    assert_contains "$SYSLOG" "pkill"
    assert_contains "$(CONF)" "mode=gnome"
}
test_no_systemd_tray() {
    sandbox; make_remote v1.0.0
    XDG_CURRENT_DESKTOP=KDE WAYLAND_DISPLAY=wayland-0 FAKE_NO_SYSTEMD=1 run_install || { cat "$HOME/out.txt"; fail "saída != 0"; }
    assert_contains "$(CONF)" "updater=tray"
    assert_not_contains "$SYSLOG" "enable --now"
}
test_no_systemd_cli() {
    sandbox; make_remote v1.0.0
    FAKE_NO_SYSTEMD=1 bash "$REPO_ROOT/install.sh" --cli > "$HOME/out.txt" 2>&1 || fail "saída != 0"
    assert_contains "$(CONF)" "updater=none"
    assert_contains "$HOME/out.txt" "atualizações automáticas"
}
test_no_watcher_falls_back_to_cli() {
    sandbox; make_remote v1.0.0
    XDG_CURRENT_DESKTOP=i3 DISPLAY=:0 FAKE_WATCHER=false run_install || { cat "$HOME/out.txt"; fail "saída != 0"; }
    assert_contains "$(CONF)" "mode=cli"
    assert_contains "$HOME/out.txt" "--tray"
    assert_not_contains "$HOME/out.txt" "Os ícones já devem aparecer"
    assert_not_contains "$SYSLOG" "setsid"
}
test_flag_tray_without_watcher() {
    sandbox; make_remote v1.0.0
    FAKE_WATCHER=false bash "$REPO_ROOT/install.sh" --tray > "$HOME/out.txt" 2>&1 || fail "saída != 0"
    assert_contains "$(CONF)" "mode=tray"
}
