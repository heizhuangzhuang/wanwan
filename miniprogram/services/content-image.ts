import type { IAppOption } from '../app'

const DEFAULT_PUBLIC_ORIGIN = 'https://xiaojiaoya-331697-11-1510985006.sh.run.tcloudbase.com'

function resolvePublicOrigin(override?: string): string {
  if (override) return override.replace(/\/+$/, '')
  try {
    const origin = typeof getApp === 'function' ? getApp<IAppOption>()?.globalData?.publicOrigin : ''
    if (origin) return origin.replace(/\/+$/, '')
  } catch {
    // Ignore when called outside Mini Program runtime (e.g. unit tests).
  }
  return DEFAULT_PUBLIC_ORIGIN
}

/** Only published HTTPS raster images (or Halo /upload/ relative paths) are displayed; never execute HTML-provided attributes. */
export function contentImageUrl(value?: string | null, baseOrigin?: string): string {
  let url = (value || '').trim()
  if (!url || url.length > 2048 || /[\s<>"'\\]/.test(url)) return ''
  if (url.startsWith('/upload/')) {
    if (/(?:^|\/)\.{1,2}(?:\/|$)|\/\//.test(url)) return ''
    url = `${resolvePublicOrigin(baseOrigin)}${url}`
  }
  if (!/^https:\/\/(?:[a-z\d](?:[a-z\d-]*[a-z\d])?\.)+[a-z]{2,}(?::443)?\//i.test(url)) return ''
  return /\.(?:png|jpe?g|webp|gif|avif)$/i.test(url.split(/[?#]/)[0]) ? url : ''
}
