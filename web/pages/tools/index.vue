<script setup lang="ts">
const config = useRuntimeConfig()
const appointmentTime = ref('')
const appointmentStatus = ref('')

const castUrl = computed(() => {
  const link = config.public.castMiniprogramUrl || ''
  return /^https:\/\/wxaurl\.cn\/[a-z0-9_-]+$/i.test(link) ? link : ''
})

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function toUtcStamp(date: Date) {
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    'T',
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
    'Z',
  ].join('')
}

function onDownloadIcs() {
  if (!import.meta.client) return
  const raw = appointmentTime.value.trim()
  if (!raw) {
    appointmentStatus.value = '请先选择复诊日期和时间。'
    return
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(raw)
  if (!match) {
    appointmentStatus.value = '时间格式无效，请重新选择。'
    return
  }
  const [, y, m, d, hh, mm] = match
  const startUtc = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), Number(hh) - 8, Number(mm), 0))
  const endUtc = new Date(startUtc.getTime() + 60 * 60 * 1000)
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Xiaojiaoya//Appointment//ZH',
    'BEGIN:VEVENT',
    `UID:${Date.now()}@xiaojiaoya.local`,
    `DTSTAMP:${toUtcStamp(new Date())}`,
    `DTSTART:${toUtcStamp(startUtc)}`,
    `DTEND:${toUtcStamp(endUtc)}`,
    'SUMMARY:足内翻复诊提醒',
    'DESCRIPTION:由小脚丫步步指南在本机生成的复诊日程。请提前核对医院科室、携带既往报告与支具/石膏记录。',
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n')

  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `xiaojiaoya-appointment-${y}${m}${d}.ics`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  appointmentStatus.value = '已生成复诊日历文件（.ics），可直接导入手机或电脑日历。'
}

useHead({ title: `家庭工具 - ${config.public.siteTitle}` })
</script>

<template>
  <div>
    <section class="tool-lead">
      <h1>家庭工具</h1>
      <p>记录治疗、准备就诊，回看每个阶段。</p>
    </section>

    <div class="tools-grid">
      <article class="card tool-feature">
        <h2 class="card-title">矫正鞋穿戴记录</h2>
        <p>计时或补记穿戴时段，记录穿戴困难与复诊问题，一键生成复诊摘要，也可导出 Excel 和互通备份。</p>
        <NuxtLink class="btn" to="/tools/brace-followup">
          打开支具随访大屏 <span class="arrow" aria-hidden="true" />
        </NuxtLink>
      </article>

      <article class="card">
        <h2 class="card-title">就诊沟通清单</h2>
        <p>按当前阶段勾选最想问医生的问题，一键复制带去产检、超声或小儿骨科门诊。</p>
        <NuxtLink class="btn btn-outline" to="/tools/preparation">整理就诊问题</NuxtLink>
      </article>

      <article class="card">
        <h2 class="card-title">找医生与门诊 / 家长经验</h2>
        <p>整理医院官方渠道、产前诊断、小儿骨科与机构科普搜索词，一键复制去核对。</p>
        <div class="action-bar">
          <NuxtLink class="btn btn-outline" to="/channels?type=doctor">找医生与门诊</NuxtLink>
          <NuxtLink class="btn btn-outline" to="/channels?type=social">科普与家长经验</NuxtLink>
        </div>
      </article>

      <article class="card">
        <h2 class="card-title">我的家庭记录</h2>
        <p>用微信登录，跨设备查看石膏记录和矫正鞋计时。</p>
        <NuxtLink class="btn" to="/tools/family">打开家庭记录</NuxtLink>
      </article>

      <article id="cast" class="card">
        <h2 class="card-title">石膏记录与微信提醒</h2>
        <p>在微信小程序记录每次打石膏的日期、医院交代事项和下次治疗时间。同一微信账户可换机恢复。</p>
        <a v-if="castUrl" class="btn btn-outline" :href="castUrl" rel="noopener noreferrer">
          在微信打开石膏记录
        </a>
        <p v-else class="meta-row">打开微信小程序，在家庭工具中选择「石膏记录与复诊提醒」。</p>
      </article>

      <article class="card">
        <h2 class="card-title">生成复诊日历文件</h2>
        <p>输入医院给出的时间，下载后导入手机或电脑日历。时间仅在当前浏览器处理。</p>
        <form class="tools-calendar" @submit.prevent="onDownloadIcs">
          <label for="appointment-time">复诊时间（北京时间）</label>
          <input
            id="appointment-time"
            v-model="appointmentTime"
            type="datetime-local"
            class="search-input"
            required
          />
          <button class="btn" type="submit">下载日历文件</button>
          <span v-if="appointmentStatus" id="appointment-status" role="status">{{ appointmentStatus }}</span>
        </form>
      </article>

      <article class="card">
        <h2 class="card-title">足内翻超声复查清单</h2>
        <p>一页空白 PDF，可打印后带去和医生沟通。</p>
        <a class="btn btn-outline" :href="`${config.public.siteBasePath}/downloads/clubfoot-ultrasound-checklist.pdf`">
          下载清单
        </a>
      </article>

      <article class="card">
        <h2 class="card-title">产前检查专项</h2>
        <p>查阅结构超声、无创 DNA、羊水穿刺、CMA 和全外显子测序，并一键复制要向医生确认的问题。</p>
        <NuxtLink class="btn btn-outline" to="/prenatal">查看专项</NuxtLink>
      </article>
    </div>
  </div>
</template>
