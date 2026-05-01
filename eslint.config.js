// Flat config (eslint v9). Single-package repo — one config covers
// everything under `src/`. Mirrors the conventions from the old
// monorepo without the per-package boilerplate.

import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: ['dist/**', 'node_modules/**', '**/*.cjs'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Allow `any` sparingly — admin SDK's bridge layer uses it for
      // unstructured envelopes from the host. ``noUncheckedIndexedAccess``
      // in tsconfig handles the bigger wins.
      '@typescript-eslint/no-explicit-any': 'off',
      // We rely on TS for unused-vars in test code; turn off the JS
      // rule so `vi.fn()` placeholders don't trip it.
      'no-unused-vars': 'off',
    },
  },
];
