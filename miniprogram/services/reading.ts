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

const textEntities: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
}

export function plainGuideBody(html: string): string {
  // Show the published snapshot as text. No remote images, executable markup or linked requests.
  return (html || '')
    .replace(/<!--[\s\S]*?(?:-->|$)/g, '')
    .replace(/<(script|style|iframe|template)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi, '')
    .replace(/<li\b[^>]*>/gi, '\n• ')
    .replace(/<br\s*\/?>|<\/(?:p|div|li|tr|blockquote|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
      if (!code.startsWith('#')) return textEntities[code.toLowerCase()] ?? entity
      const point = code[1].toLowerCase() === 'x'
        ? Number.parseInt(code.slice(2), 16) : Number.parseInt(code.slice(1), 10)
      return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff)
        ? String.fromCodePoint(point) : entity
    })
    .replace(/\r\n?/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
