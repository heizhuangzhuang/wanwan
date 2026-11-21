import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import type { WebConfig } from './config.js'
import { escapeHtml, renderLayout } from './html.js'

export const braceScript = readFileSync(new URL('./brace-client.js', import.meta.url))
export const braceScriptHash = 'sha256-' + createHash('sha256').update(braceScript).digest('base64')
const style = readFileSync(new URL('../public/tools/brace-dashboard.css', import.meta.url), 'utf8')

export function renderBraceDashboard(config: WebConfig): string {
  const base = escapeHtml(config.siteBasePath)
  return renderLayout(config, '支具随访大屏', `
<style>${style}</style>
<div class="brace-board" id="brace-board">
  <a class="brace-return" href="${base}/tools">‹ 家庭工具</a>
  <section class="brace-hero">
    <div><h1>支具随访大屏</h1><p id="brace-phase">读取档案中</p></div>
    <div class="brace-hero-stat"><strong id="brace-average">—</strong><span>有记录日均值</span></div>
  </section>
  <div class="brace-bar">
    <div id="brace-periods" class="brace-periods" aria-label="统计跨度"></div>
    <label>截止日期 <input id="brace-end" type="date"></label>
    <span id="brace-range"></span>
  </div>
  <div class="brace-kpis">
    <div><strong id="brace-recorded">—</strong><span>有记录天数</span></div>
    <div><strong id="brace-below">—</strong><span>记录低于目标</span></div>
    <div><strong id="brace-missing">—</strong><span>计划日无记录</span></div>
    <div><strong id="brace-zero">—</strong><span>确认未穿</span></div>
  </div>
  <div class="brace-columns">
    <section class="brace-panel"><h2>穿戴趋势</h2><p>有记录日平均时长 · 满格 24 小时</p><div id="brace-chart"></div></section>
    <section class="brace-panel"><h2>待核对记录</h2><p>只对已结束的计划日归类。临床风险由医生评估。</p><ul id="brace-alerts"></ul>
      <button type="button" id="brace-confirm-zero">确认或撤回所选日未穿</button></section>
  </div>
  <div class="brace-columns">
    <section class="brace-panel"><h2>穿戴明细</h2><p>明细日期与截止日期一致。</p>
      <button type="button" id="brace-timer">开始计时</button> <span id="brace-running"></span>
      <ul id="brace-sessions"></ul>
      <form id="brace-session-form">
        <label>穿上时间<input required id="brace-start-time" type="datetime-local"></label>
        <label>脱下时间<input required id="brace-end-time" type="datetime-local"></label>
        <button type="submit">保存时段</button><button type="button" id="brace-cancel-edit" hidden>取消编辑</button>
      </form>
    </section>
    <section class="brace-panel"><h2>阶段计划</h2><p>按医生交代记录，每次变更从所选日期生效。</p>
      <form id="brace-plan-form">
        <label>生效日期<input required id="brace-plan-day" type="date"></label>
        <label>阶段<select id="brace-plan-type"><option value="wear">有穿戴目标</option><option value="followup">仅随访</option><option value="unset">未设目标</option></select></label>
        <label id="brace-hours-label">每日小时<input id="brace-plan-hours" type="number" min="0.02" max="24" step="0.01"></label>
        <button type="submit">保存计划</button>
      </form>
      <ul id="brace-plans"></ul>
    </section>
  </div>
  <div class="brace-columns">
    <section class="brace-panel"><h2>复诊与调整</h2>
      <form id="brace-visit-form"><label>日期<input required id="brace-visit-day" type="date"></label>
        <label>类型<select id="brace-visit-kind"><option>复诊</option><option>调整支具</option><option>随访</option></select></label>
        <label>备注<input id="brace-visit-note" maxlength="200"></label><button type="submit">加记录</button></form>
      <ul id="brace-visits"></ul>
    </section>
    <section class="brace-panel"><h2>导出与换机</h2>
      <p>Excel 用于查看所选区间，JSON 用于恢复完整档案。记录保存在当前设备。</p>
      <div class="brace-actions"><button type="button" id="brace-excel">导出 Excel</button>
        <button type="button" id="brace-backup">导出备份</button>
        <label class="brace-upload">恢复备份<input id="brace-restore" type="file" accept=".json,application/json"></label></div>
    </section>
  </div>
  <p id="brace-status" role="status"></p>
  <noscript><p>启用 JavaScript 后可使用本机记录。</p></noscript>
</div>
<script src="${base}/tools/brace-dashboard.js" integrity="${braceScriptHash}" defer></script>`)
}
