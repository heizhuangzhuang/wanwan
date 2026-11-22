export const doctorChannelsUrl = '/pages/channels/channels'
export const socialChannelsUrl = '/pages/channels/channels?type=social'

const prenatalChannelsUrl = '/pages/channels/channels?period=prenatal'
const prenatalGuide = { title: '产前检查专项', url: '/pages/prenatal/prenatal' }
const ultrasoundChecklist = { title: '超声复查清单', url: '/pages/downloads/downloads' }
const treatmentJournal = { title: '石膏记录与复诊提醒', url: '/pages/cast/cast' }

export interface StageFocusItem {
  title: string
  detail: string
}

export interface StageFocus {
  goal: string
  tags: string[]
  items: StageFocusItem[]
  reminder: string
}

interface StageGuide {
  summary: string
  focus: StageFocus
  questions: string[]
  actions: { title: string; url: string }[]
  source: { title: string; url: string }
}

const guides: Record<string, StageGuide> = {
  JUST_FOUND: {
    summary: '第一次看到「疑似足内翻」，可以先把报告原文和想问的问题整理好，带去问产检医生。请医生说明哪只脚有提示，还有哪些部位需要复核。',
    focus: {
      goal: '先稳住情绪，把超声报告原文和首诊要问的问题整理清楚，避免被碎片化网帖吓到。',
      tags: ['保存原始报告', '问清侧别与复查', '整理首诊问题'],
      items: [
        {
          title: '保留原始报告与图像',
          detail: '记下检查日期、孕周、医院和报告原文用词（单侧还是双侧、是否写有“孤立性/疑似”），后续复查和转诊都会用到。',
        },
        {
          title: '向产检医生确认下一步',
          detail: '问清是否需要安排系统/针对性超声复查、间隔几周复查，以及下次该挂产前诊断还是胎儿医学门诊。',
        },
        {
          title: '先不急着定最终治疗方案',
          detail: '产前超声受胎位和羊水影响存在局限，实际轻重程度与治疗节奏通常以出生后小儿骨科当面评估为准。',
        },
      ],
      reminder: '第一次看到提示难免紧张，但特发性足内翻已有成熟规范的诊疗路径。先把疑问记进「问医生清单」，比熬夜搜网图更有帮助。',
    },
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
    focus: {
      goal: '理清孕期各项检查分别在回答什么，按时间归档报告，并提前了解出生后的小儿骨科接诊渠道。',
      tags: ['按日期归档报告', '看懂检查区别', '提前了解小儿骨科'],
      items: [
        {
          title: '区分“筛查”与“诊断”项目',
          detail: '遇到无创 DNA、羊水穿刺、核型、CMA、全外显子等名词时，先看清各自覆盖范围，再向产前诊断或遗传咨询门诊核对是否需要做。',
        },
        {
          title: '按时间线整理孕期检查档案',
          detail: '把历次超声、筛查和遗传检测报告按日期收在一个文件夹，复诊或跨院咨询时方便医生快速看全貌。',
        },
        {
          title: '提前了解本地小儿骨科资源',
          detail: '可在孕中晚期提前查好所在城市或周边规范开展 Ponseti 疗法的儿童骨科/足踝门诊挂号方式，心里有底，安心待产。',
        },
      ],
      reminder: '每个家庭的孕期检查路径因人而异，不需要照搬他人清单；所有检测选择和报告解读，均以产前诊断或遗传咨询医生当面说明为准。',
    },
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
    focus: {
      goal: '顺利衔接小儿骨科首次评估，并在系列石膏阶段做好居家血运观察与复诊记录。',
      tags: ['衔接小儿骨科', '做好石膏居家观察', '记清复诊与联系通道'],
      items: [
        {
          title: '带齐资料完成出生后首次评估',
          detail: '带上产前超声与出生记录前往小儿骨科，请医生当面评估足部情况并明确治疗节奏（如系列石膏与必要时的跟腱处理）。',
        },
        {
          title: '掌握石膏居家日常观察要点',
          detail: '每次打完石膏，向医护确认如何观察脚趾颜色、温度、肿胀以及石膏是否松动滑脱，并记下需立即联系医院的警示信号。',
        },
        {
          title: '固定记录每次石膏与复诊安排',
          detail: '记录第几次石膏、医院交代事项、下次复诊时间和白天/夜间联系电话，提前设好提醒，避免临时手忙脚乱。',
        },
      ],
      reminder: '石膏期间若发现脚趾发紫或发白、持续异常哭闹、脚趾缩进石膏看不见或石膏明显受潮破损，请勿自行处理，直接按医院留的通道联系医护。',
    },
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
    focus: {
      goal: '在医生指导下把穿戴时长稳定融入日常作息，及时发现并反馈脚跟滑出或皮肤磨红。',
      tags: ['核对穿戴位置', '建立固定穿戴作息', '早记录早反馈困难'],
      items: [
        {
          title: '掌握正确穿戴与脚跟贴合检查',
          detail: '试配支具时请团队现场演示穿鞋顺序、鞋带松紧与连杆位置，每天穿鞋后确认脚跟贴合到位。',
        },
        {
          title: '按阶段目标稳定记录每日穿戴',
          detail: '按医生交代的当前每日时长（如全日穿戴或逐步过渡到夜间与午睡）做好计时与记录，既帮全家养成规律，也为复诊提供客观数据。',
        },
        {
          title: '遇到穿戴困难及时记下并沟通',
          detail: '若出现反复滑脚、皮肤发红起泡、孩子持续抗拒或鞋码偏小，记下日期、侧别和照片，尽早联系团队微调，切勿自行长期停穿。',
        },
      ],
      reminder: '规范、持续的支具穿戴是巩固矫形效果、降低复发风险的核心环节。起初适应需要耐心，发现不合适尽早找治疗团队调整比硬扛更有效。',
    },
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
    focus: {
      goal: '按约定周期坚持复诊随访，关注孩子成长中的步态、日常鞋适配与复发早期信号。',
      tags: ['按期复诊随访', '观察步态与日常鞋', '留存完整治疗档案'],
      items: [
        {
          title: '按医嘱坚持长期定期随访',
          detail: '即便已经完成阶段性支具穿戴或逐步减量，仍需按小儿骨科约定的周期复查，由医生追踪骨骼发育与足部形态变化。',
        },
        {
          title: '留意日常活动与早期变化信号',
          detail: '平时留心孩子走路/跑步姿势、鞋底磨损是否明显不对称、足部是否重新出现内收或脚跟不易放平等变化，复诊时一并沟通。',
        },
        {
          title: '整理并长期备份治疗档案',
          detail: '把历次石膏、支具穿戴趋势、调整记录和复诊摘要导出留档，未来跨年龄段复查或更换医院随访时，医生能迅速了解完整病史。',
        },
      ],
      reminder: '每个孩子的成长节奏和治疗背景不同，参考他人经验或随访文献时请结合自身情况；发现疑似复发信号时，尽早预约小儿骨科复核。',
    },
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
