// @feature:knowledge
// Journey: knowledge-isolated-profile-assembly（隔离 profile 装配下技能物化与 tool 在场）。
// 溯源（断言-契约溯源，条目 id 注于每条断言）：
//   .forge/docs/proposals/knowledge-stage1-foundation/testing/contracts/knowledge-isolated-profile-assembly/contract.md
//   （CT-isolated-profile-1..3 ← journey J3-1..J3-3；SC-1 机械可检面·阶段①部分）。
// 策略：vitest 装配链面——knowledgePlugin 真身 + 结构化 ctx 子面（tools/systemPrompt/
// reflect/emit 收集器，faces.ts 官方面结构兼容）驱动装配，断言三面在场性（机械可检，
// 不依赖模型凭据）；profile 物化机械（paths/presets/overlay）真机面 skip 留痕。
// 面③不一致已消解：fix-2（659ab59a）落地 registerProject 第九法 + knowledge-register
//   事件域（storage/diag.ts）——skip 解除，落真断言（成败两径）。
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { DIAG_EVENT, type DiagEventPayload } from '../../../packages/contracts/src/index.js'
import knowledgePlugin from '../../../packages/plugins/knowledge/src/index.js'
import type {
  KnowledgeContextFace,
  KnowledgePromptSection,
  KnowledgeToolDefinition,
} from '../../../packages/plugins/knowledge/src/tools/index.js'
import type { KnowledgeService } from '../../../packages/plugins/knowledge/src/service/types.js'
import { openKnowledgeDatabase } from '../../../packages/plugins/knowledge/src/storage/index.js'

/** 'knowledge' 服务 provide 名（A2 去前缀键——index.ts KNOWLEDGE_SERVICE_NAME 同值，host 在场判定键） */
const KNOWLEDGE_SERVICE_KEY = 'knowledge'

const roots: string[] = []
function tmpRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'knowledge-j-profile-'))
  roots.push(root)
  return root
}
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
})

/** 结构化 ctx 子面收集器（faces.ts 官方面结构兼容——记录注册/段/provide/诊断流） */
type AgentCreatedHandler = (payload: { agent: unknown }) => unknown

function fakeCtx(): {
  ctx: KnowledgeContextFace
  tools: KnowledgeToolDefinition[]
  sections: KnowledgePromptSection[]
  provides: Map<string, unknown>
  diag: DiagEventPayload[]
  agentCreated: AgentCreatedHandler[]
} {
  const tools: KnowledgeToolDefinition[] = []
  const sections: KnowledgePromptSection[] = []
  const provides = new Map<string, unknown>()
  const diag: DiagEventPayload[] = []
  const agentCreated: AgentCreatedHandler[] = []
  const ctx: KnowledgeContextFace = {
    on: ((event: string, handler: AgentCreatedHandler) => {
      if (event === 'agent/created') agentCreated.push(handler)
      return () => {}
    }) as KnowledgeContextFace['on'],
    tools: { register: (definition) => (tools.push(definition), () => {}) },
    systemPrompt: { section: (s) => (sections.push(s), () => {}) },
    reflect: {
      get: () => undefined,
      provide: (name: string, service: unknown) => (provides.set(name, service), () => {}),
    },
    emit: (event: 'diag/log', payload: DiagEventPayload) => {
      if (event === DIAG_EVENT) diag.push(payload)
    },
  }
  return { ctx, tools, sections, provides, diag, agentCreated }
}

