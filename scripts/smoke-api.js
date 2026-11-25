// Chamada real à API, só para verificação manual: gjs -m scripts/smoke-api.js
// Imprime apenas porcentagens e resets — nunca o token.
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';
import {parseCredentials} from '../extension/lib/credentials.js';
import {parseUsage} from '../extension/lib/usage.js';
import {fetchUsage} from '../extension/lib/api.js';

const [, raw] = GLib.file_get_contents(`${GLib.get_home_dir()}/.claude/.credentials.json`);
const creds = parseCredentials(new TextDecoder().decode(raw), Date.now());
if (!creds) {
    print('token ausente ou expirado (rode o Claude Code para renovar)');
} else {
    const u = parseUsage(await fetchUsage(new Soup.Session(), creds.token));
    const fmt = w => (w ? `${Math.round(w.pct)}% (reset ${w.resetsAt ? new Date(w.resetsAt).toLocaleString() : '—'})` : '—');
    print(`plano ${creds.plan}\nsession ${fmt(u.session)}\nweekly  ${fmt(u.weekly)}\nopus    ${fmt(u.weeklyOpus)}`);
}
