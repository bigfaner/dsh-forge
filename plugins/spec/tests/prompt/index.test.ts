// 单测 —— plugins/spec/host/prompt（plugin-spec/1.8 提示段迁入）。
// 覆盖：段名/段序 pin、唯一模式 Spec 词汇模板、子会话裁剪版、git 条件注入、
// presetBinding 注入判据两态（缺省无条件 / forge 绑定会话预设命中才注入、未命中
// 空串过滤——核销报告 research/official-verification.md §3：每次组装现求值 + 事件
// 回放投影不读裸出生头）、注册胶水、A1 自含形态禁词机检。
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { registerSpecPromptSections } from '../../host/index.js'
import {
  FORGE_DOC_STYLE_SECTION_NAME,
  FORGE_DOC_STYLE_SECTION_ORDER,
  FORGE_PIPELINE_SECTION_NAME,
  FORGE_PIPELINE_SECTION_ORDER,
  isSubagentAssembly,
  renderDocStyleSection,
  renderSpecPipelineSection,
  sessionAgentPresetOf,
  specPipelineSectionText,
} from '../../host/prompt/index.js'
import { XML_TAGS } from '@dsh-forge/contracts'

// ─────────────────────────── 合成会话/装配上下文 ───────────────────────────

/** 事件面（官方 SessionEvent 消费切片） */
const selected = (agentPreset: string) => ({ type: 'agent-preset/selected', data: { agentPreset } })
const unrelated = { type: 'session/renamed', data: { title: 'x' } }

/** 合成会话（出生头 + 可选事件日志——官方 Session 子面） */
function sessionOf(header?: { origin?: string; agentPreset?: string }, events?: readonly unknown[]) {
  return {
    header,
    ...(events !== undefined ? { snapshotEvents: () => events } : {}),
  }
}

const MAIN = { agent: { id: 'main-s' } }
const SUB = { agent: { id: 'child-s', session: sessionOf({ origin: 'subagent' }) } }

// ─────────────────────────── 段名/段序 pin ───────────────────────────

describe('段名/段序（knowledge 500 之后 forge 段族）', () => {
  it('forge:pipeline / order 510；forge:doc-style 直迁在位（单源 = project host-dirs）', () => {
    expect(FORGE_PIPELINE_SECTION_NAME).toBe('forge:pipeline')
    expect(FORGE_PIPELINE_SECTION_ORDER).toBe(510)
    expect(FORGE_DOC_STYLE_SECTION_NAME).toBe('forge:doc-style')
    expect(FORGE_DOC_STYLE_SECTION_ORDER).toBe(511)
    expect(renderDocStyleSection()).toContain('文档风格公约')
  })
})

// ─────────────────────────── 唯一模式模板（Spec/Goal/AC 词汇） ───────────────────────────

