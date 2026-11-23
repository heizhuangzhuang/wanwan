import { contentImageUrl } from './content-image'

interface TextNode { type: 'text'; text: string }
interface ElementNode {
  name: string
  attrs?: Record<string, string>
  children: GuideNode[]
}
export type GuideNode = TextNode | ElementNode

export interface GuideSection {
  id: string
  title: string
  nodes: GuideNode[]
  html: string
}

export interface GuideOutline {
  sections: GuideSection[]
  toc: { id: string; title: string }[]
  highlights: string[]
  readMinutes: number
}

const styles: Record<string, string> = {
  h1: 'font-size:21px;font-weight:bold;line-height:1.45;color:#1d3a2f;margin:24px 0 12px',
  h2: 'font-size:18px;font-weight:bold;line-height:1.45;color:#1d3a2f;border-left:4px solid #376052;padding-left:10px;margin:26px 0 12px',
  h3: 'font-size:16px;font-weight:bold;line-height:1.5;color:#285143;margin:18px 0 8px',
  h4: 'font-size:15px;font-weight:bold;color:#2b302a;margin:14px 0 6px',
  p: 'margin:0 0 13px;line-height:1.8',
  ol: 'padding-left:22px;margin:6px 0 16px;list-style-type:decimal',
  ul: 'padding-left:20px;margin:6px 0 16px;list-style-type:disc',
  li: 'margin:0 0 8px;line-height:1.75',
  blockquote: 'border-left:4px solid #376052;background:#f3f7f4;border-radius:6px;padding:10px 12px;margin:14px 0;color:#324a3e',
  hr: 'border:0;border-top:1px solid #e2dcd2;margin:20px 0',
  pre: 'padding:12px;background:#eef3ec;border-radius:8px;white-space:pre-wrap;word-break:break-all;margin:12px 0',
  code: 'font-family:monospace;background:#eef3ec;padding:1px 4px;border-radius:4px',
  table: 'border-collapse:collapse;font-size:13px;margin:12px 0 16px;min-width:100%',
  th: 'border:1px solid #ccdace;padding:8px 10px;background:#edf3ec;color:#1d3a2f;text-align:left;min-width:72px;line-height:1.5',
  td: 'border:1px solid #ccdace;padding:8px 10px;min-width:72px;line-height:1.55',
}
const allowed = new Set([...Object.keys(styles), 'h5', 'h6', 'br', 'strong', 'b', 'em', 'i', 's',
  'del', 'sup', 'sub', 'div', 'span', 'thead', 'tbody', 'tfoot', 'tr', 'a'])
const blocked = new Set(['script', 'style', 'iframe', 'template', 'object', 'svg', 'math', 'textarea', 'noscript'])
const voids = new Set(['br', 'hr', 'img'])
const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  mdash: '—', ndash: '–', hellip: '…', times: '×', middot: '·', le: '≤', ge: '≥' }

function decodeEntities(text: string): string {
  return text.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, value: string) => {
    if (!value.startsWith('#')) return entities[value.toLowerCase()] ?? entity
    const point = value[1].toLowerCase() === 'x' ? Number.parseInt(value.slice(2), 16) : Number(value.slice(1))
    return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff)
      ? String.fromCodePoint(point) : entity
  })
}

function nodeText(nodes: GuideNode[]): string {
  return nodes.map(node => 'text' in node ? node.text : nodeText(node.children)).join('')
}

