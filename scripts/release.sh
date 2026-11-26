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

latest=$(git tag -l 'v*' | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | sort -V | tail -n 1)
if [ -n "$latest" ] && [ "$(printf '%s\n%s\n' "$latest" "$tag" | sort -V | tail -n 1)" != "$tag" ]; then
    die "a versão precisa ser maior que $latest (o atualizador sempre instala a maior)."
fi

# Notas da versão: seção "## vX.Y.Z" do CHANGELOG.md, com "### Novidades" e/ou "### Correções".
# Viram a Release no GitHub, que o site mostra.
re_tag="^## ${tag//./\\.}( |\$)"
notes=$(awk -v re="$re_tag" '$0 ~ re {f=1; next} f && /^## v/ {exit} f' CHANGELOG.md 2>/dev/null)
printf '%s\n' "$notes" | grep -qE '^### (Novidades|Correções)' ||
    die "escreva as notas de $tag no CHANGELOG.md (seção '## $tag', com '### Novidades' e/ou '### Correções')."

echo "Rodando os testes..."
bash -c "${BREATH_TEST_CMD:-TZ=America/Sao_Paulo gjs -m tests/run.js && bash tests/shell/run.sh}" >/dev/null 2>&1 ||
    die "os testes falharam; nada foi publicado."

sed -i -E "s/(\"version-name\": *\")[^\"]*\"/\1$ver\"/" extension/metadata.json
grep -q "\"version-name\": \"$ver\"" extension/metadata.json || die "não consegui gravar version-name."
if ! git commit -qam "release: $tag"; then
    git checkout -q -- extension/metadata.json
    die "o commit falhou; nada foi publicado."
fi
git tag -a "$tag" -m "Breath $tag" || die "não consegui criar a tag; desfaça com: git reset --hard HEAD~1"
git push -q --atomic origin main "$tag" || die "push falhou; desfaça com: git tag -d $tag && git reset --hard HEAD~1"
echo "Publicado $tag. As instalações atualizam em até 1h (vale no próximo login)."

nf=$(mktemp)
printf '%s\n' "$notes" > "$nf"
if gh release create "$tag" --title "Breath $tag" --notes-file "$nf" >/dev/null 2>&1; then
    echo "Release $tag criada no GitHub (aparece no site)."
else
    echo "Aviso: a versão foi publicada, mas não consegui criar a release no GitHub."
    echo "Crie com: gh release create $tag --title \"Breath $tag\" --notes-file <arquivo com as notas>"
fi
rm -f "$nf"
