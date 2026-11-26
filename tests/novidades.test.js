import {assert, assertEq} from './assert.js';
import {kindOf, notesHtml, releaseView} from '../site/novidades.js';

const body = `### Novidades

- O Breath funciona em qualquer Linux:
  - GNOME 45 a 49: os anéis.
  - KDE: dois ícones, o clique abre
    um painel.
- O comando \`breath\` <script>

### Correções

- A notificação não se repete.`;

export default {
    'versão com novidades': () => assertEq(kindOf(body), 'novidades'),
    'versão só com correções': () => assertEq(kindOf('### Correções\n\n- conserta'), 'correcao'),
    'notas: títulos viram h4': () => {
        const h = notesHtml(body);
        assert(h.includes('<h4>Novidades</h4>') && h.includes('<h4>Correções</h4>'), h);
    },
    'notas: lista com subitens e linha continuada': () => {
        const h = notesHtml(body);
        assert(h.includes('<li>KDE: dois ícones, o clique abre um painel.</li>'), h);
        assert(/<li>O Breath funciona em qualquer Linux:<ul><li>GNOME 45 a 49: os anéis.<\/li>/.test(h), h);
    },
    'notas: código e HTML escapado': () => {
        const h = notesHtml(body);
        assert(h.includes('<code>breath</code>'), h);
        assert(h.includes('&lt;script&gt;') && !h.includes('<script>'), h);
    },
    'releaseView: versão, data e tipo': () => {
        const v = releaseView({tag_name: 'v1.1.1', published_at: '2026-11-26T22:10:00Z', body: '### Correções\n\n- x',
            html_url: 'https://github.com/gaabrenno/breath/releases/tag/v1.1.1'});
        assertEq([v.version, v.date, v.kind, v.label], ['v1.1.1', '26 nov 2026', 'correcao', 'Correção']);
        assertEq(v.url, 'https://github.com/gaabrenno/breath/releases/tag/v1.1.1');
    },
    'releaseView: sem corpo não quebra': () => {
        const v = releaseView({tag_name: 'v1.0.0', published_at: '2026-11-25T10:00:00Z', body: null, html_url: ''});
        assertEq([v.kind, v.label, v.html], ['correcao', 'Correção', '']);
    },
};
