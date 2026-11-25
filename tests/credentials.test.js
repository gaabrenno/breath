import {assertEq} from './assert.js';
import {parseCredentials} from '../extension/lib/credentials.js';

const now = Date.parse('2026-11-25T17:00:00Z');
const creds = (o) => JSON.stringify({claudeAiOauth: {accessToken: 't0k', subscriptionType: 'pro', ...o}});

export default {
    'credencial válida': () =>
        assertEq(parseCredentials(creds({expiresAt: now + 3600e3}), now), {token: 't0k', plan: 'pro'}),
    'expirada': () => assertEq(parseCredentials(creds({expiresAt: now - 1}), now), null),
    'expira em menos de 60s': () => assertEq(parseCredentials(creds({expiresAt: now + 30e3}), now), null),
    'JSON truncado': () => assertEq(parseCredentials('{"claudeAiOauth":{"acc', now), null),
    'sem claudeAiOauth': () => assertEq(parseCredentials('{}', now), null),
    'sem accessToken': () =>
        assertEq(parseCredentials(JSON.stringify({claudeAiOauth: {expiresAt: now + 3600e3}}), now), null),
    'plano ausente vira null': () =>
        assertEq(parseCredentials(creds({expiresAt: now + 3600e3, subscriptionType: undefined}), now),
            {token: 't0k', plan: null}),
};
