#!/usr/bin/env sh
set -eu

WORK_DIR="${HALO_WORK_DIR:-/root/.halo2}"
set -- "--server.port=${PORT:-80}" "--halo.work-dir=${WORK_DIR}"

if [ -n "${MYSQL_ADDRESS:-}" ]; then
  : "${MYSQL_USERNAME:?Set MYSQL_USERNAME for the Cloud Run MySQL instance}"
  : "${MYSQL_PASSWORD:?Set MYSQL_PASSWORD for the Cloud Run MySQL instance}"
  DB_NAME="${MYSQL_DATABASE:-halo}"
  set -- "$@" \
    "--spring.r2dbc.url=r2dbc:pool:mysql://${MYSQL_ADDRESS}/${DB_NAME}" \
    "--spring.r2dbc.username=${MYSQL_USERNAME}" \
    "--spring.sql.init.platform=mysql"
  export SPRING_R2DBC_PASSWORD="$MYSQL_PASSWORD"
  unset MYSQL_PASSWORD
fi

mkdir -p "${WORK_DIR}/plugins"

# Halo uses wanwan-<version>.jar when the plugin was installed via Console.
# Also keep the original image filename for earlier registered deployments.
for bundled in /opt/wanwan/plugins/plugin-wanwan-*.jar; do
  if [ ! -f "$bundled" ]; then
    printf '%s\n' 'Missing bundled Wanwan plugin JAR' >&2
    exit 1
  fi
  filename="${bundled##*/}"
  for name in "$filename" "${filename#plugin-}"; do
    staged="$(mktemp "${WORK_DIR}/plugins/.wanwan.XXXXXX")"
    if ! cp "$bundled" "$staged" || ! mv -f "$staged" "${WORK_DIR}/plugins/$name"; then
      rm -f "$staged"
      exit 1
    fi
  done
done

if [ -n "${HALO_EXTERNAL_URL:-}" ]; then
  set -- "$@" "--halo.external-url=${HALO_EXTERNAL_URL}"
fi

exec java ${JVM_OPTS:-} -XX:SharedArchiveFile=/application/application.jsa -jar /application/application.jar "$@"
