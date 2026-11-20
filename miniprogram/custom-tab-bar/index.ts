import { tabs } from '../services/tabs'

Component({
  data: { tabs, active: '' },
  lifetimes: {
    ready() {
      const pages = getCurrentPages()
      const route = pages[pages.length - 1]?.route
      if (route && tabs.some(tab => tab.path === route)) this.setData({ active: route })
    },
  },
  methods: {
    switchSection(event: WechatMiniprogram.TouchEvent) {
      const { path } = event.currentTarget.dataset
      if (typeof path === 'string' && path !== this.data.active && tabs.some(tab => tab.path === path)) {
        wx.switchTab({ url: '/' + path })
      }
    },
  },
})
