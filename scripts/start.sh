#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1; then
  printf 'Install Docker Desktop (including Compose), then run this command again.\n' >&2
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  printf 'Start Docker Desktop, wait until it is ready, then run this command again.\n' >&2
  exit 1
fi
if [ ! -f .env ]; then
  cp .env.example .env
  printf 'Created local .env. No AI key is required to explore the workspace.\n'
fi
if ! grep -Eq '^SESSION_SECRET=.+$' .env; then
  secret=$(od -An -N48 -tx1 /dev/urandom | tr -d ' \n')
  printf '\nSESSION_SECRET=%s\n' "$secret" >> .env
fi
mkdir -p storage/raw storage/processed
docker compose up -d --build --wait --wait-timeout 240 postgres redis mailpit fastapi worker react
frontend=$(docker compose port react 5173)
mailbox=$(docker compose port mailpit 8025)
printf '\nWorkspace: http://localhost:%s\n' "${frontend##*:}"
printf 'Admin: /admin/login (new installs: admin / admin, unless changed in .env)\nPractice only: /hrai/practisesession\n'
printf 'Local email: http://localhost:%s\n' "${mailbox##*:}"
printf 'See README.md for the reviewer walkthrough and optional AI setup.\n'
