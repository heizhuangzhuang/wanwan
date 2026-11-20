export interface IAppOption {
  globalData: {
    /** 开启后通过 wx.cloud.callContainer 直连微信云托管内网 */
    useCloudContainer: boolean
    /** 微信云托管环境 ID（在微信云托管控制台获取） */
    cloudEnv: string
    /** 微信云托管服务名 */
    cloudService: string
    /** 游客 AppID 本地联调地址，留空时使用演示数据 */
    apiBase: string
    contactEmail: string
    demoMode: boolean
  }
}

App<IAppOption>({
  globalData: {
    useCloudContainer: true,
    cloudEnv: 'prod-d1gm7gr9e711335be',
    cloudService: 'xiaojiaoya',
    apiBase: 'http://127.0.0.1:18090/apis/api.xiaojiaoya.run/v1alpha1',
    contactEmail: '',
    demoMode: false,
  },
  onLaunch() {
    const { appId, envVersion } = wx.getAccountInfoSync().miniProgram
    if (envVersion === 'develop' && (!appId || appId === 'touristappid')) {
      this.globalData.useCloudContainer = false
      this.globalData.demoMode = !this.globalData.apiBase
      return
    }

    wx.cloud?.init({ env: this.globalData.cloudEnv, traceUser: false })
  },
})
