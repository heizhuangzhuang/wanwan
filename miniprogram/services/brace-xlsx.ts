import { dateKey, dailyWear, STATE_LABEL, summarizeWear, timeKey, type WearLog } from './brace-ledger'

type Cell = number | string | null
type Sheet = { title: string; rows: Cell[][] }
const xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
const main = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const packageRel = 'http://schemas.openxmlformats.org/package/2006/relationships'

function escape(value: string): string {
  return Array.from(value).filter(char => {
    const code = char.codePointAt(0)!
    return code === 9 || code === 10 || code === 13 ||
      (code >= 32 && code <= 0xd7ff) || (code >= 0xe000 && code <= 0xfffd) || code >= 0x10000
  }).join('').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]!)
}

// Inline strings never become spreadsheet formulas, even when a note starts with "=".
function worksheet(rows: Cell[][]): string {
  return xml + `<worksheet xmlns="${main}"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="7" width="24" customWidth="1"/></cols><sheetData>` +
    rows.map((row, index) => `<row r="${index + 1}">${row.map((cell, col) => {
      const attrs = `r="${String.fromCharCode(65 + col)}${index + 1}"${index === 0 ? ' s="1"' : ''}`
      if (cell === null) return `<c ${attrs}/>`
      if (typeof cell === 'number') return `<c ${attrs}><v>${cell}</v></c>`
      return `<c ${attrs} t="inlineStr"><is><t xml:space="preserve">${escape(cell)}</t></is></c>`
    }).join('')}</row>`).join('') + '</sheetData></worksheet>'
}

function utf8(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length * 3)
  let i = 0
  for (const char of value) {
    const code = char.codePointAt(0)!
    if (code <= 0x7f) bytes[i++] = code
    else if (code <= 0x7ff) {
      bytes[i++] = 0xc0 | code >>> 6
      bytes[i++] = 0x80 | code & 63
    } else if (code <= 0xffff) {
      bytes[i++] = 0xe0 | code >>> 12
      bytes[i++] = 0x80 | code >>> 6 & 63
      bytes[i++] = 0x80 | code & 63
    } else {
      bytes[i++] = 0xf0 | code >>> 18
      bytes[i++] = 0x80 | code >>> 12 & 63
      bytes[i++] = 0x80 | code >>> 6 & 63
      bytes[i++] = 0x80 | code & 63
    }
  }
  return bytes.subarray(0, i)
}

const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let crc = index
  for (let i = 0; i < 8; i++) crc = crc >>> 1 ^ (crc & 1 ? 0xedb88320 : 0)
  return crc
})

// XLSX is an OPC package. Store entries without compression so both runtimes can write it offline.
function zip(files: [string, string][]): Uint8Array {
  const local: Uint8Array[] = [], directory: Uint8Array[] = []
  let offset = 0, size = 0
  for (const [name, content] of files) {
    const path = utf8(name), data = utf8(content)
    let crc = 0xffffffff
    for (const byte of data) crc = crc >>> 8 ^ crcTable[(crc ^ byte) & 255]
    crc ^= 0xffffffff
    const a = new Uint8Array(30 + path.length), b = new Uint8Array(46 + path.length)
    const av = new DataView(a.buffer), bv = new DataView(b.buffer)
    av.setUint32(0, 0x04034b50, true); av.setUint16(4, 20, true)
    av.setUint16(12, 33, true); av.setUint32(14, crc, true); av.setUint32(18, data.length, true)
    av.setUint32(22, data.length, true); av.setUint16(26, path.length, true); a.set(path, 30)
    bv.setUint32(0, 0x02014b50, true); bv.setUint16(4, 20, true); bv.setUint16(6, 20, true)
    bv.setUint16(14, 33, true); bv.setUint32(16, crc, true); bv.setUint32(20, data.length, true)
    bv.setUint32(24, data.length, true); bv.setUint16(28, path.length, true); bv.setUint32(42, offset, true); b.set(path, 46)
    local.push(a, data); directory.push(b); offset += a.length + data.length; size += b.length
  }
  const end = new Uint8Array(22), view = new DataView(end.buffer)
  view.setUint32(0, 0x06054b50, true); view.setUint16(8, files.length, true); view.setUint16(10, files.length, true)
  view.setUint32(12, size, true); view.setUint32(16, offset, true)
  const result = new Uint8Array(offset + size + end.length)
  let cursor = 0
  for (const piece of [...local, ...directory, end]) {
    result.set(piece, cursor)
    cursor += piece.length
  }
  return result
}

