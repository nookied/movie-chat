import { defineConfig, configDefaults } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['__e2e__/**/*.test.ts'],
    exclude: [...configDefaults.exclude, '.claude/**'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    coverage: {
      enabled: false,
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
