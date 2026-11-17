export interface IAppOption {
  globalData: {
    apiBase: string
  }
}

App<IAppOption>({
  globalData: {
    // 上线前替换为已完成 ICP 备案的 HTTPS 域名
    apiBase: 'https://example.com/apis/api.wanwan.run/v1alpha1',
  },
})
