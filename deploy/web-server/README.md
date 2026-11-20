# 独立 Web 服务器部署说明

Web 服务器仅运行轻量 Node 22.12+ SSR 前端（`web/`），无数据库、无 Java 进程，通过 HTTPS 调用微信云托管后端的公开 JSON API（`/apis/api.xiaojiaoya.run/v1alpha1`）。

## 运行步骤（Node 22.12+）
1. 在服务器上拉取仓库，进入 `web/`：
   ```bash
   cd web
   pnpm install --frozen-lockfile
   pnpm build
   ```
2. 复制 `deploy/web-server/.env.example` 为 `.env` 并填写：
   - `BACKEND_API_BASE`：微信云托管后端公网 HTTPS 地址 + `/apis/api.xiaojiaoya.run/v1alpha1`
   - `SITE_ORIGIN`：Web 已备案 HTTPS 域名（用于 `sitemap.xml`）
   - `CONTACT_EMAIL` 与 `ICP_NUMBER`：真实可用邮箱与 ICP 备案号
3. 启动服务（可用 systemd / pm2 守护）：
   ```bash
   set -a && source ../deploy/web-server/.env && set +a
   node dist/server.js
   ```
4. 配置 Nginx 反向代理本机 `127.0.0.1:3000` 并开启 HTTPS（参考 `deploy/web-server/nginx.conf`）。
5. 在微信云托管后端环境变量 `WANWAN_CORS_ALLOWED_ORIGINS` 中加入本 Web 域名（仅在需要浏览器端跨域请求时放行）。

发布前的联调、可用性与恢复项见[技术架构与实施方案](../../docs/技术架构与实施方案.md)。

## 公共入口切换

站点使用 `SITE_BASE_PATH=/xiaojiaoya`。同一 Nginx 站点将 `/xiaojiaoya` 和旧 `/wanwan` 请求原样转发至现有 Node.js 端口，由应用对旧链接返回 308，保留子路径和查询参数。发布顺序为先更新支持两个 API 前缀的 Halo 插件，再切 Web 的 `BACKEND_API_BASE`，最后发布小程序。回退 Web 时还原原有 Nginx 配置、环境文件和可用构建版本。
