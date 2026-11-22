(function () {
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).catch(function () {
        return fallbackCopy(text)
      })
    }
    return fallbackCopy(text)
  }

  function fallbackCopy(text) {
    return new Promise(function (resolve, reject) {
      try {
        var area = document.createElement('textarea')
        area.value = text
        area.setAttribute('readonly', '')
        area.style.position = 'fixed'
        area.style.top = '-9999px'
        area.style.left = '-9999px'
        document.body.appendChild(area)
        area.focus()
        area.select()
        var ok = document.execCommand('copy')
        area.remove()
        if (ok) resolve()
        else reject(new Error('copy failed'))
      } catch (err) {
        reject(err)
      }
    })
  }

  function showFeedback(button, message) {
    var statusId = button.getAttribute('data-status-id')
    if (statusId) {
      var statusEl = document.getElementById(statusId)
      if (statusEl) statusEl.textContent = message
    }
    var original = button.getAttribute('data-original-label')
    if (!original) {
      original = button.textContent || ''
      button.setAttribute('data-original-label', original)
    }
    button.textContent = message.indexOf('失败') >= 0 ? '复制失败' : '已复制'
    window.setTimeout(function () {
      button.textContent = original
    }, 1800)
  }

  document.addEventListener('click', function (event) {
    var target = event.target
    if (!(target instanceof Element)) return

    var copyBtn = target.closest('[data-copy-text], [data-copy-url]')
    if (copyBtn) {
      var urlMode = copyBtn.getAttribute('data-copy-url')
      var payload = urlMode === 'current'
        ? (copyBtn.getAttribute('data-copy-prefix') ? copyBtn.getAttribute('data-copy-prefix') + '\n' + window.location.href : window.location.href)
        : (copyBtn.getAttribute('data-copy-text') || '')
      if (!payload) return
      var okMsg = copyBtn.getAttribute('data-copy-ok') || '已复制到剪贴板。'
      copyText(payload).then(
        function () { showFeedback(copyBtn, okMsg) },
        function () { showFeedback(copyBtn, '复制失败，请手动长按选中复制。') }
      )
      return
    }

    var prepCopy = target.closest('[data-prep-copy]')
    if (prepCopy) {
      var container = document.getElementById('prep-list')
      if (!container) return
      var boxes = Array.prototype.slice.call(container.querySelectorAll('input[type="checkbox"][data-prep-question]'))
      var checked = boxes.filter(function (box) { return box.checked })
      var chosen = checked.length ? checked : boxes
      if (!chosen.length) return
      var heading = container.getAttribute('data-prep-heading') || '就诊沟通问题清单'
      var lines = [heading].concat(chosen.map(function (box, index) {
        return (index + 1) + '. ' + (box.getAttribute('data-prep-question') || '')
      }))
      var msg = checked.length
        ? '已复制选中的 ' + checked.length + ' 条问题。'
        : '未单独勾选，已复制全部 ' + chosen.length + ' 条问题。'
      copyText(lines.join('\n')).then(
        function () { showFeedback(prepCopy, msg) },
        function () { showFeedback(prepCopy, '复制失败，请手动选中复制。') }
      )
      return
    }

    var prepToggle = target.closest('[data-prep-toggle]')
    if (prepToggle) {
      var listEl = document.getElementById('prep-list')
      if (!listEl) return
      var allBoxes = Array.prototype.slice.call(listEl.querySelectorAll('input[type="checkbox"][data-prep-question]'))
      var allChecked = allBoxes.every(function (box) { return box.checked })
      allBoxes.forEach(function (box) { box.checked = !allChecked })
      prepToggle.textContent = allChecked ? '全选问题' : '取消全选'
      var statusEl = document.getElementById('prep-status')
      if (statusEl) {
        statusEl.textContent = allChecked ? '已取消全选。' : '已全选 ' + allBoxes.length + ' 条问题。'
      }
    }
  })
})()
