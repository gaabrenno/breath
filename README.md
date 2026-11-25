# Breath

Extensão do GNOME Shell que mostra os **limites de uso do Claude** na barra
superior: dois anéis, um para a **sessão de 5 horas** e outro para o **limite
semanal**. Passe o mouse para ver quando cada um reseta.

> Projeto não oficial, sem vínculo com a Anthropic.

![Barra superior com os anéis do Breath](docs/images/barra.svg)

## Como funciona

**Na barra**, cada anel mostra a porcentagem usada e muda de cor conforme o consumo:

![Estados de cor dos anéis](docs/images/estados.svg)

- **Azul**: abaixo de 75%
- **Amarelo**: de 75% a 89%
- **Vermelho**: 90% ou mais (você recebe **uma notificação** por janela)
- **Tracejado com `~`**: estimativa, usada quando não há dado oficial recente
- **Cinza com `–`**: ainda sem nenhum dado

**Ao passar o mouse**, abre um painel com a porcentagem, a barra de progresso e
o horário de reset de cada limite, além da origem do dado e de quando ele foi
atualizado:

![Painel de detalhes exibido ao passar o mouse](docs/images/painel.svg)

**Ao clicar**, abre um menu com **Atualizar agora** e **Abrir uso no claude.ai**.

Os dados são atualizados a cada 2 minutos. Se a API pedir para esperar, o
intervalo dobra até no máximo 10 minutos.

## De onde vêm os números

1. **Oficial (principal):** o Breath lê o token OAuth do Claude Code em
   `~/.claude/.credentials.json` e consulta o mesmo endpoint que o `/usage` do
   Claude Code usa. Os números são os mesmos do claude.ai, porque somam o uso na
   web, no app e no Claude Code.
2. **Fallback:** quando o token expira (o Claude Code só o renova enquanto está
   rodando) ou a API não responde, o Breath mostra o **último valor oficial com a
   idade dele**. Por exemplo, "Oficial há 3h". Se houver uso no Claude Code
   depois disso, ele soma um **acréscimo estimado** (`~`) a partir dos logs
   locais em `~/.claude/projects/*/*.jsonl`, calibrado pelas leituras oficiais.

O endpoint não é documentado e pode mudar sem aviso. Se o formato da resposta
mudar, o Breath passa automaticamente para o fallback.

### Segurança e privacidade

- O token é **somente lido**. O Breath nunca renova o token nem escreve no
  arquivo de credenciais, então não interfere no login do Claude Code.
- O token nunca aparece em logs.
- As requisições **não seguem redirecionamentos**: o token só vai para
  `api.anthropic.com`.
- O estado (último valor oficial, calibração e notificações já enviadas) fica
  em `~/.cache/breath/state.json`.

## Requisitos

- GNOME Shell 49 (testado no Ubuntu 25.10, Wayland)
- Claude Code instalado e logado

## Instalação

```bash
git clone git@github.com:gaabrenno/breath.git
cd breath
bash scripts/install.sh   # cria o link em ~/.local/share/gnome-shell/extensions/breath@simer
```

No Wayland, encerre a sessão e entre de novo. Depois, ative a extensão:

```bash
gnome-extensions enable breath@simer
```

Para testar sem sair da sessão, abra um GNOME dentro de uma janela (requer o
pacote `mutter-dev-bin`):

```bash
dbus-run-session gnome-shell --devkit --wayland
```

## Desenvolvimento

```bash
TZ=America/Sao_Paulo gjs -m tests/run.js   # testes de unidade (lógica pura em extension/lib)
gjs -m scripts/smoke-api.js                # chamada real à API; imprime só as porcentagens
```

Estrutura:

| Caminho | O que contém |
|---|---|
| `extension/lib/` | Lógica pura: credenciais, leitura da API, contagem de tokens nos logs, estimativa do fallback, regra de notificação e ciclo de atualização |
| `extension/ui/` | O anel (Cairo) e o painel do hover |
| `extension/extension.js` | Liga tudo na barra do GNOME |
| `tests/` | Testes em GJS, sem dependências externas |
| `docs/superpowers/` | Design e plano de implementação |
| `docs/images/` | Mockups usados neste README |

Os logs da extensão podem ser acompanhados com:

```bash
journalctl -f -o cat /usr/bin/gnome-shell | grep breath
```
