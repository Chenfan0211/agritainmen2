#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/deploy/compose/.env}"
BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/deploy/backups}"
mkdir -p "$BACKUP_DIR"
set -a
source "$ENV_FILE"
set +a
STAMP="$(date +%Y%m%d-%H%M%S)"
docker compose --env-file "$ENV_FILE" -f "$ROOT_DIR/deploy/compose/docker-compose.yml" exec -T mysql \
  mysqldump -u root -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines --triggers \
  agritainmen_auth agritainmen_org agritainmen_catalog agritainmen_inventory \
  agritainmen_order agritainmen_payment agritainmen_fulfillment \
  agritainmen_settlement agritainmen_admin agritainmen_notification \
  > "$BACKUP_DIR/agritainmen-$STAMP.sql"
echo "backup written: $BACKUP_DIR/agritainmen-$STAMP.sql"
