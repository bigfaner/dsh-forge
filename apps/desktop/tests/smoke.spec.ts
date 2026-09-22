import { describe, expect, it } from 'vitest'

// Workspace smoke: verifies the vitest baseline resolves and runs inside the
// pnpm workspace scaffold (task 1.4).
describe('workspace scaffold smoke', () => {
  it('runs vitest inside apps/desktop', () => {
    expect(1 + 1).toBe(2)
  })
})
