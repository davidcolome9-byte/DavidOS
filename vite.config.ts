/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' keeps the build portable: it works on any static host,
// in a Capacitor wrapper, or opened from a subdirectory.
export default defineConfig({
  plugins: [react()],
  base: './',
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
