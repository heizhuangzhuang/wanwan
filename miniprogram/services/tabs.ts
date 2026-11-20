export const tabs = [
  { path: 'pages/index/index', label: '首页', icon: 'house' },
  { path: 'pages/library/library', label: '资料', icon: 'book-open' },
  { path: 'pages/tools/tools', label: '工具', icon: 'wrench' },
  { path: 'pages/me/me', label: '我的', icon: 'user-round' },
] as const

export function selectTab(page: TabBarHost, path: typeof tabs[number]['path']) {
  page.getTabBar?.()?.setData({ active: path })
}
