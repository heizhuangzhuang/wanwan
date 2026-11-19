# 小脚丫步步指南微信小程序

微信原生小程序使用 TypeScript，复用 Halo 公开 API。读者可按阶段、类型和标签查找资料，按阶段和类型筛选搜索结果，浏览有序专题及本站原创导读。详情重新进入前台时检查内容是否仍可访问。

## 微信开发者工具与后端接入

在微信开发者工具中导入本目录。[project.config.json](./project.config.json) 中的 `touristappid` 用于本地开发。云端联调时，在开发者工具中换成已绑定 `prod-d8goya17ka2d1a272` 的真实小程序 AppID。 [app.ts](./app.ts) 已配置环境 ID 和服务名 `xiaojiaoya`，对外联系邮箱由运营者填写。

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
