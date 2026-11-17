export interface WebConfig {
  port: number
  backendApiBase: string
  siteTitle: string
  siteOrigin: string
  contactEmail: string
  icpNumber: string
  maintenanceStatus: string
  aboutOperator: string
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): WebConfig {
  const backend = (env.BACKEND_API_BASE || 'http://127.0.0.1:8090/apis/api.wanwan.run/v1alpha1')
    .replace(/\/+$/, '')
  const origin = (env.SITE_ORIGIN || '').replace(/\/+$/, '')
  return {
    port: Number(env.PORT) || 3000,
    backendApiBase: backend,
    siteTitle: env.SITE_TITLE || '弯弯知识导航',
    siteOrigin: origin,
    contactEmail: env.CONTACT_EMAIL || '',
    icpNumber: env.ICP_NUMBER || '',
    maintenanceStatus:
      env.MAINTENANCE_STATUS ||
      '个人整理维护中；本站点仅提供公开资料导航与出处，不提供医疗诊断或个体建议。',
    aboutOperator:
      env.ABOUT_OPERATOR || '由个人以家长及资料整理者身份运营，不具备医疗专业背景或执业资格。',
  }
}
