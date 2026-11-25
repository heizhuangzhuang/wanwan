<script setup lang="ts">
const route = useRoute()
const config = useRuntimeConfig()
const resourceName = computed(() => String(route.query.resource || '').trim().slice(0, 253))

useHead({ title: `关于与规则 - ${config.public.siteTitle}` })
</script>

<template>
  <div>
    <h1>关于本站与收录规则</h1>

    <div class="card" style="margin-bottom: 14px">
      <h2>运营者身份与定位</h2>
      <p>{{ config.public.aboutOperator }}</p>
      <p>
        本站定位为阶段式公开资料导航：帮助家庭定位可核对的机构资料、研究题录与家庭经历，点击前往合法原站阅读。不提供医学诊断、预后判断、个体诊疗方案或在线问答。
      </p>
    </div>

    <div class="card" style="margin-bottom: 14px">
      <h2>收录与编辑方法</h2>
      <p>
        所有资料由运营者逐篇查看原始页面后手动录入：保留原标题与来源信息、独立撰写简短介绍，并提供合法原文入口。不自动采集第三方正文，不复制论文摘要或配图，不提供盗版下载或绕过付费墙入口。
      </p>
    </div>

    <div class="card" style="margin-bottom: 14px">
      <h2 id="feedback">版权、勘误与撤回联系</h2>
      <p v-if="resourceName">反馈资料编号 <code>{{ resourceName }}</code></p>
      <p>
        若您发现资料来源失效、介绍有误，或认为收录内容涉及版权或隐私问题，请联系运营者。收到有效通知后将先行暂停相关展示并核查处理。
      </p>
      <p>
        <a :href="`${config.public.siteBasePath}/downloads/clubfoot-ultrasound-checklist.pdf`">
          下载足内翻超声复查清单（PDF）
        </a>
      </p>
      <p v-if="config.public.contactEmail">
        联系邮箱：<strong>{{ config.public.contactEmail }}</strong>
      </p>
      <p v-else class="warn-bar">
        运营者尚未配置联系邮箱，请在正式公开前通过环境变量 CONTACT_EMAIL 填写真实可用联系方式。
      </p>
    </div>

    <div class="card">
      <h2>隐私与维护说明</h2>
      <p><NuxtLink to="/feedback">提交功能建议</NuxtLink>。建议内容与提交渠道仅供运营人员查看，用于改进产品。</p>
      <p>
        公开浏览与搜索无需注册。Web 的日历工具在本机生成文件。小程序的石膏记录开通后，由本人或孩子的监护人单独授权，再加密保存手填记录。微信提醒另行授权，可在小程序取消提醒、删除记录或撤回同意。病历、检查报告和遗传资料没有上传入口。
      </p>
      <p>服务器保留保障运行所需的访问日志，默认省去完整搜索词。</p>
      <p>{{ config.public.maintenanceStatus }}</p>
    </div>
  </div>
</template>
