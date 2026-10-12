var locked = false
var retryAfterMs = 0
var attemptsLeft = 0

function setText(id, text) {
  var el = document.getElementById(id)
  el.textContent = text
  el.classList.remove('hidden')
}

function showMessage(text, cls) {
  var el = document.getElementById('msg')
  el.textContent = text
  el.className = 'msg ' + (cls || '')
  el.classList.remove('hidden')
}

function tick() {
  if (!locked) return
  retryAfterMs -= 1000
  if (retryAfterMs <= 0) {
    locked = false
    attemptsLeft = 5
    document.getElementById('pin').disabled = false
    document.getElementById('submit').disabled = false
    document.getElementById('msg').classList.add('hidden')
    document.getElementById('attempts').textContent = ''
    return
  }
  var total = Math.ceil(retryAfterMs / 1000)
  var m = Math.floor(total / 60)
  var s = String(total % 60).padStart(2, '0')
  showMessage('Too many wrong attempts — recovery is locked. Try again in ' + m + ':' + s + '.', '')
}

function renderAttempts() {
  document.getElementById('attempts').textContent = locked
    ? ''
    : attemptsLeft + ' attempt' + (attemptsLeft === 1 ? '' : 's') + ' remaining before a 5-minute lock.'
}

window.recovery.state().then(function (s) {
  if (s.error) {
    setText('error', s.error)
    return
  }
  if (!s.pinSet) {
    setText(
      'error',
      'No recovery PIN has been set. Sign in to the application and set one in Settings → General, then run this tool again.'
    )
    document.getElementById('pinView').classList.add('hidden')
    return
  }
  if (s.locked) {
    locked = true
    retryAfterMs = s.retryAfterMs
    document.getElementById('pin').disabled = true
    document.getElementById('submit').disabled = true
    tick()
    setInterval(tick, 1000)
  } else {
    attemptsLeft = s.attemptsLeft
    renderAttempts()
  }
})

document.getElementById('submit').addEventListener('click', function () {
  var pin = document.getElementById('pin').value
  if (!pin || locked) return
  this.disabled = true
  window.recovery.verify(pin).then(function (r) {
    document.getElementById('submit').disabled = locked
    if (r.ok) {
      document.getElementById('pinView').classList.add('hidden')
      document.getElementById('resultView').classList.remove('hidden')
      document.getElementById('resUser').textContent = r.username
      document.getElementById('resPass').textContent = r.password || 'not recorded'
      if (!r.password) document.getElementById('resPass').className = 'v hint'
      return
    }
    if (r.error) {
      showMessage(r.error, '')
      return
    }
    if (r.locked) {
      locked = true
      retryAfterMs = r.retryAfterMs
      document.getElementById('pin').disabled = true
      tick()
      setInterval(tick, 1000)
      renderAttempts()
      return
    }
    attemptsLeft = r.attemptsLeft
    showMessage('Wrong PIN.', '')
    renderAttempts()
    document.getElementById('pin').value = ''
    document.getElementById('pin').focus()
  })
})

document.getElementById('pin').addEventListener('input', function () {
  this.value = this.value.replace(/\D/g, '')
})
document.getElementById('pin').addEventListener('keydown', function (e) {
  if (e.key === 'Enter') document.getElementById('submit').click()
})

document.querySelectorAll('[data-copy]').forEach(function (button) {
  button.addEventListener('click', function () {
    var value =
      this.getAttribute('data-copy') === 'user'
        ? document.getElementById('resUser').textContent
        : document.getElementById('resPass').textContent
    navigator.clipboard.writeText(value).then(function () {
      var old = button.textContent
      button.textContent = 'Copied'
      button.classList.add('copied')
      setTimeout(function () {
        button.textContent = old
        button.classList.remove('copied')
      }, 1400)
    })
  })
})
