// 单测 —— forge:pipeline / forge:doc-style 段渲染（dual-mode-overhaul 段重构终版）：
// 段常量 / 三段结构 MD 段体（总纲与核心规则·文档位置与存储约束·流程）/ 四规则含环间确认 /
// 执行协议与受限面整段删除 / 双模式独立渲染（mode 键——目录树与流程图各自版本，缺省回退
// 远征）/ 双 mermaid 无 worker 内部节点 / doc-style 独立段（XML_TAGS.docStyle 扩集）/
// 标签包裹单源 / 不含 forge tool 说明 / 禁裸 {{ / forgeDir 缺省回退不炸渲染。
import { describe, expect, it } from 'vitest'
import { XML_TAGS } from '@dsh-forge/contracts'
import {
  FORGE_DOC_STYLE_SECTION_NAME,
  FORGE_DOC_STYLE_SECTION_ORDER,
  FORGE_SECTION_NAME,
  FORGE_SECTION_ORDER,
  modeOf,
  renderDocStyleSection,
  renderForgePipelineSection,
} from './index.js'
import { FORGE_TOOL_NAMES } from '../tools/index.js'

const text = renderForgePipelineSection()

describe('段常量（Interface 8 定死）', () => {
  it('forge:pipeline / order 510（knowledge 500 之后）', () => {
    expect(FORGE_SECTION_NAME).toBe('forge:pipeline')
    expect(FORGE_SECTION_ORDER).toBe(510)
  })

  it('forge:doc-style / order 511（doc-style 独立段——510 相邻之后）', () => {
    expect(FORGE_DOC_STYLE_SECTION_NAME).toBe('forge:doc-style')
    expect(FORGE_DOC_STYLE_SECTION_ORDER).toBe(511)
  })
})

describe('renderForgePipelineSection——三段结构 MD 段体', () => {
  it('### 总纲与核心规则 / ### 文档位置与存储约束 / ### 流程 三段标题按序在场（缺省 forgeDir 时中段省略）', () => {
    expect(text).toContain('### 总纲与核心规则')
    expect(text).toContain('### 流程')
    const injected = renderForgePipelineSection({ forgeDir: 'Z:/ws/demo/.forge', mode: 'expedition' })
    expect(injected).toContain('### 文档位置与存储约束')
    expect(injected.indexOf('总纲与核心规则')).toBeLessThan(injected.indexOf('文档位置与存储约束'))
    expect(injected.indexOf('文档位置与存储约束')).toBeLessThan(injected.indexOf('### 流程'))
    // 缺省回退：中段整段省略，前后两段相邻
    expect(text).not.toContain('文档位置与存储约束')
  })

  it('总纲四条规则：状态层单源 / 自然键与 fix 链 / 领取-结算如实 / 环间确认铁律', () => {
    expect(text).toContain('唯一事实来源')
    expect(text).toContain('投影')
    expect(text).toContain('禁止手改状态')
    expect(text).toContain('管线动词')
    expect(text).toContain('slug/local-id')
    expect(text).toContain('fix-N')
    expect(text).toContain('disc-N')
    expect(text).toContain('派发简报')
    expect(text).toContain('质量门')
    expect(text).toContain('绝不伪造')
    expect(text).toContain('blocked 给出具体阻塞原因')
    expect(text).toContain('fix 链至多六层')
  })

  it('环间确认规则逐句在场（ask_user_question 显式确认 / 确认后推进并流转状态 / 未确认不得推进）', () => {
    expect(text).toContain(
      '环间确认：进入流程下一环节前，使用 ask_user_question 工具显式向用户确认；确认后推进，并同步调用管线工具流转提案或 feature 的状态；未确认不得推进。',
    )
  })

  it('执行协议与受限面整段删除（dual-mode-overhaul——正本在 run-tasks / submit-task 技能）', () => {
    expect(text).not.toContain('执行协议')
    expect(text).not.toContain('受限面')
    expect(text).not.toContain('是人类决定')
    expect(text).not.toContain('不在此复制')
  })
})

