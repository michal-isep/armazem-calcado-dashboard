import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // The e2e files recreate the same tables, so they must not run in parallel.
    fileParallelism: false,
  },
});
