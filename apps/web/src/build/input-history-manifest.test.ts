// input-history 双真相源断言单测（vite.config 构建期消费的纯函数面回归）。
// 真源在场一致性由 apps/web vite build 实测（assertInputHistoryManifest 插件跑真文件）。
import { describe, expect, it } from 'vitest'
import { assertInputHistorySteeringLine } from './input-history-manifest.js'

const VALID_BLOCK = `const inputHistoryClient: ProductClientEntry = {
  id: '@dsh-forge/input-history',
  url: \`input-history-client.js?rev=x\`,
  rev: 'x',
  inject: ['a'],
}
`

describe('assertInputHistorySteeringLine（inject 双真相源构建期断言）', () => {
  it('一致 = 通过；掌舵行缺席 = fail-loud', () => {
    expect(() => assertInputHistorySteeringLine(VALID_BLOCK, { name: '@dsh-forge/input-history', inject: ['a'] })).not.toThrow()
    expect(() => assertInputHistorySteeringLine('// 无锚点', { name: 'x', inject: [] })).toThrow(/掌舵行缺席/)
  })

  it('id 漂移 = fail-loud', () => {
    expect(() =>
      assertInputHistorySteeringLine(VALID_BLOCK, { name: '@dsh-forge/other', inject: ['a'] }),
    ).toThrow(/id.*漂移/)
  })

  it('inject 清单漂移（成员/缺 inject）= fail-loud', () => {
    expect(() =>
      assertInputHistorySteeringLine(VALID_BLOCK, { name: '@dsh-forge/input-history', inject: ['b'] }),
    ).toThrow(/inject \[.*\] 与包.*漂移/)
    const noInject = VALID_BLOCK.replace("  inject: ['a'],\n", '')
    expect(() =>
      assertInputHistorySteeringLine(noInject, { name: '@dsh-forge/input-history', inject: ['a'] }),
    ).toThrow(/缺 inject/)
    // 双侧皆空 = 一致
    expect(() =>
      assertInputHistorySteeringLine(noInject, { name: '@dsh-forge/input-history', inject: [] }),
    ).not.toThrow()
  })
})