export function guideNodes(html: string, title: string): GuideNode[] {
  const root: ElementNode = { name: '', children: [] }
  const stack = [{ source: '', node: root }]
  const ignored: string[] = []
  const tokens = /<!--[\s\S]*?(?:-->|$)|<\/?[a-z][\w:-]*(?:[^<>"']|"[^"]*"|'[^']*')*>|[^<]+|</gi
  for (const match of html.matchAll(tokens)) {
    const token = match[0]
    if (token.startsWith('<!--')) continue
    const tag = /^<(\/)?([a-z][\w:-]*)/i.exec(token)
    const name = tag?.[2].toLowerCase()
    if (name && blocked.has(name)) {
      if (tag?.[1]) {
        if (ignored[ignored.length - 1] === name) ignored.pop()
      } else if (!token.endsWith('/>')) ignored.push(name)
      continue
    }
    if (ignored.length) continue
    const parent = stack[stack.length - 1].node
    if (!name) {
      // Indent-only whitespace between list items is not a paragraph.
      if (!token.trim() && !['strong', 'em', 'span', 'p', 'pre', 'code'].includes(parent.name)) {
        if (parent.children.length && /^(?:p|li|h[1-6]|td|th)$/.test(parent.name)
          && !/[\r\n]/.test(token)) parent.children.push({ type: 'text', text: ' ' })
        continue
      }
      parent.children.push({ type: 'text', text: decodeEntities(token) })
      continue
    }
    if (name === 'img' && !tag?.[1]) {
      const alt = /\balt\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(token)
      const source = /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(token)
      const src = contentImageUrl(source ? decodeEntities(source[1] ?? source[2]) : '')
      const caption = alt ? decodeEntities(alt[1] ?? alt[2]) : ''
      if (src) {
        parent.children.push({ name: 'img', attrs: { src, alt: caption,
          style: 'display:block;width:100%;max-width:100%;height:auto;margin:16px 0;border-radius:8px' }, children: [] })
      } else if (caption) parent.children.push({ type: 'text', text: caption })
      continue
    }
    if (!allowed.has(name)) continue
    if (tag?.[1]) {
      const index = stack.map(frame => frame.source).lastIndexOf(name)
      if (index > 0) stack.length = index
      continue
    }
    // Native rich-text cannot navigate arbitrary external links. Keep readable text without fake link underline.
    let style = name === 'a' ? 'color:#35483d;font-weight:500' : styles[name]
    if (name === 'p' && parent.name === 'li') style = 'display:inline;margin:0'
    const node: ElementNode = { name: name === 'a' ? 'span' : name, children: [], ...(style ? { attrs: { style } } : {}) }
    parent.children.push(node)
    if (!voids.has(name) && !token.endsWith('/>') && stack.length < 40) stack.push({ source: name, node })
  }

  const first = root.children[0]
  if (first && 'name' in first && /^h[1-6]$/.test(first.name) && nodeText(first.children).trim() === title.trim()) {
    root.children.shift()
    const next = root.children[0]
    if (next && 'name' in next && next.name === 'hr') root.children.shift()
  }
  return root.children
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Serialize sanitized GuideNode tree into safe HTML for mp-html (tap-to-zoom images & scrollable tables). */
export function guideNodesToHtml(nodes: GuideNode[]): string {
  let out = ''
  for (const node of nodes) {
    if ('text' in node) {
      out += escapeText(node.text)
      continue
    }
    const attrs = node.attrs
      ? Object.entries(node.attrs)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => ` ${k}="${escapeAttr(v)}"`)
        .join('')
      : ''
    if (voids.has(node.name)) {
      out += `<${node.name}${attrs} />`
    } else {
      out += `<${node.name}${attrs}>${guideNodesToHtml(node.children)}</${node.name}>`
    }
  }
  return out
}

export function buildGuideOutline(nodes: GuideNode[]): GuideOutline {
  const sections: GuideSection[] = []
  let current: GuideSection = { id: 'sec-0', title: '', nodes: [], html: '' }
  const highlights: string[] = []
  let totalChars = 0

  for (const node of nodes) {
    const text = ('text' in node ? node.text : nodeText(node.children)).trim()
    totalChars += text.length
    if ('name' in node && node.name === 'h2' && text) {
      if (current.nodes.length || current.title) {
        current.html = guideNodesToHtml(current.nodes)
        sections.push(current)
      }
      current = { id: `sec-${sections.length + 1}`, title: text, nodes: [], html: '' }
      if (highlights.length < 3) highlights.push(text)
    } else {
      current.nodes.push(node)
    }
  }
  if (current.nodes.length || current.title) {
    current.html = guideNodesToHtml(current.nodes)
    sections.push(current)
  }

  if (!highlights.length) {
    for (const node of nodes) {
      if ('name' in node && (node.name === 'h3' || node.name === 'blockquote')) {
        const text = nodeText(node.children).trim()
        if (text && highlights.length < 3) highlights.push(text.slice(0, 48))
      }
    }
  }

  const toc = sections.filter(sec => sec.title).map(sec => ({ id: sec.id, title: sec.title }))
  const readMinutes = Math.max(1, Math.round(totalChars / 350))
  return { sections, toc, highlights, readMinutes }
}
