# 微信云托管（WeChat Cloud Run）后端构建文件
# 构建上下文：仓库根目录（.）

FROM eclipse-temurin:21-jdk AS plugin-builder
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && \
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    apt-get install -y --no-install-recommends nodejs && \
    npm install -g pnpm@9 && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /src/plugin-wanwan
COPY plugin-wanwan/ui/package.json plugin-wanwan/ui/pnpm-lock.yaml ./ui/
RUN cd ui && pnpm install --frozen-lockfile

COPY plugin-wanwan ./
RUN cd ui && pnpm build && cd .. && \
    ./gradlew jar --no-daemon -x :ui:pnpmSetup -x :ui:pnpmInstall -x :ui:buildFrontend

FROM halohub/halo:2.27.3
COPY --from=plugin-builder /src/plugin-wanwan/build/libs/plugin-wanwan-*.jar /opt/wanwan/plugins/
COPY deploy/cloudrun/entrypoint.sh /opt/wanwan/entrypoint.sh
RUN chmod +x /opt/wanwan/entrypoint.sh

ENV JVM_OPTS="-Xmx1024m -Xms512m" \
    PORT="80"

EXPOSE 80
ENTRYPOINT ["/opt/wanwan/entrypoint.sh"]
