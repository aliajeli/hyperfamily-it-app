/**
 * Connection-method settings (Settings -> Connections), cards + dialog
 * edition (v2.0.14).
 *
 * Every device type is a card; clicking one opens a centered dialog where its
 * methods are picked, so this suite opens the card for each type before
 * asserting its chips. It still covers the three interactions — enable,
 * promote-to-default and remove — and the "last method cannot be removed"
 * guard, plus the two layout requirements (no sideways scroll, one screen at
 * 1366x768). The matrix must not be rendered by "Device tools" either.
 *
 * Usage: build, serve out/ on :3000, then
 *   node tests/connection-methods.playwright.mjs
 */
import { chromium } from '/tmp/node_modules/playwright/index.mjs'
const S = JSON.stringify({state:{user:{username:'Admin',role:'admin',display_name:'Admin'}},version:0})
const b = await chromium.launch(); const c = await b.newContext({viewport:{width:1366,height:768}})
await c.addInitScript(s=>window.sessionStorage.setItem('hyperfamily-session',s), S)
const p = await c.newPage()
let fail=0, pass=0
const t=(name,ok)=>{ ok?pass++:fail++; console.log((ok?'✔ ':'✖ ')+name) }

await p.goto('http://127.0.0.1:3000/settings/',{waitUntil:'domcontentloaded',timeout:60000})
await p.waitForTimeout(1200)
// v2.0.11: the matrix moved off "Device tools" onto its own tab.
await p.getByText('Device tools',{exact:true}).first().click()
await p.waitForTimeout(2000)
t('device tools no longer hosts the matrix',
  (await p.locator('[aria-label^="Open connection methods for"]').count())===0)

await p.getByText('Connections',{exact:true}).first().click()
await p.waitForTimeout(2500)

const open = async (label) => {
  await p.locator(`[aria-label="Open connection methods for ${label}"]`).click()
  await p.waitForTimeout(500)
}
const close = async () => {
  await p.keyboard.press('Escape')
  await p.waitForTimeout(400)
}

// 1. all ten device cards are listed
t('all ten device cards are shown',
  (await p.locator('[aria-label^="Open connection methods for"]').count())===10)

// 2. spec defaults are the starred chip per type (inside the dialog)
const LABEL = {Router:'Router',AccessPoint:'Access Point',Switch:'Switch',iLO:'iLO',
              NVR:'NVR',Server:'Server',Checkout:'Checkout',Client:'Client',
              Scale:'Scale',POS:'POS'}
const spec = {Router:'Winbox',AccessPoint:'Winbox',Switch:'Terminal',iLO:'Browser with auto sign-in',
              NVR:'Browser with auto sign-in',Server:'Remote Desktop',Checkout:'Remote Desktop',Client:'Remote Desktop',
              Scale:'External browser',POS:'TeamViewer'}
for (const [type,label] of Object.entries(spec)) {
  await open(LABEL[type])
  const star = p.locator(`[aria-label="${label} is the default for ${type}"]`)
  t(`${type} defaults to ${label}`, await star.count()===1)
  await close()
}

// 3. Client must offer BOTH Remote Desktop and TeamViewer per spec
await open('Client')
t('Client offers TeamViewer as well',
  (await p.locator('[aria-label="Remove TeamViewer from Client"]').count())===1)

// 4. promote TeamViewer to default for Client, star should move
await p.locator('[aria-label="Make TeamViewer the default for Client"]').click()
await p.waitForTimeout(350)
t('promoting TeamViewer moves the star',
  (await p.locator('[aria-label="TeamViewer is the default for Client"]').count())===1)

// 5. enable a disabled method (Winbox on Client) then remove it again
await p.locator('[aria-label="Enable Winbox for Client"]').click()
await p.waitForTimeout(300)
const added = await p.locator('[aria-label="Remove Winbox from Client"]').count()===1
await p.locator('[aria-label="Remove Winbox from Client"]').click()
await p.waitForTimeout(300)
const removed = await p.locator('[aria-label="Enable Winbox for Client"]').count()===1
t('enable then remove round-trips', added && removed)

// 6. last remaining method exposes no remove control (cannot reach zero)
await p.locator('[aria-label="Remove Remote Desktop from Client"]').click()
await p.waitForTimeout(300)
t('last method cannot be removed',
  (await p.locator('[aria-label="Remove TeamViewer from Client"]').count())===0)
await close()

// 7. no sideways scroll on this tab
const v = await p.evaluate(()=>({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth}))
t('connections tab does not scroll sideways', v.sw<=v.cw+1)

// 8. the whole tab has to fit 1366x768 without vertical scrolling either
const h = await p.evaluate(()=>({dh:document.documentElement.scrollHeight,wh:window.innerHeight}))
t('connections tab fits one screen', h.dh<=h.wh+1)

await p.screenshot({path:'/tmp/shots/matrix-after.png'})
await b.close()
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail?1:0)
