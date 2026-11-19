export interface IAppOption {
  globalData: {
    /** 开启后通过 wx.cloud.callContainer 直连微信云托管内网 */
    useCloudContainer: boolean
    /** 微信云托管环境 ID（在微信云托管控制台获取） */
    cloudEnv: string
    /** 微信云托管服务名（如 xiaojiaoya） */
    cloudService: string
    /** 本地开发或关闭云托管直连时的备用 HTTPS API 基地址 */
    apiBase: string
    contactEmail: string
    demoMode: boolean
  }
}

App<IAppOption>({
  globalData: {
    useCloudContainer: true,
    cloudEnv: '',
    cloudService: 'xiaojiaoya',
    apiBase: 'https://api.example.com/apis/api.wanwan.run/v1alpha1',
    contactEmail: '',
    demoMode: false,
  },
  onLaunch() {
    const envVersion = wx.getAccountInfoSync().miniProgram.envVersion
    this.globalData.demoMode = envVersion === 'develop' && this.globalData.useCloudContainer && !this.globalData.cloudEnv
    if (this.globalData.useCloudContainer && this.globalData.cloudEnv && wx.cloud) {
      wx.cloud.init({
        env: this.globalData.cloudEnv || undefined,
        traceUser: false,
      })
    }
  },
})
