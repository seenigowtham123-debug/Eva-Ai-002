#!/bin/bash
cd "$(dirname "$0")"
command -v node >/dev/null || { echo "Node.js is not installed. Get it from https://nodejs.org (LTS)."; exit 1; }
[ -f .env ] || { [ -f .env.example ] && cp .env.example .env; }
( sleep 1.5; (open http://localhost:3000 || xdg-open http://localhost:3000) >/dev/null 2>&1 ) &
exec node server.js
