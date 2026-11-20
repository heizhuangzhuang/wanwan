interface Channel {
  key: string
  platform: string
  title: string
  description: string
  keyword: string
  sourceLabel?: string
  sourceUrl?: string
}

const prenatal: Channel = {
  key: 'prenatal-clinic',
  platform: '医院官方渠道',
  title: '产前诊断或胎儿医学门诊',
  description: '孕期可先向产检医院确认复查或转诊入口。查本地门诊时可在搜索词前加上所在城市或医院名称。',
  keyword: '产前诊断 胎儿医学 遗传咨询',
  sourceLabel: '上海交通大学医学院 · 胎儿发育异常诊治中心',
  sourceUrl: 'https://www.shsmu.edu.cn/info/1073/1046.htm',
}

const orthopedics: Channel[] = [
  {
    key: 'haodf',
    platform: '好大夫在线',
    title: '按地区查小儿骨科医生',
    description: '可以查擅长领域和线上咨询入口。到医院官方渠道核对科室、院区和门诊安排。',
    keyword: '先天性马蹄内翻足 小儿骨科',
    sourceLabel: '好大夫在线 · 全国医生目录',
    sourceUrl: 'https://www.haodf.com/citiao/jibing-xiantianxingmatineifanzu/tuijian-doctor.html',
  },
  {
    key: 'hospital-orthopedics',
    platform: '医院官方渠道',
    title: '小儿骨科或儿童足踝门诊',
    description: '查找附近接诊婴幼儿足部先天畸形的科室。上海市儿童医院骨科页面可作为核对接诊范围的示例。',
    keyword: '小儿骨科 马蹄内翻足 门诊',
    sourceLabel: '上海市儿童医院 · 骨科',
    sourceUrl: 'https://www.shchildren.com.cn/contents/449/2780.html',
  },
]

const social: Channel[] = [
  {
    key: 'xiaohongshu-families',
    platform: '小红书 · 家庭经验',
    title: '看看家长怎么准备就诊和复查',
    description: '可以参考别人如何携带资料、记下换石膏日期，以及安排支具复查。浏览时留意分享对应的年龄和治疗阶段。',
    keyword: '马蹄内翻足 石膏 支具 复查',
  },
  {
    key: 'xiaohongshu-institution',
    platform: '小红书 · 机构科普',
    title: '广西壮族自治区妇幼保健院',
    description: '医院公开介绍里列有小红书账号，适合查找妇幼科普。请在平台搜索并核对机构认证。',
    keyword: '广西妇幼保健院',
    sourceLabel: '中国妇幼保健协会 · 医院账号介绍',
    sourceUrl: 'https://cmcha.org/detail/16781577636753290832.html',
  },
  {
    key: 'douyin-sun',
    platform: '抖音 · 医生科普',
    title: '孙永建 · 南医三院儿童骨科',
    description: '南方医科大学介绍了他在抖音发布的儿童骨科科普。搜索后核对姓名、医院和账号认证。',
    keyword: '南医三院 儿童骨科 孙永建',
    sourceLabel: '南方医科大学 · 孙永建介绍',
    sourceUrl: 'https://www.smu.edu.cn/info/1141/23409.htm',
  },
  {
    key: 'haodf-zhang',
    platform: '好大夫在线 · 医生科普',
    title: '张网林医生的科普号',
    description: '公开文章目录收录儿童石膏固定和小儿骨科相关科普，可以先整理想向接诊医生确认的问题。',
    keyword: '张网林 儿童石膏固定',
    sourceLabel: '好大夫在线 · 作者文章目录',
    sourceUrl: 'https://jiankanghao.haodf.com/97205/wenzhang.html',
  },
]

export function channelsFor(type: string | undefined, period: string | undefined): Channel[] {
  if (type === 'social') return social
  return period === 'prenatal' ? [prenatal, ...orthopedics] : [...orthopedics, prenatal]
}
