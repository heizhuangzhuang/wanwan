# 微信云托管（后端）部署说明

本服务运行 Halo 2.27.3 + `plugin-wanwan`（不修改 Halo 核心源码），同时向 **微信小程序**（内网 `wx.cloud.callContainer`）和 **独立 Web 服务器**（服务器间 HTTPS 请求）提供公开 JSON API。生产验收要求见[技术架构与实施方案](../../docs/技术架构与实施方案.md)。

## 控制台关键配置
1. **代码仓库构建**：选择 `heizhuangzhuang/wanwan` 的 `main`，使用仓库根目录的 [`Dockerfile`](../../Dockerfile)，构建上下文为 `.`，监听端口为 `80`。已有服务沿用控制台中的名称。小程序 `cloudService` 配置需与该服务名一致。
2. **实例规格与扩缩容（重要）**：
   - 最小实例数必须设为 **1**（禁止缩容到 0，防止 Halo 启动与内存搜索索引重建超时）。
   - 建议规格：1C2G 或 2C4G（`JVM_OPTS=-Xmx1024m -Xms512m`）。
3. **存储与数据库**：
   - 仓库构建和预构建上传包都要求 MySQL。使用云托管 MySQL 时，把 `MYSQL_ADDRESS`、`MYSQL_USERNAME`、`MYSQL_PASSWORD` 保存到本次发布的版本。启动日志会列出缺失的变量名。
   - 已运行的实例若尚未使用 MySQL，先核实数据所在位置并备份，确认迁移后的数据再切换流量。
   - 挂载 **CFS 文件存储** 到 `/root/.halo2`，保存 Halo 配置与原创附件。
4. **环境变量**：
   - `MYSQL_DATABASE` 填现有数据库名。仅当原库名是 `halo` 时使用 `halo`
   - `HALO_EXTERNAL_URL=https://你的后端域名`
   - `WANWAN_CORS_ALLOWED_ORIGINS` 在浏览器需要跨域调用时填写允许的来源，多个来源用逗号分隔。Web SSR 通过服务器间 HTTPS 请求读取接口
5. **安全边界**：
   - 开启公网域名给 Web 侧使用时，应在网关/访问规则中仅允许公开接口前缀下的 GET/HEAD；小程序订阅写入由云托管通道调用。`/console` 管理后台不要暴露给无限制公网入口。

如果高级设置保存了旧的 `deploy/cloudrun/Dockerfile` 路径，将它清空以使用默认值，或填 `Dockerfile`。出现 GitHub 内容接口 404 时，先检查分支和路径。根目录文件可访问但控制台仍报相同错误时，再检查 GitHub 仓库绑定。


## 上传本地构建包

如果已构建插件 JAR，可使用控制台的「本地代码上传」构建服务版本。上传包根目录应包含 `Dockerfile`、`entrypoint.sh` 和 `plugin-wanwan-*.jar`。Dockerfile 基于 `halohub/halo:2.27.3`，复制已构建的插件和入口脚本，监听 `80`。代码压缩包由云端构建为镜像。MySQL 凭据和环境变量在控制台配置。

发布后检查 `/actuator/health/readiness`，并用连接记录核实目标 MySQL。第一次配置 Halo 时，在受控管理入口完成初始化，然后在「插件」上传同版本 JAR 并启用「弯弯知识导航」。镜像将 JAR 同步到工作目录；Halo 的插件安装记录仍由管理后台建立。已安装的实例如果更换插件版本，在管理后台执行升级。

针对「Halo 已启动，应用 API 和插件静态文件都返回 404」的恢复包额外包含 `wanwan-plugin-recovery.yaml`，通过 Halo 的 `HALO_INITIAL_EXTENSION_LOCATIONS` 注册并启用该插件。用编译了 Console 的 JAR 生成上传包：

```bash
python3 deploy/cloudrun/package-backend.py plugin-wanwan/build/libs/plugin-wanwan-0.1.6.jar ./release \
  --compatible-jar ./previous/plugin-wanwan-0.1.2.jar \
  --compatible-jar ./previous/plugin-wanwan-0.1.3.jar \
  --compatible-jar ./previous/plugin-wanwan-0.1.4.jar \
  --compatible-jar ./previous/plugin-wanwan-0.1.5.jar
```

