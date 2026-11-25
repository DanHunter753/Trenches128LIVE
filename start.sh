#!/bin/sh
cd "$(dirname "$0")"
command -v node >/dev/null 2>&1 || { echo "Node.js is required. Install it from https://nodejs.org then run this again."; exit 1; }
exec node host.js "$@"
