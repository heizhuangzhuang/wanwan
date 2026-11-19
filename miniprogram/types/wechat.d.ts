declare namespace WechatMiniprogram {
  interface TouchEvent {
    currentTarget: {
      dataset: Record<string, unknown>
    }
  }
  interface PickerChange {
    detail: { value: string | number }
  }
  interface Input {
    detail: {
      value: string
    }
  }
}

declare function App<T>(options: T & { onLaunch?(): void } & ThisType<T>): void
declare function getApp<T = Record<string, unknown>>(): T
declare function Page<T extends { data?: Record<string, unknown> }>(
  options: T & ThisType<T & { setData(data: Partial<T['data']>): void }>,
): void

declare const wx: {
  getAccountInfoSync(): { miniProgram: { envVersion: string } }
  cloud?: {
    init(options?: { env?: string; traceUser?: boolean }): void
    callContainer(options: {
      config?: { env?: string }
      path: string
      method?: string
      header?: Record<string, string>
      data?: unknown
      success?: (res: { statusCode: number; data: unknown }) => void
      fail?: (err: unknown) => void
    }): void
  }
  request(options: {
    url: string
    method?: string
    data?: Record<string, unknown>
    success?: (res: { statusCode: number; data: unknown }) => void
    fail?: (err: unknown) => void
  }): void
  navigateTo(options: { url: string }): void
  reLaunch(options: { url: string }): void
  navigateToMiniProgram(options: { appId: string; path?: string; fail?: () => void }): void
  setNavigationBarTitle(options: { title: string }): void
  setClipboardData(options: { data: string; success?: () => void; fail?: () => void }): void
  openOfficialAccountArticle?(options: { url: string; fail?: () => void }): void
  showToast(options: { title: string; icon?: string }): void
}
