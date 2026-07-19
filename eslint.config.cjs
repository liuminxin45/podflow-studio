const js = require('@eslint/js')
const tsParser = require('@typescript-eslint/parser')
const reactHooks = require('eslint-plugin-react-hooks')
const reactRefresh = require('eslint-plugin-react-refresh')

const browserGlobals = {
  window: 'readonly',
  document: 'readonly',
  navigator: 'readonly',
  localStorage: 'readonly',
  Blob: 'readonly',
  ArrayBuffer: 'readonly',
  MediaRecorder: 'readonly',
  MediaStream: 'readonly',
  HTMLTextAreaElement: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
}

const nodeGlobals = {
  __dirname: 'readonly',
  ArrayBuffer: 'readonly',
  Buffer: 'readonly',
  console: 'readonly',
  global: 'readonly',
  module: 'readonly',
  process: 'readonly',
  require: 'readonly',
  setImmediate: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  URL: 'readonly',
}

const testGlobals = {
  beforeEach: 'readonly',
  describe: 'readonly',
  expect: 'readonly',
  it: 'readonly',
  vi: 'readonly',
}

module.exports = [
  {
    ignores: [
      'auto_podcast.egg-info/**',
      'build/**',
      'coverage/**',
      'dist/**',
      'dist-electron/**',
      'node_modules/**',
      'out/**',
      'tmp/**',
      '.venv/**',
      '**/__pycache__/**',
      '**/*.pyc',
    ],
  },
  {
    files: ['**/*.js', '**/*.cjs'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: nodeGlobals,
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-console': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-unused-vars': 'off',
    },
  },
  {
    files: ['src/**/*.{ts,tsx}', 'vite.config.mts', 'vitest.config.mts'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        ...browserGlobals,
        ...nodeGlobals,
        ...testGlobals,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'no-console': 'off',
      'no-undef': 'off',
      'no-unused-vars': 'off',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
]
