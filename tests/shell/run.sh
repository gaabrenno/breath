#!/usr/bin/env bash
# Harness de testes de shell: bash tests/shell/run.sh [filtro]
cd "$(dirname "$0")/../.." || exit 1
export REPO_ROOT=$PWD
filter=${1:-}
pass=0 fail=0
for f in tests/shell/*.test.sh; do
    [[ $f == *"$filter"* ]] || continue
    tests=$(bash -c "source tests/shell/lib.sh; source $f; declare -F" | awk '{print $3}' | grep '^test_')
    for t in $tests; do
        out=$(bash -c "source tests/shell/lib.sh; source $f; set -u; $t" 2>&1)
        if [ $? -eq 0 ]; then
            pass=$((pass + 1)); echo "PASS $(basename "$f") › $t"
        else
            fail=$((fail + 1)); echo "FAIL $(basename "$f") › $t"; echo "$out" | tail -8 | sed 's/^/    /'
        fi
    done
done
echo; echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
