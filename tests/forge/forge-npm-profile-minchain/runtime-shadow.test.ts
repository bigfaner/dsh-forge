// bug d36710e5/21f0e9a7 陈旧副本遮蔽探针自证——staleRuntimeShadowCopies +
// desktopInstallShadowLayers/desktopInstallShadowViolations（e2e/support/forge-combo.ts）
// 正反双向验证：
// - 正向：安装树候选层缺席（resources/runtime 目录不存在 + app.asar.unpacked 无
//   @dsh-forge——目标宿主实态形状）/ 副本带 dsh 字段（现行代）→ 零违例；
// - 反向（539b7413 复发形态）：knowledge 副本 0.30.6 无 dsh 字段 → 违例留痕
//   （pkg + version + 路径，调用侧 fail-loud 不静默误判五件层清单）；
// - 锚定纪律：发现面 = 目标宿主安装产物 exe 派生的安装树两候选层（runtime 捆绑层 +
//   app.asar.unpacked 捆绑层），缺席层零贡献——禁通道 CLI bin 上溯（harness 本检出
//   dev 依赖树与 desktop 通道零关，错树锚定 = 0.30.6 误报根因）。
// 环境封闭：安装树/源侧均落临时目录夹具（sourcePluginsRoot 注入），零真机依赖、零盘符字面。
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  desktopInstallShadowLayers,
  desktopInstallShadowViolations,
  staleRuntimeShadowCopies,
} from '../../../e2e/support/forge-combo.js'

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

describe('desktopInstallShadowLayers / desktopInstallShadowViolations（21f0e9a7 安装树锚）', () => {
  /** 假安装树：<root>/DSH Desktop.exe + resources/——返回 exe 路径 */
  function makeInstallTree(): string {
    const root = mkdtempSync(join(tmpdir(), 'shadow-install-'))
    mkdirSync(join(root, 'resources'), { recursive: true })
    const exe = join(root, 'DSH Desktop.exe')
    writeFileSync(exe, '')
    return exe
  }

  it('正向：候选层全缺席（目标宿主实态形状——resources/runtime 目录不存在 + app.asar.unpacked 无 @dsh-forge）→ 两层零贡献 + 零违例', () => {
    const exe = makeInstallTree()
    const layers = desktopInstallShadowLayers(exe)
    expect(layers.runtimeNodeModules).toBeUndefined()
    expect(layers.asarUnpackedNodeModules).toBeUndefined()
    expect(desktopInstallShadowViolations(exe, { sourcePluginsRoot: makeSourceRoot() })).toEqual([])
  })

  it('正向：runtime 捆绑层在场且副本带 dsh 字段（现行代形态）→ 零违例', () => {
    const exe = makeInstallTree()
    const nm = makeRuntime([{ name: 'knowledge', version: SOURCE_VERSION }])
    mkdirSync(join(exe, '..', 'resources', 'runtime'), { recursive: true })
    cpSync(nm, join(exe, '..', 'resources', 'runtime', 'node_modules'), { recursive: true })
    expect(desktopInstallShadowViolations(exe, { sourcePluginsRoot: makeSourceRoot() })).toEqual([])
  })

  it('反向：runtime 捆绑层陈旧副本（0.30.6 无 dsh 字段）→ 违例留痕（路径含 runtime 层）', () => {
    const exe = makeInstallTree()
    const nm = makeRuntime([{ name: 'knowledge', version: '0.30.6', withDsh: false }])
    mkdirSync(join(exe, '..', 'resources', 'runtime'), { recursive: true })
    cpSync(nm, join(exe, '..', 'resources', 'runtime', 'node_modules'), { recursive: true })
    const violations = desktopInstallShadowViolations(exe, { sourcePluginsRoot: makeSourceRoot() })
    expect(violations.length).toBe(1)
    expect(violations[0]?.pkg).toBe('@dsh-forge/knowledge')
    expect(violations[0]?.path).toContain(join('resources', 'runtime', 'node_modules'))
  })

  it('反向：app.asar.unpacked 捆绑层陈旧副本 → 违例留痕（路径含 asar 解包层）', () => {
    const exe = makeInstallTree()
    const nm = makeRuntime([{ name: 'knowledge', version: '0.30.6', withDsh: false }])
    mkdirSync(join(exe, '..', 'resources', 'app.asar.unpacked'), { recursive: true })
    cpSync(nm, join(exe, '..', 'resources', 'app.asar.unpacked', 'node_modules'), { recursive: true })
    const violations = desktopInstallShadowViolations(exe, { sourcePluginsRoot: makeSourceRoot() })
    expect(violations.length).toBe(1)
    expect(violations[0]?.path).toContain(join('resources', 'app.asar.unpacked', 'node_modules'))
  })
})
