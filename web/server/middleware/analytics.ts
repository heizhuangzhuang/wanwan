import { trackPageview } from '../utils/analytics'

export default defineEventHandler((event) => {
  if (event.method !== 'GET') return
  const pathname = getRequestURL(event).pathname.replace(/\/+$/, '') || '/'
  if (
    pathname.includes('/api/')
    || pathname.includes('/_nuxt/')
    || pathname.endsWith('/healthz')
    || pathname.endsWith('/robots.txt')
    || pathname.endsWith('/sitemap.xml')
    || /\.(css|js|png|webp|ico|pdf|svg|json|map|woff2?)$/i.test(pathname)
  ) {
    return
  }
  const config = useRuntimeConfig()
  trackPageview(
    event,
    pathname,
    String(config.public.siteBasePath || ''),
    String(config.backendApiBase || ''),
  )
})
