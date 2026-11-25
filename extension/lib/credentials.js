const EXPIRY_MARGIN_MS = 60_000;

/**
 * Lê o texto do ~/.claude/.credentials.json. Nunca loga o conteúdo.
 * @param {string} text
 * @param {number} nowMs
 * @returns {{token:string, plan:string|null}|null}
 */
export function parseCredentials(text, nowMs) {
    let data;
    try {
        data = JSON.parse(text);
    } catch {
        return null;
    }
    const o = data?.claudeAiOauth;
    if (!o || typeof o.accessToken !== 'string' || !o.accessToken)
        return null;
    if (typeof o.expiresAt !== 'number' || o.expiresAt <= nowMs + EXPIRY_MARGIN_MS)
        return null;
    return {token: o.accessToken, plan: typeof o.subscriptionType === 'string' ? o.subscriptionType : null};
}
