// bug 63a9a2b8 修复面单测（fix-17）——仓外副本变体构造器 + 五件 entry 冷启动解析
// 行为锚判据（e2e/support/forge-combo.ts bundleResolutionGaps）双极性自证：
// 闭包在场正向绿 / 闭包缺席反向红（CT-NPM-05 反例红依据）。
// 判据域 = 装载/解析行为面（Node node_modules 上溯 + exports["."] 声明物存在性），
// 不锚物化布局（stale-anchor 三律——布局候选仅作为解析基扩展）。
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { bundleResolutionGaps } from '../../../e2e/support/forge-combo.js'
import { copyVariantRootDeps, stripPatchConfig } from '../../../scripts/build-forge-copy-variant.mjs'

const cleanups: string[] = []
afterEach(() => {
  for (const dir of cleanups.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function tmpRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), 'fcombo-copy-variant-'))
  cleanups.push(dir)
  return dir
}

/** 最小六包 fixture 仓（manifests only——copyVariantRootDeps 只读 union 面） */
function seedMiniRepo(root: string, memberManifests: Record<string, Record<string, unknown>>): string {
  const pluginsDir = join(root, 'plugins')
  const forge = memberManifests.forge ?? {}
  mkdirSync(join(pluginsDir, 'forge'), { recursive: true })
  writeFileSync(
    join(pluginsDir, 'forge', 'package.json'),
    JSON.stringify({
      name: '@dsh-forge/forge',
      version: '0.0.1',
      dependencies: Object.fromEntries(
        ['project', 'spec', 'task-loop', 'expert-squad', 'knowledge'].map((id) => [`@dsh-forge/${id}`, `file:../${id}`]),
      ),
      ...forge,
    }),
  )
  for (const id of ['project', 'spec', 'task-loop', 'expert-squad', 'knowledge']) {
    mkdirSync(join(pluginsDir, id), { recursive: true })
    writeFileSync(join(pluginsDir, id, 'package.json'), JSON.stringify({ name: `@dsh-forge/${id}`, version: '0.0.1', ...memberManifests[id] }))
  }
  return pluginsDir
}

describe('build-forge-copy-variant: copyVariantRootDeps（union 闭包物化清单）', () => {
  it('六包 dependencies/devDependencies/peerDependencies 全量 union', () => {
    const root = tmpRoot()
    seedMiniRepo(root, {
      project: { dependencies: { 'better-sqlite3': '13.0.3', zod: '4.6.6' }, devDependencies: { '@deepseek-ai/dsh-session': '0.2.2-rc.1' }, peerDependencies: { '@deepseek-ai/cordis': '4.0.4' } },
      'expert-squad': { dependencies: { chokidar: '5.0.0' }, devDependencies: { '@deepseek-ai/dsh-storage-domain': '0.2.2-rc.1' } },
    })
    const deps = copyVariantRootDeps(root)
    expect(deps['better-sqlite3']).toBe('13.0.3')
    expect(deps['@deepseek-ai/dsh-session']).toBe('0.2.2-rc.1')
    expect(deps['@deepseek-ai/dsh-storage-domain']).toBe('0.2.2-rc.1')
    expect(deps['@deepseek-ai/cordis']).toBe('4.0.4')
    expect(deps.chokidar).toBe('5.0.0')
  })

  it('排除闭包键与检出树协议 spec（@dsh-forge/*、workspace:/file: 不入根清单）', () => {
    const root = tmpRoot()
    seedMiniRepo(root, {
      project: {
        dependencies: { '@dsh-forge/project': 'file:../project', '@dsh-forge/lib-db': 'workspace:*', 'zod': '4.6.6' },
        devDependencies: { '@dsh-forge/contracts': 'workspace:*' },
      },
    })
    const deps = copyVariantRootDeps(root)
    expect(Object.keys(deps).filter((k) => k.startsWith('@dsh-forge/'))).toEqual([])
    expect(Object.values(deps).filter((v) => v.startsWith('workspace:') || v.startsWith('file:'))).toEqual([])
    expect(deps.zod).toBe('4.6.6')
  })
})

