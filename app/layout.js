import './globals.css'
import AppProviders from '@/components/providers/AppProviders'
import { THEMES, THEME_VARS, THEME_STORAGE_KEY } from '@/lib/themes'

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
 * Runs before the first paint: restores the theme the user last chose, so every
 * screen — the login page included — opens in the right colours with no flash.
 * Written as a string because it must execute synchronously in the document
 * head, ahead of React hydration.
 */
const BOOT_SCRIPT = `(function(){try{
var T=${JSON.stringify(BOOT_THEMES)},K=${JSON.stringify(THEME_VARS)};
var id=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
var t=(id&&T[id])||T[${JSON.stringify(THEMES[0].id)}];
if(!t)return;
var r=document.documentElement;
for(var i=0;i<K.length;i++)r.style.setProperty('--'+K[i],t.v[i]);
r.style.colorScheme=t.m;r.dataset.theme=id&&T[id]?id:${JSON.stringify(THEMES[0].id)};r.dataset.colorMode=t.m;
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
