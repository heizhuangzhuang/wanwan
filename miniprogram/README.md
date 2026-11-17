# 弯弯微信小程序（Phase 2 骨架）

技术选型：微信原生小程序 + TypeScript（见 [ADR-004](../docs/adr/ADR-004-公开接口与微信渠道.md)）。

## 开发前关卡（P0）
在正式投入开发与提审前，必须使用实际小程序账号核实：
1. 个人主体可用类目与足内翻知识导航主题是否通过审核；
2. 小程序 ICP 备案与已备案 HTTPS 接口域名（`request` 合法域名）；
3. `wx.openOfficialAccountArticle` 等公众号文章跳转能力的实际可用条件。

若个人主体无法过审，按决策执行：方案 A（仅保留 Web + 公众号）或方案 B（变更为个体工商户/企业主体）。

## 接口与入口约定
- 统一读取后端公开 API：`/apis/api.wanwan.run/v1alpha1`。
- 严禁在小程序内直接将 `citationUrl` 当作可打开网页；只按后端返回的 `entry.type`（`CITATION_ONLY | MP_ARTICLE | MINIPROGRAM | WEB`）处理。
- 个人主体默认使用 `CITATION_ONLY`（展示完整题名、来源、DOI 及复制出处链接）。
