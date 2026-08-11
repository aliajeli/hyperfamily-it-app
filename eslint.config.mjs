import nextPlugin from '@next/eslint-plugin-next'
import reactPlugin from 'eslint-plugin-react'

export default [
  { ignores: ['node_modules/**', '.next/**', 'out/**', 'dist/**'] },
  {
    files: ['**/*.{js,jsx,mjs}'],
    languageOptions: { parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } } },
    plugins: { '@next/next': nextPlugin, react: reactPlugin },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      'react/jsx-uses-vars': 'error',
      'react/jsx-uses-react': 'off',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-undef': 'error'
    }
  },
  {
    files: ['electron/**/*.js', 'tests/**/*.js', 'next.config.js', 'tailwind.config.js', 'postcss.config.js'],
    languageOptions: { globals: { require: 'readonly', module: 'readonly', process: 'readonly', __dirname: 'readonly', Buffer: 'readonly', console: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly', fetch: 'readonly', URL: 'readonly', Response: 'readonly' } }
  },
  {
    files: ['app/**/*.{js,jsx}', 'components/**/*.{js,jsx}', 'stores/**/*.js', 'lib/**/*.js'],
    languageOptions: { globals: { window: 'readonly', document: 'readonly', localStorage: 'readonly', sessionStorage: 'readonly', navigator: 'readonly', CustomEvent: 'readonly', Event: 'readonly', FileReader: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly', console: 'readonly', confirm: 'readonly' } }
  }
]
