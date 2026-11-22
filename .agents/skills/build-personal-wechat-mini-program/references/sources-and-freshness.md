# 官方来源与新鲜度策略

## 目录

1. 证据优先级
2. 必须实时核验的规则
3. 核验与留证方法
4. 核心官方来源
5. 冲突处理
6. 禁止的取证方式

## 1. 证据优先级

按以下顺序裁决事实：

1. 当前小程序管理后台对该 AppID、主体、类目和地区给出的可选项、报错与准入提示。
2. 微信开放文档、微信公众平台、微信开放平台、微信支付、微信广告等腾讯官方页面。
3. 工信部、网信办、市场监管、行业主管部门等政府官方页面及现行法律法规。
4. 官方社区中由微信团队发布或明确确认的公告。
5. 有日期、有截图、有可复现步骤的高质量二手资料，仅作线索。
6. 无日期教程、营销软文、问答、论坛猜测、AI 生成文档，不作为最终依据。

同级来源冲突时采用更具体、更新、与当前主体/AppID 更接近的来源。平台页面与法律要求不一致时，同时满足二者，不取更宽松一方。

## 2. 必须实时核验的规则

以下事实不得长期硬编码：

| 主题 | 建议新鲜度 | 原因 |
|---|---:|---|
| 个人主体类目、适用范围、资质 | 当日或 7 天内 | 页面明确声明会动态变化 |
| 普通个人/升级版/组织主体能力 | 当日或 7 天内 | 灰度、服务商和主体条件可能变化 |
| 微信认证、支付、虚拟支付、手机号、WebView | 当日或 7 天内 | 主体限制和收费持续调整 |
| 审核、拒审、运营处罚 | 7 天内 | 平台规则为动态文档 |
| 备案入口、字段、材料、短信时限、地方补充材料 | 30 天内，并在提交当天复核 | 地区和管局要求不同 |
| 流量主门槛、广告组件和结算 | 30 天内 | 商业化政策动态 |
| 基础库最低版本、API 能力、组件行为 | 开发时查对应 API 页 | 随基础库演进 |
| 费用、配额、账号数量、审核时长、热线 | 提交当天 | 高动态、不可承诺 |
| 工程原理、安全、性能建议 | 90 天内或升级前 | 相对稳定但仍会演进 |

若无法实时访问官方页面，输出 `LIVE_VERIFICATION_REQUIRED`，保留当前快照仅作设计参考。

## 3. 核验与留证方法

每个会改变产品路线的结论至少记录：

```yaml
checked_at: 2026-07-12T00:00:00+08:00
source_title: 小程序开放的服务类目
source_url: https://developers.weixin.qq.com/miniprogram/product/material/
subject_route: ordinary-personal
region: 中国大陆/具体省份（如适用）
appid_scope: 当前 AppID 或“通用规则”
conclusion: 一句话结论
quote: 支撑结论的短原文
last_modified: HTTP 响应值（若有，不等于规则生效日）
confidence: high|medium|low
```

核验步骤：

1. 直接打开官方详情页，不只看搜索摘要。
2. 确认页面标题、最终 URL、主体类型、类目和适用范围。
3. 对动态能力同时查看 MP 后台是否出现入口，以及当前 AppID 的错误提示。
4. 记录短原文，不复制整页受版权保护内容。
5. 对费用、名额、时限等数值记录核验日期。
6. 对 `Last-Modified`、页面更新时间和公告发布日期分别记录；不得互相替代。
7. 规则改变时更新 `source-registry.json` 和相关快照说明。

运行来源检查：

```bash
python3 scripts/check_official_sources.py \
  --registry references/source-registry.json
```

脚本默认读取每条来源的 `volatility` 决定时效阈值；`--max-age-days` 仅用于明确需要统一阈值的审计。它只能提示页面可达性、跳转、响应头变化和本地快照年龄，不能证明页面正文含义未变。网络失败时保持 TLS 验证，修复 CA 路径或网络环境，不允许关闭证书校验。

## 4. 核心官方来源

本表于 2026-07-12（Asia/Shanghai）核验。微信开发文档关键页面的 HTTP `Last-Modified` 多为 2026-07-10，但这只是站点构建时间。

### 主体、运营与发布

