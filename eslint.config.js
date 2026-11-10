// Flat ESLint config for the whole monorepo.
//
// Rules are tuned for the native-Node-TS setup we use across engine/server/ui:
// - `consistent-type-imports` enforces `import type` for type-only imports
//   (matches `verbatimModuleSyntax` in tsconfigs).
// - `no-import-type-side-effects` keeps emitted type imports as zero-runtime.
// - `no-unused-vars` catches dead code; underscore prefix opts out by convention.
//
// Prettier owns formatting; eslint-config-prettier disables conflicting rules.

import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import prettier from 'eslint-config-prettier'
import globals from 'globals'

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/.turbo/**',
      '.claude/**',
      // The CAD build's outputs (gitignored): exports, renders with vendored three.js, private run dirs.
      'cad/out/**',
      'cad/shots/**',
      'cad/.runs/**',
      'cad/.fluidcad/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    rules: {
      // Type-only import discipline, required for verbatimModuleSyntax + native Node TS.
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],
      '@typescript-eslint/no-import-type-side-effects': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
      'no-unused-vars': 'off',
      // `any` is real tech debt but pre-existing in UI/server code: warn, do not block.
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  // UI: React + browser globals + react-hooks and react-refresh plugins.
  // The hooks rules surface real issues but most are pre-existing, so start as
  // warnings so fresh violations stand out without blocking CI.
  {
    files: ['ui/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      ...reactHooks.configs['recommended-latest'].rules,
      ...reactRefresh.configs.vite.rules,
      'react-hooks/rules-of-hooks': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/error-boundaries': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/static-components': 'warn',
      'no-case-declarations': 'warn',
    },
  },
  {
    // React contexts export their provider and their hook from one file;
    // fast refresh warns about that pairing and nothing else.
    files: ['ui/src/context/**/*.tsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  {
    // The dev pages are entry points: they mount themselves and export
    // nothing, so fast refresh reloads them whole, which is all they need.
    files: ['ui/src/dev-*.tsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  {
    // React Three Fiber animates by writing to three.js objects, uniforms and
    // refs inside useFrame, and the 3D scene must never re-render per frame
    // (CLAUDE.md), so these two rules flag the pattern the board is built on.
    files: ['ui/src/components/board/three/**/*.{ts,tsx}'],
    rules: { 'react-hooks/immutability': 'off', 'react-hooks/refs': 'off' },
  },
  prettier
)
