<script setup lang="ts">
import '~/assets/brace-dashboard.css'

const config = useRuntimeConfig()
let cleanup: (() => void) | null = null

onMounted(async () => {
  const { mountBraceDashboard } = await import('~/client/brace-dashboard')
  cleanup = await mountBraceDashboard()
})

onBeforeUnmount(() => {
  cleanup?.()
  cleanup = null
})

useHead({ title: `矫正鞋穿戴记录 - ${config.public.siteTitle}` })
</script>

<template>
  <div id="brace-board" class="brace-board">
    <NuxtLink class="text-link brace-return" to="/tools">‹ 家庭工具</NuxtLink>
    <header class="brace-heading">
      <div>
        <h1>矫正鞋穿戴记录</h1>
        <p>记录每天的穿戴时段，按时间回看随访。</p>
      </div>
      <a class="btn btn-outline" href="#brace-export">导出与备份</a>
    </header>

    <section class="brace-today" aria-labelledby="brace-today-title">
      <div>
        <h2 id="brace-today-title">今天已穿戴</h2>
        <strong id="brace-today-total">—</strong>
        <p id="brace-phase">读取档案中</p>
        <progress id="brace-today-progress" aria-label="今日穿戴目标进度" hidden />
      </div>
      <div class="brace-today-controls">
        <div class="brace-actions">
          <button id="brace-timer" class="btn brace-primary" type="button" disabled>开始计时</button>
          <button id="brace-cancel-timer" class="btn brace-on-dark" type="button" hidden>取消计时</button>
          <button id="brace-add-session" class="btn brace-on-dark" type="button" disabled>补记时段</button>
        </div>
        <p id="brace-running" role="status" />
      </div>
    </section>

    <section class="brace-section" aria-labelledby="brace-summary-title">
      <div class="brace-section-heading">
        <h2 id="brace-summary-title">穿戴概览</h2>
        <label class="brace-end-field">截至 <input id="brace-end" type="date" /></label>
      </div>
      <div class="brace-bar">
        <div id="brace-periods" class="brace-periods" role="group" aria-label="统计跨度" />
        <span id="brace-range" />
      </div>
      <div class="brace-kpis">
        <div><span>有记录日均值</span><strong id="brace-average">—</strong></div>
        <div><span>有记录天数</span><strong id="brace-recorded">—</strong></div>
        <div><span>记录低于目标</span><strong id="brace-below">—</strong></div>
        <div><span>计划日无记录</span><strong id="brace-missing">—</strong></div>
        <div><span>确认未穿</span><strong id="brace-zero">—</strong></div>
      </div>
      <div class="brace-columns brace-overview">
        <section class="brace-panel" aria-labelledby="brace-trend-title">
          <h3 id="brace-trend-title">穿戴趋势</h3>
          <p>按有记录的日期计算平均时长。每格最高 24 小时。</p>
          <p id="brace-chart-empty" class="brace-empty">读取记录中</p>
          <div id="brace-chart" role="list" aria-label="各时段平均穿戴时长" hidden />
          <p id="brace-chart-caption" class="brace-chart-caption" role="status" hidden />
        </section>
        <section class="brace-panel" aria-labelledby="brace-review-title">
          <h3 id="brace-review-title">待核对记录</h3>
          <p>列出最近 12 个待核对日期。临床风险由医生评估。</p>
          <ul id="brace-alerts" />
        </section>
      </div>
    </section>

    <section class="brace-section" aria-labelledby="brace-details-title">
      <div class="brace-section-heading">
        <h2 id="brace-details-title">记录与计划</h2>
      </div>
      <div class="brace-columns">
        <section id="brace-detail" class="brace-panel" aria-labelledby="brace-detail-title" tabindex="-1">
          <h3 id="brace-detail-title">穿戴明细</h3>
          <div class="brace-detail-bar">
            <p id="brace-detail-day" />
            <button id="brace-confirm-zero" class="btn btn-outline" type="button">确认当天未穿</button>
          </div>
          <ul id="brace-sessions" />
          <details id="brace-session-editor">
            <summary>手动记录穿戴时段</summary>
            <form id="brace-session-form">
              <label>穿上时间<input id="brace-start-time" required type="datetime-local" /></label>
              <label>脱下时间<input id="brace-end-time" required type="datetime-local" /></label>
              <div class="brace-actions">
                <button class="btn" type="submit">保存时段</button>
                <button id="brace-cancel-edit" class="btn btn-outline" type="button" hidden>取消编辑</button>
              </div>
            </form>
          </details>
        </section>

        <section class="brace-panel" aria-labelledby="brace-plan-title">
          <h3 id="brace-plan-title">阶段计划</h3>
          <p>按医生交代填写，每次变更从所选日期生效。</p>
          <div class="brace-presets" role="group" aria-label="Ponseti 常用目标时长">
            <span>常用目标：</span>
            <button class="btn btn-outline brace-preset-btn" type="button" data-preset-hours="23">23 小时</button>
            <button class="btn btn-outline brace-preset-btn" type="button" data-preset-hours="16">16 小时</button>
            <button class="btn btn-outline brace-preset-btn" type="button" data-preset-hours="14">14 小时</button>
            <button class="btn btn-outline brace-preset-btn" type="button" data-preset-hours="12">12 小时</button>
          </div>
          <form id="brace-plan-form">
            <label>生效日期<input id="brace-plan-day" required type="date" /></label>
            <label>
              阶段
              <select id="brace-plan-type">
                <option value="wear">有穿戴目标</option>
                <option value="followup">仅随访</option>
                <option value="unset">未设目标</option>
              </select>
            </label>
            <label id="brace-hours-label">
              每日小时<input id="brace-plan-hours" type="number" min="0.02" max="24" step="0.01" />
            </label>
            <button class="btn" type="submit">保存计划</button>
          </form>
          <ul id="brace-plans" />
        </section>

        <section class="brace-panel" aria-labelledby="brace-visit-title">
          <h3 id="brace-visit-title">复诊与调整</h3>
          <form id="brace-visit-form">
            <label>日期<input id="brace-visit-day" required type="date" /></label>
            <label>
              类型
              <select id="brace-visit-kind">
                <option>复诊</option>
                <option>调整支具</option>
                <option>随访</option>
                <option>开始穿戴</option>
                <option>更换矫正鞋</option>
                <option>跟腱处理</option>
              </select>
            </label>
            <label class="brace-full-width">备注<input id="brace-visit-note" maxlength="200" /></label>
            <button class="btn" type="submit">加记录</button>
          </form>
          <ul id="brace-visits" />
        </section>

        <section id="brace-observations-panel" class="brace-panel" aria-labelledby="brace-obs-title">
          <h3 id="brace-obs-title">穿戴困难与观察</h3>
          <p>记录滑脚、磨红、支具异常等情况，复诊时方便与医生核对，备份与微信小程序互通。</p>
          <form id="brace-obs-form">
            <label>日期<input id="brace-obs-day" required type="date" /></label>
            <label>
              困难类型
              <select id="brace-obs-kind">
                <option>脚跟易滑出</option>
                <option>皮肤不适</option>
                <option>支具损坏</option>
                <option>穿戴不适应</option>
                <option>其他困难</option>
              </select>
            </label>
            <label>
              侧别
              <select id="brace-obs-side">
                <option>未记录</option>
                <option>左侧</option>
                <option>右侧</option>
                <option>双侧</option>
              </select>
            </label>
            <label class="brace-checkbox-row">
              <input id="brace-obs-contacted" type="checkbox" />
              <span>已联系治疗团队</span>
            </label>
            <label class="brace-full-width">
              情况与处置备注
              <input id="brace-obs-outcome" maxlength="200" placeholder="例如：已调整鞋带松紧 / 预约复查" />
            </label>
            <button class="btn" type="submit">记录观察</button>
          </form>
          <ul id="brace-observations" />
        </section>

        <section id="brace-questions-panel" class="brace-panel" aria-labelledby="brace-questions-title">
          <h3 id="brace-questions-title">复诊想问医生的问题</h3>
          <p>最多保存 3 条，会自动带入下方复诊摘要。</p>
          <form id="brace-questions-form" class="brace-questions-form">
            <label class="brace-full-width">
              问题 1<input id="brace-q-0" maxlength="100" placeholder="例如：最近脚跟偶尔滑出，鞋码是否需要调整？" />
            </label>
            <label class="brace-full-width">
              问题 2<input id="brace-q-1" maxlength="100" placeholder="例如：下一阶段每天穿戴时长何时调整？" />
            </label>
            <label class="brace-full-width">
              问题 3<input id="brace-q-2" maxlength="100" placeholder="例如：复诊是否需要带齐连杆和鞋子？" />
            </label>
            <button class="btn" type="submit">保存复诊问题</button>
          </form>
        </section>

        <section id="brace-summary-panel" class="brace-panel brace-panel-wide" aria-labelledby="brace-summary-box-title">
          <div class="brace-section-heading">
            <h3 id="brace-summary-box-title">复诊摘要（一键复制给医生）</h3>
            <button id="brace-copy-summary" class="btn" type="button">复制复诊摘要</button>
          </div>
          <p>按上次复诊（或最近 30 天）至今日自动汇总，便于门诊沟通或发给家人。</p>
          <pre id="brace-summary-preview" class="brace-summary-box">正在整理复诊摘要…</pre>
        </section>

        <section id="brace-export" class="brace-panel brace-panel-wide" aria-labelledby="brace-export-title">
          <h3 id="brace-export-title">导出与换机</h3>
          <p>
            档案保存在当前浏览器（建议定期导出备份以防浏览器清理本地存储）。Excel 包含所选区间，备份可与微信小程序互通（包含穿戴时段、阶段计划、复诊记录、穿戴困难与复诊问题）。
          </p>
          <div class="brace-actions">
            <button id="brace-excel" class="btn" type="button">导出 Excel</button>
            <button id="brace-backup" class="btn btn-outline" type="button">导出备份</button>
            <label class="btn btn-outline brace-upload">
              恢复备份<input id="brace-restore" type="file" accept=".json,application/json" />
            </label>
          </div>
        </section>
      </div>
    </section>

    <p id="brace-status" role="status" />
    <noscript><p class="warn-bar">启用 JavaScript 后可使用本机记录。</p></noscript>
  </div>
</template>