已有登记若带 `halo.run/do-not-overwrite` 标记，Halo 会保留它的管理状态，并按登记版本查找 JAR。升级已安装的部署时使用上面的兼容包，保留所需旧版 JAR。若旧插件在 Halo 中被停用，通过 Halo Console 启用。通过 Console 将主插件升级为 0.1.6 以启用功能建议。使用新版本预览流量检查 `/stages` 与 `/resources` 的实际 JSON 响应，再切正式流量。

已有 MySQL `SPRING_R2DBC_URL` 的版本会沿用该连接和对应的 Spring 凭据。其他版本在当前服务版本的环境变量中填写原库的 `MYSQL_ADDRESS`（内网主机与端口）、`MYSQL_USERNAME`、`MYSQL_PASSWORD` 和 `MYSQL_DATABASE`。沿用原数据库和持久化挂载。新入口脚本以 `[wanwan] Starting with` 标识插件文件和数据源配置方式，随后还需要核对 Halo 实际连接成功及插件启用状态。

测试资料通过[独立导入工具](../../content/import-test-fixtures.mjs)写入 Halo。先升级并启用新版插件，再向已核实使用 MySQL 的目标导入。测试卡在 Web 和小程序可读，按其保留的样本 ID 跳过微信新资料通知。

匿名 `GET /apis/api.xiaojiaoya.run/v1alpha1/stages` 应返回 `200 application/json` 和阶段数组。若进程健康但此接口跳到登录页，在受控的 Halo 后台核对插件的安装、启用状态和启动日志，再联调 Web 和小程序。升级前保留原镜像、持久化目录备份和上一版插件 JAR。

云托管兼容包独立登记「小脚丫 Web 入口」。直接打开云托管域名根路径会跳转到访客 Web，默认进入 `http://81.71.123.100/xiaojiaoya/`。可用 `WANWAN_WEB_HOME_URL` 配置其他访客站点，填写完整的 HTTP 或 HTTPS 地址。若该 Halo 自己提供主题首页，可把变量设置为空以使用主题路由。管理入口使用 `/console/`，健康检查使用 `/actuator/health/readiness`，资料查询使用公开 API 前缀。

## API 请求来源

Web 服务端发送 `X-Wanwan-Client: web`，微信小程序发送 `X-Wanwan-Client: wechat-miniprogram`。应用 API 在响应头返回识别结果。旧版小程序云请求可通过 `X-WX-SOURCE` 兼容识别，其他无法识别的请求返回 `unknown`。该标记仅用于排查调用来源，私有写入仍核验微信登录码。

## 功能建议

Web 的 `/feedback` 表单由 Web 服务端转发，小程序从「我的 → 功能建议」使用云托管请求。两个入口提交到 `POST /apis/api.xiaojiaoya.run/v1alpha1/feedback`，存到 Halo 的 MySQL。已设置公网请求白名单时，允许 Web 服务访问这个 POST 路径，Console 和内部资源仍使用 Halo 权限。

部署时确认 Halo 主插件已在 Console 升级并启用 0.1.6。后台「弯弯导航 → 功能建议」可按状态筛选、分页和处理。单独授权的运营账号需要「功能建议处理」权限。发布验收时用虚构内容分别提交一次，确认后台来源和状态，再检查访客无法查询建议正文。


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

- `WANWAN_OPS_WEB_BASE_URL` 默认沿用弯弯访客 Web 地址，含 `/xiaojiaoya` 子路径。更换域名时填写 Web 站点基地址。
- `WANWAN_OPS_HALO_BASE_URL` 默认沿用 `xiaojiaoya` 的 HTTPS 测试入口。使用正式域名后填写 Halo 基地址。
- 探测从 Halo 服务端执行，首屏和刷新时触发。Web 探测包含原创导读页面，Halo API 探测包含匿名读取。真机记录按体验版与正式版分别保存，24 小时后待复核。
- 资料运营统计展示公开可检索、待审核、撤回或原文下线，以及公开资料待核对链接的数量。读取失败时显示暂无法读取。

