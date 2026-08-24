#!/usr/bin/env bash
# Shared helpers for this repo's git hooks.
#
# `core.hooksPath` is a single value, and the repo-local one wins outright, so
# pointing git at `.githooks/` means the user's *global* hooks stop running in
# this repo. Every hook here therefore delegates to its global namesake first,
# then adds the repo-specific check. A hook that exists globally but has no
# passthrough file here silently stops running in this repo, which is what
# `yarn hooks:install` warns about.

# Run the global hook of the same name, if the user has one. Stdin is
# inherited, which pre-push needs (git feeds it the ref list). A non-zero exit
# propagates under `set -e`, so a global gate can still veto the operation.
run_global_hook() {
  local name="$1"
  shift

  local global_dir
  global_dir="$(git config --global --get core.hooksPath || true)"
  [ -n "${global_dir}" ] || return 0

  case "${global_dir}" in
    "~"*) global_dir="${HOME}${global_dir#\~}" ;;
  esac

  local hook="${global_dir}/${name}"
  [ -x "${hook}" ] || return 0

  "${hook}" "$@"
}

# Run one of this repo's own hook scripts, from the repo root, and return its
# exit code for the caller to interpret.
#
# Returns 0 when node is missing rather than failing. A GUI git client runs
# hooks with a minimal PATH that often has no nvm-installed node in it, and
# under `set -e` that would turn a reminder into a blocked operation.
run_repo_script() {
  local script="$1"
  shift

  command -v node >/dev/null 2>&1 || return 0

  local root
  root="$(git rev-parse --show-toplevel)"
  node "${root}/scripts/${script}" "$@"
}
