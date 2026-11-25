#!/usr/bin/env bash
# Publica uma versão do Breath: scripts/release.sh X.Y.Z
# Atualiza version-name, faz o commit, cria a tag anotada vX.Y.Z e envia.
# Todas as instalações recebem a versão na próxima checagem (até 1h).
set -u
cd "$(dirname "$0")/.." || exit 1
die() { printf 'Erro: %s\n' "$*" >&2; exit 1; }

ver=${1:-}
[[ $ver =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "use: scripts/release.sh X.Y.Z (ex.: 1.2.0)"
tag=v$ver

[ "$(git rev-parse --abbrev-ref HEAD)" = main ] || die "publique a partir da branch main."
[ -z "$(git status --porcelain)" ] || die "há alterações não commitadas."
git rev-parse -q --verify "refs/tags/$tag" >/dev/null && die "a tag $tag já existe."
git fetch -q --tags origin 2>/dev/null
git rev-parse -q --verify "refs/tags/$tag" >/dev/null && die "a tag $tag já existe no remoto."

echo "Rodando os testes..."
bash -c "${BREATH_TEST_CMD:-TZ=America/Sao_Paulo gjs -m tests/run.js && bash tests/shell/run.sh}" >/dev/null 2>&1 ||
    die "os testes falharam; nada foi publicado."

sed -i -E "s/(\"version-name\": *\")[^\"]*\"/\1$ver\"/" extension/metadata.json
grep -q "\"version-name\": \"$ver\"" extension/metadata.json || die "não consegui gravar version-name."
git commit -qam "release: $tag"
git tag -a "$tag" -m "Breath $tag"
git push -q --atomic origin main "$tag" || die "push falhou; desfaça com: git tag -d $tag && git reset --hard HEAD~1"
echo "Publicado $tag. As instalações atualizam em até 1h (vale no próximo login)."
