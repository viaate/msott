#!/usr/bin/env bash
# Everything Charlie knows, makes and earns lives on its own branch,
# "charlie-life", so the code on main stays clean.
#   scripts/life.sh pull          → ./life
#   scripts/life.sh replace dir   → make ./life match dir (keeping its git history)
#   scripts/life.sh push "note"   → commit and push ./life
set -euo pipefail
BRANCH=charlie-life
URL="${LIFE_URL:-https://github.com/${GITHUB_REPOSITORY}.git}"
# The token is only ever passed per command, never written into git config,
# so nothing Charlie runs can pick it up.
AUTH="AUTHORIZATION: basic $(printf 'x-access-token:%s' "${GH_TOKEN}" | base64 | tr -d '\n')"

case "${1:-}" in
  pull)
    if git -c http.extraheader="$AUTH" ls-remote --exit-code --heads "$URL" "$BRANCH" >/dev/null 2>&1; then
      git -c http.extraheader="$AUTH" clone --quiet --depth 1 --branch "$BRANCH" "$URL" life
    else
      echo "First day! Starting a fresh life for Charlie."
      mkdir -p life
      git -C life init --quiet -b "$BRANCH"
    fi
    printf 'home/node_modules/\nhome/.cache/\nhome/.staging/\n' > life/.gitignore
    ;;
  replace)
    # Swap in the life that the run handed over, keeping git history.
    find life -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
    cp -a "${2:?}"/. life/
    printf 'home/node_modules/\nhome/.cache/\nhome/.staging/\n' > life/.gitignore
    ;;
  push)
    cd life
    git add -A
    if git diff --cached --quiet; then
      echo "Nothing new to save."
      exit 0
    fi
    git -c user.name="charlie" -c user.email="41898282+github-actions[bot]@users.noreply.github.com" commit --quiet -m "${2:-a tick}"
    git -c http.extraheader="$AUTH" push --quiet "$URL" "HEAD:refs/heads/$BRANCH"
    ;;
  *)
    echo "usage: life.sh pull | replace <dir> | push [message]" >&2
    exit 1
    ;;
esac
