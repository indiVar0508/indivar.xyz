#!/usr/bin/env bash
# Installs the KTX-Software CLI into tools/bin/ktx/. Needed only to re-process the car model.
set -euo pipefail
version=4.4.2
here="$(cd "$(dirname "$0")" && pwd)"
dest="$here/bin/ktx"
name="KTX-Software-$version-Linux-x86_64"
url="https://github.com/KhronosGroup/KTX-Software/releases/download/v$version/$name.tar.bz2"

if [[ -x "$dest/bin/ktx" ]]; then echo "ktx already installed: $("$dest/bin/ktx" --version)"; exit 0; fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
curl -fsSL -o "$tmp/ktx.tar.bz2" "$url"
curl -fsSL -o "$tmp/ktx.tar.bz2.sha1" "$url.sha1"
expected="$(cut -d' ' -f1 < "$tmp/ktx.tar.bz2.sha1")"
actual="$(sha1sum "$tmp/ktx.tar.bz2" | cut -d' ' -f1)"
if [[ "$expected" != "$actual" ]]; then echo "KTX-Software checksum mismatch" >&2; exit 1; fi

mkdir -p "$tmp/x" "$dest"
tar -xjf "$tmp/ktx.tar.bz2" -C "$tmp/x"
top="$(find "$tmp/x" -mindepth 1 -maxdepth 1 -type d | head -1)"
cp -R "$top"/. "$dest"/
"$dest/bin/ktx" --version
