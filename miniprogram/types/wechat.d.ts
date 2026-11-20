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

interface MiniProgramFailure { errMsg?: string }
interface MiniProgramFileSystem {
  access(options: { path: string; success: () => void; fail: (err: MiniProgramFailure) => void }): void
  writeFile(options: { filePath: string; data: string; encoding: 'base64';
    success: () => void; fail: (err: MiniProgramFailure) => void }): void
  saveFile(options: { filePath?: string; tempFilePath: string;
    success: (result: { savedFilePath: string }) => void; fail: (err: MiniProgramFailure) => void }): void
}

declare const wx: {
  env: { USER_DATA_PATH: string }
  getFileSystemManager(): MiniProgramFileSystem
  downloadFile(options: { url: string;
    success: (result: { tempFilePath?: string; statusCode: number }) => void;
    fail: (err: MiniProgramFailure) => void }): void
  openDocument?(options: { filePath: string; fileType?: string; showMenu?: boolean;
    fail?: (err: MiniProgramFailure) => void }): void
  previewImage?(options: { urls: string[]; fail?: (err: MiniProgramFailure) => void }): void
  shareFileMessage?(options: { filePath: string; fileName: string; fail?: (err: MiniProgramFailure) => void }): void
  saveImageToPhotosAlbum?(options: { filePath: string; success?: () => void;
    fail?: (err: MiniProgramFailure) => void }): void
  getStorageSync(key: string): unknown
  setStorageSync(key: string, value: unknown): void
  stopPullDownRefresh(): void
  getAccountInfoSync(): { miniProgram: { appId: string; envVersion: string } }
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
  requestSubscribeMessage?(options: {
    tmplIds: string[]
    success: (result: Record<string, string>) => void
    fail: (err: unknown) => void
  }): void
  login(options: { success: (result: { code?: string }) => void; fail: (err: unknown) => void }): void
  navigateTo(options: { url: string }): void
  reLaunch(options: { url: string }): void
  navigateToMiniProgram(options: { appId: string; path?: string; fail?: () => void }): void
  setNavigationBarTitle(options: { title: string }): void
  setClipboardData(options: { data: string; success?: () => void; fail?: () => void }): void
  openOfficialAccountArticle?(options: { url: string; fail?: () => void }): void
  showToast(options: { title: string; icon?: string }): void
}
