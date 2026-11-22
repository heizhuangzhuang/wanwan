import type { ResourceView } from './api'

export const materialTypes = [
  { key: '', label: '全部类型', tone: 'sage' },
  { key: 'INSTITUTION', label: '机构资料', tone: 'sage' },
  { key: 'PAPER', label: '论文题录', tone: 'blue' },
  { key: 'FAMILY_STORY', label: '家庭经历', tone: 'rose' },
  { key: 'ORIGINAL', label: '本站原创', tone: 'gold' },
]

const accessLabels: Record<string, string> = {
  OPEN: '公开可读',
  LOGIN_REQUIRED: '原站需登录',
  MAY_BE_PAID: '原站可能付费',
  UNKNOWN: '待核对条件',
}

function entrySummary(resource: ResourceView): string {
  if (resource.attachment && resource.linkStatus === 'OK') return '可下载附件'
  if (resource.entry.type === 'MP_ARTICLE' && resource.linkStatus === 'OK') return '公众号原文'
  if (resource.entry.type === 'MINIPROGRAM' && resource.linkStatus === 'OK') return '来源小程序'
  return '原文出处'
}

export function resourceLabel(resource: ResourceView) {
  const material = materialTypes.find(({ key }) => key === resource.materialType)
  return {
    ...resource,
    materialLabel: material?.label ?? '资料',
    materialTone: material?.tone ?? 'sage',
    accessLabel: accessLabels[resource.access] ?? accessLabels.UNKNOWN,
    entryLabel: entrySummary(resource),
  }
}

export function decodeOption(value?: string): string {
  if (!value) return ''
  try {
    return decodeURIComponent(value)
  } catch {
    return ''
  }
}

export function openResource(e: WechatMiniprogram.TouchEvent) {
  const { name } = e.currentTarget.dataset
  if (typeof name === 'string' && name) {
    wx.navigateTo({ url: `/pages/detail/detail?name=${encodeURIComponent(name)}` })
  }
}
