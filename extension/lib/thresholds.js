export const COLORS = {
    blue: '#3b8eea',
    yellow: '#f5c542',
    red: '#e5484d',
    gray: '#888888',
};

/** @param {number|null} pct */
export function colorFor(pct) {
    if (pct === null || pct === undefined || Number.isNaN(pct))
        return COLORS.gray;
    if (pct >= 90)
        return COLORS.red;
    if (pct >= 75)
        return COLORS.yellow;
    return COLORS.blue;
}
