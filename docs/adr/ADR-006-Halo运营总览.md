# ADR-006 Halo 运营总览

已采纳，2026-11-20。

## 背景

弯弯的 Web 在腾讯云广州服务器独立运行，Halo 在微信云托管 `xiaojiaoya`，原生小程序通过 `wx.cloud.callContainer` 访问资料 API。曾发生 Web 进程健康但原创导读返回 503，原因是 Web 的后端地址未配置。只检查进程存活会漏掉这一类故障。

## 决策

在现有 Halo Console 的「弯弯导航」增加「运营总览」。复用 Halo 登录、权限和扩展存储。独立的通用管理后台可覆盖更多应用，当前只有一套资料后端，引入第二套业务后台会增加身份接入和部署工作。外部云监控继续承担 Halo 自身不可用时的诊断。

| 对象 | 判定依据 |
| --- | --- |
| Web | 检查 `/healthz` 和 `/posts`。分别显示进程探测和实际资料页面的结果 |
| Halo API | 匿名请求 `/stages` 和 `/posts?page=1&size=1`。检查 HTTP 状态、内容类型及 JSON 结构 |
| 微信小程序 | 分别显示体验版和正式版最后一次人工真机确认。登记版本、结果和时间，24 小时后标为待复核 |
| 运维入口 | Web 跳腾讯云 CVM，后端跳微信云托管服务，客户端版本跳微信公众平台 |

服务端并行发起带超时的 HTTP 检查，以 10 秒缓存合并重复刷新。探测地址从部署环境读取，状态接口仅返回时间、耗时、结果和 HTTP 状态码。请求沿用 Halo 角色授权，真机记录由同一后台登记和保存。平台变更在相应控制台执行。

## 接口与验收

- `GET /apis/console.api.xiaojiaoya.run/v1alpha1/ops-overview` 返回四项探测和最近真机记录。
- `PUT /apis/console.api.xiaojiaoya.run/v1alpha1/ops-miniprogram-checks/{channel}` 录入对应渠道的真机结论。渠道为 `trial` 或 `formal`，服务端生成时间。
- 验收包含 Web 进程正常而资料页面返回 503、Halo 跳转登录或返回异常 JSON、未录入及已过期的真机结果、匿名访问拒绝、运营入口直达。
