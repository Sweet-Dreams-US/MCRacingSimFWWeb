import { defineConfig } from 'vitest/config'

// Unit tests for the pure business logic (pricing, discounts, deposits,
// dashboard date math, accounting). These run in a plain Node environment —
// no DOM, no server clients — so they stay fast and deterministic.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Keep node_modules + the Android project out.
    exclude: ['node_modules', '.next', 'android-pos'],
  },
})
