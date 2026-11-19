# 弯弯微信小程序

微信原生小程序使用 TypeScript，复用 Halo 公开 API。读者可按阶段、类型和标签查找资料，按阶段和类型筛选搜索结果，浏览有序专题及本站原创导读。详情重新进入前台时检查内容是否仍可访问。

## 微信开发者工具与后端接入

在微信开发者工具中导入本目录。[project.config.json](./project.config.json) 中的 `touristappid` 用于本地开发。实际接入时填写小程序 AppID，并在 [app.ts](./app.ts) 配置 `cloudEnv`、`cloudService` 与对外联系邮箱 `contactEmail`。

小程序默认通过 `wx.cloud.callContainer` 请求微信云托管，服务名通过 `X-WX-SERVICE` 传递。HTTP 本地联调可将 `useCloudContainer` 设为 `false`，并将 `apiBase` 设为 `http://localhost:8090/apis/api.wanwan.run/v1alpha1` 或本机实际公开接口地址。[部署架构](../docs/adr/ADR-005-前后端分离与微信云托管部署.md)

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
