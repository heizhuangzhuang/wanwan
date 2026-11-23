import type { PostSummary } from './api'
import { resourceLabel } from './reading'
import { postPreview } from './post-preview'
import { contentImageUrl } from './content-image'

export interface FeedItem {
  id: string
  kind: 'guide' | 'resource'
  name: string
  title: string
  excerpt: string
  source: string
  label: string
  literature: boolean
  date: string
  citation: string
  coverUrl: string
  url: string
  action: string
}

export function readingFeed(posts: PostSummary[], resources: ReturnType<typeof resourceLabel>[], previous: FeedItem[] = []): FeedItem[] {
  const guides: FeedItem[] = posts.map(post => ({
    id: `guide:${post.name}`, kind: 'guide', name: post.name, title: post.title,
    excerpt: postPreview(post), source: post.author || '本站整理',
    label: post.articleKind === 'LITERATURE' ? '文献译读' : '原创导读',
    literature: post.articleKind === 'LITERATURE', date: post.publishTime?.slice(0, 10) || '',
    citation: [post.citation?.journal, post.citation?.publishedYear].filter(Boolean).join(' · '),
    coverUrl: contentImageUrl(post.coverUrl),
    url: `/pages/reading/reading?kind=guide&name=${encodeURIComponent(post.name)}&mode=full`, action: '阅读全文',
  }))
  const cards: FeedItem[] = resources.map(resource => ({
    id: `resource:${resource.name}`, kind: 'resource', name: resource.name, title: resource.title,
    excerpt: resource.intro || '', source: resource.sourceName || '资料出处', label: resource.materialLabel,
    literature: false, date: '', citation: '', coverUrl: '',
    url: `/pages/detail/detail?name=${encodeURIComponent(resource.name)}`, action: '查看资料出处',
  }))
  const ordered: FeedItem[] = []
  for (let i = 0; i < Math.max(Math.ceil(guides.length / 2), cards.length); i++) {
    ordered.push(...guides.slice(i * 2, i * 2 + 2), ...cards.slice(i, i + 1))
  }
  const pending = new Map(ordered.map(item => [item.id, item]))
  const result: FeedItem[] = []
  // Keep already visible items in place when appending or returning from an article.
  for (const item of previous) {
    const updated = pending.get(item.id)
    if (updated) { result.push(updated); pending.delete(item.id) }
  }
  return result.concat([...pending.values()])
}
