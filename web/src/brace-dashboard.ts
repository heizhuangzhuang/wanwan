import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import type { WebConfig } from './config.js'
import { escapeHtml, renderLayout } from './html.js'

export const braceScript = readFileSync(new URL('./brace-client.js', import.meta.url))
export const braceScriptHash = 'sha256-' + createHash('sha256').update(braceScript).digest('base64')
const style = readFileSync(new URL('../public/tools/brace-dashboard.css', import.meta.url), 'utf8')

export function renderBraceDashboard(config: WebConfig): string {
  const base = escapeHtml(config.siteBasePath)
  return renderLayout(config, '矫正鞋穿戴记录', `
<style>${style}</style>
<div class="brace-board" id="brace-board">
  <a class="text-link brace-return" href="${base}/tools">‹ 家庭工具</a>
  <header class="brace-heading">
    <div><h1>矫正鞋穿戴记录</h1><p>记录每天的穿戴时段，按时间回看随访。</p></div>
    <a class="btn btn-outline" href="#brace-export">导出与备份</a>
  </header>
  <section class="brace-today" aria-labelledby="brace-today-title">
    <div>
      <h2 id="brace-today-title">今天已穿戴</h2>
      <strong id="brace-today-total">—</strong>
      <p id="brace-phase">读取档案中</p>
      <progress id="brace-today-progress" aria-label="今日穿戴目标进度" hidden></progress>
    </div>
    <div class="brace-today-controls">
      <div class="brace-actions">
        <button class="btn brace-primary" type="button" id="brace-timer" disabled>开始计时</button>
        <button class="btn brace-on-dark" type="button" id="brace-cancel-timer" hidden>取消计时</button>
        <button class="btn brace-on-dark" type="button" id="brace-add-session" disabled>补记时段</button>
      </div>
      <p id="brace-running" role="status"></p>
    </div>
  </section>
  <section class="brace-section" aria-labelledby="brace-summary-title">
    <div class="brace-section-heading">
      <h2 id="brace-summary-title">穿戴概览</h2>
      <label class="brace-end-field">截至 <input id="brace-end" type="date"></label>
    </div>
    <div class="brace-bar">
      <div id="brace-periods" class="brace-periods" role="group" aria-label="统计跨度"></div>
      <span id="brace-range"></span>
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
        <p class="brace-empty" id="brace-chart-empty">读取记录中</p>
        <div id="brace-chart" role="list" aria-label="各时段平均穿戴时长" hidden></div>
        <p id="brace-chart-caption" class="brace-chart-caption" role="status" hidden></p>
      </section>
      <section class="brace-panel" aria-labelledby="brace-review-title">
        <h3 id="brace-review-title">待核对记录</h3><p>列出最近 12 个待核对日期。临床风险由医生评估。</p>
        <ul id="brace-alerts"></ul>
      </section>
    </div>
  </section>
  <section class="brace-section" aria-labelledby="brace-details-title">
    <div class="brace-section-heading"><h2 id="brace-details-title">记录与计划</h2></div>
    <div class="brace-columns">
      <section class="brace-panel" id="brace-detail" aria-labelledby="brace-detail-title" tabindex="-1">
        <h3 id="brace-detail-title">穿戴明细</h3>
        <div class="brace-detail-bar"><p id="brace-detail-day"></p><button class="btn btn-outline" type="button" id="brace-confirm-zero">确认当天未穿</button></div>
        <ul id="brace-sessions"></ul>
        <details id="brace-session-editor">
          <summary>手动记录穿戴时段</summary>
          <form id="brace-session-form">
            <label>穿上时间<input required id="brace-start-time" type="datetime-local"></label>
            <label>脱下时间<input required id="brace-end-time" type="datetime-local"></label>
            <div class="brace-actions"><button class="btn" type="submit">保存时段</button><button class="btn btn-outline" type="button" id="brace-cancel-edit" hidden>取消编辑</button></div>
          </form>
        </details>
      </section>
      <section class="brace-panel" aria-labelledby="brace-plan-title">
        <h3 id="brace-plan-title">阶段计划</h3><p>按医生交代填写，每次变更从所选日期生效。</p>
        <form id="brace-plan-form">
          <label>生效日期<input required id="brace-plan-day" type="date"></label>
          <label>阶段<select id="brace-plan-type"><option value="wear">有穿戴目标</option><option value="followup">仅随访</option><option value="unset">未设目标</option></select></label>
          <label id="brace-hours-label">每日小时<input id="brace-plan-hours" type="number" min="0.02" max="24" step="0.01"></label>
          <button class="btn" type="submit">保存计划</button>
        </form>
        <ul id="brace-plans"></ul>
      </section>
      <section class="brace-panel" aria-labelledby="brace-visit-title">
        <h3 id="brace-visit-title">复诊与调整</h3>
        <form id="brace-visit-form"><label>日期<input required id="brace-visit-day" type="date"></label>
          <label>类型<select id="brace-visit-kind"><option>复诊</option><option>调整支具</option><option>随访</option><option>开始穿戴</option><option>更换矫正鞋</option><option>跟腱处理</option></select></label>
          <label class="brace-full-width">备注<input id="brace-visit-note" maxlength="200"></label><button class="btn" type="submit">加记录</button></form>
        <ul id="brace-visits"></ul>
      </section>
      <section class="brace-panel" id="brace-export" aria-labelledby="brace-export-title">
        <h3 id="brace-export-title">导出与换机</h3>
        <p>档案保存在当前浏览器（建议定期导出备份以防浏览器清理本地存储）。Excel 包含所选区间，备份可与微信小程序互通。</p>
        <div class="brace-actions"><button class="btn" type="button" id="brace-excel">导出 Excel</button>
          <button class="btn btn-outline" type="button" id="brace-backup">导出备份</button>
          <label class="btn btn-outline brace-upload">恢复备份<input id="brace-restore" type="file" accept=".json,application/json"></label></div>
        <div id="brace-extra" hidden style="margin-top:14px;border-top:1px solid var(--border);padding-top:10px">
          <h4>同步自备份的穿戴困难与复诊问题</h4>
          <ul id="brace-extra-list"></ul>
        </div>
      </section>
    </div>
  </section>
  <p id="brace-status" role="status"></p>
  <noscript><p class="warn-bar">启用 JavaScript 后可使用本机记录。</p></noscript>
</div>
<script src="${base}/tools/brace-dashboard.js" integrity="${braceScriptHash}" defer></script>`, '/tools/brace-followup')
}
