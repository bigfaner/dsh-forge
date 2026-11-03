// 单测 —— forge:pipeline / forge:doc-style 段渲染（dual-mode-overhaul 模板化终版；
// forge-dirs-query-tool §2.5 二分改造：机制指引条退役、目录占位符统一 dirKey 记法、
// 公约段末目录真值指引句——四模板 + fixture 同步）：
// 两份自包含模板（六条核心规则双份逐字在场——允许重复、禁止占位抽公共）/ 三段结构
// MD 段体（总纲与核心规则·文档位置与存储约束·流程）/ 四规则口径（状态库+查询为准，
// 执行协议与受限面零回渗）/ 双模式独立渲染（mode 键——目录树与流程图各自版本，缺省
// 回退远征）/ 双 mermaid 含用户裁决节点与箭头固定产物、无 worker 内部节点 / doc-style
// 独立段（XML_TAGS.docStyle 扩集）/ 标签包裹单源 / 不含 forge tool 说明 / 禁裸 {{ /
// forgeDir 缺省回退不炸渲染 / prompt-scoping-and-desc-trim/1.2 角色分流（isSubagentAssembly
// 单点谓词 + 子会话裁剪版双模式 + 共享基底 fixture 守卫 + 两段横切断言）。
import { describe, expect, it } from 'vitest'
import { XML_TAGS } from '@dsh-forge/contracts'
import {
  commanderSectionText,
  FORGE_DOC_STYLE_SECTION_NAME,
  FORGE_DOC_STYLE_SECTION_ORDER,
  forgePipelineSectionText,
  FORGE_SECTION_NAME,
  FORGE_SECTION_ORDER,
  isSubagentAssembly,
  modeOf,
  renderDocStyleSection,
  renderForgePipelineSection,
} from './index.js'
import type { ForgeAssembleContext } from '../faces.js'
import { FORGE_TOOL_NAMES } from '../tools/index.js'

const text = renderForgePipelineSection()

/** 目录真值指引句（forge-dirs-query-tool §2.5——四模板逐字共享基底之一）。 */
const DIRECTORY_TRUTH_GUIDANCE =
  '以上各目录的实际绝对路径一律经 forgeDirs 工具查询获取（dirKey 直接查锚目录；卷宗/任务日志等具体路径经 forgeResolvePath 目的地解析）——目录树承载结构规范，路径真值以工具查询为准。'

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
  it('### 总纲与核心规则 / ### 文档位置与存储约束 / ### 流程 三段标题按序在场（文档根行 = {{forge_docs_root}} 占位，段恒在）', () => {
    expect(text).toContain('### 总纲与核心规则')
    expect(text).toContain('### 流程')
    expect(text).toContain('### 文档位置与存储约束')
    expect(text.indexOf('总纲与核心规则')).toBeLessThan(text.indexOf('文档位置与存储约束'))
    expect(text.indexOf('文档位置与存储约束')).toBeLessThan(text.indexOf('### 流程'))
  })

  it('标题带模式名（## Forge 任务管线（远征模式）/（突击模式））', () => {
    expect(text).toContain('## Forge 任务管线（远征模式）')
    expect(renderForgePipelineSection({ mode: 'blitz' })).toContain('## Forge 任务管线（突击模式）')
  })
})

