import './globals.css'
import AppProviders from '@/components/providers/AppProviders'
import { THEMES, THEME_VARS, THEME_STORAGE_KEY, CUSTOM_THEME_ID, CUSTOM_THEME_STORAGE_KEY } from '@/lib/themes'
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
var r=document.documentElement,t=null,name=id&&T[id]?id:${JSON.stringify(THEMES[0].id)};
if(id===${JSON.stringify(CUSTOM_THEME_ID)}){
/* The custom palette is not in the compiled table: read the mirrored copy and
   derive its light/dark mode from the canvas luminance, exactly as
   lib/themes.js does, so native scrollbars match from the very first paint. */
var raw=localStorage.getItem(${JSON.stringify(CUSTOM_THEME_STORAGE_KEY)});
if(raw){var c=JSON.parse(raw),v=[];
for(var k=0;k<K.length;k++)v.push(c[K[k]]||T[${JSON.stringify(THEMES[0].id)}].v[k]);
var p=String(c.canvas||'0 0 0').split(/\s+/).map(Number);
var lum=function(x){x=(Number(x)||0)/255;return x<=0.03928?x/12.92:Math.pow((x+0.055)/1.055,2.4)};
t={m:(0.2126*lum(p[0])+0.7152*lum(p[1])+0.0722*lum(p[2])>0.4)?'light':'dark',v:v};
name=${JSON.stringify(CUSTOM_THEME_ID)};}
}
if(!t)t=(id&&T[id])||T[${JSON.stringify(THEMES[0].id)}];
if(!t)return;
for(var i=0;i<K.length;i++)r.style.setProperty('--'+K[i],t.v[i]);
r.style.colorScheme=t.m;r.dataset.theme=name;r.dataset.colorMode=t.m;
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
