#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SITE_DIR="/var/www/holon.software"
API_SERVICE="holon-software-contact-api.service"

cd "$REPO_DIR"

git fetch origin main
git reset --hard origin/main

bun install
bun run build

mkdir -p "${SITE_DIR}/dist"
rsync -a --delete ./dist/ "${SITE_DIR}/dist/"
chown -R www-data:www-data "${SITE_DIR}"

systemctl restart "${API_SERVICE}"
systemctl --no-pager --full status "${API_SERVICE}"
