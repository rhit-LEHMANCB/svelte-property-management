#!/usr/bin/env bash
# Pulls .env and .env.qa from 1Password into the repo root (both are gitignored).
#
# Each file is a Document item in the Lehman Family vault, named ".env" and ".env.qa". Overridable
# through the environment: OP_VAULT (default: the vault id below), OP_ENV_ITEM, OP_ENV_QA_ITEM.
#
# Auth: locally, sign in with the 1Password desktop app integration or `op signin`. In a cloud
# session, set OP_SERVICE_ACCOUNT_TOKEN as an environment secret for a service account with
# read-only access to that vault. Use dev-project values only, never production.
#
# Usage: scripts/pull-env.sh [--force]   (--force overwrites existing files)
set -euo pipefail

cd "$(dirname "$0")/.."

force=0
[[ "${1:-}" == "--force" ]] && force=1

vault="${OP_VAULT:-tnv5rypeamngjzwy6txx2ut6nu}"

if ! command -v op >/dev/null 2>&1; then
	echo "pull-env: the 1Password CLI (op) is not installed. See https://developer.1password.com/docs/cli/get-started" >&2
	exit 1
fi

pull() {
	local dest="$1" item="$2"
	if [[ -e "$dest" && $force -eq 0 ]]; then
		echo "pull-env: $dest already exists, skipping (use --force to overwrite)"
		return
	fi
	local tmp
	tmp="$(mktemp "${dest}.XXXXXX")"
	trap 'rm -f "$tmp"' RETURN
	chmod 600 "$tmp"
	if ! op document get "$item" --vault "$vault" --force --out-file "$tmp" >/dev/null; then
		echo "pull-env: could not read document '$item' from vault $vault" >&2
		return 1
	fi
	mv "$tmp" "$dest"
	trap - RETURN
	echo "pull-env: wrote $dest (mode 600)"
}

pull .env "${OP_ENV_ITEM:-.env}"
pull .env.qa "${OP_ENV_QA_ITEM:-.env.qa}"
