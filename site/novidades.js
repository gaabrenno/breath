// Seção "Novidades" do site: busca as Releases do GitHub (criadas pelo
// scripts/release.sh a partir do CHANGELOG.md) e mostra a versão atual e as anteriores.

const API = 'https://api.github.com/repos/gaabrenno/breath/releases?per_page=8';
const RELEASES = 'https://github.com/gaabrenno/breath/releases';
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const inline = s => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>');

/** 'novidades' se a versão traz algo novo; 'correcao' se são só ajustes. */
export function kindOf(body) {
    return /^###\s+Novidades\b/m.test(body ?? '') ? 'novidades' : 'correcao';
}

/** Markdown das notas (títulos ###, listas com subitens, `código`) em HTML seguro. */
export function notesHtml(md) {
    if (!md)
        return '';
    const out = [];
    let depth = 0; // listas abertas
    const close = to => {
        while (depth > to) {
            out.push('</li></ul>');
            depth--;
        }
    };
    for (const line of md.replace(/\r/g, '').split('\n')) {
        const item = line.match(/^(\s*)- (.*)$/);
        if (item) {
            const level = Math.floor(item[1].length / 2) + 1;
            if (level > depth) {
                while (depth < level) {
                    out.push('<ul>');
                    depth++;
                }
                out.push(`<li>${inline(item[2])}`);
            } else {
                close(level);
                out.push(`</li><li>${inline(item[2])}`);
            }
            continue;
        }
        if (depth > 0 && /^\s+\S/.test(line)) {
            out.push(` ${inline(line.trim())}`); // continuação do item
            continue;
        }
        close(0);
        const heading = line.match(/^#{2,4}\s+(.*)$/);
        if (heading)
            out.push(`<h4>${inline(heading[1])}</h4>`);
        else if (line.trim())
            out.push(`<p>${inline(line.trim())}</p>`);
    }
    close(0);
    return out.join('');
}

/** Uma Release da API do GitHub no formato que a página mostra. */
export function releaseView(r) {
    const d = new Date(r.published_at);
    const kind = kindOf(r.body);
    return {
        version: r.tag_name,
        date: `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`,
        kind,
        label: kind === 'novidades' ? 'Novidades' : 'Correção',
        html: notesHtml(r.body),
        url: r.html_url,
    };
}

function badge(v) {
    return `<span class="kind kind-${v.kind}">${v.label}</span>`;
}

async function load() {
    const list = document.getElementById('versoes');
    if (!list)
        return;
    try {
        const res = await fetch(API, {headers: {Accept: 'application/vnd.github+json'}});
        if (!res.ok)
            throw new Error(`HTTP ${res.status}`);
        const items = (await res.json()).filter(r => !r.draft && !r.prerelease).map(releaseView);
        if (!items.length)
            throw new Error('sem releases');
        const [cur, ...old] = items;
        for (const el of document.querySelectorAll('[data-versao]'))
            el.textContent = cur.version;
        list.innerHTML = `
          <article class="rel-cur">
            <header><span class="ver">${esc(cur.version)}</span>${badge(cur)}<span class="date">${cur.date}</span></header>
            <div class="notes">${cur.html}</div>
          </article>
          ${old.map(v => `
          <details class="rel-old">
            <summary><span class="ver">${esc(v.version)}</span>${badge(v)}<span class="date">${v.date}</span></summary>
            <div class="notes">${v.html}</div>
          </details>`).join('')}`;
    } catch {
        list.innerHTML = `<p class="rel-fallback">Não consegui carregar as versões agora. <a href="${RELEASES}">Veja as novidades no GitHub</a>.</p>`;
    }
}

if (typeof document !== 'undefined')
    load();
