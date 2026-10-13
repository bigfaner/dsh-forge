// forge:pipeline / forge:doc-style 系统提示段渲染（dual-mode-overhaul 模板化终版）。
// 结构铁律（用户裁决）：不抽公共文本——远征/突击两份自包含模板函数，四条核心规则
// 双份逐字重复（允许重复，人类可读性优先）；docs 块为函数内局部 const、插值自占一行、
// 尾部单换行（forgeDir 缺省时整体省略，至多多一个空行）；渲染入口纯胶水。
// 文本口径：总纲四规则（状态库+查询为准 / 自然键 / 提案裁决 / 环间确认）——执行协议与
// 受限面零回渗（操作正本在 run-tasks / submit-task 技能）；双 mermaid 含用户裁决节点、
// 各步固定产物标于箭头、终节点=交付、无 worker 内部节点。
// 注意：SystemPrompt 段文本默认 {{var}} 插值（未知引用会炸渲染）——文本禁用裸 {{。
import { XML_TAGS } from '@dsh-forge/contracts'

/** 段名（Interface 8 定死） */
export const FORGE_SECTION_NAME = 'forge:pipeline'

/** 段序（Interface 8 定死：order 510，升序拼接——knowledge 500 之后） */
export const FORGE_SECTION_ORDER = 510

/** doc-style 独立段名（dual-mode-overhaul——文档风格公约拆段） */
export const FORGE_DOC_STYLE_SECTION_NAME = 'forge:doc-style'

/** doc-style 段序（510 之后相邻——双段同属 forge 系统提示面） */
export const FORGE_DOC_STYLE_SECTION_ORDER = 511

/** 管线双模式（preset yml plugin-forge 行 config 的 mode 键；缺省回退远征） */
export type ForgePipelineMode = 'expedition' | 'blitz'

/**
 * 段渲染入参（forgeDir 文档位置动态注入 + mode 双模式键）。
 */
export interface ForgePipelineSectionVars {
  /**
   * 本项目 forge 文档根（绝对路径——调用点经 routing/projects 服务取实际值注入，不假设
   * `<ws>/.forge`）。缺省/空白/未知 = 回退：整段省略文档位置与存储约束（渲染绝不因此
   * 炸掉——纯函数零外抛）。
   */
  readonly forgeDir?: string
  /**
   * 管线模式（preset yml plugin-forge 行 config 的 mode 键）：expedition = 远征（缺省回退）、
   * blitz = 突击。双模式各自模板（目录树与 mermaid 流程图）。
   */
  readonly mode?: ForgePipelineMode
}

/** 模式归一（缺省/未知值回退远征——渲染纯函数永不炸） */
export function modeOf(mode: string | undefined): ForgePipelineMode {
  return mode === 'blitz' ? 'blitz' : 'expedition'
}

/**
 * 远征模式段模板（自包含；docsRoot 为空 = 省略文档位置与存储约束段）。
 * 四条核心规则与突击版逐字相同——允许重复，人类可读性优先，禁止抽公共。
 */
function expeditionSection(docsRoot: string): string {
  const docs = docsRoot === '' ? '' : `### 文档位置与存储约束

文档根：
\`${docsRoot}\`

\`\`\`text
├─ proposals/{slug}/   提案文档（proposal.md 及配套）
├─ features/{slug}/    特性阶段文档（prd/ design/ test/）
└─ probes/             探针（一次性验证脚本与取证产物）
\`\`\`

存储约束：

- 入文档根仅三类：提案文档、特性阶段文档、探针产物。
- 代码与测试不入文档根——进仓库源码树。
- 过程产物只归档到对应 {slug} 子目录，不另设他处。
- 特性阶段文档产出后经管线工具登记，文件与登记一致。
`

  return `## Forge 任务管线（远征模式）

### 总纲与核心规则

- 状态存于 forge 管线的状态库（任务/提案/特性/文档四域，按工作区注册）；一切状态判断以管线工具的查询结果为准，不以盘上文件或记忆推断。
- 任务身份 = slug/local-id；blocked 任务派生修复任务携带 fix-N；偏差跟进携带 disc-N；slug 与 feature 目录名一致。
- 提案 accept/reject 仅在用户明示决定后记录。
- 进入流程下一环节前，使用 ask_user_question 工具显式向用户确认；确认后推进，并同步调用管线工具流转提案或 feature 的状态；未确认不得推进。

${docs}
### 流程

\`\`\`mermaid
flowchart LR
    A[brainstorm] -->|"proposal.md"| B{用户裁决}
    B -->|"accept"| C[write-prd]
    C -->|"prd-spec / user-stories / ui-functions"| D["ui-design（有 UI 面）"]
    D -->|"ui-design.md + prototype"| E[tech-design]
    C -->|"无 UI 面"| E
    E -->|"tech-design / ER / schema / handbook"| F[breakdown-tasks]
    F -->|"任务清单"| G["/run-dag-tasks 派发"]
    G --> H["eval → 交付"]
\`\`\`
`
}

