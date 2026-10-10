#!/usr/bin/env bash
# Builds the Jekyll site and the garage app into one output folder, then checks every page and link.
# Usage: scripts/build-site.sh [destination] [baseurl]   (defaults: _site and the baseurl in _config.yml)
set -euo pipefail
cd "$(dirname "$0")/.."

dest="${1:-_site}"
base="${2:-}"

SITE_BASEURL="$base" npm --prefix garage run build

jekyll_args=(build --destination "$dest")
if [[ -n "$base" ]]; then jekyll_args+=(--baseurl "$base"); fi
bundle exec jekyll "${jekyll_args[@]}"

rm -rf "$dest/garage"
cp -R garage/dist "$dest/garage"

if [[ -n "$base" ]]; then ruby test_site.rb "$dest" "$base"; else ruby test_site.rb "$dest"; fi
