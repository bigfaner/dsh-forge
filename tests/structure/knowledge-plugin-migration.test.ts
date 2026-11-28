// 结构 pin——knowledge-plugin-migration 提案验收 1/2/4（结构门/残留核销/行为零变化随迁锚）。
// 正本：.forge/docs/proposals/knowledge-plugin-migration/proposal.md 四、验收 1/2/4 +
// 评审 M4 随迁锚清单 + testing/contracts/shared-anchors-channels.md（CT-KN-CH 通道键契约）。
// 只断言仓库形态，不测行为（测试策略 docs/conventions/testing/core.md 结构层边界）。
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { KNOWLEDGE_CHANNELS } from '@dsh-forge/lib-api/channels'
import { createForgeRpcClient } from '../../plugins/knowledge/ui/rpc-channels.js'

const ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..')
const rel = (...p: string[]): string => join(ROOT, ...p)

/** 源码树文本扫描（跳过 node_modules/dist/.git——旧位路径引用实扫判据） */
function scanSources(dir: string, probe: (file: string) => void, exts = ['.ts', '.tsx', '.mjs', '.json', '.md', '.yml']): void {
  const base = rel(dir)
  if (!existsSync(base)) return
  for (const e of readdirSync(base, { withFileTypes: true })) {
    const p = join(base, e.name)
    if (e.isDirectory()) {
      if (['node_modules', 'dist', '.git', '.pnpm'].includes(e.name)) continue
      scanSources(join(dir, e.name), probe, exts)
    } else if (exts.some((ext) => e.name.endsWith(ext))) {
      if (readFileSync(p, 'utf8').includes('packages/plugins/knowledge') || readFileSync(p, 'utf8').includes('plugins/project/ui/knowledge')) probe(p)
    }
  }
}

describe('验收1 结构门——plugins/knowledge 三目录制齐备', () => {
  it('三目录 + skills 随包在场（host/ui/shared/skills）', () => {
    for (const d of ['host', 'ui', 'shared', 'skills', 'tests']) {
      expect(existsSync(rel('plugins', 'knowledge', d)), `plugins/knowledge/${d} 在场`).toBe(true)
    }
  })

  it('包根配置件：exports 双键（. / ./client）+ 双 bundle 脚本 + cordis peerDep + contracts/path-key devDeps', () => {
    const pkg = JSON.parse(readFileSync(rel('plugins', 'knowledge', 'package.json'), 'utf8')) as {
      name: string
      exports: Record<string, unknown>
      scripts: Record<string, string>
      peerDependencies?: Record<string, string>
      devDependencies?: Record<string, string>
      dependencies?: Record<string, string>
    }
    expect(pkg.name).toBe('@dsh-forge/knowledge')
    expect(pkg.exports['.']).toBeDefined()
    expect(pkg.exports['./client']).toBeDefined()
    expect(pkg.scripts.build).toContain('clean-dist.mjs')
    expect(pkg.scripts.build).toContain('bundle-host.mjs')
    expect(pkg.scripts.build).toContain('bundle-client.mjs')
    expect(pkg.scripts.prepack).toContain('self-containment')
    expect(pkg.peerDependencies?.['@deepseek-ai/cordis'], 'cordis peerDep 补齐').toBeDefined()
    expect(pkg.devDependencies?.['@dsh-forge/lib-api'], 'lib-api devDeps（构建期内联）').toBeDefined()
    expect(pkg.devDependencies?.['@dsh-forge/path-key'], 'path-key devDeps（构建期内联）').toBeDefined()
    expect(pkg.dependencies?.['better-sqlite3'], 'better-sqlite3 依赖零残留（1.40 node:sqlite 迁移）').toBeUndefined()
    expect(pkg.devDependencies?.['@dsh-forge/lib-db'], 'lib-db 持久层保持 devDependencies（bundle 内联闭包）').toBeDefined()
  })

  it('双 tsconfig 在场（tsconfig.json + tsconfig.client.json）', () => {
    expect(existsSync(rel('plugins', 'knowledge', 'tsconfig.json'))).toBe(true)
    expect(existsSync(rel('plugins', 'knowledge', 'tsconfig.client.json'))).toBe(true)
  })
})

describe('验收1/2 旧位零残留 + project 白名单口径', () => {
  it('旧位 packages/plugins/knowledge 零存在', () => {
    expect(existsSync(rel('packages', 'plugins', 'knowledge')), '旧位单包已退役删除').toBe(false)
  })

  it('全仓源码树旧位路径引用零命中（红-first——失败回显命中文件）', () => {
    const hits: string[] = []
    for (const dir of ['apps', 'plugins', 'packages', 'lib', 'tests', 'e2e']) {
      scanSources(dir, (file) => { if (file !== fileURLToPath(import.meta.url)) hits.push(file) }) // 自身探针字面豁免
    }
    expect(hits, `旧位路径引用残留：${hits.join(', ')}`).toEqual([])
  })

  it('project 白名单口径 pin 在场（验收2 grep 判据承载——具名常量 + 逐条理由注释）', () => {
    const pin = rel('plugins', 'project', 'ui', 'knowledge-retirement.pin.test.ts')
    expect(existsSync(pin), 'knowledge-retirement.pin.test.ts 在场').toBe(true)
    const text = readFileSync(pin, 'utf8')
    expect(text).toContain('showKnowledge')
    expect(text).toContain('deriveKnowledgeDir')
  })
})