describe('双模式独立渲染（mode 键——缺省回退远征）', () => {
  const EXPEDITION = renderForgePipelineSection({ mode: 'expedition', forgeDir: 'Z:/ws/demo/.forge' })
  const BLITZ = renderForgePipelineSection({ mode: 'blitz', forgeDir: 'Z:/ws/demo/.forge' })

  it('modeOf：blitz → blitz，expedition/未知/缺省 → expedition（回退纯函数不炸）', () => {
    expect(modeOf('blitz')).toBe('blitz')
    expect(modeOf('expedition')).toBe('expedition')
    expect(modeOf(undefined)).toBe('expedition')
    expect(modeOf('unknown-mode')).toBe('expedition')
  })

  it('缺省 mode = 远征版（回退逐字一致）', () => {
    expect(renderForgePipelineSection()).toBe(renderForgePipelineSection({ mode: 'expedition' }))
  })

  it('远征目录树：提案/特性/探针三类', () => {
    expect(EXPEDITION).toContain('docs/features/{slug}/')
    expect(EXPEDITION).toContain('docs/probes/')
    expect(EXPEDITION).toContain('远征模式文档面布局')
  })

  it('突击目录树：提案/探针两类（无特性目录行）', () => {
    expect(BLITZ).toContain('docs/proposals/{slug}/')
    expect(BLITZ).toContain('docs/probes/')
    expect(BLITZ).not.toContain('docs/features/')
    expect(BLITZ).toContain('突击模式文档面布局')
  })

  it('远征流程图：brainstorm→write-prd→ui-design→tech-design→breakdown-tasks→派发→eval→交付，各步产物标于箭头', () => {
    expect(EXPEDITION).toContain('A[brainstorm] -->|proposal.md| B[write-prd]')
    expect(EXPEDITION).toContain('B -->|prd| C[ui-design]')
    expect(EXPEDITION).toContain('C -->|ui 设计稿| D[tech-design]')
    expect(EXPEDITION).toContain('D -->|design 文档| E[breakdown-tasks]')
    expect(EXPEDITION).toContain('E -->|任务清单| F[派发]')
    expect(EXPEDITION).toContain('F -->|实现与测试| G[eval]')
    expect(EXPEDITION).toContain('G -->|验收报告| H[交付]')
    expect(EXPEDITION).toContain('仅在存在 UI 面时执行')
  })

  it('突击流程图：brainstorm→用户裁决→quick-tasks→派发→交付', () => {
    expect(BLITZ).toContain('A[brainstorm] -->|proposal.md| B[用户裁决]')
    expect(BLITZ).toContain('B -->|裁决记录| C[quick-tasks]')
    expect(BLITZ).toContain('C -->|任务清单| D[派发]')
    expect(BLITZ).toContain('D -->|实现与验收| E[交付]')
  })

  it('双 mermaid 简要、无 worker 内部节点（流程图行不含 claim/submit 等动词节点）', () => {
    for (const v of [EXPEDITION, BLITZ]) {
      const flow = v.slice(v.indexOf('```mermaid'), v.indexOf('```', v.indexOf('```mermaid') + 3))
      expect(flow).not.toMatch(/\[(claim|submit|dispatch)\]/i)
      expect(flow).toContain('```mermaid')
    }
  })
})

