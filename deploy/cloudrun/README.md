# 微信云托管（后端）部署说明

本服务运行 Halo 2.27.3 + `plugin-wanwan`（不修改 Halo 核心源码），同时向 **微信小程序**（内网 `wx.cloud.callContainer`）和 **独立 Web 服务器**（服务器间 HTTPS 请求）提供公开 JSON API。生产验收要求见[技术架构与实施方案](../../docs/技术架构与实施方案.md)。

## 控制台关键配置
1. **代码仓库构建**：选择 `heizhuangzhuang/wanwan` 的 `main`，使用仓库根目录的 [`Dockerfile`](../../Dockerfile)，构建上下文为 `.`，监听端口为 `80`。已有服务沿用控制台中的名称。小程序 `cloudService` 配置需与该服务名一致。
2. **实例规格与扩缩容（重要）**：
   - 最小实例数必须设为 **1**（禁止缩容到 0，防止 Halo 启动与内存搜索索引重建超时）。
   - 建议规格：1C2G 或 2C4G（`JVM_OPTS=-Xmx1024m -Xms512m`）。
3. **存储与数据库**：
   - 发布前先关联微信云托管 MySQL 8.0，确认目标版本获得 `MYSQL_ADDRESS`、`MYSQL_USERNAME`、`MYSQL_PASSWORD`。入口脚本在缺少任一参数时会停止启动。
   - 已运行的实例若尚未使用 MySQL，先核实数据所在位置并备份，确认迁移后的数据再切换流量。
   - 挂载 **CFS 文件存储** 到 `/root/.halo2`，保存 Halo 配置与原创附件。
4. **环境变量**：
   - `MYSQL_DATABASE=halo`
   - `HALO_EXTERNAL_URL=https://你的后端域名`
   - `WANWAN_CORS_ALLOWED_ORIGINS` 在浏览器需要跨域调用时填写允许的来源，多个来源用逗号分隔。Web SSR 通过服务器间 HTTPS 请求读取接口
5. **安全边界**：
   - 开启公网域名给 Web 侧使用时，应在网关/访问规则中仅允许公开只读接口（`/apis/api.wanwan.run/v1alpha1/**`）；`/console` 管理后台不要暴露给无限制公网入口。

如果高级设置保存了旧的 `deploy/cloudrun/Dockerfile` 路径，将它清空以使用默认值，或填 `Dockerfile`。出现 GitHub 内容接口 404 时，先检查分支和路径。根目录文件可访问但控制台仍报相同错误时，再检查 GitHub 仓库绑定。


## 上传本地构建包

如果已构建插件 JAR，可使用控制台的「本地代码上传」构建服务版本。上传包根目录应包含 `Dockerfile`、`entrypoint.sh` 和 `plugin-wanwan-*.jar`。Dockerfile 基于 `halohub/halo:2.27.3`，复制已构建的插件和入口脚本，监听 `80`。代码压缩包由云端构建为镜像。MySQL 凭据和环境变量在控制台配置。

发布后检查 `/actuator/health/readiness`，并用 MySQL 查询或连接记录核实新版本实际连到目标库。在 Halo 后台确认「弯弯知识导航」插件已启用，匿名 `GET /apis/api.wanwan.run/v1alpha1/stages` 应返回 `200 application/json` 和阶段数组。随后联调 Web 和小程序。升级已有服务时先确认 MySQL、持久化目录和当前可回滚版本。
