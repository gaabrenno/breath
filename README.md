# Breath

GNOME Shell extension that shows your **Claude usage limits** in the top bar:
two rings for the **5-hour session** and the **weekly** limit, blue below 75%,
yellow from 75%, red from 90%. Hover for reset times and details; click for
"Atualizar agora" / "Abrir uso no claude.ai". A system notification fires once
per window when a limit crosses 90%.

> Unofficial. Not affiliated with Anthropic.

## How it gets the numbers

1. **Official (primary):** reads the Claude Code OAuth token from
   `~/.claude/.credentials.json` (**read-only**: Breath never refreshes or
   writes it) and calls the same usage endpoint Claude Code's `/usage` uses.
   This endpoint is undocumented and may change.
2. **Fallback:** when the token is expired or the API is unreachable, Breath
   shows the last official value with its age, plus an estimate (`~`) from
   Claude Code's local logs (`~/.claude/projects/*/*.jsonl`), calibrated
   against the last official reading. Rings turn dashed in this mode.

State (last official value, calibration, notifications sent) lives in
`~/.cache/breath/state.json`. The token is never logged and requests never
follow redirects, so it only ever goes to `api.anthropic.com`.

## Requirements

- GNOME Shell 49 (tested on Ubuntu 25.10, Wayland)
- Claude Code installed and logged in

## Install

```bash
bash scripts/install.sh            # symlinks extension/ into ~/.local/share/gnome-shell/extensions/breath@simer
# Wayland: log out and back in, then:
gnome-extensions enable breath@simer
```

Try it without logging out (needs `mutter-dev-bin`):

```bash
dbus-run-session gnome-shell --devkit --wayland
```

## Development

```bash
TZ=America/Sao_Paulo gjs -m tests/run.js   # unit tests (pure logic in extension/lib)
gjs -m scripts/smoke-api.js                # real API call, prints only percentages
```

Layout: `extension/lib/` holds the pure logic (credentials, API parsing,
log token counting, fallback estimate, notification policy, refresh
controller); `extension/ui/` the ring and hover popup; `extension/extension.js`
wires them into the panel. Design and plan: `docs/superpowers/`.