describe('文档位置与存储约束（forgeDir 注入）', () => {
  const FORGE_DIR = 'Z:/ws/demo/.forge'

  it('注入 forgeDir：绝对路径先行 + 目录树段；去「中央 projects.forge_dir 单源」注记', () => {
    const injected = renderForgePipelineSection({ forgeDir: FORGE_DIR, mode: 'expedition' })
    expect(injected).toContain('文档位置')
    expect(injected).toContain(FORGE_DIR)
    expect(injected.indexOf(FORGE_DIR)).toBeLessThan(injected.indexOf('目录树'))
    expect(injected).not.toContain('projects.forge_dir 单源')
  })

  it('存储约束：代码与测试入源码树 / 过程产物归 {slug} 子目录不另设他处', () => {
    const injected = renderForgePipelineSection({ forgeDir: FORGE_DIR })
    expect(injected).toContain('代码与测试改动一律落工作区源码树')
    expect(injected).toContain('过程产物')
    expect(injected).toContain('{slug} 子目录，不另设他处')
  })

  it('回退：缺省/空白 forgeDir = 省略文档位置段（渲染不炸、其余段原样）', () => {
    for (const vars of [undefined, { forgeDir: undefined }, { forgeDir: '' }, { forgeDir: '   ' }]) {
      const fallback = renderForgePipelineSection(vars)
      expect(fallback).not.toContain('文档位置')
      expect(fallback).not.toContain('目录树')
      expect(fallback).toContain('唯一事实来源')
      expect(fallback).toContain('环间确认')
      expect(fallback).toContain('### 流程')
    }
  })

  it('尾部路径分隔符归一（不落双斜杠结尾的裸路径）', () => {
    const injected = renderForgePipelineSection({ forgeDir: 'Z:/ws/demo/.forge/' })
    expect(injected).toContain('Z:/ws/demo/.forge\n')
  })
})

describe('段契约（标签包裹 / 无 forge tool 说明 / 禁裸 {{）', () => {
  const BLITZ_RENDER = renderForgePipelineSection({ mode: 'blitz' })
  it('最外层唯一标签包裹：<forge-pipeline>（contracts XML_TAGS 单源）', () => {
    for (const v of [text, renderForgePipelineSection({ mode: 'blitz', forgeDir: 'Z:/ws/x/.forge' })]) {
      expect(v.startsWith(`<${XML_TAGS.forgePipeline}>\n`)).toBe(true)
      expect(v.endsWith(`</${XML_TAGS.forgePipeline}>`)).toBe(true)
    }
    expect(XML_TAGS.forgePipeline).toBe('forge-pipeline')
  })

  it('不含 forge tool 说明（六工具名零出现——注册面自描述；环间确认点名的 ask_user_question 为宿主问询工具，不属 forge tool 面）', () => {
    expect(FORGE_TOOL_NAMES).not.toContain('ask_user_question')
    for (const name of FORGE_TOOL_NAMES) {
      expect(text, `段文本不得含工具名 ${name}`).not.toContain(name)
    }
    expect(text).not.toMatch(/\(string, (required|optional)\)/)
  })

  it('段文本禁用裸 {{（SystemPrompt 默认插值，未知引用会炸渲染）——双模式与 doc-style 同判', () => {
    for (const v of [text, BLITZ_RENDER, renderDocStyleSection()]) {
      expect(v).not.toContain('{{')
    }
  })
})

describe('renderDocStyleSection——独立段（dual-mode-overhaul 拆段）', () => {
  const docStyle = renderDocStyleSection()

  it('doc-style 标签包裹（XML_TAGS.docStyle 单源）+ 零入参共用', () => {
    expect(docStyle.startsWith(`<${XML_TAGS.docStyle}>\n`)).toBe(true)
    expect(docStyle.endsWith(`</${XML_TAGS.docStyle}>`)).toBe(true)
    expect(XML_TAGS.docStyle).toBe('doc-style')
  })

  it('三要点在场：mermaid 优先 / 文字精简 / 不留调整修复叙事，约束全部产出文档', () => {
    expect(docStyle).toContain('文档风格公约')
    expect(docStyle).toContain('全部产出文档')
    expect(docStyle).toContain('mermaid')
    expect(docStyle).toContain('文字精简')
    expect(docStyle).toContain('不留调整修复叙事')
  })

  it('内层无二级尖括号标签（mermaid 提法用代码栅栏措辞——非 XML 标签）', () => {
    const body = docStyle.slice(`<${XML_TAGS.docStyle}>`.length, -`</${XML_TAGS.docStyle}>`.length)
    expect(body).not.toMatch(/<\/?[a-z-]+>/)
  })
})
