import { selectTab } from '../../services/tabs'
import { doctorChannelsUrl, socialChannelsUrl } from '../../services/family-guide'

Page({
  data: { doctorChannelsUrl, socialChannelsUrl },
  onShow() { selectTab(this, 'pages/tools/tools') },
})
