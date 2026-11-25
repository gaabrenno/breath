import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';

export const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage';

Soup.Session.prototype._sendAndRead ??= function (msg) {
    return new Promise((resolve, reject) => {
        this.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, null, (s, res) => {
            try {
                resolve(s.send_and_read_finish(res));
            } catch (e) {
                reject(e);
            }
        });
    });
};

export class ApiError extends Error {
    /** @param {number} status */
    constructor(status) {
        super(`HTTP ${status}`);
        this.name = 'ApiError';
        this.status = status;
    }
}

/**
 * GET /api/oauth/usage. Nunca inclui o token em mensagens de erro.
 * Não segue redirects: o token só vai para o host de USAGE_URL.
 * @param {Soup.Session} session
 * @param {string} token
 * @param {string} [url] só para testes
 * @returns {Promise<object>}
 */
export async function fetchUsage(session, token, url = USAGE_URL) {
    const msg = Soup.Message.new('GET', url);
    msg.set_flags(Soup.MessageFlags.NO_REDIRECT);
    const h = msg.get_request_headers();
    h.append('Authorization', `Bearer ${token}`);
    h.append('anthropic-beta', 'oauth-2025-04-20');
    h.append('Accept', 'application/json');
    const bytes = await session._sendAndRead(msg);
    const status = msg.get_status();
    if (status !== Soup.Status.OK)
        throw new ApiError(status);
    return JSON.parse(new TextDecoder().decode(bytes.get_data()));
}
