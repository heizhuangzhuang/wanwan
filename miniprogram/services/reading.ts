import type { ResourceView } from './api'

export const materialTypes = [
  { key: '', label: '全部类型' },
  { key: 'INSTITUTION', label: '机构资料' },
  { key: 'PAPER', label: '论文题录' },
  { key: 'FAMILY_STORY', label: '家庭经历' },
  { key: 'ORIGINAL', label: '本站原创' },
]

const accessLabels: Record<string, string> = {
  OPEN: '公开可读',
  LOGIN_REQUIRED: '原站需要登录',
  MAY_BE_PAID: '原站可能付费',
  UNKNOWN: '访问条件未确认',
}

export function resourceLabel(resource: ResourceView) {
  return {
    ...resource,
    materialLabel: materialTypes.find(({ key }) => key === resource.materialType)?.label ?? '资料',
    accessLabel: accessLabels[resource.access] ?? accessLabels.UNKNOWN,
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
