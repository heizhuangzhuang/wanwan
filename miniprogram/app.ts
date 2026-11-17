export interface IAppOption {
  globalData: {
    /** 开启后通过 wx.cloud.callContainer 直连微信云托管内网 */
    useCloudContainer: boolean
    /** 微信云托管环境 ID（在微信云托管控制台获取） */
    cloudEnv: string
    /** 微信云托管服务名（如 wanwan-backend） */
    cloudService: string
    /** 本地开发或关闭云托管直连时的备用 HTTPS API 基地址 */
    apiBase: string
  }
}

App<IAppOption>({
  globalData: {
    useCloudContainer: true,
    cloudEnv: '',
    cloudService: 'wanwan-backend',
    apiBase: 'https://api.example.com/apis/api.wanwan.run/v1alpha1',
  },
  onLaunch() {
    if (this.globalData.useCloudContainer && wx.cloud) {
      wx.cloud.init({
        env: this.globalData.cloudEnv || undefined,
        traceUser: false,
      })
    }
  },
})
