---
name: build-personal-wechat-mini-program
description: Build, modify, audit, debug, review, and ship WeChat Mini Programs for individual developers and personal-subject accounts, including ordinary personal Mini Programs and the service-provider-mediated personal upgraded Mini Program route. Use when Codex needs to assess personal-subject feasibility, service categories, certification, filing, payment or monetization eligibility; create or change native, Taro, uni-app, or other Mini Program projects; design privacy, security, UGC, backend, performance, compatibility, testing, CI, review, release, or operations; or diagnose review rejection, complaints, violations, and migration to another subject type. Trigger on 微信小程序, 个人主体小程序, 个人开发者, 小程序备案, 小程序提审, 小程序拒审, 微信支付, 虚拟支付, 流量主, 隐私保护指引, and related Mini Program code or project files.
---

# 微信小程序个人开发者全流程

把主体、类目、能力和合规约束当作产品架构输入，再进行编码。覆盖可行性判断、工程实现、质量验证、备案提审和持续运营；不得把“先做出来再碰运气过审”当作方案。

## 不可违背的原则

1. 先区分主体路线，再判断功能：
   - `ordinary-personal`：普通个人主体；同时记录是公众平台自助注册，还是服务商快速注册/授权。
   - `upgraded-personal`：由合格服务商代开发的“个人升级版小程序”。
   - `non-personal-required`：必须改用个体工商户、企业或其他组织主体。
2. 将“账号实名”“小程序备案”“微信认证”视为三个不同流程。当前腾讯客服已有个人小程序微信认证流程，认证时还可选择职业身份认证；服务商快速注册/授权场景另有专项代认证能力。个人认证不会改变主体类型，也不会自动解锁普通支付、虚拟支付、`web-view`、手机号组件或组织类目；不得把认证与个人升级版交易路线混为一谈。
3. 将平台准入与法律许可分开。类目开放不等于依法可以无证经营；平台审核通过也不替代行政许可。
4. 对类目、认证、支付、虚拟支付、接口主体限制、费用、配额、审核口径和备案要求进行实时官方核验。不得依赖无日期截图、转载或本 Skill 的历史快照作最终决定。
5. 不得建议隐藏功能、按审核员/IP/地区/时间切换内容、审核后远程开启、伪造资质、套类目或借 WebView/插件/客服消息规避规则。
6. 不得把 AppSecret、session_key、支付密钥、代码上传私钥、云密钥或用户敏感数据放入小程序前端包。
7. 只对已验证的事实给出确定结论。无法访问管理后台或无法确认动态规则时，输出 `LIVE_VERIFICATION_REQUIRED` 并说明核验路径。

## 路由任务

先识别本次任务类型，可组合执行：

- `feasibility`：评估个人主体是否能做、选什么类目、需要什么资质和能力。
- `build`：创建或修改项目、页面、组件、服务端、云开发或 CI。
- `audit`：审查代码、隐私、内容、性能、审核风险或上线准备度。
- `rejection`：解释拒审/处罚原文、定位根因、整改并准备再提交或申诉。
- `release`：备案、测试、提审说明、发布、更新策略和运营交接。
- `incident`：处理数据泄漏、违规内容、支付/投诉或线上不可用事件。

检查工作区，优先从 `project.config.json`、`project.private.config.json`、`app.json`、`miniprogramRoot`、构建配置和包管理文件识别真实项目根目录与技术栈。尊重已有框架和用户修改，不为展示偏好重写技术栈。

## 先做主体与能力门禁

读取 [subject-and-category-gate.md](references/subject-and-category-gate.md) 处理任何涉及产品可行性、类目、认证、支付、手机号、WebView、流量主或主体迁移的问题。

涉及新建组织 AppID 或主体变更时，复制并填写 [subject-migration-checklist.md](assets/subject-migration-checklist.md)，逐项处理身份映射、历史订单/权益、备案、类目、隐私、支付和回滚。

遵循以下简化门禁：

```text
列出全部功能/内容/商品/变现/权限
  -> 匹配当前个人主体官方类目
     -> 无类目、需机构牌照或需组织认证：改主体或删改功能
     -> 普通个人需要实物/线下服务支付：评估个人升级版或组织主体
     -> 普通个人或个人升级版需要虚拟支付：改用符合条件的组织主体
     -> 普通个人需要 web-view / 手机号快速验证：能力不开放，重构流程
     -> 涉及动态能力：当日核验官方文档与 MP 后台
  -> 建立“功能—页面—类目—备案标识—资质—数据—审核证据”矩阵
```

为可行性结论使用一个主状态：

