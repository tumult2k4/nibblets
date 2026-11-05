import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  test: {
    environment: 'node',
    include: ['src/**/__tests__/*.test.ts'],
    testTimeout: 60000,
  },
} as never);