| 用途 | 官方来源 | 已核验要点 |
|---|---|---|
| 注册、成员、支付总览 | [小程序介绍](https://developers.weixin.qq.com/miniprogram/introduction/) | 通用介绍页部分认证表述与当前个人专项 FAQ 冲突；认证问题采用更具体的个人流程页，不从“已认证”直接推导支付资格 |
| 个人注册流程 | [小程序注册流程](https://kf.qq.com/faq/170109iQBJ3Q170109JbQfiu.html) | 个人需为 18 岁以上、具有中国大陆居民身份信息的微信实名用户；注册邮箱限制 |
| 注册与绑定上限 | [小程序注册上限和绑定上限](https://kf.qq.com/faq/170109F3MRFj170109eYJ7fi.html) | 当前公开页称同一身份证最多注册 5 个个人小程序，身份证/手机号/微信号各最多绑定 5 个；提交当天复核 |
| 普通个人服务类目 | [开放的服务类目](https://developers.weixin.qq.com/miniprogram/product/material/) | 类目动态；个人主体当前仅开放有限类目 |
| 运营红线 | [平台运营规范](https://developers.weixin.qq.com/miniprogram/product/) | 类目、隐私、UGC、支付、分享、广告、备案、技术实现等；动态文档 |
| 高频拒审 | [常见拒绝情形](https://developers.weixin.qq.com/miniprogram/product/reject.html) | 完整性、两次点击可达、测试账号、隐私、安全、UI 等 |
| 平台合同 | [服务条款](https://developers.weixin.qq.com/miniprogram/product/service.html) | 开发者责任、隐私政策、数据删除、类目和许可 |
| 通用微信认证旧入口 | [微信认证指引](https://developers.weixin.qq.com/miniprogram/product/renzheng.html) | 页面主体表未覆盖当前个人专项流程，不得用它否定个人认证；组织材料与年审仅在适用主体中参考 |
| 个人微信认证 | [个人认证流程](https://kf.qq.com/faq/231114eyInYR23111463uqeM.html) | 个人可申请微信认证；需主体验证、名称/发票信息并支付审核服务费；个人仅支持电子发票；费用与入口实时核验 |
| 个人职业身份认证 | [职业身份认证介绍](https://kf.qq.com/faq/231025iYNNzm231025NjMzIZ.html) | 认证流程中可选；通过后身份展示在资料页；按职业提交证明，不等于服务类目资质或行业许可 |
| 主体变更条件 | [主体变更条件](https://kf.qq.com/faq/180831FBfE32180831UBr6Vn.html) | 目标主体不能为个人；支付/广告服务商、商户号、余额等可能阻断；原个人主体能否发起以当前后台为准 |
| 主体变更影响 | [主体变更介绍](https://kf.qq.com/faq/180914RZVjyE180914YjMvAF.html) | 原类目失效，需按目标主体重新申请；当前提示成功 7 天后代码仍不匹配会有能力失效或下架风险 |
| 小程序备案 | [备案操作指引](https://developers.weixin.qq.com/miniprogram/product/record/guidelines.html) | 平台初审、12381 短信 24 小时、管局审核、备案号展示 |
| 工信部短信核验 | [工信部备案管理系统](https://beian.miit.gov.cn/) | 官方核验入口 |

### 个人变现与特殊路线

| 用途 | 官方来源 | 已核验要点 |
|---|---|---|
| 服务商快速注册个人 | [快速创建个人小程序](https://developers.weixin.qq.com/doc/oplatform/Third-party_Platforms/2.0/product/Register_Mini_Programs/fastregisterpersonalmp.html) | 该渠道创建的小程序不可绑定微信支付商户号；2023-12-25 后新账号默认未认证，未认证不影响发布但影响搜索/分享 |
| 服务商代认证个人 | [代认证小程序介绍](https://developers.weixin.qq.com/doc/oplatform/Third-party_Platforms/2.0/product/weapp_wxverify.html) | 专项接口支持个人类型；个人认证获得搜索、分享能力；不是标准支付认证或升级版交易能力 |
| 标准小程序支付 | [微信支付接入指引](https://pay.weixin.qq.com/static/applyment_guide/applyment_detail_miniapp.shtml) | 要求公众平台注册并完成微信认证；提交营业执照、身份证、银行账户 |
| 虚拟支付 | [虚拟支付](https://developers.weixin.qq.com/miniprogram/dev/platform-capabilities/business-capabilities/virtual-payment.html) | 当前只向已认证企业、事业单位或个体工商户开放；普通个人与个人升级版不满足主体条件 |
| 个人升级版 | [个人升级版小程序能力介绍](https://developers.weixin.qq.com/doc/oplatform/Third-party_Platforms/2.0/product/Register_Mini_Programs/fastregistertransactionweapp.html) | 合格服务商可为依法无需营业执照的个人创建可交易小程序并绑定特约商户号 |
| 升级版类目线索 | [快速创建类目参考表](https://developers.weixin.qq.com/doc/oplatform/Third-party_Platforms/2.0/product/Register_Mini_Programs/Category_Reference_Table.html) | 页面自述更新于 2023-07-25，必须向服务商/平台确认，不可当现行白名单 |
| 小程序流量主 | [流量主开通流程](https://ad.weixin.qq.com/docs/50) | 累计独立访客 500+、无刷粉、无严重违规；公开条件未排除个人主体 |
| 个人流量主结算 | [流量主结算规则](https://kf.qq.com/faq/161222jMVJfA161222YB3EZ7.html) | 个人发票、代扣代缴和 2026 年扣缴方式；金额与公式实时核验，不给个性化税务结论 |
| 平台从业人员税务规则 | [国家税务总局 2025 年第 16 号公告](https://fgk.chinatax.gov.cn/zcfgk/c100012/c5241472/content.html) | 平台报送与扣缴的监管依据；结合最新税务口径及个人情况处理 |

### 开发、隐私与安全

| 用途 | 官方来源 | 已核验要点 |
|---|---|---|
| 开发入口 | [开发指南](https://developers.weixin.qq.com/miniprogram/dev/framework/) | 框架、组件、API、服务端、工具、云开发索引 |
| 隐私协议接入 | [小程序隐私协议开发指南](https://developers.weixin.qq.com/miniprogram/dev/framework/user-privacy/PrivacyAuthorize.html) | 后台声明、`wx.getPrivacySetting`、同意组件、监听和官方弹窗 |
| 隐私指引填写 | [用户隐私保护指引填写说明](https://developers.weixin.qq.com/miniprogram/dev/framework/user-privacy/index) | 后台填写路径与要求 |
| 数据类型映射 | [隐私保护指引内容介绍](https://developers.weixin.qq.com/miniprogram/dev/framework/user-privacy/miniprogram-intro) | 接口/组件与个人信息类型对应关系 |
| 登录 | [小程序登录](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/login.html) | code 一次性；服务端换取 OpenID/session_key；session_key 不下发 |
| 头像昵称 | [头像昵称填写](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/userProfile.html) | 当前推荐 `chooseAvatar` 与 `input type=nickname`，并带内容安全能力 |
| 手机号 | [手机号快速验证组件](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/getPhoneNumber.html) | 仅向已认证非个人主体开放；按成功调用计费 |
| 实时手机号 | [手机号实时验证组件](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/getRealtimePhoneNumber.html) | 同样仅向已认证非个人主体开放；不要因个人已认证而误判 |
| WebView | [web-view 组件](https://developers.weixin.qq.com/miniprogram/dev/component/web-view.html) | 个人类型暂不支持使用 |
| 网络与域名 | [网络](https://developers.weixin.qq.com/miniprogram/dev/framework/ability/network.html) | HTTPS/WSS、ICP 备案、证书、AppSecret 仅后端、并发与超时 |
| 常见安全风险 | [安全风险与建议](https://developers.weixin.qq.com/miniprogram/security/basic/risk.html) | 越权、敏感信息、爬虫、弱口令、注入、上传下载、条件竞争 |
| 内容安全 | [内容安全解决方案](https://developers.weixin.qq.com/miniprogram/security/content/security.html) | 文本、多媒体检测；AI 检测不能替代人工治理 |
| 文本内容安全 API | [msgSecCheck](https://developers.weixin.qq.com/miniprogram/dev/server/API/sec-center/sec-check/api_msgseccheck) | 使用 2.0 服务端接口；不能在小程序前端持有 access token |
| 多媒体内容安全 API | [mediaCheckAsync](https://developers.weixin.qq.com/miniprogram/dev/server/API/sec-center/sec-check/api_mediacheckasync) | 异步结果到达前不得默认公开；准备回调、超时和人工复核 |
| 生成式 AI 服务 | [生成式人工智能服务管理暂行办法](https://www.cac.gov.cn/2023-07/13/c_1690898327029107.htm) | 面向境内公众提供生成服务时的内容、数据、用户协议、投诉、算法备案/安全评估等义务 |
| AIGC 内容标识 | [人工智能生成合成内容标识办法](https://www.cac.gov.cn/2025-03/14/c_1743654684782215.htm) | 2025-09-01 起施行；显式/隐式标识、导出、传播、用户声明、协议和日志要求 |

### 性能、设计、测试与交付

| 用途 | 官方来源 | 已核验要点 |
|---|---|---|
| 性能总览 | [性能与体验](https://developers.weixin.qq.com/miniprogram/dev/framework/performance/) | 启动、运行时、诊断、弱网和工具索引 |
| 包体优化 | [代码包体积优化](https://developers.weixin.qq.com/miniprogram/dev/framework/performance/tips/start_optimizeA.html) | 单个代码包 2M；分包、独立分包、异步化、资源外置 |
| 分包限制 | [分包加载](https://developers.weixin.qq.com/miniprogram/dev/framework/subpackages.html) | 当前总包 30M、服务商代开发 20M，主包/单分包 2M；最终以上传结果为准 |
| `setData` | [合理使用 setData](https://developers.weixin.qq.com/miniprogram/dev/framework/performance/tips/runtime_setData.html) | 只传渲染数据、合并、路径更新、避免高频和后台更新 |
| 基础库兼容 | [兼容](https://developers.weixin.qq.com/miniprogram/dev/framework/compatibility.html) | 正确比较版本、API 存在判断、`wx.canIUse`、最低基础库 |
| 更新 | [更新机制](https://developers.weixin.qq.com/miniprogram/dev/framework/runtime/update-mechanism.html) | 新版不立即覆盖全部用户；UpdateManager；最低可用版本 |
| 设计 | [设计指南](https://developers.weixin.qq.com/miniprogram/design/) | 导航、反馈、异常可退、误操作、视觉与基准尺寸 |
| 无障碍 | [无障碍设计指南](https://developers.weixin.qq.com/miniprogram/design/accessibility.html) | 读屏与可访问设计 |
| 适老化 | [适老化设计指南](https://developers.weixin.qq.com/miniprogram/design/elderly.html) | 字号、热区、组件和自适应 |
| 自动化 | [小程序自动化](https://developers.weixin.qq.com/miniprogram/dev/devtools/auto/) | `miniprogram-automator` 可从外部脚本控制小程序测试 |
| CI | [miniprogram-ci](https://developers.weixin.qq.com/miniprogram/dev/devtools/ci.html) | 预览、上传、构建 npm；上传私钥和 IP 白名单 |
| 云开发 | [微信云开发](https://developers.weixin.qq.com/miniprogram/dev/wxcloudservice/wxcloud/basis/getting-started.html) | 数据库、存储、云函数和原生鉴权；不改变主体/类目限制 |
| 云开发计费 | [计费说明](https://developers.weixin.qq.com/miniprogram/dev/wxcloudservice/wxcloud/billing/price.html) | 价格、免费活动、配额、到期停服和数据释放均属高波动事实 |
| 云数据库权限 | [数据库权限控制](https://developers.weixin.qq.com/miniprogram/dev/wxcloudservice/wxcloud/guide/database/permission.html) | 小程序端受权限规则约束；云函数/控制台高权限仍需业务鉴权 |
| 云数据库安全规则 | [数据库安全规则](https://developers.weixin.qq.com/miniprogram/dev/wxcloudservice/wxcloud/guide/database/security-rules.html) | 按 owner/角色/字段设计最小权限，防止越权读写 |
| 云存储安全规则 | [存储安全规则](https://developers.weixin.qq.com/miniprogram/dev/wxcloudservice/wxcloud/guide/storage/security-rules.html) | 默认策略不适合私密附件；收紧读写与访问 URL |
| 云函数安全规则 | [云函数安全规则](https://developers.weixin.qq.com/miniprogram/dev/wxcloudservice/wxcloud/guide/functions/security-rules.html) | 登录门槛不能替代角色、资源归属和操作权限判断 |

### 法律边界

| 用途 | 官方来源 | 已核验要点 |
|---|---|---|
| 个人信息保护 | [个人信息保护法](http://www.npc.gov.cn/npc/c2/c30834/202108/t20210820_313088.html) | 最小必要、告知、敏感个人信息单独同意、用户权利与安全义务 |
| 个人经营与登记 | [电子商务法](http://www.npc.gov.cn/zgrdw/npc/xinwen/2018-08/31/content_2060172.htm) | 第十条登记豁免范围有限，第十二条仍要求必要行政许可；个人升级版不是免许可通道 |

## 5. 冲突处理

遇到冲突时：

1. 保存双方原文、URL、日期和适用对象。
2. 判断是否把“普通个人”“个人升级版”“个体工商户”混为同一主体。
3. 判断是否把“服务类目”“备案服务内容标识”“接口权限”混为同一概念。
4. 判断是否把历史接口（模板消息、旧头像昵称、旧手机号换取方式）套到现行基础库。
5. 采用更严格方案保证安全，但不要把保守建议伪装成官方硬性条款。
6. 若冲突会改变主体、支付、资质或发布时间，停止给出确定结论并要求后台核验。

## 6. 禁止的取证方式

- 不从搜索摘要直接得出结论。
- 不把百度快照、营销站文章、CSDN 或服务商宣传页当官方规则。
- 不把 HTTP `Last-Modified` 当法规生效日。
- 不把本地文件修改时间当官方更新时间。
- 不把 AI 生成的运营分数值、申诉时限或处罚阶梯写成事实。
- 不因某个 AppID 曾成功调用能力，就推断所有个人主体均开放。
