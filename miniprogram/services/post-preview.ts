import type { PostSummary } from './api'

/** An automatically extracted bibliography is not a useful article introduction. */
export function postPreview(post: Pick<PostSummary, 'title' | 'excerpt' | 'articleKind'>): string {
  const title = post.title.trim()
  let excerpt = (post.excerpt || '').trim()
  if (title && excerpt.startsWith(title)) {
    excerpt = excerpt.slice(title.length).replace(/^[\s:：—\-·]+/, '').trim()
  }
  const heading = excerpt.replace(/^[\s#*\d一二三四五六七八九十、.．（）()：:]+/, '')
  if (!excerpt || /^(?:(?:原始|原文|英文|论文|文献).{0,16}(?:出处|来源|信息)|英文原题\s*[:：]|(?:DOI|PMID)\s*[:：]|参考文献|作者\s*[:：])/i.test(heading)) {
    return post.articleKind === 'LITERATURE'
      ? '查看文献译读、原文出处与阅读说明。'
      : '打开导读，查看内容与资料出处。'
  }
  return excerpt
}
