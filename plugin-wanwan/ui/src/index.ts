import { definePlugin } from '@halo-dev/console-shared'
import { IconBookRead, IconFolder } from '@halo-dev/components'
import { markRaw } from 'vue'
import FamilyAccountsView from './views/FamilyAccountsView.vue'
import OpsOverviewView from './views/OpsOverviewView.vue'
import FeedbackView from './views/FeedbackView.vue'
import ResourceCardListView from './views/ResourceCardListView.vue'
import TopicListView from './views/TopicListView.vue'

export default definePlugin({
  components: {},
  routes: [
    {
      parentName: 'Root',
      route: {
        path: '/xiaojiaoya/family-accounts',
        name: 'FamilyAccounts',
        component: FamilyAccountsView,
        meta: {
          title: '家庭账号',
          searchable: true,
          permissions: ['plugin:wanwan:family-accounts'],
          menu: {
            name: '家庭账号',
            group: '弯弯导航',
            icon: markRaw(IconFolder),
            priority: 3,
          },
        },
      },
    },
    {
      parentName: 'Root',
      route: {
        path: '/xiaojiaoya/feedback',
        name: 'WanwanFeedback',
        component: FeedbackView,
        meta: {
          title: '功能建议',
          searchable: true,
          permissions: ['plugin:wanwan:feedback'],
          menu: {
            name: '功能建议',
            group: '弯弯导航',
            icon: markRaw(IconFolder),
            priority: 2,
          },
        },
      },
    },
    {
      parentName: 'Root',
      route: {
        path: '/xiaojiaoya/operations',
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
        path: '/xiaojiaoya/resources',
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
        path: '/xiaojiaoya/topics',
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
