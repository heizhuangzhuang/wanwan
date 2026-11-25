export default defineEventHandler((event) => {
  const config = useRuntimeConfig()
  const basePath = String(config.public.siteBasePath || '').replace(/\/+$/, '')
  const siteOrigin = String(config.public.siteOrigin || '').replace(/\/+$/, '')
  const sitemapLine = siteOrigin ? `\nSitemap: ${siteOrigin}${basePath}/sitemap.xml` : ''
  setResponseHeader(event, 'Content-Type', 'text/plain; charset=utf-8')
  return `User-agent: *\nAllow: ${basePath}/${sitemapLine}\n`
})
