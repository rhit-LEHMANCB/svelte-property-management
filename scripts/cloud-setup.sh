#!/usr/bin/env bash
# Cloud environment startup: installs the 1Password CLI if missing, pulls .env and .env.qa, and
# installs npm dependencies. Paste this file's contents into the environment's setup script, or
# run it from there as `bash scripts/cloud-setup.sh`.
#
# Needs OP_SERVICE_ACCOUNT_TOKEN set as an environment secret, and network access to
# my.1password.com and cache.agilebits.com. Missing pieces are warnings, not failures, so the
# session still starts and npm dependencies still install.
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

if command -v op >/dev/null 2>&1 && [[ -n "${OP_SERVICE_ACCOUNT_TOKEN:-}" ]]; then
	bash scripts/pull-env.sh --force || echo "cloud-setup: WARNING pull-env failed" >&2
else
	echo "cloud-setup: WARNING skipping env pull (op missing or OP_SERVICE_ACCOUNT_TOKEN unset)" >&2
fi

npm ci
