#!/usr/bin/env sh
set -eu

WORK_DIR="${HALO_WORK_DIR:-/root/.halo2}"
mkdir -p "${WORK_DIR}/plugins"

# 同步内置插件到持久化工作目录（兼容挂载 CFS 后的插件升级）
rm -f "${WORK_DIR}/plugins"/plugin-wanwan-*.jar
cp /opt/wanwan/plugins/plugin-wanwan-*.jar "${WORK_DIR}/plugins/"

set -- "--server.port=${PORT:-80}" "--halo.work-dir=${WORK_DIR}"

if [ -n "${MYSQL_ADDRESS:-}" ]; then
  DB_NAME="${MYSQL_DATABASE:-halo}"
  set -- "$@" \
    "--spring.r2dbc.url=r2dbc:pool:mysql://${MYSQL_ADDRESS}/${DB_NAME}" \
    "--spring.r2dbc.username=${MYSQL_USERNAME:-root}" \
    "--spring.r2dbc.password=${MYSQL_PASSWORD:-}" \
    "--spring.sql.init.platform=mysql"
fi

if [ -n "${HALO_EXTERNAL_URL:-}" ]; then
  set -- "$@" "--halo.external-url=${HALO_EXTERNAL_URL}"
fi

exec java ${JVM_OPTS:-} -XX:SharedArchiveFile=/application/application.jsa -jar /application/application.jar "$@"
