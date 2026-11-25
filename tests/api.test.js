import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';
import {assertEq, assert, assertRejects} from './assert.js';
import {fetchUsage, ApiError} from '../extension/lib/api.js';

export default {
    'não segue redirect (o token não sai do host)': async () => {
        let leakedAuth = null;
        const target = new Soup.Server({});
        target.add_handler(null, (_s, msg) => {
            leakedAuth = msg.get_request_headers().get_one('Authorization');
            msg.set_status(200, null);
            msg.set_response('application/json', Soup.MemoryUse.COPY, new TextEncoder().encode('{}'));
        });
        target.listen_local(0, 0);
        const targetUri = target.get_uris()[0].to_string();

        const origin = new Soup.Server({});
        origin.add_handler(null, (_s, msg) => {
            msg.set_redirect(302, targetUri);
        });
        origin.listen_local(0, 0);
        const originUri = origin.get_uris()[0].to_string();

        const e = await assertRejects(() => fetchUsage(new Soup.Session(), 'SECRET', originUri));
        assert(e instanceof ApiError, `esperava ApiError, veio ${e}`);
        assertEq(e.status, 302);
        assertEq(leakedAuth, null);
        origin.disconnect();
        target.disconnect();
    },
};
