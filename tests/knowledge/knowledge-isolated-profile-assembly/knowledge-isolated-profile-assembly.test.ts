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
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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
function fakeCtx(): {
  ctx: KnowledgeContextFace
  tools: KnowledgeToolDefinition[]
  sections: KnowledgePromptSection[]
  provides: Map<string, unknown>
  diag: DiagEventPayload[]
} {
  const tools: KnowledgeToolDefinition[] = []
  const sections: KnowledgePromptSection[] = []
  const provides = new Map<string, unknown>()
  const diag: DiagEventPayload[] = []
  const ctx: KnowledgeContextFace = {
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
  return { ctx, tools, sections, provides, diag }
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
    const { ctx, tools, sections, provides } = fakeCtx()
    const dispose = knowledgePlugin(ctx, {
      dbFile,
      projects: [{ wsPath: join(root, 'ws'), projectId: 'p-iso' }],
    })
    expect(typeof dispose).toBe('function')

    // 面②：knowledge tool schema 在场（结构可判定——name/object 根 schema/描述/输出渲染）
    expect(tools.map((t) => t.name).sort()).toEqual(['knowledge_read', 'knowledge_read_abstract', 'knowledge_reinstate', 'knowledge_search', 'knowledge_supersede', 'knowledge_write'])
    for (const tool of tools) {
      expect(tool.parameters.type).toBe('object') // JSON Schema object 根（注册面消费形状）
      expect(tool.description.length).toBeGreaterThan(0)
      expect(typeof tool.output.render).toBe('function')
      expect(typeof tool.execute).toBe('function')
    }
    // 提示词段注册（forge:knowledge 段——装配后 agent 可见面）
    expect(sections).toHaveLength(1)
    expect(sections[0]!.name).toBe('forge:knowledge')
    expect(sections[0]!.text.length).toBeGreaterThan(0)
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
    // 注册行落表（自持注册表——常规路径唯一产品写径）
    expect(registryRowCount(dbFile)).toBe(1)
    // info 级 knowledge-register 事件（SC-10 埋点，携 projectId）
    const info = diag.find((d) => d.level === 'info' && d.event === 'knowledge-register')
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
    expect(registryRowCount(dbFile)).toBe(0)
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
    expect(second.sections).toHaveLength(1)
    d2()

    // 注册表行数不变（零重复注册行——幂等；常规路径零注册行，无迁移源）
    expect(registryRowCount(dbFile)).toBe(0)
  })
})

describe('CT-isolated-profile-3（J3-3：对照面隔离——config 未命中不落行不误写）', () => {
  it('success-B：config 未注入该项目映射 → 解析未命中可判定（不落行、不误写他项目行）', async () => {
    const root = tmpRoot()
    const dbFile = join(root, 'knowledge', 'knowledge.db')
    const { ctx, tools } = fakeCtx()
    const dispose = knowledgePlugin(ctx, { dbFile }) // 无 projects 绑定（config 未注入映射）
    expect(tools).toHaveLength(6) // 插件本体装配在（面①②在场），仅解析面未命中

    // 未绑定会话 → 可判定缺席语义（unboundSessionError 同语义：不挂、非静默）
    const search = tools.find((t) => t.name === 'knowledge_search')!
    await expect(
      search.execute({}, { agent: { session: { id: 's1', header: { cwd: join(root, 'ws-unbound') } } } }),
    ).rejects.toThrow(/not bound to a registered project|no session workspace/)
    dispose()

    // 无注册表副作用（不落行、不误写）
    expect(registryRowCount(dbFile)).toBe(0)
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
