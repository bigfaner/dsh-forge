// 通用插件双真相源断言单测（quote-reference / super-composer 构建期消费面回归）。
// 真源在场一致性由 apps/web vite build 实测（assertPluginManifest 插件跑真文件）。
import { describe, expect, it } from 'vitest'
import { assertPluginSteeringLine } from './plugin-manifest.js'

const QUOTE_BLOCK = /const quoteReferenceClient: ProductClientEntry = \{([\s\S]*?)\n\}/
const VALID_BLOCK = `const quoteReferenceClient: ProductClientEntry = {
  id: '@dsh-forge/quote-reference',
  url: \`quote-reference-client.js?rev=x\`,
  rev: 'x',
  inject: ['@deepseek-ai/dsh-api-session-controller'],
}
`

describe('assertPluginSteeringLine（inject 双真相源构建期断言，通用形）', () => {
  it('一致 = 通过；掌舵行缺席 = fail-loud', () => {
    expect(() =>
      assertPluginSteeringLine(
        VALID_BLOCK,
        QUOTE_BLOCK,
        { name: '@dsh-forge/quote-reference', inject: ['@deepseek-ai/dsh-api-session-controller'] },
        '@dsh-forge/quote-reference',
      ),
    ).not.toThrow()
    expect(() =>
      assertPluginSteeringLine('// 无锚点', QUOTE_BLOCK, { name: 'x', inject: [] }, 'x'),
    ).toThrow(/掌舵行缺席/)
  })

  it('id 漂移 = fail-loud', () => {
    expect(() =>
      assertPluginSteeringLine(VALID_BLOCK, QUOTE_BLOCK, { name: '@dsh-forge/other', inject: ['a'] }, 'x'),
    ).toThrow(/id.*漂移/)
  })

  it('inject 清单漂移（成员/缺 inject）= fail-loud', () => {
    expect(() =>
      assertPluginSteeringLine(VALID_BLOCK, QUOTE_BLOCK, { name: '@dsh-forge/quote-reference', inject: ['b'] }, 'x'),
    ).toThrow(/inject \[.*\] 与包.*漂移/)
    const noInject = VALID_BLOCK.replace(/  inject: \[[^\]]*\],\n/, '')
    expect(() =>
      assertPluginSteeringLine(noInject, QUOTE_BLOCK, { name: '@dsh-forge/quote-reference', inject: ['a'] }, 'x'),
    ).toThrow(/缺 inject/)
    // 双侧皆空 = 一致
    expect(() =>
      assertPluginSteeringLine(noInject, QUOTE_BLOCK, { name: '@dsh-forge/quote-reference', inject: [] }, 'x'),
    ).not.toThrow()
  })
})
