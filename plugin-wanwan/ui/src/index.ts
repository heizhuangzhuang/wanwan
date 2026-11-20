import { definePlugin } from '@halo-dev/console-shared'
import { IconBookRead, IconFolder } from '@halo-dev/components'
import { markRaw } from 'vue'
import OpsOverviewView from './views/OpsOverviewView.vue'
import ResourceCardListView from './views/ResourceCardListView.vue'
import TopicListView from './views/TopicListView.vue'

export default definePlugin({
  components: {},
  routes: [
    {
      parentName: 'Root',
      route: {
        path: '/wanwan/operations',
        name: 'WanwanOperations',
        component: OpsOverviewView,
        meta: {
          title: '运营总览',
          searchable: true,
          permissions: ['plugin:wanwan:ops'],
          menu: {
            name: '运营总览',
            group: '弯弯导航',
            icon: markRaw(IconFolder),
            priority: -1,
          },
        },
      },
    },
    {
      parentName: 'Root',
      route: {
        path: '/wanwan/resources',
        name: 'WanwanResources',
        component: ResourceCardListView,
        meta: {
          title: '弯弯资料卡',
          searchable: true,
          permissions: ['plugin:wanwan:manage'],
          menu: {
            name: '资料卡',
            group: '弯弯导航',
            icon: markRaw(IconBookRead),
            priority: 0,
          },
        },
      },
    },
    {
      parentName: 'Root',
      route: {
        path: '/wanwan/topics',
        name: 'WanwanTopics',
        component: TopicListView,
        meta: {
          title: '弯弯专题',
          searchable: true,
          permissions: ['plugin:wanwan:manage'],
          menu: {
            name: '专题',
            group: '弯弯导航',
            icon: markRaw(IconFolder),
            priority: 1,
          },
        },
      },
    },
  ],
  extensionPoints: {},
})
