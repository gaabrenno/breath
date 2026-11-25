export function assert(cond, msg = 'assertion failed') {
    if (!cond)
        throw new Error(msg);
}

export function assertEq(a, b, msg) {
    const ja = JSON.stringify(a), jb = JSON.stringify(b);
    if (ja !== jb)
        throw new Error(`${msg ? msg + ': ' : ''}expected ${jb}, got ${ja}`);
}

export function assertClose(a, b, eps = 1e-6, msg) {
    if (typeof a !== 'number' || Math.abs(a - b) > eps)
        throw new Error(`${msg ? msg + ': ' : ''}expected ≈${b}, got ${a}`);
}

export async function assertRejects(fn, msg = 'expected rejection') {
    try {
        await fn();
    } catch (e) {
        return e;
    }
    throw new Error(msg);
}
