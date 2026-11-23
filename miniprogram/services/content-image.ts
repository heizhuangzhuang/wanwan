/** Only published HTTPS raster images are displayed; never execute HTML-provided attributes. */
export function contentImageUrl(value?: string | null): string {
  const url = (value || '').trim()
  if (url.length > 2048 || /[\s<>"'\\]/.test(url)) return ''
  if (!/^https:\/\/(?:[a-z\d](?:[a-z\d-]*[a-z\d])?\.)+[a-z]{2,}(?::443)?\//i.test(url)) return ''
  return /\.(?:png|jpe?g|webp|gif|avif)$/i.test(url.split(/[?#]/)[0]) ? url : ''
}
