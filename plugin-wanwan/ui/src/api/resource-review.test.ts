import { describe, expect, it } from 'vitest'
import { previewEntry, similarSources, sourceUrl } from './resource-review'
import type { ResourceCard, ResourceCardSpec } from '../types/wanwan'

const original = {
  url: 'https://EXAMPLE.ORG/article#summary',
  doi: 'https://doi.org/10.1000/ABC',
  pmid: ' 123 ',
  linkStatus: 'OK',
  entryType: 'WEB',
} as ResourceCardSpec

describe('release review', () => {
  it('finds the same source and excludes the card being edited', () => {
    const spec = { ...original, url: 'https://example.org/article', doi: 'doi:10.1000/abc', pmid: '123' }
    const first = { metadata: { name: 'same-card' }, spec } as ResourceCard
    const second = { metadata: { name: 'other-card' }, spec } as ResourceCard
    expect(similarSources(original, [first, second], 'same-card')).toEqual([
      { card: second, fields: ['原始 URL', 'DOI', 'PMID'] },
    ])
  })

  it('blocks embedded credentials and previews unverified sources as citations', () => {
    expect(sourceUrl('https://user:pass@example.org')).toBeUndefined()
    expect(previewEntry({ ...original, linkStatus: 'UNCHECKED' })).toEqual({
      web: '仅显示出处',
      mini: '复制出处',
    })
  })
})
