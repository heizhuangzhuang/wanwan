export function useCopyAction() {
  const status = ref('')
  let timer: ReturnType<typeof setTimeout> | null = null

  async function copy(text: string, okMessage = '已复制到剪贴板。') {
    if (!import.meta.client) return false
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
      } else {
        const el = document.createElement('textarea')
        el.value = text
        el.style.position = 'fixed'
        el.style.opacity = '0'
        document.body.appendChild(el)
        el.select()
        document.execCommand('copy')
        document.body.removeChild(el)
      }
      status.value = okMessage
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => { status.value = '' }, 4000)
      return true
    } catch {
      status.value = '当前浏览器不支持自动复制，请手动长按复制。'
      return false
    }
  }

  return { status, copy }
}
