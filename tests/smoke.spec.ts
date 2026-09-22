import { describe, expect, it } from 'vitest'

// Root workspace smoke (task 1.4): proves the pnpm workspace install produced
// a resolvable vitest toolchain at the repo root.
describe('workspace root smoke', () => {
  it('runs vitest from the workspace root', () => {
    expect(typeof describe).toBe('function')
  })
})