describe('CT-KN-CH 通道键结构 pin（knowledge 侧切片 = contracts 本尊，双侧同钉）', () => {
  const noopTransport = async (): Promise<unknown> => ({ ok: true, data: null })
  const client = createForgeRpcClient(noopTransport)

  it('knowledge 切片键集合逐字 = KNOWLEDGE_CHANNELS 七键（任一键漂移即红）', () => {
    expect(Object.keys(client.knowledge).sort()).toEqual(Object.keys(KNOWLEDGE_CHANNELS).sort())
    expect(Object.values(KNOWLEDGE_CHANNELS)).toEqual([
      'forge:knowledge/browse',
      'forge:knowledge/listEntries',
      'forge:knowledge/entryDetail',
      'forge:knowledge/heat',
      'forge:knowledge/sessionRecall',
      'forge:knowledge/entryAction',
      'forge:knowledge/recallFeedback',
    ])
  })
})

describe('契约锚实锚核查（shared-anchors-channels.md A-KN-*——源码级在场）', () => {
  const read = (...p: string[]): string => readFileSync(rel(...p), 'utf8')

  it('A-KN-1/2/3 面板锚：data-dswf-view=knowledge / data-dswf-knowledge-view / data-dswf-kn-anchor', () => {
    expect(read('plugins', 'knowledge', 'ui', 'KnowledgePanel.tsx')).toContain('data-dswf-view="knowledge"')
    const view = read('plugins', 'knowledge', 'ui', 'KnowledgeView.tsx')
    expect(view).toContain('data-dswf-knowledge-view')
    expect(view).toContain('data-dswf-kn-anchor')
  })

  it('A-KN-6/7 召回锚：data-dswf-pane=recall + face 实锚三态 {empty, loading, error} + 统计面（ready 态）', () => {
    const tab = read('plugins', 'knowledge', 'ui', 'RecallTab.tsx')
    expect(tab).toContain('data-dswf-pane="recall"')
    expect(tab).toContain('data-dswf-recall-face="empty"')
    expect(tab).toContain('data-dswf-recall-face="loading"')
    expect(tab).toContain('data-dswf-recall-face="error"')
    expect(tab).toContain('data-dswf-recall-stats')
  })

  it('A-KN-8 门控诊断读数：faces registered console.info 里程碑（registered 面清单）', () => {
    expect(read('plugins', 'knowledge', 'ui', 'faces.ts')).toContain('knowledge faces registered=')
  })
})

describe('验收4 M4 随迁锚清单逐项在场（评审 M4 + 圆桌补项）', () => {
  it('tests/knowledge 旅程池 ≥12 旅程（执行入口 tests/knowledge 不变锚）', () => {
    const entries = readdirSync(rel('tests', 'knowledge'), { withFileTypes: true }).filter((e) => e.isDirectory())
    expect(entries.length, `旅程池目录数=${entries.length}`).toBeGreaterThanOrEqual(12)
  })

  it('pin-06/07/21 三 pin 随迁在场', () => {
    expect(existsSync(rel('tests', 'contract', 'pin-06-system-prompt-section.test.ts'))).toBe(true)
    expect(existsSync(rel('tests', 'contract', 'pin-07-cordis-services.test.ts'))).toBe(true)
    expect(existsSync(rel('tests', 'contract', 'pin-21-knowledge-entryaction-golden.test.ts'))).toBe(true)
  })

  it('scaffold 依赖闭包/导出面锚 + installer-pipeline 锚在场', () => {
    expect(existsSync(rel('tests', 'structure', 'scaffold.test.ts'))).toBe(true)
    expect(existsSync(rel('tests', 'structure', 'installer-pipeline.test.ts'))).toBe(true)
  })

  it('e2e/support knowledge 夹具锚（knowledge-db + knowledge-golden）在场', () => {
    expect(existsSync(rel('e2e', 'support', 'knowledge-db.ts'))).toBe(true)
    expect(existsSync(rel('e2e', 'support', 'knowledge-golden'))).toBe(true)
  })

  it('host 侧 knowledge-rpc 测试锚在场（apps/host/src/ipc/knowledge-rpc.test.ts）', () => {
    expect(existsSync(rel('apps', 'host', 'src', 'ipc', 'knowledge-rpc.test.ts'))).toBe(true)
  })

  it('通道键随迁 pin 双侧在场（knowledge 侧 channels-pin + project 侧 dock-tabs mirror pin）', () => {
    expect(existsSync(rel('plugins', 'knowledge', 'ui', 'channels-pin.test.ts'))).toBe(true)
    expect(existsSync(rel('plugins', 'project', 'ui', 'dock-tabs', 'rpc-channels-mirror-pin.test.ts'))).toBe(true)
  })

  it('locale 词条随迁（ui/locale.ts）+ profile.dev link 行指向新位', () => {
    expect(existsSync(rel('plugins', 'knowledge', 'ui', 'locale.ts'))).toBe(true)
    const profile = readFileSync(rel('apps', 'host', 'profile.dev', 'package.json'), 'utf8')
    expect(profile).toContain('"@dsh-forge/knowledge": "link:../../../plugins/knowledge"')
  })
})
