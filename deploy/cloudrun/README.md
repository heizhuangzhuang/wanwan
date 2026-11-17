# 微信云托管（后端）部署说明

本服务运行 Halo 2.27.3 + `plugin-wanwan`（不修改 Halo 核心源码），同时向 **微信小程序**（内网 `wx.cloud.callContainer`）和 **独立 Web 服务器**（HTTPS + CORS 白名单）提供公开 JSON API。

## 控制台关键配置
1. **代码仓库构建**：绑定 GitHub 仓库，Dockerfile 路径填 `deploy/cloudrun/Dockerfile`，构建上下文填 `.`，服务名设为 `wanwan-backend`，监听端口 `80`。
2. **实例规格与扩缩容（重要）**：
   - 最小实例数必须设为 **1**（禁止缩容到 0，防止 Halo 启动与内存搜索索引重建超时）。
   - 建议规格：1C2G 或 2C4G（`JVM_OPTS=-Xmx1024m -Xms512m`）。
3. **存储与数据库**：
   - 关联微信云托管 MySQL 8.0（自动注入 `MYSQL_ADDRESS`、`MYSQL_USERNAME`、`MYSQL_PASSWORD`）。
   - 挂载 **CFS 文件存储** 到 `/root/.halo2`，保存 Halo 配置与原创附件。
4. **环境变量**：
   - `MYSQL_DATABASE=halo`
   - `HALO_EXTERNAL_URL=https://你的后端域名`
   - `WANWAN_CORS_ALLOWED_ORIGINS=https://你的Web域名`（严格白名单，多个域名逗号分隔）
5. **安全边界**：
   - 开启公网域名给 Web 侧使用时，应在网关/访问规则中仅允许公开只读接口（`/apis/api.wanwan.run/v1alpha1/**`）；`/console` 管理后台不要暴露给无限制公网入口。
