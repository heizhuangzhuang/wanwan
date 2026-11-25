import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outFile = resolve(rootDir, 'dist/server.js')

mkdirSync(dirname(outFile), { recursive: true })
writeFileSync(
  outFile,
  `// Bridge systemd env (SITE_BASE_PATH / HOST / PORT) to Nuxt 3 Nitro server.
const basePath = (process.env.SITE_BASE_PATH ?? '/xiaojiaoya').replace(/\\/+$/, '') || '/'
if (!process.env.NUXT_APP_BASE_URL) process.env.NUXT_APP_BASE_URL = basePath
if (!process.env.NITRO_APP_BASE_URL) process.env.NITRO_APP_BASE_URL = basePath
if (process.env.BACKEND_API_BASE && !process.env.NUXT_BACKEND_API_BASE) {
  process.env.NUXT_BACKEND_API_BASE = process.env.BACKEND_API_BASE.replace(/\\/+$/, '')
}
if (process.env.SITE_TITLE && !process.env.NUXT_PUBLIC_SITE_TITLE) {
  process.env.NUXT_PUBLIC_SITE_TITLE = process.env.SITE_TITLE
}
if (process.env.SITE_ORIGIN && !process.env.NUXT_PUBLIC_SITE_ORIGIN) {
  process.env.NUXT_PUBLIC_SITE_ORIGIN = process.env.SITE_ORIGIN.replace(/\\/+$/, '')
}
if (process.env.SITE_BASE_PATH !== undefined && !process.env.NUXT_PUBLIC_SITE_BASE_PATH) {
  process.env.NUXT_PUBLIC_SITE_BASE_PATH = process.env.SITE_BASE_PATH.replace(/\\/+$/, '')
}
if (process.env.CONTACT_EMAIL && !process.env.NUXT_PUBLIC_CONTACT_EMAIL) {
  process.env.NUXT_PUBLIC_CONTACT_EMAIL = process.env.CONTACT_EMAIL
}
if (process.env.ICP_NUMBER && !process.env.NUXT_PUBLIC_ICP_NUMBER) {
  process.env.NUXT_PUBLIC_ICP_NUMBER = process.env.ICP_NUMBER
}
if (process.env.MAINTENANCE_STATUS && !process.env.NUXT_PUBLIC_MAINTENANCE_STATUS) {
  process.env.NUXT_PUBLIC_MAINTENANCE_STATUS = process.env.MAINTENANCE_STATUS
}
if (process.env.ABOUT_OPERATOR && !process.env.NUXT_PUBLIC_ABOUT_OPERATOR) {
  process.env.NUXT_PUBLIC_ABOUT_OPERATOR = process.env.ABOUT_OPERATOR
}
if (process.env.CAST_MINIPROGRAM_URL && !process.env.NUXT_PUBLIC_CAST_MINIPROGRAM_URL) {
  process.env.NUXT_PUBLIC_CAST_MINIPROGRAM_URL = process.env.CAST_MINIPROGRAM_URL
}

await import('../.output/server/index.mjs')
`,
  'utf8',
)
console.log('Wrote dist/server.js entry bridge')
