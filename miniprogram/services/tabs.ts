export const tabs = [
  { path: 'pages/index/index', label: '首页' },
  { path: 'pages/library/library', label: '资料' },
  { path: 'pages/tools/tools', label: '工具' },
  { path: 'pages/me/me', label: '我的' },
] as const

export function selectTab(page: TabBarHost, path: typeof tabs[number]['path']) {
  page.getTabBar?.()?.setData({ active: path })
}