function registryRowCount(dbFile: string): number {
  const db = openKnowledgeDatabase(dbFile)
  // stage② v4：projects → knowledge_registry（ALTER RENAME——行集不变）
  const row = db.prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM knowledge_registry`).get()
  db.close()
  return row?.n ?? 0
}

describe('CT-isolated-profile-1（J3-1：仅 knowledge 行 → 装配面在场）', () => {
  it('success（面①②）：装配后 tool 面含 knowledge tool schema（结构可判定）+ 提示词段注册 + knowledge 服务 provide', () => {
    const root = tmpRoot()
    const dbFile = join(root, 'knowledge', 'knowledge.db')
    const { ctx, tools, sections, provides, agentCreated } = fakeCtx()
    const dispose = knowledgePlugin(ctx, {
      dbFile,
      projects: [{ wsPath: join(root, 'ws'), projectId: 'p-iso' }],
    })
    expect(typeof dispose).toBe('function')

    // 面②：knowledge tool schema 在场（结构可判定——name/object 根 schema/描述/输出渲染）
    expect(tools.map((t) => t.name).sort()).toEqual(['knowledge_browse', 'knowledge_read', 'knowledge_read_abstract', 'knowledge_reinstate', 'knowledge_search', 'knowledge_supersede', 'knowledge_write'])
    for (const tool of tools) {
      expect(tool.parameters.type).toBe('object') // JSON Schema object 根（注册面消费形状）
      expect(tool.description.length).toBeGreaterThan(0)
      expect(typeof tool.output.render).toBe('function')
      expect(typeof tool.execute).toBe('function')
    }
    // 提示词接线（fix-11 裁决 B 侧 Interface 3——bug 90d9b515 判例 c5e72025：静态段
    // forge:knowledge(910) 全局注册（装配期恰一段，固定文本无条件在场）；动态段
    // forge:knowledge-domains(911) 走 agent/created 时刻 scoped 注册。装配面锚 =
    // 订阅在场 + 根级段恰静态段一段）
    expect(sections).toHaveLength(1)
    expect(sections[0]?.name).toBe('forge:knowledge')
    expect(sections[0]?.order).toBe(910)
    expect(typeof sections[0]!.text).toBe('string')
    expect(sections[0]!.text as string).toContain('<knowledge-base>')
    expect(agentCreated).toHaveLength(1)
    // 'knowledge' 服务 provide（host 五通道句柄来源——在场判定键）
    expect(provides.has(KNOWLEDGE_SERVICE_KEY)).toBe(true)
    // knowledge.root 目录键声明（dirKeys.knowledge 反向拉取缝）
    expect(provides.has('dirKeys.knowledge')).toBe(true)
    dispose()
  })

  // 面③（注册表落行 + knowledge-register 事件）——fix-2（659ab59a）已落地第九法 +
  // knowledge-register 事件域（storage/diag.ts），skip 解除、落真断言。
  it('面③-成功径：registerProject 落注册行 + info 级 knowledge-register 事件产生', async () => {
    const root = tmpRoot()
    const dbFile = join(root, 'knowledge', 'knowledge.db')
    const { ctx, provides, diag } = fakeCtx()
    const dispose = knowledgePlugin(ctx, { dbFile })
    const service = provides.get(KNOWLEDGE_SERVICE_KEY) as KnowledgeService & {
      registerProject: (input: { wsPath: string; knowledgeDir?: string; projectId?: string }) => Promise<void>
    }

    const ws = join(root, 'ws-reg')
    await expect(service.registerProject({ wsPath: ws, projectId: 'p-reg' })).resolves.toBeUndefined()
    // 注册行落表（stage④ 1.4 全局注册：装配期全局库自启注册行 + 本项目行——两行）
    expect(registryRowCount(dbFile)).toBe(2)
    // info 级 knowledge-register 事件（SC-10 埋点，携 projectId）
    // stage④ 1.4：装配期全局库自启注册也发 knowledge-register——本项目事件按 projectId 定位
    const info = diag.find((d) => d.level === 'info' && d.event === 'knowledge-register' && d.projectId === 'p-reg')
    expect(info).toBeDefined()
    expect(info!.cwd).toBe(ws)
    expect(info!.projectId).toBe('p-reg')
    dispose()
  })

  it('面③-失败径：知识目录建失败 → 抛 + 注册行不落 + error 级 knowledge-register 事件', async () => {
    const root = tmpRoot()
    const dbFile = join(root, 'knowledge', 'knowledge.db')
    const { ctx, provides, diag } = fakeCtx()
    const dispose = knowledgePlugin(ctx, { dbFile })
    const service = provides.get(KNOWLEDGE_SERVICE_KEY) as KnowledgeService & {
      registerProject: (input: { wsPath: string; knowledgeDir?: string; projectId?: string }) => Promise<void>
    }

    // 父级为普通文件 → mkdir 失败：抛、零注册行、error 级事件留痕（fail-loud 不静默）
    const parentFile = join(root, 'parent-file')
    writeFileSync(parentFile, '占位', 'utf8')
    const ws = join(root, 'ws-fail')
    await expect(
      service.registerProject({ wsPath: ws, knowledgeDir: join(parentFile, 'sub', '.knowledge') }),
    ).rejects.toThrow()
    expect(registryRowCount(dbFile)).toBe(1) // 仅装配期全局注册行（项目行零落——失败径）
    expect(diag.some((d) => d.level === 'error' && d.event === 'knowledge-register')).toBe(true)
    dispose()
  })
})

describe('CT-isolated-profile-2（J3-2：重复装配幂等）', () => {
  it('success：同库重复装配（materialize 等价面）——注册表行数不变、装配面等价、无重复副作用', () => {
    const root = tmpRoot()
    const dbFile = join(root, 'knowledge', 'knowledge.db')
    const first = fakeCtx()
    const d1 = knowledgePlugin(first.ctx, { dbFile })
    d1()

    // 二次装配（同 profile 重复启动等价面）：装配产物等价、无重复堆积
    const second = fakeCtx()
    const d2 = knowledgePlugin(second.ctx, { dbFile })
    expect(second.tools.map((t) => t.name).sort()).toEqual(first.tools.map((t) => t.name).sort())
    expect(second.sections.map((s) => s.name)).toEqual(['forge:knowledge']) // fix-11 裁决 B：装配期恰静态全局段一段（动态段走 scoped）
    expect(second.agentCreated).toHaveLength(1)
    d2()

    // 注册表行数不变（零重复注册行——幂等；仅装配期全局注册行一份，无迁移源）
    expect(registryRowCount(dbFile)).toBe(1)
  })
})

// 评审 Major 补强：装配→订阅→注册全链断言——fakeCtx 派发 agent/created 后断言两段
// 实际落位（非仅订阅计数）；兼作 F1（1.7 真机发现）回归锚：注册径触发 rebuild，
// 绑定会话首 turn 动态段非空（不经 listEntries 静默重建）。
describe('CT-isolated-profile-1 补强（agent/created 派发全链——动态段落位 + 静态全局段锚）', () => {
  it('success：注册库在场时派发 agent/created → 该会话 scope 动态段 911 落位且 text 实值非空、根级静态段 910 在场；首 turn 动态段含顶域行（F1 注册径 rebuild）', async () => {
    const root = tmpRoot()
    const dbFile = join(root, 'knowledge', 'knowledge.db')
    const ws = join(root, 'ws')
    mkdirSync(join(ws, '.knowledge', 'frontend'), { recursive: true })
    writeFileSync(
      join(ws, '.knowledge', 'frontend', 'ui-token-anchor.md'),
      [
        '---',
        'title: UI 令牌取值锚',
        'summary: 取色/字/距按 DESIGN.md 令牌表，不凭记忆猜值',
        'keywords:',
        '  - ui',
        '  - token',
        'status: unconfirmed',
        'id: ui-token-anchor',
        'version_ts: \'2026-11-05T00:00:00.000Z\'',
        '---',
        '',
      ].join('\n'),
      'utf8',
    )
    const { ctx, provides, agentCreated, sections } = fakeCtx()
    const dispose = knowledgePlugin(ctx, {
      dbFile,
      projects: [{ wsPath: ws, projectId: 'p-iso-chain' }],
    })
    expect(agentCreated).toHaveLength(1)

    // 注册径（F1：触发入库 rebuild——首 turn 动态段供数就位）
    const service = provides.get(KNOWLEDGE_SERVICE_KEY) as KnowledgeService & {
      registerProject: (input: { wsPath: string; projectId?: string }) => Promise<void>
    }
    await expect(service.registerProject({ wsPath: ws, projectId: 'p-iso-chain' })).resolves.toBeUndefined()

    // 派发 agent/created（绑定 cwd + agent-scoped systemPrompt 捕获面）→ 两段落位
    const scoped: KnowledgePromptSection[] = []
    const agent = {
      session: { id: 's-iso', header: { cwd: ws } },
      ctx: { systemPrompt: { section: (s: KnowledgePromptSection) => (scoped.push(s), () => {}) } },
    }
    for (const h of agentCreated) h({ agent: agent as never })
    expect(sections.map((s) => s.name)).toEqual(['forge:knowledge']) // 根级恰静态全局段（fix-11 裁决 B 接线锚）
    expect(scoped.map((s) => s.name)).toEqual(['forge:knowledge-domains'])
    expect(scoped[0]?.order).toBe(911)
    expect(sections[0]?.order).toBe(910)
    expect(sections[0]!.text as string).toContain('<knowledge-base>')
    // 首 turn 动态段非空（F1：注册径 rebuild 已入库，零 listEntries 调用）
    expect((scoped[0]!.text as () => string)()).toContain('frontend(1 篇) — <无简介>')
    dispose()
  })

  it('对照：未绑定 cwd 派发 agent/created → 该会话 scope 零段落位', () => {
    const root = tmpRoot()
    const ws = join(root, 'ws')
    const { ctx, agentCreated } = fakeCtx()
    const dispose = knowledgePlugin(ctx, {
      dbFile: join(root, 'knowledge', 'knowledge.db'),
      projects: [{ wsPath: ws, projectId: 'p-iso-unbound' }],
    })
    const scoped: KnowledgePromptSection[] = []
    const agent = {
      session: { id: 's-x', header: { cwd: join(root, 'elsewhere') } },
      ctx: { systemPrompt: { section: (s: KnowledgePromptSection) => (scoped.push(s), () => {}) } },
    }
    for (const h of agentCreated) h({ agent: agent as never })
    expect(scoped).toEqual([])
    dispose()
  })
})

describe('CT-isolated-profile-3（J3-3：对照面隔离——config 未命中不落行不误写）', () => {
  it('success-B：config 未注入该项目映射 → 解析未命中可判定（不落行、不误写他项目行）', async () => {
    const root = tmpRoot()
    const dbFile = join(root, 'knowledge', 'knowledge.db')
    const { ctx, tools } = fakeCtx()
    const dispose = knowledgePlugin(ctx, { dbFile }) // 无 projects 绑定（config 未注入映射）
    expect(tools).toHaveLength(7) // 插件本体装配在（面①②在场——browse 入列七工具），仅解析面未命中

    // 未绑定会话 → 可判定缺席语义（unboundSessionError 同语义：不挂、非静默）
    const search = tools.find((t) => t.name === 'knowledge_search')!
    await expect(
      search.execute({}, { agent: { session: { id: 's1', header: { cwd: join(root, 'ws-unbound') } } } }),
    ).rejects.toThrow(/not bound to a registered project|no session workspace/)
    dispose()

    // 无本项目注册表副作用（不落行、不误写——仅装配期全局行）
    expect(registryRowCount(dbFile)).toBe(1)
  })

  // 对照组 A（patch 无 knowledge 行 → 零 knowledge 面）：profile 物化机械真机装配面——
  // vitest 层已由 host 结构测试钉住（apps/host/src/profile/{materialize,overlay,presets}.test.ts
  // ——PRODUCT_PLUGINS 行派生 / knowledge-skills 物化 token / fail-soft 剔除）；真机启动
  // 对照归 Playwright test-run 收口，skip 留痕。
  it.skip('对照组 A：隔离 profile patch 不含 knowledge 行 → 无 knowledge 技能物化/tool schema/注册表副作用（环境前提：真机 Electron profile 装配，归 test-run 收口）', () => {
    expect(true).toBe(true)
  })
})

// ── 技能物化面（SC-1 机械可检面·面①）真机限定留痕 ──
// 「隔离 profile 真实启动后技能目录物化在位（customSkillDirs 生效，learn 技能可被 agent
// 装载）」= profile 物化机械真机端到端面（paths.ts 物化锚 → presets patch → materialize
// → customSkillDirs → 装配），vitest 层等价锚已由 host 测试承接：
//   · apps/host/src/profile/paths.test.ts（knowledgeSkillsDir 解析 + 缺席 fail-soft）
//   · apps/host/src/profile/overlay.test.ts（{{knowledge-skills}} 物化替换 + 剔除降级）
//   · apps/host/src/profile/presets.test.ts（双预设 knowledge 技能行在场）
// 真机启动后装配产物归 Playwright test-run 收口任务。
describe('真机面留痕（CT-isolated-profile-1 面①技能物化 / CT-isolated-profile-2 并发物化）', () => {
  it.skip('隔离 profile 启动后 knowledge 技能目录物化在位 + 并发 materialize 无损坏：需真机 Electron（环境前提：pnpm test:e2e，归 test-run 收口）', () => {
    expect(true).toBe(true)
  })
})

// 组装纪律自证：本 spec 只消费插件公开导出面与结构化 ctx 子面（faces.ts 声明），
// 不触 cordis/dsh 运行时——结构独立（SC-2）在依赖面由 boundaries.test.ts 钉死。
