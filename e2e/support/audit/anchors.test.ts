// 5.3 审计锚单测（Hard Rule 落 test 面）：两段——
//   ① 对当前仓零残留：六锚（no-watch/零迁移/发现面只读+白名单/web 无编排/技能引用零悬空）
//      全量跑批断言空 findings（`pnpm test` 单测门常驻——审计锚的第一落点）；
//   ② 规则自证（lint-selftest 同形制）：临时目录负样例种植 → 逐规则拦截断言 → 清理
//      （引擎漏报 = 审计失效；豁免行 audit-allow 语义一并锁定）。
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  auditAbsorptionWhitelist,
  auditDiscoveryReadOnlyFace,
  auditForgeNoWatchBackflow,
  auditNoLegacyMigrationTool,
  auditSkillReferencesResolved,
  auditWebNoOrchestration,
  M3_DEFERRED_SKILL_REFS,
  runAllSourceAuditAnchors,
} from './anchors.js'
import { stripSourceComments } from './source-scan.js'

const tempRoots: string[] = []

afterEach(() => {
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('5.3 审计锚①：当前仓零残留（SC2/SC8/SC3/web 无编排/技能零悬空）', () => {
  // 全仓同步扫描单跑 ~3s；全量套件并行负载下曾超 5s 默认限时（worker 竞争）——非回归红线，
  // 提时到 30s（findings 断言本身不受影响——零残留语义不变）
  it('六锚全量跑批 → 零 findings', () => {
    const findings = runAllSourceAuditAnchors()
    expect(findings, findings.map((f) => `${f.anchor}: ${f.detail}`).join('\n')).toEqual([])
  }, 30_000)

  it('吸收白名单常量封闭集（DOC_KIND_FILES 七类 + FRONTMATTER_KEYS 四键）', () => {
    expect(auditAbsorptionWhitelist()).toEqual([])
  })

  it('M3 豁免清单封闭记载（六技能——扩池须附裁决出处）', () => {
    expect(M3_DEFERRED_SKILL_REFS).toEqual(['eval', 'gen-contracts', 'gen-journeys', 'gen-test-scripts', 'consolidate-specs', 'clean-code'])
  })
})

describe('5.3 审计锚②：规则自证（负样例种植 → 拦截断言——引擎漏报即审计失效）', () => {
  function plantRepo(): string {
    const root = mkdtempSync(join(tmpdir(), 'dsh-forge-audit-selftest-'))
    tempRoots.push(root)
    return root
  }

  it('watch 依赖/调用 + 轮询守护 + 回流模块名 → 四路拦截', () => {
    const root = plantRepo()
    const write = (rel: string, content: string): void => {
      mkdirSync(join(root, rel, '..'), { recursive: true })
      writeFileSync(join(root, rel), content, 'utf8')
    }
    write('packages/core/src/forge/tasks/watch-impl.ts', `import { watch } from 'node:fs'\nfs.watch(dir, cb)\nsetInterval(() => rescan(), 5000)\n`)
    write('packages/core/src/forge/workspace/backflow-sync.ts', 'export const x = 1\n')
    write('packages/plugin-forge/src/bad.ts', `import chokidar from 'chokidar'\n`)
    const findings = auditForgeNoWatchBackflow(root)
    const rules = new Set(findings.map((f) => f.detail.match(/\[([a-z-]+)\]/)?.[1]))
    expect(findings.length).toBeGreaterThanOrEqual(4)
    expect(rules).toEqual(new Set(['fs-watch-named-import', 'fs-watch-call', 'polling-daemon', 'watch-dep-import', 'forbidden-module-name']))
    expect(findings.some((f) => f.detail.includes('backflow-sync.ts') && f.detail.includes('forbidden-module-name'))).toBe(true)
  })

  it('旧仓迁移工具标识 → 拦截（WORKSPACE_MIGRATIONS 版本线不误伤）', () => {
    const root = plantRepo()
    const write = (rel: string, content: string): void => {
      mkdirSync(join(root, rel, '..'), { recursive: true })
      writeFileSync(join(root, rel), content, 'utf8')
    }
    write('packages/core/src/forge/tasks/convert.ts', 'export function migrateLegacyTasks(): void {}\n')
    write('packages/core/src/forge/workspace/migrations.ts', 'export const WORKSPACE_MIGRATIONS = []\n')
    const findings = auditNoLegacyMigrationTool(root)
    expect(findings).toHaveLength(1)
    expect(findings[0]!.detail).toContain('migrateLegacyTasks')
    expect(findings[0]!.detail).toContain('legacy-migration-tool')
  })

  it('发现面写调用 / fs 导入集漂移 / 阀门标记缺席 → 三路拦截', () => {
    const root = plantRepo()
    const write = (rel: string, content: string): void => {
      mkdirSync(join(root, rel, '..'), { recursive: true })
      writeFileSync(join(root, rel), content, 'utf8')
    }
    write(
      'packages/core/src/forge/workspace/discovery.ts',
      `import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'\nwriteFileSync(p, 'x')\n`,
    )
    const findings = auditDiscoveryReadOnlyFace(root)
    const details = findings.map((f) => f.detail).join('\n')
    expect(details).toContain('[discovery-fs-write]')
    expect(details).toContain('writeFileSync(')
    expect(details).toContain('≠ 读三件套封闭集')
    expect(details).toContain('INSERT OR IGNORE')
  })

  it('web 写动词调用形 / dispatchPrompt / 数据层 import / fs 写 → 四路拦截（submitTaskTransition 人类通道不误伤）', () => {
    const root = plantRepo()
    const write = (rel: string, content: string): void => {
      mkdirSync(join(root, rel, '..'), { recursive: true })
      writeFileSync(join(root, rel), content, 'utf8')
    }
    write(
      'apps/web/src/views/bad.tsx',
      [
        'import { openDatabase } from "@dsh-forge/core"',
        'const dispatchPrompt = build(x)',
        'await claimTask(input)',
        'writeFileSync(p, "x")',
        'const ok = await submitTaskTransition(client, payload) // 人类通道 RPC——不误伤',
      ].join('\n'),
    )
    const findings = auditWebNoOrchestration(root)
    const rules = new Set(findings.map((f) => f.detail.match(/\[([a-z-]+)\]/)?.[1]))
    expect(rules).toEqual(new Set(['web-data-layer-import', 'web-dispatch-prompt', 'web-write-verb-call', 'web-fs-write']))
    expect(findings.every((f) => !f.detail.includes('submitTaskTransition'))).toBe(true)
  })

  it('悬空技能引用 → 拦截；挂载名（裸名形·2.4 前缀缝消灭）与 M3 豁免名解析通过', () => {
    const root = plantRepo()
    const write = (rel: string, content: string): void => {
      mkdirSync(join(root, rel, '..'), { recursive: true })
      writeFileSync(join(root, rel), content, 'utf8')
    }
    mkdirSync(join(root, 'packages/plugin-forge/skills/run-tests'), { recursive: true })
    writeFileSync(join(root, 'packages/plugin-forge/skills/run-tests/SKILL.md'), '# run-tests\n', 'utf8')
    write(
      'packages/core/src/forge/tasks/prompt/templates/fake.ts',
      [
        'export const a = \'Skill(skill="run-tests")\'', // 裸名 = dsh 挂载名（2.4 前缀缝消灭后形制）→ 挂载集命中
        'export const b = \'Skill(skill="ghost-skill")\'', // 裸名悬空 → 拦截（executor 将调用不存在的技能）
        'export const c = \'Skill(skill="forge:eval")\'', // forge: 前缀 + M3 豁免清单 → 通过
        'export const d = \'Skill(skill="forge:execute-task")\'', // forge: 前缀悬空 → 拦截
      ].join('\n'),
    )
    const findings = auditSkillReferencesResolved(root)
    expect(findings).toHaveLength(2)
    expect(findings.some((f) => f.detail.includes('ghost-skill') && f.detail.includes('悬空'))).toBe(true)
    expect(findings.some((f) => f.detail.includes('forge:execute-task') && f.detail.includes('悬空'))).toBe(true)
  })

  it('audit-allow 行豁免（使用须在执行记录说明理由）+ 注释剥离保行号', () => {
    const root = plantRepo()
    const write = (rel: string, content: string): void => {
      mkdirSync(join(root, rel, '..'), { recursive: true })
      writeFileSync(join(root, rel), content, 'utf8')
    }
    write('packages/core/src/forge/tasks/allowed.ts', 'const stopper = fs.watch(p, cb) // audit-allow 5.3 自证（豁免面由执行记录承载理由）\n')
    const findings = auditForgeNoWatchBackflow(root).filter((f) => f.detail.includes('allowed.ts'))
    expect(findings, 'audit-allow 行整体豁免——命中不计').toEqual([])
    const stripped = stripSourceComments(['// 注释 fs.watch(x) 不计', 'const a = 1', '/* 块', ' 注释 */ const b = 2'].join('\n'))
    expect(stripped.split('\n')).toHaveLength(4) // 块注释空格替身——行号保真
    expect(stripped.split('\n')[0]!.trim()).toBe('')
    expect(stripped.split('\n')[2]!.trim()).toBe('')
    expect(stripped.split('\n')[3]!).toContain('const b = 2')
  })
})
