import { selectTab } from '../../services/tabs'

Page({
  data: {},
  onShow() { selectTab(this, 'pages/tools/tools') },
})