发布后通过管理员账号访问总览，确认四个探测项与实际链路相符。检查正式版和体验版任一渠道后登记版本号，再刷新确认记录可读取。Halo 本身无法加载时，从微信云托管检查容器日志和版本。设计依据见 [ADR-006](../../docs/adr/ADR-006-Halo运营总览.md)。

## 石膏记录与复诊提醒

私人记录由小程序提交一次性微信登录码，经服务端核验后定位当前用户记录。新版 Halo 插件仍通过既有 MySQL 扩展存储持久化。内容用 AES-256-GCM 加密，微信标识仅在待发提醒的加密内容中暂存。服务保留由密钥派生的账户键、待发时间及 Halo 存储元数据。Web SSR 仅展示工具入口与本机日历下载。

| 变量 | 配置 |
| --- | --- |
| `XIAOJIAOYA_CAST_ENABLED` | 默认关闭。核实隐私流程、数据源及私有路由探测后设为 `true` |
| `XIAOJIAOYA_CAST_CONTACT` | 可收信且已验证的隐私联系邮箱 |
| `XIAOJIAOYA_CAST_ENCRYPTION_KEY` | 32 字节随机密钥的 Base64，在安全终端生成并保存在云环境的服务端配置和独立密钥备份 |
| `WANWAN_WECHAT_APP_ID`、`WANWAN_WECHAT_APP_SECRET` | 当前小程序 AppID 和服务端 AppSecret，可与新资料订阅共用 |
| `XIAOJIAOYA_CAST_NOTICE_TEMPLATE_ID` | 微信公众平台批准的复诊用途一次性模板，单独于新资料模板 |
| `XIAOJIAOYA_CAST_NOTICE_TITLE_FIELD`、`XIAOJIAOYA_CAST_NOTICE_TIME_FIELD` | 审核模板的通用标题及时间键，例如 `thing1`、`time2` |
| `XIAOJIAOYA_CAST_NOTICE_STATE` | 微信消息打开的版本，体验版使用 `trial`，正式版使用 `formal` |

正常提前 24 小时发送，距复诊不足一天的授权约 30 秒后进入发送队列，过就诊时间跳过。每个账户最多有一个待发提醒。选择另一条复诊授权会替换当前待发提醒；保存、改期和删除时在页面上核对状态。兼容消息模板必须包含上述两个字段，若还有必填字段，先调整映射。消息仅包含「复诊提醒」和预约时间。

上线前在隔离环境和体验版，用两个微信账号、虚构记录确认读取隔离、换机恢复、单独同意、删除、撤回、拒绝提醒、改期、实际送达。核对微信平台隐私指引及类目、监护人同意流程和个人信息保护影响评估。按业务需要落实备份保存期及恢复后的撤回重放。启用时验证 MySQL 持久化，容器最小实例数保持 1，保证无人访问时仍能调度。公网网关仅放行公开资料读取，私有记录及微信订阅写入走小程序云托管通道。

首次升级后先用 `/apis/api.xiaojiaoya.run/v1alpha1/stages` 验证匿名 JSON，再切 Web 与小程序。关闭提醒可清空复诊模板 ID。恢复服务或回退时保留原密钥和 MySQL；密钥变更须做受控迁移，直接替换会使现有记录无法定位和解密。


## 穿戴档案同步

新版插件提供 `POST /apis/api.xiaojiaoya.run/v1alpha1/brace-archive`。接口复用石膏服务的微信身份、加密密钥与启用配置。穿戴档案有独立的授权及撤回流程。小程序从「矫正鞋穿戴记录 → 档案同步」主动上传或恢复，云端依据档案版本拒绝过期的覆盖请求。Web 可继续通过 JSON 备份接续档案。

验证时用同一测试微信账号在设备 A 上传，在设备 B 恢复。两台设备分别修改后，先上传 A，再用 B 尝试上传，应看到版本冲突提示。撤回穿戴同步后，石膏记录与待发提醒仍可在原页面独立管理。
