# 微信云托管（后端）部署说明

本服务运行 Halo 2.27.3 + `plugin-wanwan`（不修改 Halo 核心源码），同时向 **微信小程序**（内网 `wx.cloud.callContainer`）和 **独立 Web 服务器**（服务器间 HTTPS 请求）提供公开 JSON API。生产验收要求见[技术架构与实施方案](../../docs/技术架构与实施方案.md)。

## 控制台关键配置
1. **代码仓库构建**：选择 `heizhuangzhuang/wanwan` 的 `main`，使用仓库根目录的 [`Dockerfile`](../../Dockerfile)，构建上下文为 `.`，监听端口为 `80`。已有服务沿用控制台中的名称。小程序 `cloudService` 配置需与该服务名一致。
2. **实例规格与扩缩容（重要）**：
   - 最小实例数必须设为 **1**（禁止缩容到 0，防止 Halo 启动与内存搜索索引重建超时）。
   - 建议规格：1C2G 或 2C4G（`JVM_OPTS=-Xmx1024m -Xms512m`）。
3. **存储与数据库**：
   - 可以先留空 `MYSQL_ADDRESS` 启动验证，此时继承 Halo 的数据源配置，新实例默认使用文件型 H2。通过 H2 试运行时保留单实例，重建或重启前确认 `/root/.halo2` 的持久化挂载。
   - 使用云托管 MySQL 8.0 时，配置 `MYSQL_ADDRESS`、`MYSQL_USERNAME`、`MYSQL_PASSWORD`。已配置地址而缺少用户名或密码时，入口脚本会停止启动。
   - 已运行的实例若尚未使用 MySQL，先核实数据所在位置并备份，确认迁移后的数据再切换流量。
   - 挂载 **CFS 文件存储** 到 `/root/.halo2`，保存 Halo 配置与原创附件。
4. **环境变量**：
   - `MYSQL_DATABASE=halo`
   - `HALO_EXTERNAL_URL=https://你的后端域名`
   - `WANWAN_CORS_ALLOWED_ORIGINS` 在浏览器需要跨域调用时填写允许的来源，多个来源用逗号分隔。Web SSR 通过服务器间 HTTPS 请求读取接口
5. **安全边界**：
   - 开启公网域名给 Web 侧使用时，应在网关/访问规则中仅允许公开接口前缀下的 GET/HEAD；小程序订阅写入由云托管通道调用。`/console` 管理后台不要暴露给无限制公网入口。

如果高级设置保存了旧的 `deploy/cloudrun/Dockerfile` 路径，将它清空以使用默认值，或填 `Dockerfile`。出现 GitHub 内容接口 404 时，先检查分支和路径。根目录文件可访问但控制台仍报相同错误时，再检查 GitHub 仓库绑定。


## 上传本地构建包

如果已构建插件 JAR，可使用控制台的「本地代码上传」构建服务版本。上传包根目录应包含 `Dockerfile`、`entrypoint.sh` 和 `plugin-wanwan-*.jar`。Dockerfile 基于 `halohub/halo:2.27.3`，复制已构建的插件和入口脚本，监听 `80`。代码压缩包由云端构建为镜像。MySQL 凭据和环境变量在控制台配置。

发布后检查 `/actuator/health/readiness`，并用连接记录核实目标 MySQL。第一次配置 Halo 时，在受控管理入口完成初始化，然后在「插件」上传同版本 JAR 并启用「弯弯知识导航」。镜像将 JAR 同步到工作目录；Halo 的插件安装记录仍由管理后台建立。已安装的实例如果更换插件版本，在管理后台执行升级。

匿名 `GET /apis/api.wanwan.run/v1alpha1/stages` 应返回 `200 application/json` 和阶段数组。若进程健康但此接口跳到登录页，在受控的 Halo 后台核对插件的安装、启用状态和启动日志，再联调 Web 和小程序。升级前保留原镜像、持久化目录备份和上一版插件 JAR。


## 小程序新资料订阅

所有订阅配置均由云托管环境变量注入。配置缺失时，浏览 API 仍正常工作，「新资料提醒」入口隐藏。

| 变量 | 配置 |
| --- | --- |
| `WANWAN_WECHAT_APP_ID` | 当前小程序 AppID |
| `WANWAN_WECHAT_APP_SECRET` | 微信后台生成的 AppSecret，仅保存于服务端 |
| `WANWAN_WECHAT_NOTICE_TEMPLATE_ID` | 当前账号、当前类目可用且用途匹配的一次性订阅模板 ID |
| `WANWAN_WECHAT_NOTICE_TITLE_FIELD` | 模板的标题字段，例如 `thing1` |
| `WANWAN_WECHAT_NOTICE_TIME_FIELD` | 模板的时间字段，例如 `time2` 或 `date2` |
| `WANWAN_WECHAT_NOTICE_FROM` | 切换时间，ISO-8601 格式。测试使用本次部署时间，启用后只有在此时间之后创建且首次公开的内容进入通知 |
| `WANWAN_WECHAT_NOTICE_STATE` | 开发版填 `developer`，体验版填 `trial`，正式版填 `formal`（默认） |

模板需支持上述两个字段。模板要求其他必填字段时，先调整服务端字段映射。核实云托管可访问 `api.weixin.qq.com`，并按微信接口提示配置服务端出口 IP 白名单。数据库须持久化，避免重启后丢失待发授权和发布去重记录。

用本地测试数据或体验版验证：打开小程序首页手动授权，发布一条切换时间后创建的测试资料卡，确认收到一条通知并能打开详情。编辑、撤回后重新发布同一资料，确认无重复推送。验证原创导读同时满足公开可见与有发布快照。拒绝授权和取消待发也应测试。排查可查看云托管日志中的微信错误码，无需查看用户标识。订阅消息的规则可参照[腾讯云开发指南](https://docs.cloudbase.net/recipes/add-subscribe-message-cloud-function)。

停用时移除模板 ID 并重新发布后端。若需回退镜像，在云托管切回上一可用版本，沿用现有 MySQL 与挂载目录。若 Halo 仍指向新版插件，在管理后台恢复备份的上一版 JAR。切回后复查阶段 API 和小程序浏览。

## Halo 运营总览

新版插件启用后，管理员从 Halo Console 的「弯弯导航 → 运营总览」查看 Web、资料 API 和小程序真机记录。普通运营账号可在 Halo 分配「运营总览」角色。页面链接直接进入腾讯云 CVM、微信云托管和微信公众平台。

- `WANWAN_OPS_WEB_BASE_URL` 默认沿用弯弯访客 Web 地址，含 `/wanwan` 子路径。更换域名时填写 Web 站点基地址。
- `WANWAN_OPS_HALO_BASE_URL` 默认沿用 `xiaojiaoya` 的 HTTPS 测试入口。使用正式域名后填写 Halo 基地址。
- 探测从 Halo 服务端执行，首屏和刷新时触发。Web 探测包含原创导读页面，Halo API 探测包含匿名读取。真机记录按体验版与正式版分别保存，24 小时后待复核。

发布后通过管理员账号访问总览，确认四个探测项与实际链路相符。检查正式版和体验版任一渠道后登记版本号，再刷新确认记录可读取。Halo 本身无法加载时，从微信云托管检查容器日志和版本。设计依据见 [ADR-006](../../docs/adr/ADR-006-Halo运营总览.md)。
