const { readFileSync, writeFileSync } = require('node:fs')
const { resolve } = require('node:path')

const source = 'web/public/guides/prenatal.json'
const data = readFileSync(resolve(__dirname, '../..', source), 'utf8')
writeFileSync(resolve(__dirname, '../services/prenatal-guides.ts'),
  `// Generated from ${source}.\nexport const prenatalGuides = ${data}`)
