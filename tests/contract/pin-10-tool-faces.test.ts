// G1 pin ⑰+⑱（M3 pin 池扩池 #17/#18，任务 5.1）：plugin 两包 tool 注册面代码审计。
// 权威：tech-design Appendix「契约面 pin 扩池（G1，M2 十六项之上）」第 17/18 项 +
// Testing Strategy 契约 pin 行（tool 面：dispatchTask 在场；claimTask(spawnWorker)/
// transitionTask/transitionFeature/setProposalMode 缺席——代码审计；两包 tool 面分置）。
// Hard Rule：pin = 机械断言（代码审计/枚举）——本文件扫描源码文本与常量面，不做行为装配
// （行为面在 packages/*/src/plugin.test.ts 临时 runtime 装配——两池互不替代）。
// #17（G1-11 集合改写落定——drift #1）：核心包 dispatchTask 在场 + 五缺席名（claimTask
// 旧名 spawnWorker 并断）；#18（两包分置）：核心六（FORGE_TOOL_NAMES）↔ spec 三
// （FORGE_SPEC_TOOL_NAMES）物理分置、互不越界、注册块逐行对账。
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FORGE_TOOL_NAMES } from '../../packages/plugin-forge/src/tools/index.js'
import { FORGE_SPEC_TOOL_NAMES } from '../../packages/plugin-forge-spec/src/tools/index.js'
import { ROOT } from './pins.js'

const CORE_TOOLS_DIR = join(ROOT, 'packages/plugin-forge/src/tools')
const SPEC_TOOLS_DIR = join(ROOT, 'packages/plugin-forge-spec/src/tools')

/** tool 定义文件清单（非测试源——装配/会话/格式化等支撑件排除后 = tool 定义件） */
function toolDefinitionFiles(dir: string): string[] {
  return readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
}

/** 机械抽取 tool 名面：`const TOOL = '<name>'` 行（两包 tool 定义件同型单源） */
function toolNameLiterals(dir: string): Map<string, string> {
  const names = new Map<string, string>()
  for (const file of toolDefinitionFiles(dir)) {
    const text = readFileSync(join(dir, file), 'utf8')
    const match = /^const TOOL = '([A-Za-z_][\w]*)'$/m.exec(text)
    if (match !== null) names.set(file, match[1]!)
  }
  return names
}

describe('pin ⑰ tool 面代码审计（G1-11「六在场/两缺席」M3 改写落定——drift #1）', () => {
  const coreLiterals = toolNameLiterals(CORE_TOOLS_DIR)

  it('核心包常量面 = 终态六员：dispatchTask 在场（Interface 4 列序）', () => {
    expect([...FORGE_TOOL_NAMES]).toEqual([
      'addTask',
      'submitTask',
      'queryTask',
      'createProposal',
      'transitionProposal',
      'dispatchTask',
    ])
    expect(FORGE_TOOL_NAMES).toContain('dispatchTask')
  })

  it('缺席面（五名——claimTask 旧名 spawnWorker 并断）：两包常量与源码 TOOL 字面量均不含', () => {
    const absent = ['claimTask', 'spawnWorker', 'transitionTask', 'transitionFeature', 'setProposalMode'] as const
    for (const name of absent) {
      expect(FORGE_TOOL_NAMES, `核心包 FORGE_TOOL_NAMES 不应含 ${name}`).not.toContain(name)
      expect(FORGE_SPEC_TOOL_NAMES, `spec 包 FORGE_SPEC_TOOL_NAMES 不应含 ${name}`).not.toContain(name)
      expect(
        [...coreLiterals.values(), ...toolNameLiterals(SPEC_TOOLS_DIR).values()],
        `两包 tool 定义件 TOOL 字面量不应含 ${name}`,
      ).not.toContain(name)
    }
  })

  it('源码枚举 ↔ 常量单源对账：TOOL 字面量集合恰 = 常量集合（核心六 / spec 三）', () => {
    expect([...coreLiterals.values()].sort()).toEqual([...FORGE_TOOL_NAMES].sort())
    expect([...toolNameLiterals(SPEC_TOOLS_DIR).values()].sort()).toEqual([...FORGE_SPEC_TOOL_NAMES].sort())
  })

  it('退役物理面：claim-task / spawn-worker 定义件不在场（3.5 退役——dist 勿进打包闭包同口径）', () => {
    const files = [...toolDefinitionFiles(CORE_TOOLS_DIR), ...toolDefinitionFiles(SPEC_TOOLS_DIR)]
    expect(files).not.toContain('claim-task.ts')
    expect(files).not.toContain('spawn-worker.ts')
  })

  it('注册块逐行对账：plugin index.ts 恰注册六员（tools.<name> 形——名面 = FORGE_TOOL_NAMES）', () => {
    const index = readFileSync(join(ROOT, 'packages/plugin-forge/src/index.ts'), 'utf8')
    for (const name of FORGE_TOOL_NAMES) {
      expect(index, `index.ts 应含 ctx.tools.register(tools.${name})`).toContain(`ctx.tools.register(tools.${name})`)
    }
    const registerCalls = index.match(/ctx\.tools\.register\(tools\.(\w+)\)/g) ?? []
    expect(registerCalls).toHaveLength(FORGE_TOOL_NAMES.length)
  })
})

describe('pin ⑱ 两包 tool 面分置（核心六 + spec 三——物理分置互不越界）', () => {
  it('spec 包常量面 = 三员：registerFeature / upsertFeatureDoc / validateFeatureTasks', () => {
    expect([...FORGE_SPEC_TOOL_NAMES]).toEqual(['registerFeature', 'upsertFeatureDoc', 'validateFeatureTasks'])
  })

  it('分置不越界：两包集合互斥（核心六 ∉ spec；spec 三 ∉ 核心）', () => {
    const core = new Set<string>(FORGE_TOOL_NAMES)
    for (const name of FORGE_SPEC_TOOL_NAMES) expect(core.has(name), `spec 名 ${name} 不应在核心包`).toBe(false)
    const spec = new Set<string>(FORGE_SPEC_TOOL_NAMES)
    for (const name of FORGE_TOOL_NAMES) expect(spec.has(name), `核心名 ${name} 不应在 spec 包`).toBe(false)
  })

  it('spec 注册块逐行对账：恰三员 + 零核心员混入', () => {
    const index = readFileSync(join(ROOT, 'packages/plugin-forge-spec/src/index.ts'), 'utf8')
    const registerCalls = index.match(/ctx\.tools\.register\(tools\.(\w+)\)/g) ?? []
    expect(registerCalls).toHaveLength(FORGE_SPEC_TOOL_NAMES.length)
    for (const name of FORGE_SPEC_TOOL_NAMES) {
      expect(index).toContain(`ctx.tools.register(tools.${name})`)
    }
    // 零核心 tool 混入（createForgeTools 不被 spec 包引用——物理分置）
    expect(index).not.toContain('createForgeTools')
    expect(index).not.toContain("from '../plugin-forge")
  })

  it('包边界审计：spec 包 dependencies 不含 plugin-forge（物理分置——L1 拆包轴）', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'packages/plugin-forge-spec/package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
    }
    expect(Object.keys(pkg.dependencies ?? {})).not.toContain('@dsh-forge/plugin-forge')
  })
})
