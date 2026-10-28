// 单测 —— forge:pipeline / forge:doc-style 段渲染（dual-mode-overhaul 模板化终版）：
// 两份自包含模板（四条核心规则双份逐字在场——允许重复、禁止占位抽公共）/ 三段结构
// MD 段体（总纲与核心规则·文档位置与存储约束·流程）/ 四规则口径（状态库+查询为准，
// 执行协议与受限面零回渗）/ 双模式独立渲染（mode 键——目录树与流程图各自版本，缺省
// 回退远征）/ 双 mermaid 含用户裁决节点与箭头固定产物、无 worker 内部节点 / doc-style
// 独立段（XML_TAGS.docStyle 扩集）/ 标签包裹单源 / 不含 forge tool 说明 / 禁裸 {{ /
// forgeDir 缺省回退不炸渲染。
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

  it('标题带模式名（## Forge 任务管线（远征模式）/（突击模式））', () => {
    expect(text).toContain('## Forge 任务管线（远征模式）')
    expect(renderForgePipelineSection({ mode: 'blitz' })).toContain('## Forge 任务管线（突击模式）')
  })
})

describe('总纲四条核心规则（双模式逐字在场——允许重复、禁止占位）', () => {
  const RULES = [
    '状态存于 forge 管线的状态库（任务/提案/特性/文档四域，按工作区注册）；一切状态判断以管线工具的查询结果为准，不以盘上文件或记忆推断。',
    '任务身份 = slug/local-id；blocked 任务派生修复任务携带 fix-N；偏差跟进携带 disc-N；slug 与 feature 目录名一致。',
    '提案 accept/reject 仅在用户明示决定后记录。',
    '进入流程下一环节前，使用 ask_user_question 工具显式向用户确认；确认后推进，并同步调用管线工具流转提案或 feature 的状态；未确认不得推进。',
  ]

  it.each(RULES.map((rule, i) => [`规则${i + 1}`, rule]))('%s 逐字在场于双模式渲染', (_label, rule) => {
    expect(text).toContain(rule)
    expect(renderForgePipelineSection({ mode: 'blitz', forgeDir: 'Z:/ws/demo/.forge' })).toContain(rule)
  })

  it('执行协议与受限面零回渗（领取/结算/fix 链细节不出现——正本在派发核心文档 / submit-task 技能）', () => {
    for (const v of [text, renderForgePipelineSection({ mode: 'blitz' })]) {
      expect(v).not.toContain('执行协议')
      expect(v).not.toContain('受限面')
      expect(v).not.toContain('投影')
      expect(v).not.toContain('禁止手改状态')
      expect(v).not.toContain('派发简报')
      expect(v).not.toContain('质量门')
      expect(v).not.toContain('fix 链至多六层')
      expect(v).not.toContain('blocked 给出具体阻塞原因')
    }
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

  it('远征目录树：提案/特性/探针三类（根=docs 层，树内无 docs/ 前缀）', () => {
    expect(EXPEDITION).toContain('├─ proposals/{slug}/')
    expect(EXPEDITION).toContain('├─ features/{slug}/')
    expect(EXPEDITION).toContain('└─ probes/')
    expect(EXPEDITION).not.toContain('docs/features/')
  })

  it('突击目录树：提案/探针两类（无特性目录行）', () => {
    expect(BLITZ).toContain('├─ proposals/{slug}/')
    expect(BLITZ).toContain('└─ probes/')
    expect(BLITZ).not.toContain('features/{slug}/')
  })

  it('存储约束显式清单：远征三类 / 突击两类', () => {
    expect(EXPEDITION).toContain('入文档根仅三类：提案文档、特性阶段文档、探针产物。')
    expect(EXPEDITION).toContain('特性阶段文档产出后经管线工具登记')
    expect(BLITZ).toContain('入文档根仅两类：提案文档、探针产物；突击不产特性阶段文档。')
    for (const v of [EXPEDITION, BLITZ]) {
      expect(v).toContain('代码与测试不入文档根——进仓库源码树')
      expect(v).toContain('过程产物只归档到对应 {slug} 子目录，不另设他处')
    }
  })

  it('远征流程图：brainstorm→用户裁决→write-prd→review-prd（Blocker 清零放行/返工环）→ui-design（有 UI 面）→tech-design→review-tech（同门）→breakdown-tasks→派发→交付，各步产物标于箭头', () => {
    expect(EXPEDITION).toContain('A[brainstorm] -->|"proposal.md"| B{用户裁决}')
    expect(EXPEDITION).toContain('B -->|"accept"| C[write-prd]')
    expect(EXPEDITION).toContain('C -->|"prd-spec / user-stories / ui-functions"| P[review-prd]')
    expect(EXPEDITION).toContain('P -->|"Blocker 清零·有 UI 面"| D["ui-design（有 UI 面）"]')
    expect(EXPEDITION).toContain('P -->|"Blocker 返工"| C')
    expect(EXPEDITION).toContain('P -->|"Blocker 清零·无 UI 面"| E[tech-design]')
    expect(EXPEDITION).toContain('D -->|"ui-design.md + prototype"| E')
    expect(EXPEDITION).toContain('E -->|"tech-design / ER / schema / handbook"| R[review-tech]')
    expect(EXPEDITION).toContain('R -->|"Blocker 清零·放行"| F[breakdown-tasks]')
    expect(EXPEDITION).toContain('R -->|"Blocker 返工"| E')
    expect(EXPEDITION).toContain('F -->|"任务清单"| G["/run-dag-tasks 派发"]')
    expect(EXPEDITION).toContain('G --> H[交付]')
    expect(EXPEDITION).not.toContain('eval')
  })

  it('突击流程图：brainstorm→用户裁决（reject 返工环）→quick-tasks→派发→交付（零评审技能节点——评审走 proposal-reviewer 对话式委派）', () => {
    expect(BLITZ).toContain('A[brainstorm] -->|"proposal.md"| B{用户裁决}')
    expect(BLITZ).toContain('B -->|"reject 返工提案"| A')
    expect(BLITZ).not.toContain('review-proposal')
    expect(BLITZ).toContain('B -->|"accept"| C[quick-tasks]')
    expect(BLITZ).toContain('C -->|"任务清单"| D["/run-dag-tasks 派发"]')
    expect(BLITZ).toContain('D --> E[交付]')
  })

  it('双 mermaid 简要、无 worker 内部节点（流程图行不含 claim/submit/dispatch 节点）', () => {
    for (const v of [EXPEDITION, BLITZ]) {
      const flow = v.slice(v.indexOf('```mermaid'), v.indexOf('```', v.indexOf('```mermaid') + 3))
      expect(flow).not.toMatch(/\[(claim|submit|dispatch)\]/i)
      expect(flow).toContain('```mermaid')
    }
  })
})

describe('文档位置与存储约束（forgeDir 注入）', () => {
  const FORGE_DIR = 'Z:/ws/demo/.forge'

  it('注入 forgeDir：文档根 = forgeDir 的 docs 层（绝对路径）；无中央库注记', () => {
    const injected = renderForgePipelineSection({ forgeDir: FORGE_DIR, mode: 'expedition' })
    expect(injected).toContain('文档根')
    expect(injected).toContain(`${FORGE_DIR}\\docs`)
    expect(injected.indexOf(`${FORGE_DIR}\\docs`)).toBeLessThan(injected.indexOf('```text'))
    expect(injected).not.toContain('projects.forge_dir 单源')
  })

  it('尾部路径分隔符归一（不落双分隔符结尾）', () => {
    const injected = renderForgePipelineSection({ forgeDir: 'Z:/ws/demo/.forge/' })
    expect(injected).toContain('Z:/ws/demo/.forge\\docs')
    expect(injected).not.toContain('//docs')
  })

  it('POSIX（macOS/Linux）forgeDir：docsRoot 以 `/` 连接（不被拼成 `\\docs`）', () => {
    const injected = renderForgePipelineSection({ forgeDir: '/Users/p/proj/.forge', mode: 'expedition' })
    expect(injected).toContain('/Users/p/proj/.forge/docs')
    expect(injected).not.toContain('/Users/p/proj/.forge\\docs')
    const trailing = renderForgePipelineSection({ forgeDir: '/Users/p/proj/.forge/' })
    expect(trailing).toContain('/Users/p/proj/.forge/docs')
    expect(trailing).not.toContain('//docs')
  })

  it('回退：缺省/空白 forgeDir = 省略文档位置段（渲染不炸、其余段原样）', () => {
    for (const vars of [undefined, { forgeDir: undefined }, { forgeDir: '' }, { forgeDir: '   ' }]) {
      const fallback = renderForgePipelineSection(vars)
      expect(fallback).not.toContain('### 文档位置与存储约束')
      expect(fallback).not.toContain('文档根')
      expect(fallback).not.toContain('```text')
      expect(fallback).toContain('状态存于 forge 管线的状态库')
      expect(fallback).toContain('### 流程')
    }
  })
})

describe('段契约（标签包裹 / 无 forge tool 说明 / 禁裸 {{）', () => {
  const BLITZ_RENDER = renderForgePipelineSection({ mode: 'blitz' })
  it('最外层唯一标签包裹：<forge-pipeline>（contracts XML_TAGS 单源）；标签行独立成 HTML 块（开标签后/闭标签前各一空行——段内 markdown 不被 HTML 块吞掉）', () => {
    for (const v of [text, renderForgePipelineSection({ mode: 'blitz', forgeDir: 'Z:/ws/x/.forge' })]) {
      expect(v.startsWith(`<${XML_TAGS.forgePipeline}>\n\n`)).toBe(true)
      expect(v.endsWith(`\n\n</${XML_TAGS.forgePipeline}>`)).toBe(true)
    }
    expect(XML_TAGS.forgePipeline).toBe('forge-pipeline')
  })

  it('不含 forge tool 说明（工具名零出现——注册面自描述；环间确认点名的 ask_user_question 为宿主问询工具，不属 forge tool 面）', () => {
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

  it('doc-style 标签包裹（XML_TAGS.docStyle 单源）+ 零入参共用 + 标签行独立成 HTML 块（同 pipeline 段空行边界）', () => {
    expect(docStyle.startsWith(`<${XML_TAGS.docStyle}>\n\n`)).toBe(true)
    expect(docStyle.endsWith(`\n\n</${XML_TAGS.docStyle}>`)).toBe(true)
    expect(XML_TAGS.docStyle).toBe('doc-style')
  })

  it('五要点在场：mermaid 优先 / 分点阐述 / 文字精简 / 用词规范 / 不留调整修复叙事，约束全部产出文档', () => {
    expect(docStyle).toContain('文档风格公约')
    expect(docStyle).toContain('全部产出文档')
    expect(docStyle).toContain('mermaid')
    expect(docStyle).toContain('分点阐述')
    expect(docStyle).toContain('文字精简')
    expect(docStyle).toContain('用词规范')
    expect(docStyle).toContain('不留调整修复叙事')
  })

  it('内层无二级尖括号标签（mermaid 提法用代码栅栏措辞——非 XML 标签）', () => {
    const body = docStyle.slice(`<${XML_TAGS.docStyle}>`.length, -`</${XML_TAGS.docStyle}>`.length)
    expect(body).not.toMatch(/<\/?[a-z-]+>/)
  })
})
