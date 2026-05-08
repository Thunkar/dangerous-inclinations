// Flat ESLint config for the whole monorepo.
//
// Rules are tuned for the native-Node-TS setup we use across engine/server/ui:
// - `consistent-type-imports` enforces `import type` for type-only imports
//   (matches `verbatimModuleSyntax` in tsconfigs).
// - `no-import-type-side-effects` keeps emitted type imports as zero-runtime.
// - `no-unused-vars` catches dead code; underscore prefix opts out by convention.
//
// Prettier owns formatting; eslint-config-prettier disables conflicting rules.

import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "**/coverage/**", "**/.turbo/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    rules: {
      // Type-only import discipline — required for verbatimModuleSyntax + native Node TS.
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "separate-type-imports" },
      ],
      "@typescript-eslint/no-import-type-side-effects": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
      "no-unused-vars": "off",
      // `any` is real tech debt but pre-existing in UI/server code — warn, don't block.
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  // UI: React + browser globals + react-hooks plugin.
  // The hooks rules surface real issues but most are pre-existing — start as
  // warnings so fresh violations stand out without blocking CI.
  {
    files: ["ui/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-hooks/rules-of-hooks": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/error-boundaries": "warn",
      "react-hooks/exhaustive-deps": "warn",
      "react-hooks/static-components": "warn",
      "no-case-declarations": "warn",
    },
  },
  prettier
);
