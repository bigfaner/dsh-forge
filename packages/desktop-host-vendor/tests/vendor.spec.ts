import { describe, expect, it } from 'vitest'

import { VENDORED_UPSTREAM_SHA, describeVendor } from '../src/index'

describe('desktop-host-vendor skeleton', () => {
  it('pins the upstream SHA', () => {
    expect(VENDORED_UPSTREAM_SHA).toBe('c36ba648dc106d21fb32562793b3e3b9c8922bc4')
  })

  it('describes the projection state', () => {
    expect(describeVendor().projected).toBe(false)
  })
})
