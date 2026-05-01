import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    include: ['src/**/__tests__/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
    environment: 'node',
    // Browser-leaning tests that need DOM globals can opt in per-file
    // via `// @vitest-environment jsdom`. Default is node so the CLI
    // tests + the runtime SDK's pure-fn tests don't pay for a JSDOM
    // boot they don't need.
  },
});
