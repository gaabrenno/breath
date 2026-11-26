// Contador de estrelas do repositório nos botões do GitHub (cabeçalho e fim da página).
// Sem resposta da API, os botões ficam como estão, sem número.

const API = 'https://api.github.com/repos/gaabrenno/breath';

/** 7 → "7"; 1234 → "1,2 mil" (arredonda para baixo). Valor inválido → null. */
export function formatStars(n) {
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 0)
        return null;
    if (n < 1000)
        return String(Math.floor(n));
    const mil = Math.floor(n / 100) / 10;
    return `${String(mil).replace('.', ',')} mil`;
}

async function load() {
    const slots = document.querySelectorAll('[data-estrelas]');
    if (!slots.length)
        return;
    try {
        const res = await fetch(API, {headers: {Accept: 'application/vnd.github+json'}});
        if (!res.ok)
            throw new Error(`HTTP ${res.status}`);
        const text = formatStars((await res.json()).stargazers_count);
        if (text === null)
            return;
        for (const el of slots) {
            el.textContent = text;
            el.hidden = false;
            el.setAttribute('aria-label', `${text} ${text === '1' ? 'estrela' : 'estrelas'}`);
        }
    } catch {
        // Sem número: os botões continuam funcionando.
    }
}

if (typeof document !== 'undefined')
    load();
