# Novidades do Breath

Cada versão tem uma seção `## vX.Y.Z (data)` com `### Novidades` (algo novo) e/ou
`### Correções` (ajustes no que já existia). O `scripts/release.sh` exige a seção
da versão e a publica como Release no GitHub, que aparece no site.

## v1.1.1 (2026-11-26)

### Correções

- A extensão agora também é instalada no GNOME 50. Antes, o instalador não
  reconhecia essa versão e colocava os ícones na bandeja.

## v1.1.0 (2026-11-26)

### Novidades

- O Breath funciona em qualquer Linux, não só no GNOME 49:
  - GNOME 45 a 49: os anéis na barra superior, como antes.
  - KDE Plasma, XFCE, Cinnamon, MATE e Budgie: dois ícones na bandeja. O clique
    abre um painel de detalhes no mesmo visual da extensão; no KDE ele abre junto
    do mouse.
  - Hyprland, Sway e i3: o comando `breath`, pronto para a waybar, a polybar e o
    i3blocks.
- O instalador descobre o seu ambiente sozinho e aceita `--gnome`, `--tray` ou
  `--cli` para escolher.
- Fora do GNOME, a versão nova já vale na hora, sem sair da sessão.

### Correções

- A notificação dos 90% não se repete quando a bandeja e o comando rodam juntos.

## v1.0.0 (2026-11-25)

### Novidades

- Primeira versão: os anéis da sessão de 5 horas e da semana na barra do
  GNOME 49, com aviso de ritmo, notificação aos 90%, instalador de um comando e
  atualização automática.
