import './globals.css'
import AppProviders from '@/components/providers/AppProviders'
import { THEMES, THEME_VARS, THEME_STORAGE_KEY } from '@/lib/themes'
import { FONT_GROUPS, MONO_FONTS, TYPOGRAPHY_STORAGE_KEY, UI_FONTS } from '@/lib/typography'

export const metadata = {
  title: 'HyperFamily Branch Monitor',
  description: 'Secure retail branch and device monitoring'
}

/**
 * Theme palettes, reduced to just what the boot script needs and inlined into
 * the document. Reading the database is asynchronous and only possible after
 * sign-in, so without this the login screen always painted in the default
 * theme and only switched after the user was authenticated.
 */
const BOOT_THEMES = Object.fromEntries(
  THEMES.map((theme) => [
    theme.id,
    { m: theme.mode, v: THEME_VARS.map((key) => theme[key]) }
  ])
)

/**
 * Font id → CSS stack lookups for the boot script, and the variable names each
 * group writes, so the cached typography can be restored without importing the
 * module at runtime.
 */
const BOOT_FONTS = {
  ui: Object.fromEntries(UI_FONTS.filter((font) => font.id).map((font) => [font.id, font.stack])),
  mono: Object.fromEntries(MONO_FONTS.map((font) => [font.id, font.stack]))
}
const BOOT_GROUPS = FONT_GROUPS.map((group) => ({ i: group.id, v: group.variable, s: group.sizeVariable, m: group.id === 'mono' }))

/**
 * Runs before the first paint: restores the theme and the typography the user
 * last chose, so every screen — the login page included — opens in the right
 * colours and at the right scale with no flash. Written as a string because it
 * must execute synchronously in the document head, ahead of React hydration.
 */
const BOOT_SCRIPT = `(function(){try{
var T=${JSON.stringify(BOOT_THEMES)},K=${JSON.stringify(THEME_VARS)};
var id=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
var t=(id&&T[id])||T[${JSON.stringify(THEMES[0].id)}];
if(!t)return;
var r=document.documentElement;
for(var i=0;i<K.length;i++)r.style.setProperty('--'+K[i],t.v[i]);
r.style.colorScheme=t.m;r.dataset.theme=id&&T[id]?id:${JSON.stringify(THEMES[0].id)};r.dataset.colorMode=t.m;
}catch(e){}
try{
var F=${JSON.stringify(BOOT_FONTS)},G=${JSON.stringify(BOOT_GROUPS)};
var raw=localStorage.getItem(${JSON.stringify(TYPOGRAPHY_STORAGE_KEY)});
if(!raw)return;
var cfg=JSON.parse(raw),el=document.documentElement;
for(var j=0;j<G.length;j++){
var g=G[j],fam=cfg['font_'+g.i+'_family'],st=fam?(g.m?F.mono[fam]:F.ui[fam]||F.mono[fam]):'';
if(st)el.style.setProperty(g.v,st);
var sz=Number(cfg['font_'+g.i+'_size']);
if(sz>=50&&sz<=200)el.style.setProperty(g.s,String(sz/100));
}
}catch(e){}})()`

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} />
      </head>
      <body><AppProviders>{children}</AppProviders></body>
    </html>
  )
}
