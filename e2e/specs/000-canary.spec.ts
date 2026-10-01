import { expect, test } from '@playwright/test'

// G2 runner 自检（非业务冒烟——electron 面随 1.4 接入；此处仅证明门入口可跑）。
test('playwright runner wired (G2 gate entry)', () => {
  expect(true).toBe(true)
})
