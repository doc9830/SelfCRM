import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// base: './' нужен, чтобы собранные ассеты корректно работали под Capacitor (file://)
export default defineConfig({
  base: './',
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
