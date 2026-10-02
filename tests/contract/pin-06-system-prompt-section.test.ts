// G1 pin ⑥（M1 批，任务 3.9）：`ctx.systemPrompt.section` 注册与 order 约定 + forge:knowledge 段形状。
// 权威：tech-design Appendix 契约面清单第 6 项 + Interface 3（段名/order 定死）+ 上游公开面
// `@deepseek-ai/dsh-system-prompt`（0.2.0-rc.2，host 锚）——d.ts 随包文本 + 真实运行期
// （real SystemPrompt on real cordis Context，Node 直载实测通过，与 M0 批 importUpstream 同径）。
// Hard Rule：只 pin 上游公开面（npm 导出与运行时契约）+ 我方注册对上游形状的符合性，不 pin 内部实现。
// 分层：
//   ⑥-1 版本锚（host）
//   ⑥-2 类型/文档语义锚（d.ts：Context 增强 + PromptSection 成员集 + order 约定原文）
//   ⑥-3 运行期 order 约定（真实装配：升序 + 同 order 码序 tiebreak + 重复名抛错 + disposer）
//   ⑥-4 forge:knowledge 段形状（Interface 3 对上游约定；真实渲染无裸 {{ 插值炸点）
import { describe, expect, it } from 'vitest'
import type { KnowledgeService } from '../../packages/contracts/src/index.js'
import { KNOWLEDGE_SECTION_NAME, KNOWLEDGE_SECTION_ORDER, renderKnowledgeSection } from '../../packages/knowledge/src/prompt/index.js'
import { createKnowledgeTools, createProjectResolver } from '../../packages/knowledge/src/tools/index.js'
import { expectPinnedVersion, importUpstream, interfaceMembers, norm, readUpstream } from './pins.js'

/** cordis Context 结构化最小面（真实 Context 结构兼容——探针实测） */
interface CordisCtxFace {
  reflect: { provide(name: string, value?: unknown): () => void }
  get(name: string): unknown
  fiber: { dispose(): Promise<void> }
}

/** 上游 SystemPrompt 结构化消费面（d.ts 公开签名子集） */
interface SystemPromptFace {
  readonly name: string
  section(section: { name: string; order: number; text: string | ((context: unknown) => string) }): () => void
  getSectionOrder(name: string): number
  assemble(context?: unknown): Promise<{ sections: { name: string; text: string }[] }>
}

/** 段渲染函数（renderPrompt：装配 → 模型可见全文；{{var}} 严格插值面） */
type RenderPrompt = (assembly: { sections: { name: string; text: string }[] }) => string

/** 起一套真实 runtime（cordis Context + SystemPrompt；调方负责 ctx.fiber.dispose()） */
async function bootSystemPrompt(): Promise<{ ctx: CordisCtxFace; sys: SystemPromptFace; renderPrompt: RenderPrompt }> {
  const cordis = await importUpstream('host', '@deepseek-ai/cordis')
  const sp = await importUpstream('host', '@deepseek-ai/dsh-system-prompt')
  const Ctx = cordis['Context'] as new () => CordisCtxFace
  const SystemPromptCtor = sp['SystemPrompt'] as new (ctx: CordisCtxFace, config: Record<string, never>) => SystemPromptFace
  const renderPrompt = sp['renderPrompt'] as RenderPrompt
  const ctx = new Ctx()
  const sys = new SystemPromptCtor(ctx, {})
  return { ctx, sys, renderPrompt }
}

/** 构造空壳插件的段文本源（真实 tool 定义对象——渲染面不触服务方法） */
function knowledgeSectionText(): string {
  const tools = createKnowledgeTools({
    knowledge: {} as KnowledgeService,
    resolveProjectId: createProjectResolver([]),
  })
  return renderKnowledgeSection(tools)
}

describe('pin ⑥-1 版本锚', () => {
  it('@deepseek-ai/dsh-system-prompt（host 锚）= 精确 pin 版本', () => {
    expectPinnedVersion('host', '@deepseek-ai/dsh-system-prompt')
  })
})

describe('pin ⑥-2 类型/文档语义锚（lib/types/index.d.ts 随包分发面）', () => {
  const raw = readUpstream('host', '@deepseek-ai/dsh-system-prompt', 'lib/types/index.d.ts')
  const types = norm(raw)

  it('Context 增强：systemPrompt: SystemPrompt（属性面——inject 声明消费位）', () => {
    expect(types).toContain('interface Context { systemPrompt: SystemPrompt; }')
  })

  it('PromptSection 注册形状成员集 = {complete, interpolate, name, order, text}', () => {
    expect(interfaceMembers(raw, 'PromptSection')).toEqual(['complete', 'interpolate', 'name', 'order', 'text'])
  })

  it('order 约定原文：升序拼接 + 同 order 按名称码序', () => {
    expect(types).toContain('Sections are concatenated in ascending order. Equal orders use code-unit name order')
  })

  it('段名唯一性约定原文：重复注册抛错', () => {
    expect(types).toContain('a duplicate registration throws')
  })

  it('注册面签名：section(section: PromptSection): () => void（返回注销器）', () => {
    expect(types).toContain('section(section: PromptSection): () => void')
  })
})