/**
 * 突击模式段模板（自包含；docsRoot 为空 = 省略文档位置与存储约束段）。
 * 四条核心规则与远征版逐字相同——允许重复，人类可读性优先，禁止抽公共。
 */
function blitzSection(docsRoot: string): string {
  const docs = docsRoot === '' ? '' : `### 文档位置与存储约束

文档根：
\`${docsRoot}\`

\`\`\`text
├─ proposals/{slug}/   提案 + 直挂任务（无 feature 阶段文档）
└─ probes/             探针
\`\`\`

存储约束：

- 入文档根仅两类：提案文档、探针产物；突击不产特性阶段文档。
- 代码与测试不入文档根——进仓库源码树。
- 过程产物只归档到对应 {slug} 子目录，不另设他处。
`

  return `## Forge 任务管线（突击模式）

### 总纲与核心规则

- 状态存于 forge 管线的状态库（任务/提案/特性/文档四域，按工作区注册）；一切状态判断以管线工具的查询结果为准，不以盘上文件或记忆推断。
- 任务身份 = slug/local-id；blocked 任务派生修复任务携带 fix-N；偏差跟进携带 disc-N；slug 与 feature 目录名一致。
- 提案 accept/reject 仅在用户明示决定后记录。
- 进入流程下一环节前，使用 ask_user_question 工具显式向用户确认；确认后推进，并同步调用管线工具流转提案或 feature 的状态；未确认不得推进。

${docs}
### 流程

\`\`\`mermaid
flowchart LR
    A[brainstorm] -->|"proposal.md"| B{用户裁决}
    B -->|"accept"| C[quick-tasks]
    C -->|"任务清单"| D["/run-dag-tasks 派发"]
    D --> E[交付]
\`\`\`
`
}

/**
 * 管线段全文（纯胶水：模式归一 → docsRoot 归一 → 选模板 → XML 标签包裹）。
 * vars.forgeDir / vars.mode 由调用点程序化注入实际值（非提示词侧插值），段文本天然
 * 不含裸 {{ 占位；不点名 forge 工具（防「提示词与注册面双源漂移」——工具面由 dsh
 * tool 注册面自描述；环间确认点名的 ask_user_question 为宿主问询工具，非 forge 面）。
 */
export function renderForgePipelineSection(vars: ForgePipelineSectionVars = {}): string {
  const mode = modeOf(typeof vars.mode === 'string' ? vars.mode : undefined)
  const dir = typeof vars.forgeDir === 'string' ? vars.forgeDir.trim().replace(/[\\/]+$/, '') : ''
  const docsRoot = dir === '' ? '' : `${dir}\\docs`
  const body = mode === 'blitz' ? blitzSection(docsRoot) : expeditionSection(docsRoot)
  return `<${XML_TAGS.forgePipeline}>\n${body}\n</${XML_TAGS.forgePipeline}>`
}

/**
 * doc-style 独立段全文（dual-mode-overhaul：文档风格公约从 forge-pipeline 段拆出——
 * XML_TAGS.docStyle 封闭集扩集；双模式共用注入，零入参，单模板字符串）。
 */
export function renderDocStyleSection(): string {
  return `<${XML_TAGS.docStyle}>
## 文档风格公约

约束本工作区全部产出文档（含 PRD/走查记录/台账/README）：

- 图示优先用 mermaid（\`\`\`mermaid 代码块）；能用一张图说清的不用大段文字。
- 文字精简：只写结论与必要上下文，不复述代码与流程细节。
- 不留调整修复叙事：不记录「改了哪里、为什么改、排查过程」等过程性内容，文档只呈现当前事实。
</${XML_TAGS.docStyle}>`
}