describe('build-forge-copy-variant: stripPatchConfig（CT-NPM-05 config 缺失变体）', () => {
  const sample = [
    '# comment kept',
    '- insert:',
    '    - id: project',
    "      name: '@dsh-forge/project'",
    '      config:',
    '        home: !!js process.env.DSH_HOME',
    '        dbFile: !!js process.env.DSH_HOME && (process.env.DSH_HOME + \'/forge/db/forge/forge.db\')',
    '    - id: expert-squad',
    "      name: '@dsh-forge/expert-squad'",
    '    - id: knowledge',
    "      name: '@dsh-forge/knowledge'",
    '      config:',
    '        dbFile: !!js >-',
    '          process.env.DSH_HOME && (process.env.DSH_HOME +',
    "          '/forge/db/forge/forge.db')",
  ].join('\n')

  it('config 段整段移除（含 !!js 折叠块后继行），插行与裸行原样保留', () => {
    const stripped = stripPatchConfig(sample)
    expect(stripped).not.toMatch(/config:/)
    expect(stripped).not.toContain('dbFile')
    expect(stripped).not.toContain('home: !!js')
    expect(stripped).toContain('- id: project')
    expect(stripped).toContain("name: '@dsh-forge/project'")
    expect(stripped).toContain('- id: expert-squad')
    expect(stripped).toContain("name: '@dsh-forge/expert-squad'")
    expect(stripped).toContain('- id: knowledge')
    expect(stripped).toContain('# comment kept')
  })

  it('无 config 段文本幂等（裸行 patch 原样通过）', () => {
    const bare = '- insert:\n    - id: expert-squad\n      name: \'@dsh-forge/expert-squad\'\n'
    expect(stripPatchConfig(bare)).toBe(bare)
  })
})

describe('forge-combo: bundleResolutionGaps（五件 entry 冷启动解析行为锚）', () => {
  /** 单包解析基 fixture：node_modules/@dsh-forge/<id> 带 ESM-only exports["."] 声明物 */
  function seedResolvableRoot(root: string, id: string): string {
    const pkgDir = join(root, 'node_modules', '@dsh-forge', id)
    mkdirSync(pkgDir, { recursive: true })
    writeFileSync(join(pkgDir, 'package.json'), JSON.stringify({ name: `@dsh-forge/${id}`, version: '0.0.1', exports: { '.': { import: './index.js' } } }))
    writeFileSync(join(pkgDir, 'index.js'), 'export {}\n')
    return root
  }

  it('正向绿：解析基闭包在场 → 零缺口', () => {
    const root = tmpRoot()
    for (const id of ['project', 'spec', 'task-loop', 'expert-squad', 'knowledge']) seedResolvableRoot(root, id)
    expect(bundleResolutionGaps([root])).toEqual([])
  })

  it('反向红：闭包缺席 → 逐件缺口回报（CT-NPM-05 反例红判据）', () => {
    const root = tmpRoot()
    seedResolvableRoot(root, 'project')
    const gaps = bundleResolutionGaps([root])
    expect(gaps.length).toBe(4)
    expect(gaps.some((g) => g.includes('@dsh-forge/project'))).toBe(false)
    expect(gaps.some((g) => g.includes('@dsh-forge/knowledge'))).toBe(true)
  })

  it('多解析基任一命中即绿（副本 forge 目录 / 根 hoist 双基）', () => {
    const forgeBase = tmpRoot()
    seedResolvableRoot(forgeBase, 'project')
    const rootBase = tmpRoot()
    for (const id of ['spec', 'task-loop', 'expert-squad', 'knowledge']) seedResolvableRoot(rootBase, id)
    expect(bundleResolutionGaps([forgeBase, rootBase])).toEqual([])
  })
})
