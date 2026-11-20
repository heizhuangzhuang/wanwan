import type { ResourceCard, ResourceCardSpec } from '@/types/wanwan'

export function sourceUrl(value?: string | null) {
  const url = value?.trim() || ''
  if (url.length > 2048 || !/^https?:\/\//i.test(url)) return undefined
  try {
    const parsed = new URL(url)
    return parsed.hostname && !parsed.username && !parsed.password ? parsed : undefined
  } catch {
    return undefined
  }
}

function comparableUrl(value?: string | null) {
  const url = sourceUrl(value)
  if (!url) return ''
  url.hash = ''
  return url.href
}

function comparableDoi(value?: string | null) {
  return (value?.trim() || '').toLowerCase().replace(/^(?:doi:\s*|https?:\/\/(?:dx\.)?doi\.org\/)/, '')
}

export function similarSources(form: ResourceCardSpec, cards: ResourceCard[], currentName?: string) {
  const url = comparableUrl(form.url)
  const doi = comparableDoi(form.doi)
  const pmid = form.pmid?.trim()
  return cards.filter(card => card.metadata.name !== currentName).flatMap(card => {
    const fields: string[] = []
    if (url && url === comparableUrl(card.spec.url)) fields.push('原始 URL')
    if (doi && doi === comparableDoi(card.spec.doi)) fields.push('DOI')
    if (pmid && pmid === card.spec.pmid?.trim()) fields.push('PMID')
    return fields.length ? [{ card, fields }] : []
  })
}

export function previewEntry(form: ResourceCardSpec) {
  const url = sourceUrl(form.url)
  if (form.linkStatus !== 'OK' || !url) {
    return { web: '仅显示出处', mini: '复制出处' }
  }
  const canOpenProgram = /^wx[0-9a-f]{16}$/.test(form.miniProgramAppId?.trim() || '')
    && (form.miniProgramPath?.trim().length || 0) <= 512 && !form.miniProgramPath?.includes('://')
  const wechatArticle = form.entryType === 'MP_ARTICLE' && url.hostname === 'mp.weixin.qq.com'
  return {
    web: form.entryType === 'WEB' || wechatArticle ? '前往原站阅读' : '仅显示出处',
    mini: wechatArticle ? '打开公众号文章或复制出处'
      : form.entryType === 'MINIPROGRAM' && canOpenProgram ? '打开来源小程序或复制出处' : '复制出处',
  }
}
