const calendarForm = document.querySelector('.tools-calendar')
const appointment = document.querySelector('#appointment-time')
const result = document.querySelector('#appointment-status')

function calendarTime(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

calendarForm.addEventListener('submit', event => {
  event.preventDefault()
  const date = new Date(appointment.value + ':00+08:00')
  if (!Number.isFinite(date.getTime())) {
    result.textContent = '请选择完整的日期和时间。'
    return
  }
  const time = calendarTime(date)
  const now = new Date()
  const id = 'visit-' + now.getTime() + '-' + Math.random().toString(36).slice(2)
  const content = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//xiaojiaoya//Visit Calendar//ZH',
    'BEGIN:VEVENT', 'UID:' + id, 'DTSTAMP:' + calendarTime(now),
    'DTSTART:' + time, 'SUMMARY:复诊', 'END:VEVENT', 'END:VCALENDAR', '',
  ].join('\r\n')
  const file = URL.createObjectURL(new Blob([content], { type: 'text/calendar;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = file
  link.download = 'visit.ics'
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(file), 1000)
  result.textContent = '日历文件已生成，可以从下载列表导入。'
})
