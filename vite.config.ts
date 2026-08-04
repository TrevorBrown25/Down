/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'node',
    // The sim files play hundreds of whole seasons. They are measurements, not
    // unit tests, and they run long enough to trip the 5s default under load.
    testTimeout: 30_000,
  },
})
