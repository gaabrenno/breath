<p align="center">
  <img src="docs/images/logo.svg" width="128" alt="Logo do Breath">
</p>

<h1 align="center">Breath</h1>

<p align="center">
  <strong>Saiba quanto fôlego ainda resta no seu Claude, direto na barra do Ubuntu.</strong><br>
  Os limites da sessão de 5h e da semana, sempre à vista, com aviso antes de acabar.
</p>

<p align="center">
  <img src="docs/images/barra.svg" alt="Barra superior do GNOME com os dois anéis do Breath">
</p>

```bash
curl -fsSL https://raw.githubusercontent.com/gaabrenno/breath/main/install.sh | bash
```

<p align="center"><sub>GNOME 49 · Claude Code com assinatura Pro ou Max · sem login, sem configuração</sub></p>

---

## Por que usar

🫁 **Veja de relance.** Dois anéis na barra mostram quanto você já usou da
sessão de 5 horas e da semana. Azul é tranquilo, amarelo pede atenção e vermelho
avisa que está acabando.

⏳ **Saiba antes de acabar.** O Breath calcula o seu ritmo e avisa se, desse
jeito, o limite vai acabar antes do reset. Por exemplo: *"Nesse ritmo, você vai
esgotar seu limite semanal sexta-feira de madrugada, antes da redefinição de
segunda-feira."*

🔑 **Sem login, sem configuração.** Ele aproveita a sessão que o Claude Code já
tem no seu computador. É instalar, entrar de novo na sessão e pronto.

🔄 **Sempre atualizado.** Versões novas chegam sozinhas, com uma notificação
avisando.

## Como funciona

Cada anel muda de cor conforme o uso:

<p align="center">
  <img src="docs/images/estados.svg" alt="Estados de cor dos anéis: azul, amarelo, vermelho, estimativa e sem dados">
</p>

**Passe o mouse sobre os anéis** para ver os detalhes: quanto falta, quando cada
limite reseta e como está o seu ritmo.

<p align="center">
  <img src="docs/images/painel.svg" alt="Painel de detalhes com aviso de ritmo, sessão e semanal">
</p>

O aviso de ritmo no topo do painel segue a mesma lógica de cores:

| | Quando aparece |
|---|---|
| 🔵 | No ritmo atual, você chega ao reset **com crédito** |
| 🟡 | O limite acaba **pouco antes** do reset: até 1 dia antes na semana, ou até 45 min antes na sessão |
| 🔴 | O limite acaba **bem antes** do reset |

E quando um limite passa de **90%**, você recebe uma notificação do sistema,
uma vez por janela.

**Clicando nos anéis**, você pode atualizar na hora ou abrir a página de uso
no claude.ai.

## Perguntas frequentes

<details>
<summary><strong>Preciso fazer login no Breath?</strong></summary>

Não. O Breath não tem login. Ele **lê, só para leitura, o token da sessão do
Claude Code** que já está no seu computador (`~/.claude/.credentials.json`) e
usa esse token para consultar o seu uso, do mesmo jeito que o comando `/usage`
do Claude Code faz.

Ele nunca pede senha, nunca renova o token e nunca altera esse arquivo, então
não atrapalha o seu login no Claude Code. Se você trocar de conta no Claude
Code, o Breath acompanha sozinho.
</details>

<details>
<summary><strong>Os números batem com o claude.ai?</strong></summary>

Sim. Eles vêm da mesma fonte e somam todo o seu uso: web, app e Claude Code.
</details>

<details>
<summary><strong>Uso o Claude só pelo site. Funciona?</strong></summary>

Infelizmente, não. O Breath precisa do **Claude Code instalado e logado** com
uma assinatura **Pro ou Max**, porque é dessa sessão que ele tira o acesso. Mas
você não precisa usar o Claude Code no dia a dia: basta ele estar logado.

Contas que usam chave de API do Console não têm limites de sessão e de semana,
então não há o que mostrar.
</details>

<details>
<summary><strong>O que aparece se eu ficar dias sem abrir o Claude Code?</strong></summary>

O Claude Code só renova o acesso enquanto está aberto. Sem ele, o Breath mostra
o **último valor oficial com a idade dele** (por exemplo, "Oficial há 3h"), com
o anel tracejado. Se houver uso no Claude Code depois disso, ele soma uma
**estimativa** (`~`) feita a partir dos registros locais. Quando você abre o
Claude Code de novo, os números oficiais voltam.
</details>

