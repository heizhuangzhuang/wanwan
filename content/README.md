# 首批精选资料

[首批资料数据](./first-batch.json)收录 13 条公开出处和 3 个专题，覆盖从超声发现到支具与随访的五个阅读阶段。资料卡保存题名、中文短介绍和原文入口。论文附 DOI、PMID，访问条件对应 PubMed 题录页。医院手册里的就诊流程、换石膏安排和护理说明适用于发布机构的患者，读者可据此整理要向接诊医院确认的问题。

| 专题 | 适合解决的问题 | 出处举例 |
| --- | --- | --- |
| 产前报告提示足内翻，先准备哪些问题 | 看报告时如何找到产前超声、无创筛查、羊水取样、核型、芯片、全外显和遗传咨询的资料 | [产前超声](https://www.beijing.gov.cn/fuwu/bmfw/jhsyfwzdzx/2024sjrkr/kpzs/202406/t20240611_3709450.html)、[羊水与核型](https://klrg.womanhospital.cn/imgd/articleInfo/190)、[产前测序](https://cspm.cma.org.cn/index/news?id=3531) |
| 出生后第一次骨科就诊与石膏回家准备 | 小儿骨科就诊有哪些环节，打完石膏回家前要和团队确认哪些观察事项 | [上海市儿童医院骨科](https://www.shchildren.com.cn/contents/449/2780.html)、[Ponseti 石膏家长手册](https://www.rnoh.nhs.uk/patients-and-visitors/patient-information-guides/plaster-instructions-parents-babies-ponseti-cast)、[儿童石膏护理](https://wjw.beijing.gov.cn/bmfw_20143/jkzs/jksh/202410/t20241022_3925285.html) |
| 支具复查与长期随访 | 第一次支具复查带什么，长期随访研究记录了哪些结果 | [支具手册](https://www.alderhey.nhs.uk/conditions/patient-information-leaflets/boots-and-bar-ponseti-treatment/)、[成年随访题录](https://pubmed.ncbi.nlm.nih.gov/7593056/) |

## 导入 Halo

在仓库根目录使用 Node.js 22。直接运行可预览资料、来源和专题，全程离线。

```bash
node content/import-halo.mjs
```

在当前终端配置可信 Halo 实例地址 `HALO_URL` 和有资料卡、专题读取及创建权限的个人令牌 `HALO_TOKEN`。本机实例默认使用 `http://127.0.0.1:8090`。然后执行：

```bash
node content/import-halo.mjs --apply
```

脚本沿用 Halo 插件的管理接口，在「资料卡」创建待核对记录，在「专题」创建草稿。已有资料按原始 URL、DOI 或 PMID 复用，专题仍会引用对应资料编号。中途中断可重跑，脚本只创建缺少的记录。需要公开时，在 Halo 后台逐条确认来源和双端预览，再发布资料卡与专题。
