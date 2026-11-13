#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/deploy/compose/.env}"
docker compose --env-file "$ENV_FILE" -f "$ROOT_DIR/deploy/compose/docker-compose.yml" down
echo "staging stack stopped; database volume retained. Restore a backup before bringing services up again."
