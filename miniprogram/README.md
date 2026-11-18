# 弯弯微信小程序（Phase 2 骨架）

技术选型：微信原生小程序 + TypeScript。公开接口和接入方式见 [现行技术架构](../docs/技术架构与实施方案.md)与 [ADR-005](../docs/adr/ADR-005-前后端分离与微信云托管部署.md)。

## 后端接入（微信云托管）
- 小程序默认开启 `useCloudContainer: true`（见 [app.ts](./app.ts)），通过 `wx.cloud.callContainer` 直连微信云托管服务（`X-WX-SERVICE: wanwan-backend`）。实际环境的服务路由与账号权限待真机验证。
- 上线前在 [app.ts](./app.ts) 填入云托管控制台获取的 `cloudEnv` 与 `cloudService`；本地纯 HTTP 调试可切回 `useCloudContainer: false` 并配置 `apiBase`。

## 正式接入与提审前的核实
在正式投入开发与提审前，必须使用实际小程序账号核实：
1. 个人主体可用类目与足内翻知识导航主题是否通过审核；
2. 小程序 ICP 备案与实际合规要求；
3. `wx.openOfficialAccountArticle` 等公众号文章跳转能力的实际可用条件。

若个人主体无法过审，Web 和公众号仍可按各自条件推进。是否变更主体由运营者决定。二期任务与验收条件见[开发计划](../docs/项目计划书.md)。

## 入口约定
- 严禁在小程序内直接将 `citationUrl` 当作可打开网页；只按后端返回的 `entry.type`（`CITATION_ONLY | MP_ARTICLE | MINIPROGRAM | WEB`）处理。
- 个人主体默认使用 `CITATION_ONLY`（展示完整题名、来源、DOI 及复制出处链接）。