- `PERSONAL_FEASIBLE`
- `PERSONAL_FEASIBLE_WITH_QUALIFICATION`
- `PERSONAL_UPGRADED_ROUTE`
- `LIVE_VERIFICATION_REQUIRED`
- `NON_PERSONAL_SUBJECT_REQUIRED`
- `PROHIBITED_OR_REDESIGN_REQUIRED`

若存在多个状态，以风险最高者作为主状态，并列出可拆分保留的低风险功能。

## 按需读取参考资料

不要一次加载所有资料。根据任务完整读取对应文件：

| 任务 | 必读资料 |
|---|---|
| 动态规则、证据、官方链接 | [sources-and-freshness.md](references/sources-and-freshness.md) |
| 主体、类目、支付、认证、特殊能力 | [subject-and-category-gate.md](references/subject-and-category-gate.md) |
| 常见产品场景与可行路线 | [scenario-playbook.md](references/scenario-playbook.md) |
| 立项、需求拆解、技术选型、端到端流程 | [workflow-and-architecture.md](references/workflow-and-architecture.md) |
| 项目结构、原生工程、网络、登录、兼容、云开发、CI | [engineering-playbook.md](references/engineering-playbook.md) |
| 隐私、个人信息、鉴权、密钥、UGC、内容安全 | [privacy-security-content.md](references/privacy-security-content.md) |
| 包体、启动、setData、弱网、测试和质量门 | [performance-quality-testing.md](references/performance-quality-testing.md) |
| 备案、审核资料、发布、更新、流量主和运营 | [review-filing-operations.md](references/review-filing-operations.md) |
| 拒审、违规、申诉和复盘 | [rejection-playbook.md](references/rejection-playbook.md) |
| 本目录原始材料的可信度与冲突 | [local-evidence-audit.md](references/local-evidence-audit.md) |

## 执行核心工作流

### 1. 建立事实底稿

从代码、产品说明和用户输入中提取：

- 主体路线、AppID、备案状态、认证状态和目标地区；
- 全部用户可见与隐藏功能、内容来源、UGC、外链和第三方 SDK；
- 实物/服务/虚拟商品/广告等变现方式；
- 登录、手机号、位置、相册、摄像头、麦克风、运动、剪贴板等数据或权限；
- 后端、云环境、域名、支付商户、内容安全和运维能力；
- 当前开发版、体验版、审核版与线上版差异。

优先复制并填写 [product-intake.yaml](assets/product-intake.yaml)、[subject-decision-record.md](assets/subject-decision-record.md)、[feature-category-matrix.csv](assets/feature-category-matrix.csv)、[privacy-data-inventory.csv](assets/privacy-data-inventory.csv) 和 [test-matrix.csv](assets/test-matrix.csv)。不得为过审虚构业务事实。

### 2. 做可行性与类目映射

为每个核心功能找到当前官方个人类目及适用范围。类目名称相似但适用范围不覆盖时，视为不匹配。对以下情况立即阻断编码或提审：

- 当前个人主体无对应类目；
- 资质只能由机构主体持有；
- 备案涉及个人路线不接受的经营性、企业/单位或前置审批内容；
- 核心能力只对认证非个人主体开放；
- 功能本身违反法律或平台红线。

### 3. 设计最小合规架构

读取 [workflow-and-architecture.md](references/workflow-and-architecture.md) 并：

- 优先保留现有技术栈；绿色项目默认优先考虑原生 TypeScript，以获得最新平台能力和较小适配层。
- 仅在明确存在跨端收益时选 Taro、uni-app 等框架，并记录平台新能力滞后、包体和调试成本。
- 选择无后端、微信云开发或自建后端时，依据数据敏感度、集成复杂度、成本、可迁移性和运维能力，而非只看开发速度。
- 把权限、失败、拒绝授权、弱网、空数据、账号注销、内容处置和售后路径纳入首版设计。

### 4. 实现工程与安全基线

读取 [engineering-playbook.md](references/engineering-playbook.md) 和 [privacy-security-content.md](references/privacy-security-content.md)。至少做到：

- 在后端执行登录换取、鉴权、资源归属校验和敏感操作；不信任前端传来的 openid、角色、价格、订单状态或文件路径。
- 使用 `wx.login` 的一次性 code 在服务端换取身份，自建短期会话；不下发 `session_key`。
- 仅在用户触发相关功能时申请权限或个人信息；实现拒绝后的降级路径。
- 让后台《小程序用户隐私保护指引》声明、代码实际调用和第三方 SDK 数据行为一致。
- 对公开 UGC 在发布前调用文本/多媒体内容安全能力，并配置人工复核、巡查、举报、删除、封禁和申诉闭环。
- 使用 HTTPS/WSS、已备案域名和有效证书；关闭开发工具的跳过域名校验后再真机验证。
- 实现可观察的错误处理、日志、请求超时、幂等、重试边界和更新管理。

