LINK() { echo "$HOME/.local/share/gnome-shell/extensions/breath@simer"; }
UNITS() { echo "$HOME/.config/systemd/user"; }

test_uninstall_removes_all() {
    sandbox; make_remote v1.0.0
    bash "$REPO_ROOT/install.sh" >/dev/null 2>&1 || fail "install"
    mkdir -p "$HOME/.cache/breath" && echo '{}' > "$HOME/.cache/breath/state.json"
    : > "$SYSLOG"
    bash "$REPO_ROOT/uninstall.sh" > "$HOME/out.txt" 2>&1 || { cat "$HOME/out.txt"; fail "saída != 0"; }
    [ ! -e "$(LINK)" ] && [ ! -L "$(LINK)" ] || fail "link ficou"
    [ ! -e "$(UNITS)/breath-update.timer" ] && [ ! -e "$(UNITS)/breath-update.service" ] || fail "unidades ficaram"
    [ ! -e "$BREATH_DIR" ] || fail "clone ficou"
    [ ! -e "$HOME/.cache/breath" ] || fail "cache ficou"
    assert_contains "$SYSLOG" "systemctl --user disable --now breath-update.timer"
    assert_contains "$SYSLOG" "gnome-extensions disable breath@simer"
}
test_uninstall_gsettings_fallback() {
    sandbox; make_remote v1.0.0
    echo "['ding@rastersoft.com', 'breath@simer']" > "$HOME/.gsettings"
    FAKE_EXT_FAIL=1 bash "$REPO_ROOT/uninstall.sh" >/dev/null 2>&1 || fail "saída != 0"
    assert_eq "$(cat "$HOME/.gsettings")" "['ding@rastersoft.com']"
}
test_uninstall_when_not_installed() {
    sandbox
    bash "$REPO_ROOT/uninstall.sh" > "$HOME/out.txt" 2>&1 || fail "deveria sair com 0"
}
test_uninstall_keeps_real_dir() {
    sandbox
    mkdir -p "$(LINK)"; touch "$(LINK)/meu-arquivo"
    bash "$REPO_ROOT/uninstall.sh" >/dev/null 2>&1
    [ -f "$(LINK)/meu-arquivo" ] || fail "apagou a pasta do usuário"
}
test_uninstall_via_stdin() {
    sandbox; make_remote v1.0.0
    bash "$REPO_ROOT/install.sh" >/dev/null 2>&1
    bash < "$REPO_ROOT/uninstall.sh" >/dev/null 2>&1 || fail "via stdin falhou"
    [ ! -e "$BREATH_DIR" ] || fail "clone ficou"
}
test_devlink_on_off() {
    sandbox; make_remote v1.0.0
    bash "$REPO_ROOT/install.sh" >/dev/null 2>&1
    bash "$REPO_ROOT/scripts/dev-link.sh" > "$HOME/out.txt" 2>&1 || fail "dev-link"
    assert_eq "$(readlink "$(LINK)")" "$REPO_ROOT/extension"
    bash "$REPO_ROOT/scripts/dev-link.sh" --off >/dev/null 2>&1 || fail "dev-link --off"
    assert_eq "$(readlink "$(LINK)")" "$BREATH_DIR/extension"
}
test_devlink_refuses_real_dir() {
    sandbox
    mkdir -p "$(LINK)"
    bash "$REPO_ROOT/scripts/dev-link.sh" >/dev/null 2>&1 && fail "deveria recusar"
    [ -d "$(LINK)" ] && [ ! -L "$(LINK)" ] || fail "mexeu na pasta"
}
