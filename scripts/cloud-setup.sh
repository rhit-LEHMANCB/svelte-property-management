#!/usr/bin/env bash
# Cloud environment startup: installs the 1Password CLI if missing, installs openspec and npm
# dependencies, and installs the Playwright browser build that @playwright/test needs if the
# container image lacks it. Paste this file's contents into the environment's setup script, or run
# it from there as `bash scripts/cloud-setup.sh`.
#
# Needs network access to cache.agilebits.com and cdn.playwright.dev. It does not pull .env or
# .env.qa: secrets such as OP_SERVICE_ACCOUNT_TOKEN are not available while the setup script runs,
# so the dev-lifecycle skill runs scripts/pull-env.sh before its preflight. Missing pieces are warnings, not failures,
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

# The container image ships its own Playwright browsers in PLAYWRIGHT_BROWSERS_PATH and sets
# PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD, so they can lag behind the installed @playwright/test. Install the
# builds it needs into the same directory, but only when one is missing.
missing_browsers="$(npx --no-install playwright install --dry-run chromium 2>/dev/null |
	sed -n 's/^ *Install location: *//p' | while read -r dir; do [ -d "$dir" ] || echo "$dir"; done)"
if [ -n "$missing_browsers" ]; then
	if PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD= npx --no-install playwright install chromium; then
		echo "cloud-setup: installed Playwright chromium $(npx --no-install playwright --version)"
	else
		echo "cloud-setup: WARNING could not install the Playwright browser; see the README's cloud notes" >&2
	fi
fi