describe('总纲六条核心规则（双模式逐字在场——允许重复、禁止占位）', () => {
  const RULES = [
    '状态存于 forge 管线的状态库（任务/提案/特性/文档四域，按工作区注册）；一切状态判断以管线工具的查询结果为准，不以盘上文件或记忆推断。',
    '任务身份 = slug/local-id；blocked 任务派生修复任务携带 fix-N；偏差跟进携带 disc-N；slug 与 feature 目录名一致。',
    '提案 accept/reject 仅在用户明示决定后记录。',
    '阶段流转确认两分——用户动作即赞同、模糊才反问：用户消息明确指向下一阶段（拆任务、开始评审/成文、开跑、进下一段等）即视为赞同，直接调用管线工具流转提案或 feature 的状态并推进，不再反问；语义模糊（未明确指向阶段推进、存在多个候选下一阶段、无阶段指向词的短指令如「继续」「好」）一律归模糊，维持 ask_user_question 显式确认。',
    '不可判定边界兜底：复合消息（多动作混杂）、疑问句、否定作用域（如「先不要 X」）、多目标指代、引用转述五类情形一律归模糊走反问；以「阶段指向词 + 目标对象 + 动作词 + 状态前提」四条件锚定判定，任一缺席即兜底反问。',
    '隐式流转约定：隐式赞同流转后，在对话纪要与流转后回复中注明「隐式赞同：<用户动作>」；显式 rejected 提案不触发隐式翻转（superseded 同为不翻转例外，其翻转伴随 decided_at 覆写与 expedition 复活成链，为失效面最重路径）——该例外为提示词层软约束。',
  ]

  it.each(RULES.map((rule, i) => [`规则${i + 1}`, rule]))('%s 逐字在场于双模式渲染', (_label, rule) => {
    expect(text).toContain(rule)
    expect(renderForgePipelineSection({ mode: 'blitz', forgeDir: 'Z:/ws/demo/.forge' })).toContain(rule)
  })

  it('流转规则两分要点（提案 implicit-stage-approval §2.1/§2.2）逐字在场：旧「进入流程下一环节前必须显式确认」退役', () => {
    for (const v of [text, renderForgePipelineSection({ mode: 'blitz' })]) {
      expect(v).toContain('用户动作即赞同、模糊才反问')
      expect(v).toContain('隐式赞同：<用户动作>')
      expect(v).toContain('superseded')
      expect(v).toContain('软约束')
      expect(v).not.toContain('未确认不得推进')
    }
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

describe('git 纪律条件注入（isGitRepo 键）', () => {
  const GIT_RULE = '- 项目为 git 仓库：git 纪律——提交按逻辑单元分批，不混杂无关改动。'

  it('isGitRepo=true：总纲追加 git 纪律规则（双模式逐字在场，位于规则 4 之后）', () => {
    for (const mode of ['expedition', 'blitz'] as const) {
      const v = renderForgePipelineSection({ mode, forgeDir: 'Z:/ws/demo/.forge', isGitRepo: true })
      expect(v).toContain(GIT_RULE)
      expect(v.indexOf('兜底反问。')).toBeLessThan(v.indexOf(GIT_RULE))
      expect(v.indexOf(GIT_RULE)).toBeLessThan(v.indexOf('### 流程'))
    }
  })

  it('isGitRepo 缺省/false：规则零出现（非 git 项目零提示词差异）', () => {
    for (const vars of [undefined, { isGitRepo: false }, { isGitRepo: undefined }]) {
      for (const mode of ['expedition', 'blitz'] as const) {
        expect(renderForgePipelineSection({ ...vars, mode })).not.toContain(GIT_RULE)
      }
    }
    expect(text).not.toContain('git 纪律')
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

  it('远征目录树：提案/特性/探针/圆桌纪要四类（根=docs 层，树内无 docs/ 前缀）', () => {
    expect(EXPEDITION).toContain('├─ proposals/{slug}/')
    expect(EXPEDITION).toContain('├─ features/{slug}/')
    expect(EXPEDITION).toContain('├─ probes/')
    expect(EXPEDITION).toContain('└─ roundtables/{slug}/')
    expect(EXPEDITION).not.toContain('docs/features/')
  })

  it('突击目录树：提案/特性/探针/圆桌纪要四类终态（features/ 行补齐，口径与地图一致）', () => {
    expect(BLITZ).toContain('├─ proposals/{slug}/')
    expect(BLITZ).toContain('├─ features/{slug}/')
    expect(BLITZ).toContain('├─ probes/')
    expect(BLITZ).toContain('└─ roundtables/{slug}/')
  })

  it('产物管理公约三条（放置/临时文件/生命周期——目录占位符 dirKey 记法，forge-dirs-query-tool §2.5）双模式在场', () => {
    const CONVENTIONS = [
      '- **放置纪律**：产物按存储地图对号入座——git 内只放交付物与活正本，过程性产物一律进 `forge.docs_root`，不散落仓库源码树与根目录。',
      '- **临时文件纪律**：临时文件（调试脚本、一次性探针、中间转储、临时截图）禁止丢在工作目录任意位置——统一放 `forge.tmp`（或项目约定的临时区），用完即清，绝不入 git。',
      '- **生命周期纪律**：过程文档按「交付 → 复盘 → 知识沉淀 → 提请批准清理」时序管理，批准后删除或归档；`probes/`、`walkthrough/` 等过程文档永不进 git。',
    ]
    for (const clause of CONVENTIONS) {
      expect(EXPEDITION).toContain(clause)
      expect(BLITZ).toContain(clause)
    }
    expect(EXPEDITION).toContain('产物管理公约（三条）')
    expect(BLITZ).toContain('产物管理公约（三条）')
  })

  it('机制指引条整条退役（产品面不引用项目内部文档 forge-artifact-lifecycle）+ 目录占位符 `{forgeDir}` 记法零残留', () => {
    for (const v of [EXPEDITION, BLITZ]) {
      expect(v).not.toContain('机制指引')
      expect(v).not.toContain('forge-artifact-lifecycle')
      expect(v).not.toContain('{forgeDir}')
    }
  })

  it('目录真值指引句（公约段末——实际路径经 forgeDirs/forgeResolvePath 查询，路径真值以工具查询为准）双模式在场', () => {
    for (const v of [EXPEDITION, BLITZ]) {
      expect(v).toContain(DIRECTORY_TRUTH_GUIDANCE)
      expect(v.indexOf('永不进 git。')).toBeLessThan(v.indexOf(DIRECTORY_TRUTH_GUIDANCE))
    }
  })

  it('存储约束显式清单：远征四类 / 突击四类终态（突击不产特性阶段文档口径保留）', () => {
    expect(EXPEDITION).toContain('入文档根仅四类：提案文档、特性阶段文档、探针产物、圆桌纪要。')
    expect(EXPEDITION).toContain('特性阶段文档产出后经管线工具登记')
    expect(BLITZ).toContain('入文档根仅四类：提案文档、探针产物、圆桌纪要、特性阶段文档；突击不产特性阶段文档')
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

describe('文档位置与存储约束（{{forge_docs_root}} 官方模板占位——变量由装配方注册）', () => {
  it('文档根行 = {{forge_docs_root}} 占位纯值（变量名 = dirKey 下划线形，无附加说明——与 {{model}}/{{cwd}} 同风格），占位前于目录树', () => {
    const v = renderForgePipelineSection({ forgeDir: 'Z:/ws/demo/.forge', mode: 'expedition' })
    expect(v).toContain('文档根：`{{forge_docs_root}}`')
    expect(v.indexOf('{{forge_docs_root}}')).toBeLessThan(v.indexOf('```text'))
  })

  it('forgeDir 注入与否段恒在（占位承载真值，段渲染不依赖会话绑定态）', () => {
    for (const vars of [undefined, { forgeDir: undefined }, { forgeDir: '' }, { forgeDir: 'Z:/ws/demo/.forge' }]) {
      const v = renderForgePipelineSection(vars)
      expect(v).toContain('### 文档位置与存储约束')
      expect(v).toContain('{{forge_docs_root}}')
      expect(v).toContain('```text')
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

  it('不含 forge tool 说明（工具名零出现——注册面自描述；例外 = 目录真值指引句与 {{forge_docs_root}} 占位注记点名 forgeDirs/forgeResolvePath〔§2.5 唯一事实源指引〕；环间确认点名的 ask_user_question 为宿主问询工具，不属 forge tool 面）', () => {
    expect(FORGE_TOOL_NAMES).not.toContain('ask_user_question')
    for (const name of FORGE_TOOL_NAMES) {
      if (name === 'forgeDirs' || name === 'forgeResolvePath') continue // 目录真值指引句唯一例外
      expect(text, `段文本不得含工具名 ${name}`).not.toContain(name)
    }
    expect(text).not.toMatch(/\(string, (required|optional)\)/)
  })

  it('段文本 {{ 引用唯一白名单 = forge_docs_root（官方模板变量——装配方经 systemPrompt.variable 注册）；doc-style 禁用一切 {{', () => {
    for (const v of [text, BLITZ_RENDER]) {
      expect(v.match(/\{\{[a-z][a-z0-9_]*\}\}/g)).toEqual(['{{forge_docs_root}}'])
    }
    expect(renderDocStyleSection()).not.toContain('{{')
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

// ═══ prompt-scoping-and-desc-trim/1.2：pipeline 段按会话角色分流 ═══

/** 共享基底 fixture：产物管理公约前三条整块（prompt-scoping-and-desc-trim/1.2）。
 *  改公约 = 四模板+fixture 同 commit：公约行是主/子 × 远征/突击四模板的共享基底，
 *  改任何一行必须四处模板与本 fixture 同步修改、同 commit 落地；下方 bullet 计数断言
 *  （main=4/sub=3）防公约新条 append-only 只落主版的静默语义漂移。 */
const CONVENTIONS_SHARED_BASE =
  [
    '- **放置纪律**：产物按存储地图对号入座——git 内只放交付物与活正本，过程性产物一律进 `forge.docs_root`，不散落仓库源码树与根目录。',
    '- **临时文件纪律**：临时文件（调试脚本、一次性探针、中间转储、临时截图）禁止丢在工作目录任意位置——统一放 `forge.tmp`（或项目约定的临时区），用完即清，绝不入 git。',
    '- **生命周期纪律**：过程文档按「交付 → 复盘 → 知识沉淀 → 提请批准清理」时序管理，批准后删除或归档；`probes/`、`walkthrough/` 等过程文档永不进 git。',
  ].join('\n') + '\n'

/** 共享基底 fixture：git 纪律句（同上同步规则——四模板字节相等）。 */
const GIT_RULE_SHARED = '- 项目为 git 仓库：git 纪律——提交按逻辑单元分批，不混杂无关改动。'

describe('isSubagentAssembly 单点谓词（官方 header.origin === subagent 唯一字面值锚）', () => {
  it('subagent origin → true；主会话形状 / origin 缺席 / 其它值 / context 缺席 → false', () => {
    expect(isSubagentAssembly({ agent: { id: 'c1', session: { header: { origin: 'subagent' } } } })).toBe(true)
    expect(isSubagentAssembly({ agent: { id: 'm1' } })).toBe(false)
    expect(isSubagentAssembly({ agent: { id: 'm2', session: { header: {} } } })).toBe(false)
    expect(isSubagentAssembly({ agent: { session: { header: { origin: 'main' } } } })).toBe(false)
    expect(isSubagentAssembly({})).toBe(false)
    expect(isSubagentAssembly(undefined)).toBe(false)
  })
})

describe('横切断言（forge:pipeline / forge:commander 两段 text 回调同源消费判据）', () => {
  const SUB_CONTEXT: ForgeAssembleContext = { agent: { id: 'child-1', session: { header: { origin: 'subagent' } } } }
  const MAIN_CONTEXT: ForgeAssembleContext = { agent: { id: 'main-1', session: { header: {} } } }

  it('同一合成 subagent context：pipeline 出裁剪版 + commander 出空串（极性相反单点判据防错向）', () => {
    const pipeline = forgePipelineSectionText(SUB_CONTEXT, { forgeDir: 'Z:/ws/demo/.forge', isGitRepo: true, mode: 'blitz' })
    expect(pipeline).toContain('## Forge 工作纪律（子会话）')
    expect(pipeline).not.toContain('### 总纲与核心规则')
    expect(commanderSectionText(SUB_CONTEXT, () => true)).toBe('')
  })

  it('主会话 context：pipeline 出全文 + commander 出指挥者话术（experts 在场前提；缺席仍空串）', () => {
    expect(forgePipelineSectionText(MAIN_CONTEXT, { forgeDir: 'Z:/ws/demo/.forge', isGitRepo: true, mode: 'blitz' })).toContain('## Forge 任务管线（突击模式）')
    expect(commanderSectionText(MAIN_CONTEXT, () => true)).toContain('指挥者模式')
    expect(commanderSectionText(MAIN_CONTEXT, () => false)).toBe('')
  })
})

describe('子会话裁剪版（subagent 键——双模式「Forge 工作纪律（子会话）」）', () => {
  const SUB_EXPEDITION = renderForgePipelineSection({ subagent: true, mode: 'expedition', forgeDir: 'Z:/ws/demo/.forge', isGitRepo: true })
  const SUB_BLITZ = renderForgePipelineSection({ subagent: true, mode: 'blitz', forgeDir: 'Z:/ws/demo/.forge', isGitRepo: true })

  it('段内标题 = Forge 工作纪律（子会话）；主会话管线标题零出现', () => {
    for (const v of [SUB_EXPEDITION, SUB_BLITZ]) {
      expect(v).toContain('## Forge 工作纪律（子会话）')
      expect(v).not.toContain('## Forge 任务管线')
    }
  })

  it('四类目录树 + 存储约束在场（双模式目录树差异保留——提案/特性/探针/圆桌纪要）', () => {
    for (const v of [SUB_EXPEDITION, SUB_BLITZ]) {
      expect(v).toContain('### 文档位置与存储约束')
      expect(v).toContain('├─ proposals/{slug}/')
      expect(v).toContain('├─ features/{slug}/')
      expect(v).toContain('├─ probes/')
      expect(v).toContain('└─ roundtables/{slug}/')
      expect(v).toContain('入文档根仅四类')
      expect(v).toContain('代码与测试不入文档根——进仓库源码树')
      expect(v).toContain('过程产物只归档到对应 {slug} 子目录，不另设他处')
    }
    expect(SUB_EXPEDITION).toContain('入文档根仅四类：提案文档、特性阶段文档、探针产物、圆桌纪要。')
    expect(SUB_EXPEDITION).toContain('特性阶段文档产出后经管线工具登记')
    expect(SUB_BLITZ).toContain('入文档根仅四类：提案文档、探针产物、圆桌纪要、特性阶段文档；突击不产特性阶段文档')
  })

  it('产物管理公约前三条在场 + 标题计数自洽（三条——列几条写几条，不写「四条」）', () => {
    for (const v of [SUB_EXPEDITION, SUB_BLITZ]) {
      expect(v).toContain('产物管理公约（三条）：')
      expect(v).not.toContain('产物管理公约（四条）')
      expect(v).toContain(CONVENTIONS_SHARED_BASE)
      expect(v).not.toContain('机制指引')
      expect(v).not.toContain('forge-artifact-lifecycle')
    }
  })

  it('git 句在场（isGitRepo=true 前提）；缺省/false 渲染零出现（非 git 项目零提示词差异）', () => {
    expect(SUB_EXPEDITION).toContain(GIT_RULE_SHARED)
    expect(SUB_BLITZ).toContain(GIT_RULE_SHARED)
    for (const isGitRepo of [undefined, false] as const) {
      for (const mode of ['expedition', 'blitz'] as const) {
        expect(renderForgePipelineSection({ subagent: true, mode, forgeDir: 'Z:/ws/demo/.forge', isGitRepo })).not.toContain('git 纪律')
      }
    }
  })

  it('主会话职责面零渗入：六条总纲 / 阶段流转 / 提案裁决 / mermaid 流程图 / ### 流程 全不含', () => {
    for (const v of [SUB_EXPEDITION, SUB_BLITZ]) {
      expect(v).not.toContain('### 总纲与核心规则')
      expect(v).not.toContain('状态存于 forge 管线的状态库')
      expect(v).not.toContain('阶段流转确认两分')
      expect(v).not.toContain('提案 accept/reject')
      expect(v).not.toContain('不可判定边界兜底')
      expect(v).not.toContain('隐式流转约定')
      expect(v).not.toContain('```mermaid')
      expect(v).not.toContain('### 流程')
    }
  })

  it('段契约同主版：forge-pipeline 标签包裹（HTML 块空行边界）+ {{ 引用唯一白名单 forge_docs_root + docs 段恒在（占位承载真值）', () => {
    for (const v of [SUB_EXPEDITION, SUB_BLITZ]) {
      expect(v.startsWith(`<${XML_TAGS.forgePipeline}>\n\n`)).toBe(true)
      expect(v.endsWith(`\n\n</${XML_TAGS.forgePipeline}>`)).toBe(true)
      expect(v.match(/\{\{[a-z][a-z0-9_]*\}\}/g)).toEqual(['{{forge_docs_root}}'])
    }
    for (const mode of ['expedition', 'blitz'] as const) {
      const v = renderForgePipelineSection({ subagent: true, mode })
      expect(v).toContain('## Forge 工作纪律（子会话）')
      expect(v).toContain('### 文档位置与存储约束')
      expect(v).toContain('```text')
    }
  })
})

describe('共享基底 fixture 守卫（主/子 × 远征/突击四模板字节相等）', () => {
  const FOUR_TEMPLATES = {
    'main-expedition': renderForgePipelineSection({ mode: 'expedition', forgeDir: 'Z:/ws/demo/.forge', isGitRepo: true }),
    'main-blitz': renderForgePipelineSection({ mode: 'blitz', forgeDir: 'Z:/ws/demo/.forge', isGitRepo: true }),
    'sub-expedition': renderForgePipelineSection({ subagent: true, mode: 'expedition', forgeDir: 'Z:/ws/demo/.forge', isGitRepo: true }),
    'sub-blitz': renderForgePipelineSection({ subagent: true, mode: 'blitz', forgeDir: 'Z:/ws/demo/.forge', isGitRepo: true }),
  } as const

  it.each(Object.entries(FOUR_TEMPLATES))('%s：公约前三条整块字节相等在场（fixture 单源）', (_label, v) => {
    expect(v).toContain(CONVENTIONS_SHARED_BASE)
  })

  it.each(Object.entries(FOUR_TEMPLATES))('%s：目录真值指引句字节相等在场（forge-dirs-query-tool §2.5 共享基底）', (_label, v) => {
    expect(v).toContain(DIRECTORY_TRUTH_GUIDANCE)
  })

  it.each(Object.entries(FOUR_TEMPLATES))('%s：git 句字节相等在场（isGitRepo=true 前提）', (_label, v) => {
    expect(v).toContain(GIT_RULE_SHARED)
  })

  it('bullet 计数：main=3 / sub=3（机制指引条退役后四模板同数；新条 append-only 单版落时在此显式失败）', () => {
    const clauseCount = (v: string) => (v.match(/^- \*\*/gm) ?? []).length
    expect(clauseCount(FOUR_TEMPLATES['main-expedition'])).toBe(3)
    expect(clauseCount(FOUR_TEMPLATES['main-blitz'])).toBe(3)
    expect(clauseCount(FOUR_TEMPLATES['sub-expedition'])).toBe(3)
    expect(clauseCount(FOUR_TEMPLATES['sub-blitz'])).toBe(3)
  })
})
