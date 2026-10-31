#!/usr/bin/env bash
# Everything Charlie knows, makes and earns lives in life/ on main.
#   scripts/life.sh save <dir> "note"   → make ./life match dir, commit it, push to main
# Only life/ is ever staged, so nothing her code wrote can change the code.
# Run it on the commit her run started from: her changes are then replayed onto
# the newest main, so anything else that changed in life/ meanwhile is kept.
set -euo pipefail
URL="${LIFE_URL:-https://github.com/${GITHUB_REPOSITORY}.git}"
# The token is only ever passed per command, never written into git config,
# so nothing Charlie runs can pick it up.
AUTH="AUTHORIZATION: basic $(printf 'x-access-token:%s' "${GH_TOKEN}" | base64 | tr -d '\n')"
WHO=(-c user.name="charlie" -c user.email="41898282+github-actions[bot]@users.noreply.github.com")

# Makes ./life match the saved dir and commits it. Fails if nothing changed.
commit_life() {
  rm -rf life
  mkdir -p life
  cp -a "$1"/. life/
  # Never save installed packages, or anything hidden in her home (caches, logins).
  printf 'node_modules/\nhome/.*\n' > life/.gitignore
  git add -A life
  git diff --cached --quiet && return 1
  git "${WHO[@]}" commit --quiet -m "$2"
}

case "${1:-}" in
  save)
    if ! commit_life "${2:?}" "${3:-a tick}"; then
      echo "Nothing new to save."
      exit 0
    fi
    for wait in 2 4 8 16; do
      if git -c http.extraheader="$AUTH" fetch --quiet "$URL" main; then
        # Where her change and someone else's touch the same lines, hers wins.
        # If it can't be replayed at all, her life as she left it is saved whole.
        if ! git "${WHO[@]}" rebase --quiet -X theirs FETCH_HEAD; then
          git rebase --abort || true
          git reset --quiet --hard FETCH_HEAD
          commit_life "$2" "${3:-a tick}" || exit 0
        fi
        git -c http.extraheader="$AUTH" push --quiet "$URL" HEAD:main && exit 0
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
