#!/usr/bin/env bash
# Everything Charlie knows, makes and earns lives in life/ on main.
#   scripts/life.sh save <dir> "note"   → make ./life match dir, commit it, push to main
# Only life/ is ever staged, so nothing her code wrote can change the code.
set -euo pipefail
URL="${LIFE_URL:-https://github.com/${GITHUB_REPOSITORY}.git}"
# The token is only ever passed per command, never written into git config,
# so nothing Charlie runs can pick it up.
AUTH="AUTHORIZATION: basic $(printf 'x-access-token:%s' "${GH_TOKEN}" | base64 | tr -d '\n')"

case "${1:-}" in
  save)
    rm -rf life
    mkdir -p life
    cp -a "${2:?}"/. life/
    # Never save installed packages, or anything hidden in her home (caches, logins).
    printf 'node_modules/\nhome/.*\n' > life/.gitignore
    git add -A life
    if git diff --cached --quiet; then
      echo "Nothing new to save."
      exit 0
    fi
    git -c user.name="charlie" -c user.email="41898282+github-actions[bot]@users.noreply.github.com" commit --quiet -m "${3:-a tick}"
    # Someone may have pushed code meanwhile; her commit only touches life/, so it rebases cleanly.
    for wait in 2 4 8 16; do
      if git -c http.extraheader="$AUTH" pull --quiet --rebase "$URL" main && git -c http.extraheader="$AUTH" push --quiet "$URL" HEAD:main; then
        exit 0
      fi
      sleep "$wait"
    done
    exit 1
    ;;
  *)
    echo "usage: life.sh save <dir> [message]" >&2
    exit 1
    ;;
esac
