// bug d36710e5 陈旧副本遮蔽探针自证——staleRuntimeShadowCopies + desktopRuntimeNodeModules
// （e2e/support/forge-combo.ts）正反双向验证：
// - 正向：runtime 无捆绑副本 / 副本带 dsh 字段（现行代）→ 零违例；
// - 反向（539b7413 复发形态）：knowledge 副本 0.30.6 无 dsh 字段 → 违例留痕
//   （pkg + version + 路径，调用侧 fail-loud 不静默误判五件层清单）；
// - runtime 发现面：自 CLI bin 上溯命中含 @dsh-forge scope 的 node_modules；缺席 fail-loud。
// 环境封闭：runtime 侧/源侧均落临时目录夹具（sourcePluginsRoot 注入），零真机依赖。
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { desktopRuntimeNodeModules, staleRuntimeShadowCopies } from '../../../e2e/support/forge-combo.js'

const SOURCE_VERSION = '0.34.1'

function makeSourceRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'shadow-src-'))
  for (const short of ['project', 'spec', 'task-loop', 'expert-squad', 'knowledge']) {
    mkdirSync(join(root, short), { recursive: true })
    writeFileSync(join(root, short, 'package.json'), JSON.stringify({ name: `@dsh-forge/${short}`, version: SOURCE_VERSION }))
  }
  return root
}

interface CopyOpts {
  name: string
  version: string
  /** 缺省写 dsh 字段（现行代形态）；false = 陈旧标记形态（无 dsh 字段） */
  withDsh?: boolean
}

/** runtime 夹具：node_modules/@dsh-forge/<short> 捆绑副本——返回 node_modules 路径 */
function makeRuntime(copies: readonly CopyOpts[]): string {
  const root = mkdtempSync(join(tmpdir(), 'shadow-runtime-'))
  const nm = join(root, 'node_modules')
  for (const c of copies) {
    const dir = join(nm, '@dsh-forge', c.name)
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({
        name: `@dsh-forge/${c.name}`,
        version: c.version,
        ...(c.withDsh === false ? {} : { dsh: { bundle: { patch: './cordis.patch.yml' }, client: { platform: 'web' } } }),
      }),
    )
  }
  return nm
}

describe('staleRuntimeShadowCopies（d36710e5 陈旧副本遮蔽探针）', () => {
  it('正向：runtime 无捆绑副本 → 零违例（无遮蔽）', () => {
    expect(staleRuntimeShadowCopies(makeRuntime([]), { sourcePluginsRoot: makeSourceRoot() })).toEqual([])
  })

  it('正向：捆绑副本带 dsh 字段（现行代形态）→ 零违例', () => {
    const nm = makeRuntime([
      { name: 'knowledge', version: SOURCE_VERSION },
      { name: 'project', version: '0.26.2' },
    ])
    expect(staleRuntimeShadowCopies(nm, { sourcePluginsRoot: makeSourceRoot() })).toEqual([])
  })

  it('反向（539b7413 复发形态）：knowledge 副本 0.30.6 无 dsh 字段 → 违例留痕（pkg + version + 路径）', () => {
    const nm = makeRuntime([
      { name: 'knowledge', version: '0.30.6', withDsh: false },
      { name: 'expert-squad', version: '0.29.4' },
    ])
    const violations = staleRuntimeShadowCopies(nm, { sourcePluginsRoot: makeSourceRoot() })
    expect(violations.length).toBe(1)
    expect(violations[0]?.pkg).toBe('@dsh-forge/knowledge')
    expect(violations[0]?.version).toBe('0.30.6')
    expect(violations[0]?.path).toContain(join('@dsh-forge', 'knowledge'))
    expect(violations[0]?.detail).toContain('陈旧副本遮蔽')
    expect(violations[0]?.detail).toContain('无 dsh 字段')
  })

  it('逐件覆盖：全部五件陈旧副本均被逐件回报（不收窄、不遗漏）', () => {
    const nm = makeRuntime(
      ['project', 'spec', 'task-loop', 'expert-squad', 'knowledge'].map((name) => ({ name, version: '0.0.1', withDsh: false })),
    )
    const flagged = staleRuntimeShadowCopies(nm, { sourcePluginsRoot: makeSourceRoot() }).map((v) => v.pkg).sort()
    expect(flagged).toEqual(['@dsh-forge/expert-squad', '@dsh-forge/knowledge', '@dsh-forge/project', '@dsh-forge/spec', '@dsh-forge/task-loop'])
  })
})

describe('desktopRuntimeNodeModules（d36710e5 runtime 发现面）', () => {
  it('正向：自 CLI bin 上溯命中含 @dsh-forge scope 的 node_modules', () => {
    const nm = makeRuntime([{ name: 'knowledge', version: '0.30.6', withDsh: false }])
    const resources = join(nm, '..', 'resources')
    mkdirSync(resources, { recursive: true })
    const bin = join(resources, 'dsh-cli.exe')
    writeFileSync(bin, '')
    expect(desktopRuntimeNodeModules(bin)).toBe(nm)
  })

  it('反向：上溯七层无 @dsh-forge scope → fail-loud throw（不静默）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'shadow-noscope-'))
    const bin = join(dir, 'dsh-cli.exe')
    writeFileSync(bin, '')
    expect(() => desktopRuntimeNodeModules(bin)).toThrow(/runtime node_modules 发现失败/)
  })
})
