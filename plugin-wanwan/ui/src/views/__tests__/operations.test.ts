import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import * as operations from '@/api/operations'
import OpsOverviewView from '../OpsOverviewView.vue'

vi.mock('@/api/operations')
vi.mock('@halo-dev/components', () => ({
  VPageHeader: { template: '<header><slot name="actions" /></header>' },
  VButton: { template: '<button><slot /></button>' },
}))

describe('运营总览', () => {
  it('shows page failures and saves a device result under the selected channel', async () => {
    const checkedAt = '2026-11-20T03:00:00Z'
    const ok = { state: 'OK', httpStatus: 200, durationMs: 20 } as const
    vi.mocked(operations.getOpsOverview).mockResolvedValue({
      probes: {
        checkedAt, webProcess: ok,
        webPosts: { state: 'HTTP_ERROR', httpStatus: 503, durationMs: 40 },
        haloStages: ok, haloPosts: ok,
      },
      miniProgramChecks: [
        { channel: 'trial', state: 'UNVERIFIED', version: null, outcome: null, checkedAt: null },
        { channel: 'formal', state: 'UNVERIFIED', version: null, outcome: null, checkedAt: null },
      ],
    })
    vi.mocked(operations.saveMiniProgramCheck).mockResolvedValue({
      channel: 'formal', state: 'RECENT', version: '1.2.0', outcome: 'PASS', checkedAt,
    })
    const page = mount(OpsOverviewView)
    await flushPromises()
    expect(page.text()).toContain('HTTP 503')
    expect(page.text()).toContain('待真机验证')
    expect(page.get('a[href="https://mp.weixin.qq.com/"]').text()).toContain('微信公众平台')

    await page.findAll('select')[0].setValue('formal')
    await page.get('input').setValue('1.2.0')
    await page.findAll('select')[1].setValue('PASS')
    await page.get('form').trigger('submit')
    await flushPromises()
    expect(operations.saveMiniProgramCheck).toHaveBeenCalledWith('formal', '1.2.0', 'PASS')
    expect(page.text()).toContain('已记录正式版真机结果')
    expect(page.text()).toContain('真机通过')
    page.unmount()
  })
})