describe('renderSpecPipelineSection——唯一模式（四模板删远征两份、突击两份改写为 Spec 词汇）', () => {
  const MAIN_RENDER = renderSpecPipelineSection({ isGitRepo: true })

  it('主会话全文：总纲（Spec 状态库 / AC 对齐键 / completed 拆解前置锚）三段结构在场', () => {
    expect(MAIN_RENDER).toContain('## Forge 任务管线')
    expect(MAIN_RENDER).toContain('### 总纲与核心规则')
    expect(MAIN_RENDER).toContain('### 文档位置与存储约束')
    expect(MAIN_RENDER).toContain('### 流程')
    // Spec 词汇核心规则
    expect(MAIN_RENDER).toContain('Spec/Goal/AC')
    expect(MAIN_RENDER).toContain('querySpec')
    expect(MAIN_RENDER).toContain('completed')
    // XML 标签包裹（HTML 块空行边界）
    expect(MAIN_RENDER.startsWith(`<${XML_TAGS.forgePipeline}>\n\n`)).toBe(true)
    expect(MAIN_RENDER.endsWith(`\n\n</${XML_TAGS.forgePipeline}>`)).toBe(true)
  })

  it('目录树改 .forge/specs/{slug}/；roundtables/probes 新树在场', () => {
    expect(MAIN_RENDER).toContain('specs/{slug}/')
    expect(MAIN_RENDER).toContain('.forge')
    expect(MAIN_RENDER).toContain('probes/')
    expect(MAIN_RENDER).toContain('roundtables/{slug}/')
    // 旧树 proposal/features 行零残留
    expect(MAIN_RENDER).not.toContain('proposals/{slug}/')
    expect(MAIN_RENDER).not.toContain('features/{slug}/')
  })

  it('探索指引（探针与 Spike）：先检索后探索 + 触发情形 + 产物落点按键 + 必备结论文件；主/子会话双模板同在', () => {
    for (const v of [MAIN_RENDER, renderSpecPipelineSection({ subagent: true })]) {
      expect(v).toContain('探索（探针与 Spike）')
      expect(v).toContain('`knowledge_search` 已有结论即复用')
      // 触发情形
      expect(v).toContain('复现缺陷、判别根因、核验外部或官方机械的承重假设')
      expect(v).toContain('对接外部系统、引入第三方库或新机制之前')
      // 产物落点 = 目录键（不写死绝对/相对路径）
      expect(v).toContain('`project.probes_dir`')
      expect(v).toContain('`project.spikes_dir`')
      expect(v).toContain('顶层必须有 `.md` 结论')
      expect(v).toContain('必须有 `README.md`')
      expect(v).toContain('两目录均不入 git')
    }
  });

  it('唯一模式：双模板面零残留（远征/突击词汇、mode 键、分模式标题禁现）', () => {
    for (const v of [MAIN_RENDER, renderSpecPipelineSection({ subagent: true })]) {
      expect(v).not.toContain('远征')
      expect(v).not.toContain('突击')
      expect(v).not.toContain('expedition')
      expect(v).not.toContain('blitz')
      expect(v).not.toContain('（突击模式）')
      expect(v).not.toContain('（远征模式）')
      expect(v).not.toContain('quick-tasks')
    }
  })

  it('流程图 = Spec 管线（grilling → createSpec → 用户评审 → to-tasks 拆解 → 派发 → 交付）', () => {
    expect(MAIN_RENDER).toContain('grilling')
    expect(MAIN_RENDER).toContain('createSpec')
    expect(MAIN_RENDER).toContain('to-tasks')
    expect(MAIN_RENDER).toContain('run-dag-tasks')
  })

  it('Milestone/Roadmap 词汇 + spec_stats 工具缝引导行在场（主会话；子会话裁剪版不含总纲词汇）', () => {
    expect(MAIN_RENDER).toContain('Roadmap')
    expect(MAIN_RENDER).toContain('Milestone')
    expect(MAIN_RENDER).toContain('spec_stats')
    expect(MAIN_RENDER).toContain('里程碑')
    const sub = renderSpecPipelineSection({ subagent: true })
    expect(sub).not.toContain('spec_stats')
    expect(sub).not.toContain('Milestone')
  })

  it('git 纪律条件注入：isGitRepo=true 追加；false/缺省零差异', () => {
    expect(renderSpecPipelineSection({ isGitRepo: true })).toContain('git 纪律')
    expect(renderSpecPipelineSection({})).not.toContain('git 纪律')
  })

  it('子会话裁剪版：目录树 + git 句在；六条总纲/流程图不入', () => {
    const sub = renderSpecPipelineSection({ subagent: true, isGitRepo: true })
    expect(sub).toContain('## Forge 工作纪律（子会话）')
    expect(sub).toContain('specs/{slug}/')
    expect(sub).toContain('git 纪律')
    expect(sub).not.toContain('### 总纲与核心规则')
    expect(sub).not.toContain('### 流程')
    expect(sub).not.toContain('```mermaid')
  })

  it('{{ 引用零残留（目录真值 = 工具查询指引，段文本不再依赖 {{forge_docs_root}}）', () => {
    for (const v of [MAIN_RENDER, renderSpecPipelineSection({ subagent: true })]) {
      expect(v.match(/\{\{/g)).toBeNull()
      expect(v).toContain('forge_dirs')
    }
  })
})

// ─────────────────────────── presetBinding 注入判据（两态必红） ───────────────────────────

describe('sessionAgentPresetOf——事件回放投影（出生头为基 + agent-preset/selected 覆盖）', () => {
  it('无事件 = 出生头（投影基座）', () => {
    expect(sessionAgentPresetOf(sessionOf({ agentPreset: 'forge' }))).toBe('forge')
  })

  it('selected 事件覆盖出生头（自尾向首最近一次 string 型 agentPreset）', () => {
    expect(sessionAgentPresetOf(sessionOf({ agentPreset: 'other' }, [unrelated, selected('forge')]))).toBe('forge')
    expect(sessionAgentPresetOf(sessionOf({ agentPreset: 'forge' }, [selected('a'), selected('b')]))).toBe('b')
  })

  it('防御读面：session 缺席 / snapshotEvents 缺席或抛错 / 形状漂移 = 出生头或 undefined', () => {
    expect(sessionAgentPresetOf(undefined)).toBeUndefined()
    expect(sessionAgentPresetOf({})).toBeUndefined()
    expect(sessionAgentPresetOf({ header: { agentPreset: 'forge' }, snapshotEvents: () => { throw new Error('boom') } })).toBe('forge')
    expect(sessionAgentPresetOf(sessionOf(undefined, [{ type: 'agent-preset/selected', data: { agentPreset: 42 } }]))).toBeUndefined()
  })
})

describe('specPipelineSectionText——presetBinding 注入判据（核销报告 §3：每次组装现求值）', () => {
  const vars = { presetBinding: undefined as string | undefined, isGitRepo: false }

  it('缺省（无 presetBinding）：无条件注入——主会话全文、子会话裁剪版', () => {
    expect(specPipelineSectionText(MAIN, vars)).toContain('## Forge 任务管线')
    expect(specPipelineSectionText(SUB, vars)).toContain('## Forge 工作纪律（子会话）')
    // 无 agent / 无 session 的装配上下文同属缺省态
    expect(specPipelineSectionText(undefined, vars)).toContain('## Forge 任务管线')
  })

  it('presetBinding=forge + 会话预设命中（事件投影）：注入；未命中（无预设/他预设）：空串过滤', () => {
    const bound = { ...vars, presetBinding: 'forge' }
    const hitMain = { agent: { id: 's1', session: sessionOf({ agentPreset: 'forge' }) } }
    const hitByEvent = { agent: { id: 's2', session: sessionOf({ agentPreset: 'other' }, [selected('forge')]) } }
    const missNoPreset = { agent: { id: 's3' } }
    const missOther = { agent: { id: 's4', session: sessionOf({ agentPreset: 'other' }) } }
    const missStaleHeader = { agent: { id: 's5', session: sessionOf({ agentPreset: 'other' }, [selected('not-forge')]) } }
    expect(specPipelineSectionText(hitMain, bound)).toContain('## Forge 任务管线')
    expect(specPipelineSectionText(hitByEvent, bound)).toContain('## Forge 任务管线')
    expect(specPipelineSectionText(missNoPreset, bound)).toBe('')
    expect(specPipelineSectionText(missOther, bound)).toBe('')
    expect(specPipelineSectionText(missStaleHeader, bound)).toBe('')
  })

  it('绑定 + 子会话命中：裁剪版照常注入（判据只看预设投影，角色分流照旧）', () => {
    const bound = { ...vars, presetBinding: 'forge' }
    const subHit = { agent: { id: 'c1', session: sessionOf({ origin: 'subagent', agentPreset: 'forge' }) } }
    const subMiss = { agent: { id: 'c2', session: sessionOf({ origin: 'subagent' }) } }
    expect(specPipelineSectionText(subHit, bound)).toContain('## Forge 工作纪律（子会话）')
    expect(specPipelineSectionText(subMiss, bound)).toBe('')
  })

  it('空串 = 官方 dsh-system-prompt 对空串 section 整体过滤语义（与从未注册一致）', () => {
    expect(specPipelineSectionText(MAIN, { ...vars, presetBinding: 'forge' })).toBe('')
  })

  it('子会话装配单点判据 isSubagentAssembly（origin === subagent；缺席/异常形状 = 主会话）', () => {
    expect(isSubagentAssembly(SUB)).toBe(true)
    expect(isSubagentAssembly(MAIN)).toBe(false)
    expect(isSubagentAssembly(undefined)).toBe(false)
    expect(isSubagentAssembly({ agent: {} } as never)).toBe(false)
  })
})

// ─────────────────────────── 注册胶水（提示段注册恒在） ───────────────────────────

/** systemPrompt 注册面桩 */
function stubSystemPrompt() {
  const sections: { name: string; order: number; text: unknown }[] = []
  const variables: { name: string }[] = []
  return {
    sections,
    variables,
    face: {
      section(section: { name: string; order: number; text: unknown }) {
        sections.push(section)
        return () => {
          const i = sections.indexOf(section)
          if (i >= 0) sections.splice(i, 1)
        }
      },
    },
  }
}

describe('registerSpecPromptSections——提示段注册恒在（A1 自含形态）', () => {
  it('缺省注册：pipeline + doc-style 两段在场，disposer 全注销', () => {
    const stub = stubSystemPrompt()
    const dispose = registerSpecPromptSections({ systemPrompt: stub.face }, {})
    expect(stub.sections.map((s) => s.name).sort()).toEqual(['forge:doc-style', 'forge:pipeline'])
    expect(stub.sections.find((s) => s.name === 'forge:pipeline')?.order).toBe(510)
    dispose()
    expect(stub.sections).toHaveLength(0)
  })

  it('pipeline 段 text = 按装配求值函数：presetBinding 判据透传（绑定 + 未命中 = 空串）', () => {
    const stub = stubSystemPrompt()
    const dispose = registerSpecPromptSections({ systemPrompt: stub.face }, { presetBinding: 'forge' })
    const section = stub.sections.find((s) => s.name === 'forge:pipeline')!
    const text = section.text as (context: unknown) => string
    expect(text({ agent: { id: 's1' } })).toBe('')
    expect(text({ agent: { id: 's2', session: sessionOf({ agentPreset: 'forge' }) } })).toContain('## Forge 任务管线')
    dispose()
  })
})

// ─────────────────────────── A1 自含形态禁词机检 ───────────────────────────

describe('禁词机检——config.mode/presetModeOf 双模板面零残留（AC6）', () => {
  // tests/prompt/ → spec 包根两级上：tests/prompt → tests → 包根
  const SPEC_ROOT = fileURLToPath(new URL('../..', import.meta.url))
  // 包根 → 仓检出根三级上：plugins/spec → plugins → 检出根
  const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url))
  const read = (abs: string) => readFileSync(abs, 'utf8')

  it('spec 包源码零预设知识（expedition/blitz/远征/突击/presetModeOf/config.mode 禁现）', () => {
    const src =
      read(join(SPEC_ROOT, 'host/prompt/index.ts')) +
      read(join(SPEC_ROOT, 'host/index.ts')) +
      read(join(SPEC_ROOT, 'host/faces.ts')) +
      read(join(SPEC_ROOT, 'cordis.patch.yml'))
    for (const banned of ['expedition', 'blitz', '远征', '突击', 'presetModeOf', 'config.mode']) {
      expect(src, `禁词「${banned}」命中 spec 包源码`).not.toContain(banned)
    }
  })

  it('plugin-forge 残本退役：src/prompt 目录已删、presetModeOf/ForgePipelineMode/config.mode 零残留', () => {
    const forgeSrc = join(REPO_ROOT, 'packages', 'plugin-forge', 'src')
    expect(existsSync(join(forgeSrc, 'prompt'))).toBe(false)
    const walk = (dir: string): string[] => {
      const out: string[] = []
      for (const name of readdirSync(dir)) {
        const p = join(dir, name)
        if (statSync(p).isDirectory()) out.push(...walk(p))
        else if (p.endsWith('.ts')) out.push(p)
      }
      return out
    }
    for (const file of walk(forgeSrc)) {
      const content = read(file)
      for (const banned of ['presetModeOf', 'ForgePipelineMode', 'config.mode']) {
        expect(content, `${file} 命中禁词「${banned}」`).not.toContain(banned)
      }
    }
  })

  it('宿主 preset 底稿 plugin-forge 行零 mode 键残留', () => {
    for (const preset of ['expedition.patch.yml', 'blitz.patch.yml']) {
      const lines = read(join(REPO_ROOT, 'apps', 'host', 'src', 'profile', 'presets', preset)).split(/\r?\n/)
      expect(lines.some((l) => /^ *mode: *(expedition|blitz) *$/.test(l)), `${preset} 残留 mode 键`).toBe(false)
    }
  })
})
