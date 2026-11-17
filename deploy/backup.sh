#!/usr/bin/env bash
# 每日备份：MySQL 逻辑备份 + Halo 工作目录（ADR-002）
# crontab 示例：30 3 * * * cd /opt/wanwan/deploy && ./backup.sh >> backup.log 2>&1
# 异地副本：请用云厂商 CLI（如 coscli/ossutil）同步 ${BACKUP_DIR} 到对象存储，凭据不写入本脚本。
set -euo pipefail

cd "$(dirname "$0")"
set -a; source .env; set +a

BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-30}"
TS="$(date +%Y%m%d-%H%M%S)"
mkdir -p "${BACKUP_DIR}"

docker compose exec -T mysql sh -c \
  'exec mysqldump --single-transaction --routines -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' \
  | gzip > "${BACKUP_DIR}/db-${TS}.sql.gz"

tar -czf "${BACKUP_DIR}/halo-${TS}.tar.gz" -C ./data halo

find "${BACKUP_DIR}" -type f -mtime "+${KEEP_DAYS}" -delete
echo "[$(date)] backup ok: ${TS}"
