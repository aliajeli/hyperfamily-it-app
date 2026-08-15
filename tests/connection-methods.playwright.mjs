/**
 * Connection-method matrix (Settings -> Device tools).
 *
 * Asserts the per-device-type defaults required by the specification and the
 * three interactions the chip grid supports: enable, promote-to-default and
 * remove. The "last method cannot be removed" case matters most -- a device
 * type with zero connection methods would be unreachable from the UI.
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
await p.getByText('Device tools',{exact:true}).first().click()
await p.waitForTimeout(2500)

// 1. spec defaults are the starred chip per type
const spec = {Router:'Winbox',AccessPoint:'Winbox',Switch:'Terminal',iLO:'Browser with auto sign-in',
              NVR:'Browser with auto sign-in',Server:'Remote Desktop',Checkout:'Remote Desktop',Client:'Remote Desktop'}
for (const [type,label] of Object.entries(spec)) {
  const star = p.locator(`[aria-label="${label} is the default for ${type}"]`)
  t(`${type} defaults to ${label}`, await star.count()===1)
}

// 2. Client must offer BOTH Remote Desktop and TeamViewer per spec
t('Client offers TeamViewer as well',
  (await p.locator('[aria-label="Remove TeamViewer from Client"]').count())===1)

// 3. promote TeamViewer to default for Client, star should move
await p.locator('[aria-label="Make TeamViewer the default for Client"]').click()
await p.waitForTimeout(350)
t('promoting TeamViewer moves the star',
  (await p.locator('[aria-label="TeamViewer is the default for Client"]').count())===1)

// 4. enable a disabled method (Winbox on Client) then remove it again
await p.locator('[aria-label="Enable Winbox for Client"]').click()
await p.waitForTimeout(300)
const added = await p.locator('[aria-label="Remove Winbox from Client"]').count()===1
await p.locator('[aria-label="Remove Winbox from Client"]').click()
await p.waitForTimeout(300)
const removed = await p.locator('[aria-label="Enable Winbox for Client"]').count()===1
t('enable then remove round-trips', added && removed)

// 5. last remaining method exposes no remove control (cannot reach zero)
await p.locator('[aria-label="Remove Remote Desktop from Client"]').click()
await p.waitForTimeout(300)
t('last method cannot be removed',
  (await p.locator('[aria-label="Remove TeamViewer from Client"]').count())===0)

// 6. no sideways scroll on this tab
const v = await p.evaluate(()=>({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth}))
t('device tools tab does not scroll sideways', v.sw<=v.cw+1)

await p.screenshot({path:'/tmp/shots/matrix-after.png'})
await b.close()
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail?1:0)