export function wearWorkbook(log: WearLog, start: string, end: string, now = Date.now()): Uint8Array {
  const days = dailyWear(log, start, end, now)
  const stats = summarizeWear(days)
  const sheets: Sheet[] = [
    { title: '概览', rows: [['指标', '值'], ['开始日期', start], ['结束日期', end], ['有穿戴或确认记录的天数', stats.recorded],
      ['所选区间天数', days.length], ['区间内未记录天数', days.length - stats.recorded],
      ['累计已记录分钟', stats.minutes], ['记录低于目标日', stats.below], ['计划日无记录', stats.missing],
      ['确认未穿日', stats.zero], ['说明', '按导出设备的日历日期统计；记录用于随访沟通。']] },
    { title: '每日统计', rows: [['日期', '记录分钟', '目标分钟', '记录状态'],
      ...days.map(row => [row.day, row.recordedMinutes, row.targetMinutes, STATE_LABEL[row.state]])] },
    { title: '穿戴时段', rows: [['开始（当地时间）', '结束（当地时间）', '原始时段分钟'],
      ...log.sessions.filter(row => dateKey(row.start) <= end && dateKey(row.end - 1) >= start)
        .sort((a, b) => a.start - b.start).map(row => [`${dateKey(row.start)} ${timeKey(row.start)}`,
          `${dateKey(row.end)} ${timeKey(row.end)}`, Math.floor((row.end - row.start) / 60_000)])] },
    { title: '计划历史', rows: [['生效日', '状态', '目标分钟'], ...log.plans.map(row =>
      [row.day, row.type === 'wear' ? '穿戴期' : row.type === 'followup' ? '仅随访' : '未设目标', row.minutes])] },
    { title: '随访记录', rows: [['日期', '类型', '备注'], ...log.visits.filter(row => row.day >= start && row.day <= end)
      .sort((a, b) => a.day.localeCompare(b.day)).map(row => [row.day, row.kind, row.note])] },
  ]
  const observations = (log.observations ?? []).filter(row => row.day >= start && row.day <= end)
    .sort((a, b) => a.day.localeCompare(b.day))
  if (observations.length) {
    sheets.push({ title: '穿戴困难', rows: [['日期', '观察', '侧别', '联系治疗团队', '处理经过或结果'],
      ...observations.map(row => [row.day, row.kind, row.side, row.contacted ? '已联系' : '未标记', row.outcome])] })
  }
  const sheetOverrides = sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
  return zip([
    ['[Content_Types].xml', xml + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheetOverrides}</Types>`],
    ['_rels/.rels', xml + `<Relationships xmlns="${packageRel}"><Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', xml + `<workbook xmlns="${main}" xmlns:r="${rel}"><sheets>${sheets.map((sheet, i) => `<sheet name="${sheet.title}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', xml + `<Relationships xmlns="${packageRel}">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${rel}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="styles" Type="${rel}/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', xml + `<styleSheet xmlns="${main}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF234A3B"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf fontId="0" fillId="0" borderId="0" xfId="0"/><xf fontId="1" fillId="2" borderId="0" xfId="0" applyFill="1" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`],
    ...sheets.map((sheet, i): [string, string] => [`xl/worksheets/sheet${i + 1}.xml`, worksheet(sheet.rows)]),
  ])
}