<details>
<summary><strong>Meus dados saem do meu computador?</strong></summary>

Só a consulta de uso, que vai direto para `api.anthropic.com`. O Breath nunca
registra o token em logs e não segue redirecionamentos, então o token não tem
como ir parar em outro lugar. Tudo o que ele guarda fica em
`~/.cache/breath/state.json`.

> O endpoint de uso não é documentado pela Anthropic e pode mudar sem aviso.
> Se isso acontecer, o Breath passa para o modo de estimativa até ganhar uma
> versão corrigida.
</details>

<details>
<summary><strong>Funciona na minha distro?</strong></summary>

Por enquanto, o Breath funciona no **GNOME 49** (testado no Ubuntu 25.10). O
instalador confere a versão e avisa se não for compatível. O
suporte a outras versões do GNOME está a caminho.

Em distros sem systemd, a extensão funciona, mas as atualizações automáticas
ficam desligadas.
</details>

<details>
<summary><strong>Como funcionam as atualizações?</strong></summary>

A cada hora, e 2 minutos depois do login, o Breath procura uma versão nova. Se
houver, ele baixa e avisa: *"Breath atualizado para vX.Y.Z — vale na próxima
sessão"*. Sem internet, ele só tenta de novo mais tarde.

```bash
systemctl --user start breath-update.service          # procurar agora
systemctl --user disable --now breath-update.timer    # desligar as atualizações
```

Como as versões novas rodam no seu GNOME, só instale se confiar neste
repositório. As versões publicadas são protegidas: depois de lançada, uma
versão nunca é alterada.
</details>

<details>
<summary><strong>Como desinstalo?</strong></summary>

```bash
curl -fsSL https://raw.githubusercontent.com/gaabrenno/breath/main/uninstall.sh | bash
```

O desinstalador remove a extensão, as atualizações automáticas e os arquivos do
Breath. Ele não toca no seu login do Claude Code.
</details>

## Instalação

```bash
curl -fsSL https://raw.githubusercontent.com/gaabrenno/breath/main/install.sh | bash
```

Antes de mexer em qualquer coisa, o instalador confere se você tem GNOME 49,
`git` e o Claude Code logado, e explica o que falta, se for o caso. Depois,
**encerre a sessão e entre de novo**, e os anéis aparecem na barra.

---

<details>
<summary><strong>Para desenvolvedores</strong></summary>

### Rodando localmente

```bash
git clone git@github.com:gaabrenno/breath.git && cd breath
TZ=America/Sao_Paulo gjs -m tests/run.js   # testes da lógica (extension/lib)
bash tests/shell/run.sh                    # testes do instalador e do atualizador
gjs -m scripts/smoke-api.js                # chamada real à API; imprime só as porcentagens
```

`scripts/dev-link.sh` faz a extensão usar a sua pasta de desenvolvimento, e
`scripts/dev-link.sh --off` volta para a instalação normal. Para ver o
resultado sem sair da sessão, abra um GNOME dentro de uma janela (requer o
pacote `mutter-dev-bin`):

```bash
dbus-run-session gnome-shell --devkit --wayland
```

Os logs da extensão:

```bash
journalctl -f -o cat /usr/bin/gnome-shell | grep breath
```

### Publicando uma versão

A partir da `main`, com a árvore limpa:

```bash
scripts/release.sh 1.1.0
```

O script roda os testes, grava a versão no `metadata.json`, cria a tag `v1.1.0`
e envia. As instalações recebem a versão em até 1 hora. Versões publicadas não
podem ser alteradas nem apagadas, então, para corrigir um problema, publique
uma versão nova.

### Estrutura

| Caminho | O que contém |
|---|---|
| `extension/lib/` | Lógica: credenciais, API, contagem de tokens nos logs, estimativa, aviso de ritmo, notificações e ciclo de atualização |
| `extension/ui/` | O anel (Cairo) e o painel do hover |
| `extension/extension.js` | Liga tudo na barra do GNOME |
| `install.sh`, `uninstall.sh` | Instalador e desinstalador de um comando |
| `scripts/` | Atualizador, publicação de versões, `dev-link` e teste da API |
| `systemd/` | Timer de atualização automática |
| `tests/` | Testes em GJS e em shell, sem dependências externas |
| `docs/` | Design, planos de implementação e imagens |

</details>

<p align="center"><sub>Projeto independente, sem vínculo com a Anthropic. Claude é uma marca da Anthropic.</sub></p>
