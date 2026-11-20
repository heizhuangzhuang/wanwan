# 小脚丫步步指南微信小程序

微信原生小程序使用 TypeScript，复用 Halo 公开 API。读者可按阶段、类型和标签查找资料，按阶段和类型筛选搜索结果，浏览有序专题及本站原创导读。详情重新进入前台时检查内容是否仍可访问。

## 微信开发者工具与后端接入

在微信开发者工具中导入本目录。[project.config.json](./project.config.json) 中的 `touristappid` 用于本地开发。云端联调时，在开发者工具中换成已绑定 `prod-d1gm7gr9e711335be` 的真实小程序 AppID。 [app.ts](./app.ts) 已配置环境 ID 和服务名 `xiaojiaoya`，对外联系邮箱由运营者填写。

使用真实 AppID 时，小程序通过 `wx.cloud.callContainer` 请求微信云托管，服务名通过 `X-WX-SERVICE` 传递。游客 AppID 使用 `apiBase` 做本地 HTTP 联调，默认端口为 `18090`。如使用本地 Compose，将端口改为 `8090`。清空 `apiBase` 可在游客模式下浏览演示资料。 [部署架构](../docs/adr/ADR-005-前后端分离与微信云托管部署.md)

## 本地演示

微信开发者工具打开项目后，开发版在云环境未配置时显示示例资料。编译模式提供“公众号专题入口（本地演示）”和“公众号导读入口（本地演示）”，分别验证两种落地路径。填写真实云环境后，开发版也使用后端资料。体验版和正式版需要配置实际后端。

## 公众号文章入口

运营者从微信公众平台编辑和发布文章，在账号实际支持的关联小程序入口中使用以下页面路径。`name` 是已发布内容的 Halo 资源名称，需做 URL 编码。将示例中的 `topic-a`、`guide-a`、`resource-a` 换成已发布的实际名称。

| 文章希望打开的内容 | 页面路径 |
| --- | --- |
| 专题详情 | `pages/reading/reading?kind=topic&name=topic-a` |
| 本站原创导读 | `pages/reading/reading?kind=guide&name=guide-a` |
| 单张资料卡 | `pages/detail/detail?name=resource-a` |
| 足内翻超声复查清单 | `pages/downloads/downloads` |
| 已批准的资料附件 | `pages/downloads/downloads?resource=resource-a` |
| 资料首页 | `pages/index/index` |

运营者用实际公众号和小程序验证账号关联、文章卡片或可用入口、目标页与原文跳转。专题或导读下线时，入口显示不可访问，并可返回资料首页。原创导读在小程序里以文字呈现，保留段落和列表。完整图文与外链可在网站的原创导读页阅读。

资料详情根据后端给出的 `entry.type` 和核对状态开放来源入口。公众号文章或其他小程序跳转失败时，页面保留题录及手动复制入口。待核对或已撤回的资料只复制题录。实际公众号关联、云托管和真机跳转仍待接入验收。

## 本地检查

在仓库根目录运行：

```sh
pnpm --dir web install --frozen-lockfile
node --test miniprogram/test/public-flow.test.cjs
```

此检查编译小程序 TypeScript，并用模拟微信接口覆盖公众号专题入口、导读正文、筛选翻页、故障重试和资料撤回。生产接入与提审条件见[开发计划](../docs/项目计划书.md)。

## 当前体验

底部有四个一级栏目。详情使用微信页面栈返回到来源栏目。已有公众号专题、导读和下载路径可继续使用。

- 首页集中展示五个阶段，进入某一阶段后浏览对应资料。
- 资料集中展示搜索、产前检查专项、专题、原创和精选内容。
- 工具集中提供石膏记录、沟通清单和超声复查 PDF。
- 我的集中提供本机收藏与最近阅读、微信提醒和反馈。收藏回访时重新核对资料可见性。

资料搜索、专题与详情复用 Web 使用的 Halo 公开 API。

## 资料下载

「工具」和「就诊沟通清单」均可打开足内翻超声复查清单。内置 PDF 来自 `web/public/downloads/clubfoot-ultrasound-checklist.pdf`，与 Web 文件一致，可在离线时写入小程序的用户文件目录。更新 PDF 后，从仓库根目录运行 `node miniprogram/test/sync-checklist.cjs`，再运行公开流程测试验证内容一致。

已公开且链接正常的资料卡可配置获准公开下载的 HTTPS 附件。运营者在 Halo 资料卡填写地址、带后缀的文件名，并确认公开下载许可。微信公众平台须放行附件主机的 `downloadFile` 合法域名。附件先下载，再保存到小程序用户目录。

PDF、Word、Excel 和 PPT 使用微信文档预览。图片可保存到手机相册。支持的文件可转发到微信会话，再从手机提供的选项导出。ZIP 使用下载和转发流程。真机验证时覆盖 iOS、Android、清单离线、文件转发、相册权限、远程下载域名和附件撤回。

## 家庭工具与产前检查专项

从底部「工具」可打开石膏记录、就诊沟通清单与 PDF。从底部「资料」进入产前检查专项。产前专项内容不依赖 Halo；编辑 `web/public/guides/prenatal.json` 后，在根目录运行 `node miniprogram/test/sync-prenatal-guides.cjs`。专题入口可从公众号链接到 `pages/prenatal/prenatal?key=amniocentesis` 或 `pages/prenatal/prenatal?key=exome`。

石膏记录位于 `pages/cast/cast`。开启后使用当前微信账户识别本人。首次保存前由本人或监护人单独确认，照护事项与时间由家长手动填入。提醒需再次向微信申请一次性授权。变更复诊时间后，原有待发提醒取消。个人记录页禁止小程序搜索索引。

公开读取先走新 API。在云托管仍返回 Halo 登录页时，客户端兼容旧公开路径。石膏记录只使用新 API，配置缺失时显示暂未开放。云配置、真机步骤见[微信云托管部署说明](../deploy/cloudrun/README.md#石膏记录与复诊提醒)。