describe('pin ⑥-3 运行期 order 约定（真实 SystemPrompt 装配自证）', () => {
  it('服务名 = systemPrompt → ctx.systemPrompt 属性面可读（cordis provide 官方径）', async () => {
    const { ctx, sys } = await bootSystemPrompt()
    try {
      expect(sys.name).toBe('systemPrompt')
      // ctx.get 经 traceable proxy 解析（包装代理非同一引用）——按面断言
      const resolved = ctx.get('systemPrompt') as { name?: unknown; section?: unknown }
      expect(resolved.name).toBe('systemPrompt')
      expect(typeof resolved.section).toBe('function')
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('装配全序：升序 + 同 order 码序 tiebreak（aaa-early < zzz-late @order 100）+ 默认三段定位', async () => {
    const { ctx, sys } = await bootSystemPrompt()
    try {
      sys.section({ name: 'zzz-pin-late', order: 100, text: 'L' })
      sys.section({ name: 'aaa-pin-early', order: 100, text: 'E' })
      sys.section({ name: 'forge:knowledge', order: KNOWLEDGE_SECTION_ORDER, text: 'KB' })
      const assembly = await sys.assemble()
      // 默认三段（构造即注册）：harness:identity(-1000) / deployment:persona-prefix(0) /
      // deployment:persona-suffix(10200)——自有三段插入后全序
      expect(assembly.sections.map((s) => s.name)).toEqual([
        'harness:identity',
        'deployment:persona-prefix',
        'aaa-pin-early',
        'zzz-pin-late',
        'forge:knowledge',
        'deployment:persona-suffix',
      ])
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('重复段名注册抛错（唯一性约定的运行期自证）', async () => {
    const { ctx, sys } = await bootSystemPrompt()
    try {
      sys.section({ name: 'forge:knowledge', order: 500, text: 'A' })
      expect(() => sys.section({ name: 'forge:knowledge', order: 400, text: 'B' })).toThrow()
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('disposer 卸载段：装配即失（注册/卸载对称——插件卸载不留残段）', async () => {
    const { ctx, sys } = await bootSystemPrompt()
    try {
      const dispose = sys.section({ name: 'pin:probe', order: 100, text: 'P' })
      dispose()
      const assembly = await sys.assemble()
      expect(assembly.sections.map((s) => s.name)).not.toContain('pin:probe')
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('text 支持按装配求值的 provider 函数（PromptSection.text 联合类型的运行期面）', async () => {
    const { ctx, sys } = await bootSystemPrompt()
    try {
      sys.section({ name: 'pin:fn', order: 100, text: () => 'dynamic-text' })
      const assembly = await sys.assemble()
      expect(assembly.sections.find((s) => s.name === 'pin:fn')?.text).toBe('dynamic-text')
    } finally {
      await ctx.fiber.dispose()
    }
  })
})

describe('pin ⑥-4 forge:knowledge 段形状（Interface 3 × 上游约定）', () => {
  it('段名/段序 = Interface 3 定死值：forge:knowledge / 500', () => {
    expect(KNOWLEDGE_SECTION_NAME).toBe('forge:knowledge')
    expect(KNOWLEDGE_SECTION_ORDER).toBe(500)
  })

  it('段序落位：persona-prefix(0) < 500 < team-policy(600)——官方中央分配位带内（getSectionOrder 官方面）', async () => {
    const { ctx, sys } = await bootSystemPrompt()
    try {
      expect(sys.getSectionOrder('DEPLOYMENT_PERSONA_PREFIX')).toBe(0)
      expect(sys.getSectionOrder('TEAM_POLICY')).toBe(600)
      expect(sys.getSectionOrder('DEPLOYMENT_PERSONA_PREFIX')).toBeLessThan(KNOWLEDGE_SECTION_ORDER)
      expect(KNOWLEDGE_SECTION_ORDER).toBeLessThan(sys.getSectionOrder('TEAM_POLICY'))
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('真实段文本装配 + 渲染通过：无裸 {{ 插值炸点（renderPrompt 严格插值面的装配级自证）', async () => {
    const { ctx, sys, renderPrompt } = await bootSystemPrompt()
    try {
      sys.section({ name: KNOWLEDGE_SECTION_NAME, order: KNOWLEDGE_SECTION_ORDER, text: knowledgeSectionText() })
      const assembly = await sys.assemble()
      const rendered = renderPrompt(assembly)
      expect(rendered).toContain('## Project knowledge base')
      expect(rendered).toContain('knowledge.search')
      expect(rendered).toContain('knowledge.read-abstract')
      // 段文本契约事实来自 contracts 常量（域层级上限）——机械入文
      expect(rendered).toContain('at most 3 levels')
    } finally {
      await ctx.fiber.dispose()
    }
  })
})
