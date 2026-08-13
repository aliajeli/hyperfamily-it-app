/* Renderer for the themed device window. Runs with contextIsolation on and
   talks to the main process exclusively through the deviceWebview bridge. */
(async () => {
  const bridge = window.deviceWebview
  const dot = document.getElementById('dot')
  const overlay = document.getElementById('overlay')
  const overlayText = document.getElementById('overlay-text')
  const statusBar = document.getElementById('status')
  const urlBox = document.getElementById('url')
  const titleBox = document.getElementById('title')

  const setStatus = (text, tone = '') => {
    statusBar.textContent = text
    statusBar.className = `status ${tone}`
    dot.className = `dot ${tone === 'error' ? 'err' : tone === 'done' ? 'ok' : 'busy'}`
  }

  const applyPalette = (css) => {
    if (css) document.documentElement.setAttribute('style', css)
  }

  const session = await bridge.session()
  if (!session) { setStatus('This window has no device session.', 'error'); return }

  applyPalette(session.paletteCss)
  bridge.onPalette(({ paletteCss }) => applyPalette(paletteCss))

  document.title = session.title
  titleBox.textContent = session.title
  urlBox.textContent = session.url

  const view = document.createElement('webview')
  view.setAttribute('src', session.url)
  view.setAttribute('partition', session.partition)
  view.setAttribute('allowpopups', 'false')
  document.querySelector('main').prepend(view)

  let signedIn = false

  const runLogin = async () => {
    setStatus('Signing in with the assigned credential\u2026')
    try {
      const result = await bridge.autologin(view.getWebContentsId())
      if (result === 'no-form') setStatus('No sign-in form was found \u2014 the device may already be signed in.', 'done')
      else { signedIn = true; setStatus('Credential submitted.', 'done') }
    } catch (error) {
      setStatus(error.message || 'Automatic sign-in failed.', 'error')
    }
  }

  view.addEventListener('did-start-loading', () => { if (!signedIn) setStatus('Loading the device interface\u2026') })

  view.addEventListener('dom-ready', async () => {
    urlBox.textContent = view.getURL()
    overlay.classList.add('hide')
    try { await bridge.applyGuestTheme(view.getWebContentsId()) } catch (error) { void error }
    if (session.autologin && !signedIn) runLogin()
    else if (signedIn) setStatus('Session active.', 'done')
  })

  view.addEventListener('did-navigate', () => { urlBox.textContent = view.getURL() })
  view.addEventListener('did-navigate-in-page', () => { urlBox.textContent = view.getURL() })
  view.addEventListener('page-title-updated', (event) => { titleBox.textContent = event.title || session.title })

  view.addEventListener('did-fail-load', (event) => {
    if (event.errorCode === -3) return // user-initiated abort
    overlay.classList.remove('hide')
    overlayText.textContent = `Could not reach the device (${event.errorDescription || event.errorCode}).`
    setStatus(`Connection failed: ${event.errorDescription || event.errorCode}`, 'error')
  })

  document.getElementById('reload').addEventListener('click', () => { signedIn = false; view.reload() })
  document.getElementById('back').addEventListener('click', () => { if (view.canGoBack()) view.goBack() })
  document.getElementById('login').addEventListener('click', runLogin)
  document.getElementById('close').addEventListener('click', () => bridge.close())
})()
