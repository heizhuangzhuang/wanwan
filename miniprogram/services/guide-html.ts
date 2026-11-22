interface TextNode { type: 'text'; text: string }
interface ElementNode {
  name: string
  attrs?: Record<string, string>
  children: GuideNode[]
}
export type GuideNode = TextNode | ElementNode

const styles: Record<string, string> = {
  h1: 'font-size:21px;font-weight:bold;line-height:1.45;margin:22px 0 10px',
  h2: 'font-size:19px;font-weight:bold;line-height:1.5;margin:21px 0 9px',
  h3: 'font-size:17px;font-weight:bold;line-height:1.5;margin:17px 0 8px',
  h4: 'font-size:16px;font-weight:bold;margin:14px 0 6px',
  p: 'margin:0 0 11px',
  ol: 'padding-left:24px;margin:6px 0 14px;list-style-type:decimal',
  ul: 'padding-left:22px;margin:6px 0 14px;list-style-type:disc',
  li: 'margin:0 0 7px',
  blockquote: 'border-left:3px solid #678b76;padding:3px 0 3px 12px;margin:12px 0;color:#405b4d',
  hr: 'border:0;border-top:1px solid #dce3d8;margin:15px 0',
  pre: 'padding:10px;background:#eef3ec;white-space:pre-wrap;word-break:break-all',
  code: 'font-family:monospace;background:#eef3ec',
  table: 'width:100%;border-collapse:collapse;table-layout:fixed;font-size:14px;margin:10px 0 14px',
  th: 'border:1px solid #ccdace;padding:6px;background:#edf3ec;word-break:break-all',
  td: 'border:1px solid #ccdace;padding:6px;word-break:break-all',
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
      if (alt) parent.children.push({ type: 'text', text: decodeEntities(alt[1] ?? alt[2]) })
      continue
    }
    if (!allowed.has(name)) continue
    if (tag?.[1]) {
      const index = stack.map(frame => frame.source).lastIndexOf(name)
      if (index > 0) stack.length = index
      continue
    }
    // Native rich-text cannot navigate arbitrary external links. Keep their visible labels.
    let style = name === 'a' ? 'color:#285143;text-decoration:underline' : styles[name]
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
