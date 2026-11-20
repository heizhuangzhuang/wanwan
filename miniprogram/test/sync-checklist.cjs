const { readFileSync, writeFileSync } = require('node:fs')
const { resolve } = require('node:path')

const source = 'web/public/downloads/clubfoot-ultrasound-checklist.pdf'
const pdf = readFileSync(resolve(__dirname, '../..', source))
const chunks = pdf.toString('base64').match(/.{1,120}/g)
const lines = [
  `// Generated from ${source}.`,
  '// Bundled so the checklist can be saved even without a download domain or network.',
  'export const checklistPdf = [',
  ...chunks.map(chunk => `  '${chunk}',`),
  "].join('')",
]
writeFileSync(resolve(__dirname, '../services/checklist-pdf.ts'), lines.join('\n') + '\n')
