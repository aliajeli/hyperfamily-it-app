// Central theme catalogue.
// Every theme is pure data: the palette is applied at runtime as CSS custom
// properties on <html>, so adding a theme never requires new CSS.
// Values are "R G B" triplets so Tailwind can use rgb(var(--x) / <alpha>).

function theme(id, name, mode, family, description, vars) {
  return { id, name, mode, family, description, ...vars }
}

const SNOW = { canvas: '229 233 240', surface: '236 239 244', text: '46 52 64', muted: '76 86 106', border: '216 222 233' }
const POLAR = { canvas: '46 52 64', surface: '59 66 82', text: '236 239 244', muted: '196 205 221', border: '76 86 106' }

export const THEMES = [
  /* ---------------------------------------------------------------- Nord light */
  theme('aurora', 'Aurora Light', 'light', 'Nord', 'Warm Nord Aurora accents over Snow Storm surfaces', {
    primary: '191 97 106', secondary: '208 135 112', accent: '235 203 139', focus: '191 97 106', ...SNOW,
    colors: ['#BF616A', '#D08770', '#EBCB8B', '#ECEFF4']
  }),
  theme('frost', 'Frost Light', 'light', 'Nord', 'Cool Nord cyan and blue accents', {
    primary: '94 129 172', secondary: '136 192 208', accent: '143 188 187', focus: '136 192 208', ...SNOW,
    colors: ['#8FBCBB', '#88C0D0', '#81A1C1', '#ECEFF4']
  }),
  theme('snow', 'Snow Light', 'light', 'Nord', 'Clean Snow Storm neutrals with a Polar Night accent', {
    primary: '76 86 106', secondary: '216 222 233', accent: '129 161 193', focus: '129 161 193', ...SNOW,
    colors: ['#ECEFF4', '#E5E9F0', '#D8DEE9', '#4C566A']
  }),
  theme('tundra', 'Tundra Light', 'light', 'Nord', 'Nord green and purple accents on calm light surfaces', {
    primary: '94 129 172', secondary: '163 190 140', accent: '180 142 173', focus: '163 190 140', ...SNOW,
    colors: ['#A3BE8C', '#B48EAD', '#D8DEE9', '#ECEFF4']
  }),
  theme('glacier', 'Glacier Light', 'light', 'Nord', 'Icy Frost teal on the brightest Snow Storm canvas', {
    primary: '143 188 187', secondary: '129 161 193', accent: '136 192 208', focus: '143 188 187',
    canvas: '236 239 244', surface: '248 250 252', text: '46 52 64', muted: '76 86 106', border: '223 229 238',
    colors: ['#8FBCBB', '#81A1C1', '#88C0D0', '#F8FAFC']
  }),
  theme('boreal', 'Boreal Light', 'light', 'Nord', 'Nord forest green leading a soft daylight palette', {
    primary: '132 163 112', secondary: '143 188 187', accent: '235 203 139', focus: '163 190 140', ...SNOW,
    colors: ['#84A370', '#8FBCBB', '#EBCB8B', '#ECEFF4']
  }),

  /* ----------------------------------------------------------------- Nord dark */
  theme('polar', 'Polar Night', 'dark', 'Nord', 'Classic Nord dark workspace with Frost highlights', {
    primary: '136 192 208', secondary: '67 76 94', accent: '180 142 173', focus: '136 192 208', ...POLAR,
    colors: ['#2E3440', '#3B4252', '#434C5E', '#88C0D0']
  }),
  theme('arctic-night', 'Arctic Night', 'dark', 'Nord', 'Deep Polar Night surfaces with strong blue Frost accents', {
    primary: '129 161 193', secondary: '136 192 208', accent: '143 188 187', focus: '136 192 208',
    ...POLAR, surface: '67 76 94',
    colors: ['#2E3440', '#434C5E', '#5E81AC', '#81A1C1']
  }),
  theme('fjord-night', 'Fjord Night', 'dark', 'Nord', 'Teal Nord Frost accents for network operations', {
    primary: '143 188 187', secondary: '136 192 208', accent: '163 190 140', focus: '143 188 187',
    ...POLAR, canvas: '59 66 82', surface: '67 76 94',
    colors: ['#3B4252', '#4C566A', '#8FBCBB', '#88C0D0']
  }),
  theme('aurora-night', 'Aurora Night', 'dark', 'Nord', 'Dark Nord surfaces with purple and red Aurora accents', {
    primary: '180 142 173', secondary: '191 97 106', accent: '208 135 112', focus: '180 142 173', ...POLAR,
    colors: ['#2E3440', '#3B4252', '#B48EAD', '#BF616A']
  }),
  theme('nord-ember', 'Nord Ember', 'dark', 'Nord', 'Warm Aurora orange over the deepest Polar Night', {
    primary: '208 135 112', secondary: '235 203 139', accent: '191 97 106', focus: '208 135 112',
    ...POLAR, canvas: '38 43 54',
    colors: ['#262B36', '#3B4252', '#D08770', '#EBCB8B']
  }),
  theme('nord-moss', 'Nord Moss', 'dark', 'Nord', 'Aurora green highlights for calm night monitoring', {
    primary: '163 190 140', secondary: '143 188 187', accent: '136 192 208', focus: '163 190 140', ...POLAR,
    colors: ['#2E3440', '#3B4252', '#A3BE8C', '#8FBCBB']
  }),

  /* ------------------------------------------------------------ Non-Nord light */
  theme('porcelain', 'Porcelain', 'light', 'Modern', 'Neutral slate surfaces with a confident indigo primary', {
    primary: '79 70 229', secondary: '99 102 241', accent: '14 165 233', focus: '79 70 229',
    canvas: '241 245 249', surface: '255 255 255', text: '15 23 42', muted: '100 116 139', border: '226 232 240',
    colors: ['#4F46E5', '#6366F1', '#0EA5E9', '#FFFFFF']
  }),
  theme('sandstone', 'Sandstone', 'light', 'Modern', 'Warm paper tones with a terracotta accent', {
    primary: '194 101 66', secondary: '217 155 98', accent: '138 122 90', focus: '194 101 66',
    canvas: '245 240 232', surface: '253 250 244', text: '52 44 36', muted: '124 110 95', border: '231 222 208',
    colors: ['#C26542', '#D99B62', '#8A7A5A', '#FDFAF4']
  }),
  theme('mint', 'Mint Studio', 'light', 'Modern', 'Fresh emerald on a bright, low-contrast workspace', {
    primary: '13 148 136', secondary: '16 185 129', accent: '2 132 199', focus: '13 148 136',
    canvas: '240 247 245', surface: '255 255 255', text: '17 40 38', muted: '90 116 112', border: '215 232 228',
    colors: ['#0D9488', '#10B981', '#0284C7', '#FFFFFF']
  }),
  theme('rose-quartz', 'Rose Quartz', 'light', 'Modern', 'Soft rose and violet for a friendly console', {
    primary: '219 39 119', secondary: '168 85 247', accent: '244 114 182', focus: '219 39 119',
    canvas: '250 242 246', surface: '255 253 254', text: '48 26 40', muted: '124 96 112', border: '240 224 233',
    colors: ['#DB2777', '#A855F7', '#F472B6', '#FFFDFE']
  }),
  theme('solarized-light', 'Solarized Light', 'light', 'Classic', 'The classic Solarized base3 palette', {
    primary: '38 139 210', secondary: '42 161 152', accent: '181 137 0', focus: '38 139 210',
    canvas: '238 232 213', surface: '253 246 227', text: '7 54 66', muted: '101 123 131', border: '223 214 190',
    colors: ['#268BD2', '#2AA198', '#B58900', '#FDF6E3']
  }),
  theme('graphite', 'Graphite Light', 'light', 'Modern', 'Monochrome workspace with a single amber highlight', {
    primary: '55 65 81', secondary: '107 114 128', accent: '217 119 6', focus: '217 119 6',
    canvas: '243 244 246', surface: '255 255 255', text: '17 24 39', muted: '107 114 128', border: '229 231 235',
    colors: ['#374151', '#6B7280', '#D97706', '#FFFFFF']
  }),
  theme('sky', 'Sky Ops', 'light', 'Modern', 'Bright operations blue tuned for large dashboards', {
    primary: '2 132 199', secondary: '14 165 233', accent: '6 182 212', focus: '2 132 199',
    canvas: '238 246 252', surface: '255 255 255', text: '12 34 52', muted: '86 108 128', border: '216 231 243',
    colors: ['#0284C7', '#0EA5E9', '#06B6D4', '#FFFFFF']
  }),

  /* ------------------------------------------------------------- Non-Nord dark */
  theme('midnight', 'Midnight Indigo', 'dark', 'Modern', 'Deep navy surfaces with an electric indigo primary', {
    primary: '129 140 248', secondary: '99 102 241', accent: '56 189 248', focus: '129 140 248',
    canvas: '15 23 42', surface: '30 41 59', text: '226 232 240', muted: '148 163 184', border: '51 65 85',
    colors: ['#0F172A', '#1E293B', '#818CF8', '#38BDF8']
  }),
  theme('carbon', 'Carbon', 'dark', 'Modern', 'True neutral dark UI with a cyan signal colour', {
    primary: '34 211 238', secondary: '82 82 91', accent: '250 204 21', focus: '34 211 238',
    canvas: '9 9 11', surface: '24 24 27', text: '244 244 245', muted: '161 161 170', border: '39 39 42',
    colors: ['#09090B', '#18181B', '#22D3EE', '#FACC15']
  }),
  theme('emerald-dark', 'Emerald Night', 'dark', 'Modern', 'Dark teal shell with a vivid emerald primary', {
    primary: '52 211 153', secondary: '20 184 166', accent: '125 211 252', focus: '52 211 153',
    canvas: '6 26 26', surface: '11 40 39', text: '224 242 241', muted: '148 180 176', border: '22 61 58',
    colors: ['#061A1A', '#0B2827', '#34D399', '#7DD3FC']
  }),
  theme('dracula', 'Dracula', 'dark', 'Classic', 'The well-known purple and pink developer palette', {
    primary: '189 147 249', secondary: '255 121 198', accent: '80 250 123', focus: '189 147 249',
    canvas: '40 42 54', surface: '52 55 70', text: '248 248 242', muted: '175 177 197', border: '68 71 90',
    colors: ['#282A36', '#343746', '#BD93F9', '#FF79C6']
  }),
  theme('tokyo-night', 'Tokyo Night', 'dark', 'Classic', 'Cool blue-violet night palette with neon accents', {
    primary: '122 162 247', secondary: '187 154 247', accent: '125 207 255', focus: '122 162 247',
    canvas: '26 27 38', surface: '36 40 59', text: '192 202 245', muted: '150 158 190', border: '52 59 88',
    colors: ['#1A1B26', '#24283B', '#7AA2F7', '#BB9AF7']
  }),
  theme('gruvbox-dark', 'Gruvbox Dark', 'dark', 'Classic', 'Retro warm contrast for long shifts', {
    primary: '250 189 47', secondary: '184 187 38', accent: '254 128 25', focus: '250 189 47',
    canvas: '40 40 40', surface: '60 56 54', text: '235 219 178', muted: '189 174 147', border: '80 73 69',
    colors: ['#282828', '#3C3836', '#FABD2F', '#FE8019']
  }),
  theme('solarized-dark', 'Solarized Dark', 'dark', 'Classic', 'The classic Solarized base03 palette', {
    primary: '38 139 210', secondary: '42 161 152', accent: '203 75 22', focus: '38 139 210',
    canvas: '0 43 54', surface: '7 54 66', text: '238 232 213', muted: '147 161 161', border: '25 71 84',
    colors: ['#002B36', '#073642', '#268BD2', '#2AA198']
  }),
  theme('crimson-dark', 'Crimson Ops', 'dark', 'Modern', 'High-alert red accents for NOC wall displays', {
    primary: '244 63 94', secondary: '251 113 133', accent: '250 204 21', focus: '244 63 94',
    canvas: '21 14 17', surface: '35 22 28', text: '250 235 240', muted: '190 160 172', border: '64 38 48',
    colors: ['#150E11', '#23161C', '#F43F5E', '#FACC15']
  })
]

export const THEME_VARS = ['primary', 'secondary', 'accent', 'canvas', 'surface', 'text', 'muted', 'border', 'focus']

export function findTheme(id) {
  return THEMES.find((item) => item.id === id) || THEMES[0]
}

export function applyTheme(themeOrId) {
  if (typeof document === 'undefined') return
  const value = typeof themeOrId === 'string' ? findTheme(themeOrId) : themeOrId
  const root = document.documentElement
  for (const key of THEME_VARS) root.style.setProperty(`--${key}`, value[key])
  root.style.colorScheme = value.mode
  root.dataset.theme = value.id
  root.dataset.colorMode = value.mode
}

export const THEME_FAMILIES = ['Nord', 'Modern', 'Classic']
