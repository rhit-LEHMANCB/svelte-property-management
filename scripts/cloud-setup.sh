#!/usr/bin/env bash
# Cloud environment startup: installs the 1Password CLI if missing, and installs openspec and npm
# dependencies. Paste this file's contents into the environment's setup script, or run it from
# there as `bash scripts/cloud-setup.sh`.
#
# Needs network access to cache.agilebits.com. It does not pull .env or .env.qa: secrets such as
# OP_SERVICE_ACCOUNT_TOKEN are not available while the setup script runs, so the dev-lifecycle
# skill runs scripts/pull-env.sh before its preflight. Missing pieces are warnings, not failures,
# so the session still starts and npm dependencies still install.
set -uo pipefail

cd "$(dirname "$0")/.."

if ! command -v op >/dev/null 2>&1; then
	arch="$(uname -m)"
	case "$arch" in
		x86_64) arch=amd64 ;;
		aarch64 | arm64) arch=arm64 ;;
	esac
	version="2.30.3"
	tmp="$(mktemp -d)"
	if curl -fsSL "https://cache.agilebits.com/dist/1P/op2/pkg/v${version}/op_linux_${arch}_v${version}.zip" -o "$tmp/op.zip" &&
		unzip -qo "$tmp/op.zip" -d "$tmp" && install -m 755 "$tmp/op" /usr/local/bin/op; then
		echo "cloud-setup: installed op $(op --version)"
	else
		echo "cloud-setup: WARNING could not install the 1Password CLI" >&2
	fi
	rm -rf "$tmp"
fi

command -v openspec >/dev/null 2>&1 || npm install -g @fission-ai/openspec@1.14.1 ||
	echo "cloud-setup: WARNING could not install openspec" >&2

npm ci
