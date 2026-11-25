import { defineEventHandler, sendRedirect } from 'h3'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.h3App.stack.unshift({
    route: '',
    handler: defineEventHandler((event) => {
      const rawUrl = event.node.req.url || '/'
      if (rawUrl === '/wanwan' || rawUrl.startsWith('/wanwan/') || rawUrl.startsWith('/wanwan?')) {
        const config = useRuntimeConfig()
        const base = String(config.public.siteBasePath || '/xiaojiaoya').replace(/\/+$/, '')
        const suffix = rawUrl.slice('/wanwan'.length)
        return sendRedirect(event, `${base}${suffix || '/'}`, 308)
      }
    }),
  })
})