### 5. 运行静态审计

从 Skill 目录运行：

```bash
python3 scripts/audit_miniprogram.py /path/to/project \
  --subject ordinary-personal \
  --format markdown
```

可用主体参数为 `ordinary-personal`、`upgraded-personal`、`non-personal`、`unknown`。将报告作为代码审计线索，不得宣称它替代真机测试、MP 后台声明、服务端审计或平台审核。

对动态来源运行：

```bash
python3 scripts/check_official_sources.py \
  --registry references/source-registry.json
```

脚本默认按注册表的波动等级使用不同新鲜度（critical 7 天、high 30 天、medium 90 天、low 365 天；历史警告源当天即提示），可用 `--max-age-days` 显式覆盖。来源失效、发生跳转、`Last-Modified` 变化或快照过期时，重新核验并更新证据，不要静默沿用旧结论。TLS 校验必须保持开启；脚本会尝试系统 CA 路径，不得用关闭证书验证解决网络错误。

### 6. 做质量与兼容验证

读取 [performance-quality-testing.md](references/performance-quality-testing.md)。至少覆盖：

- 开发者工具与真机；iOS、Android，必要时 HarmonyOS、Windows/Mac；
- 最低基础库、主流基础库与最新版；使用版本比较、API 存在判断或 `wx.canIUse` 降级；
- 冷启动、热启动、更新、首屏、页面返回、前后台切换；
- 正常网络、弱网、离线、超时、重复提交和并发；
- 同意/拒绝/撤回权限，登录过期，空账号和账号注销；
- 登录、会员、付费、隐藏功能及审核测试账号完整可达；
- 包体、分包、按需注入、资源体积、`setData`、长列表和内存。

能修改项目时，修复后运行现有测试、构建、审计脚本和适量自动化；不能运行时明确列出未验证项。

### 7. 准备备案、提审和发布

读取 [review-filing-operations.md](references/review-filing-operations.md)，使用 [review-submission.md](assets/review-submission.md) 和 [release-checklist.md](assets/release-checklist.md)。确保：

- 名称、简介、Logo、类目、标签、备案服务内容、隐私声明和实际页面形成一致链；
- 小程序是完整产品，无测试词、空白页、失效按钮和不可达功能；
- 审核备注写明首页到类目页的路径、账号、密码、特殊触发步骤和权限用途；
- 备案通过并完成 12381 短信核验；主体、负责人、名称或联系方式变化后及时判断变更/注销备案；
- 发布后使用更新管理，不假设所有用户立即获得新版本；对不可用旧版本配置最低可用版本并准备服务端兼容窗口。

### 8. 处理拒审或处罚

读取 [rejection-playbook.md](references/rejection-playbook.md)，复制 [rejection-postmortem.md](assets/rejection-postmortem.md)。把平台原文拆为：规则域、命中页面、实际根因、修改、验证证据和再提交说明。先修根因再改文案；不得仅删除审核截图中的单个入口后原样重提。

## 输出契约

对于评估、审计、实现或拒审任务，最终结果至少包含：

1. `结论状态`：使用本 Skill 的主体可行性状态之一。
2. `主体路线`：普通个人、个人升级版或必须非个人主体。
3. `证据时点`：动态规则的核验日期、页面标题和官方 URL。
4. `阻断项`：按 `P0 / P1 / P2 / INFO` 排序。
5. `功能映射`：功能、页面、类目、备案标识、资质、数据、审核条件。
6. `实现或整改`：说明实际修改、文件、关键取舍和未完成项。
7. `验证结果`：命令、测试矩阵、静态审计、真机或后台未验证项。
8. `下一动作`：只列真正需要用户、服务商、审核后台或外部机构完成的步骤。

每个风险发现给出：规则 ID、严重度、置信度、文件/页面证据、影响、可执行修复。没有证据时不得制造精确阈值、成功率或审核承诺。

## 完成标准

只有同时满足以下条件才宣称任务完成：

- 主体与类目路线明确且无未解释的核心能力冲突；
- 代码、隐私、服务端安全、UGC 和审核路径完成相称验证；
- 动态规则使用当前官方来源或明确标为待核验；
- 产物可运行、可审计、可交接，且没有通过规避审核换取表面通过。
