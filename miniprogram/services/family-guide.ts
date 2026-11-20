export const doctorChannelsUrl = '/pages/channels/channels'
export const socialChannelsUrl = '/pages/channels/channels?type=social'

const prenatalChannelsUrl = '/pages/channels/channels?period=prenatal'
const prenatalGuide = { title: '产前检查专项', url: '/pages/prenatal/prenatal' }
const ultrasoundChecklist = { title: '超声复查清单', url: '/pages/downloads/downloads' }
const treatmentJournal = { title: '石膏记录与复诊提醒', url: '/pages/cast/cast' }

interface StageGuide {
  summary: string
  questions: string[]
  actions: { title: string; url: string }[]
  source: { title: string; url: string }
}

const guides: Record<string, StageGuide> = {
  JUST_FOUND: {
    summary: '第一次看到「疑似足内翻」，可以先把报告原文和想问的问题整理好，带去问产检医生。请医生说明哪只脚有提示，还有哪些部位需要复核。',
    questions: [
      '报告提示哪一侧？这次哪些部位还需要复核？',
      '是否需要约复查？下次看哪个科室、带哪些原始资料？',
      '有没有同时看到其他需要进一步评估的情况？',
    ],
    actions: [ultrasoundChecklist, { title: '查产前诊断与胎儿医学门诊', url: prenatalChannelsUrl }],
    source: {
      title: '北京市垂杨柳医院 · 产前超声检查知多少',
      url: 'https://www.beijing.gov.cn/fuwu/bmfw/jhsyfwzdzx/2024sjrkr/kpzs/202406/t20240611_3709450.html',
    },
  },
  PRENATAL: {
    summary: '复查前把每次超声、筛查和取样报告按日期放在一起。遇到羊水穿刺、染色体微阵列或全外显等名词，可以先查项目，再向产前诊断或遗传咨询医生核对。',
    questions: [
      '这次提到的是筛查、取样还是实验室检测？它能回答什么？',
      '是否要带以前的报告或父母的资料？谁来解释结果？',
      '如果报告分批出具或结果还不确定，该约哪一个门诊？',
    ],
    actions: [prenatalGuide, { title: '查产前诊断与遗传咨询门诊', url: prenatalChannelsUrl }],
    source: {
      title: '上海交通大学医学院 · 胎儿发育异常诊治中心',
      url: 'https://www.shsmu.edu.cn/info/1073/1046.htm',
    },
  },
  POSTNATAL_TREATMENT: {
    summary: '出生后可向接诊医院确认小儿骨科的评估安排。进入石膏阶段后，把这次医院交代的事项、下次复诊时间和联系电话记在一起。',
    questions: [
      '第一次骨科评估要带哪些产前、出生后的资料？',
      '打石膏回家后要观察什么？出现哪些情况该立即联系医院？',
      '下次治疗是什么时间？白天和夜间分别联系谁？',
    ],
    actions: [treatmentJournal, { title: '查小儿骨科就诊入口', url: doctorChannelsUrl }],
    source: {
      title: '上海市儿童医院 · 骨科',
      url: 'https://www.shchildren.com.cn/contents/449/2780.html',
    },
  },
  BRACE_DAILY: {
    summary: '试配支具时，请团队现场演示穿戴和检查位置的方法。复诊前记下穿戴时遇到的问题，并向团队确认这趟是否要带鞋和连杆。',
    questions: [
      '能否现场演示穿戴，以及怎样确认脚跟在合适的位置？',
      '鞋或连杆看起来不合适时，应该找谁检查？',
      '这次复查需要带鞋、连杆或穿戴记录吗？',
    ],
    actions: [{ title: '找支具复查经验和科普', url: socialChannelsUrl }],
    source: {
      title: 'Alder Hey 儿童医院 · 支具家长手册（英文）',
      url: 'https://www.alderhey.nhs.uk/conditions/patient-information-leaflets/boots-and-bar-ponseti-treatment/',
    },
  },
  LONG_TERM: {
    summary: '把每次复诊的交代和下一次安排放在同一处。读随访研究或家长经验时，留意孩子的年龄、治疗背景和随访时间。',
    questions: [
      '下次需要什么时候复诊？需要带哪些以往记录？',
      '平时哪些变化适合记下来，哪些变化需要提前联系门诊？',
      '换医院随访时，哪些治疗和支具记录需要一起带过去？',
    ],
    actions: [{ title: '查小儿骨科就诊入口', url: doctorChannelsUrl }],
    source: {
      title: 'Cooper 与 Dietz · 成年随访研究题录（英文）',
      url: 'https://pubmed.ncbi.nlm.nih.gov/7593056/',
    },
  },
}

export function familyGuide(key: string): StageGuide | null {
  return Object.prototype.hasOwnProperty.call(guides, key) ? guides[key] : null
}
