const rawBase = (process.env.SITE_BASE_PATH || '/xiaojiaoya').replace(/\/+$/, '')

export default defineNuxtConfig({
  compatibilityDate: '2025-02-01',
  devtools: { enabled: false },
  telemetry: false,
  ssr: true,

  app: {
    baseURL: rawBase || '/',
    head: {
      htmlAttrs: { lang: 'zh-CN' },
      charset: 'utf-8',
      viewport: 'width=device-width, initial-scale=1.0',
      meta: [
        {
          name: 'description',
          content: '小脚丫步步指南：从产前发现、产前复查、石膏治疗、支具穿戴到长期随访的足内翻家庭资料与工具。',
        },
      ],
      link: [
        { rel: 'icon', type: 'image/png', href: `${rawBase}/assets/logo.png` },
        { rel: 'apple-touch-icon', href: `${rawBase}/assets/logo.png` },
      ],
    },
  },

  css: ['~/assets/site.css'],

  runtimeConfig: {
    familyLocalHttp: process.env.XIAOJIAOYA_FAMILY_LOCAL_HTTP || '0',
    backendApiBase: (process.env.BACKEND_API_BASE ?? 'http://127.0.0.1:8090/apis/api.xiaojiaoya.run/v1alpha1').replace(/\/+$/, ''),
    public: {
      siteTitle: process.env.SITE_TITLE || '小脚丫步步指南',
      siteOrigin: (process.env.SITE_ORIGIN || '').replace(/\/+$/, ''),
      siteBasePath: rawBase,
      contactEmail: process.env.CONTACT_EMAIL || '',
      icpNumber: process.env.ICP_NUMBER || '',
      maintenanceStatus:
        process.env.MAINTENANCE_STATUS
        || '个人整理维护中；本站点仅提供公开资料导航与出处，不提供医疗诊断或个体建议。',
      aboutOperator:
        process.env.ABOUT_OPERATOR
        || '由个人以家长及资料整理者身份运营，不具备医疗专业背景或执业资格。',
      castMiniprogramUrl: (process.env.CAST_MINIPROGRAM_URL || '').trim(),
    },
  },

  nitro: {
    preset: 'node-server',
  },

  typescript: {
    strict: true,
    typeCheck: false,
  },
})
