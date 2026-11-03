// forge:pipeline / forge:doc-style 系统提示段渲染（dual-mode-overhaul 模板化终版；
// prompt-scoping-and-desc-trim/1.2 增按会话角色分流）。
// 结构铁律（用户裁决）：不抽公共文本——主/子会话 × 远征/突击四份自包含模板函数，
// 核心规则与共享基底多份逐字重复（允许重复，人类可读性优先；共享基底字节相等由
// index.test.ts fixture 守卫）；docs 块为函数内局部 const、插值自占一行、尾部单换行。
// 目录口径（forge-dirs-query-tool 用户裁决）：目录占位统一 dirKey 记法 + 官方
// {{var}} 模板插值——文档根行放 `{{forge_docs_root}}` 占位，变量由装配方经
// systemPrompt.variable 注册（每次组装按会话求值、dsh 插值器直接渲染）。
// 角色分流（isSubagentAssembly 判据）：主会话渲染全文；子会话渲染裁剪版「Forge 工作
// 纪律（子会话）」= 四类目录树存储约束 + 产物管理公约三条 + 目录真值指引句 + git 句；六条总纲与
// mermaid 流程图为主会话职责面，不入子会话版。受众判据：
// 凡子会话也须遵守的工作区公约入两版共享基底；凡主会话职责规则只入主会话版；
// 新增行先裁决受众归属，禁止两版语义漂移。
// 文本口径：总纲四规则（状态库+查询为准 / 自然键 / 提案裁决 / 环间确认）——执行协议与
// 受限面零回渗（操作正本在派发核心文档 docs/business-rules/task-pipeline.md / submit-task 技能）；双 mermaid 含用户裁决节点、
// 各步固定产物标于箭头、终节点=交付、无 worker 内部节点；doc-style 五要点（mermaid 优先 /
// 分点阐述 / 文字精简 / 用词规范 / 不留调整修复叙事）。
// 注意：SystemPrompt 段文本默认 {{var}} 插值（未知引用会炸渲染）——本文本唯一 {{ 引用
// = forge_docs_root（装配方注册的 dirKey 派生变量），其余文本禁用裸 {{。
import { XML_TAGS } from '@dsh-forge/contracts'
import type { ForgeAssembleContext } from '../faces.js'
import { FORGE_COMMANDER_SECTION_NAME, FORGE_COMMANDER_SECTION_ORDER, renderCommanderSection } from './commander.js'

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
 * 段渲染入参（mode 双模式键 + git 探测结果；docsRoot 经官方 {{forge_docs_root}}
 * 变量插值承载，不入段渲染入参）。
 */
export interface ForgePipelineSectionVars {
  /**
   * 本项目 forge 目录（绝对路径——调用点经 routing/projects 服务取实际值注入；装配方
   * 以此探测 isGitRepo 并注册 forge_docs_root 变量，段渲染本身不再消费）。
   */
  readonly forgeDir?: string
  /**
   * 管线模式（preset yml plugin-forge 行 config 的 mode 键）：expedition = 远征（缺省回退）、
   * blitz = 突击。双模式各自模板（目录树与 mermaid 流程图）。
   */
  readonly mode?: ForgePipelineMode
  /**
   * 本项目是否为 git 仓库（调用点按项目根 `.git` 在场探测注入）。true = 总纲追加
   * git 纪律规则；缺省/false = 不追加（非 git 项目零提示词差异）。渲染纯函数不做探测。
   */
  readonly isGitRepo?: boolean
  /**
   * 会话角色（prompt-scoping-and-desc-trim/1.2）：true = 子会话装配 → 裁剪版模板
   * （「## Forge 工作纪律（子会话）」= 四类目录树存储约束 + 公约前三条 + git 句；六条
   * 总纲/公约第四条/mermaid 流程图不入）；缺省/false = 主会话全文（与角色分流前逐字节
   * 一致）。调用点经 isSubagentAssembly(context) 求值注入——渲染纯函数不做判据。
   */
  readonly subagent?: boolean
}

/** 模式归一（缺省/未知值回退远征——渲染纯函数永不炸） */
export function modeOf(mode: string | undefined): ForgePipelineMode {
  return mode === 'blitz' ? 'blitz' : 'expedition'
}

/**
 * 子会话装配单点判据（prompt-scoping-and-desc-trim/1.2）：官方 SessionHeader.origin
 * === 'subagent'（唯一字面值——子会话出生即写、header 不可变，首回合组装在场）。
 * 消费面：forge:pipeline 与 forge:commander 两段 text 回调同源调用（此前两份极性相反
 * 的 origin 内联副本有静默错向风险，收敛一处）；缺席/异常形状 = false（主会话——主会话
 * 与 fork 的创建 meta 均不写 origin，有害方向结构不可达）。
 */
export function isSubagentAssembly(context: ForgeAssembleContext | undefined): boolean {
  return context?.agent?.session?.header?.origin === 'subagent'
}

/**
 * forge:pipeline 段 text 回调体（角色分流单点：isSubagentAssembly 判据 → 主会话全文 /
 * 子会话裁剪版；forgeDir/isGitRepo/mode 由装配方解析注入——本函数纯胶水零探测）。
 */
export function forgePipelineSectionText(
  context: ForgeAssembleContext | undefined,
  vars: Omit<ForgePipelineSectionVars, 'subagent'>,
): string {
  return renderForgePipelineSection({ ...vars, subagent: isSubagentAssembly(context) })
}

/**
 * forge:commander 段 text 回调体（条件注入单点：experts 服务在场 + 主会话装配——
 * isSubagentAssembly 与 forge:pipeline 段同源判据；空串 = 官方 dsh-system-prompt 对
 * 空串 section 整体过滤，与「从未注册」逐字节一致）。
 */
export function commanderSectionText(
  context: ForgeAssembleContext | undefined,
  expertsServicePresent: () => boolean,
): string {
  return expertsServicePresent() && !isSubagentAssembly(context) ? renderCommanderSection() : ''
}

/**
 * 远征模式段模板（自包含）。四条核心规则与突击版逐字相同——允许重复，人类可读性优先，禁止抽公共。
 * 文档根统一 dirKey 记法（forge.docsRoot）——实际绝对路径经 forgeDirs 工具查询（AGENTS 1.7：
 * 目录真值唯一事实源 = 工具查询，提示词不注入会话级绝对路径）。
 */
function expeditionSection(isGitRepo: boolean): string {
  const git = isGitRepo ? '\n- 项目为 git 仓库：git 纪律——提交按逻辑单元分批，不混杂无关改动。' : ''
  const docs = `### 文档位置与存储约束

文档根：\`{{forge_docs_root}}\`

\`\`\`text
├─ proposals/{slug}/   提案文档（proposal.md 及配套）
├─ features/{slug}/    特性阶段文档（prd/ design/ test/）
├─ probes/             探针（一次性验证脚本与取证产物）
└─ roundtables/{slug}/ 圆桌纪要（与提案/特性无关的会议纪要）
\`\`\`

存储约束：

- 入文档根仅四类：提案文档、特性阶段文档、探针产物、圆桌纪要。
- 代码与测试不入文档根——进仓库源码树。
- 过程产物只归档到对应 {slug} 子目录，不另设他处。
- 特性阶段文档产出后经管线工具登记，文件与登记一致。

产物管理公约（三条）：

- **放置纪律**：产物按存储地图对号入座——git 内只放交付物与活正本，过程性产物一律进 \`forge.docsRoot\`，不散落仓库源码树与根目录。
- **临时文件纪律**：临时文件（调试脚本、一次性探针、中间转储、临时截图）禁止丢在工作目录任意位置——统一放 \`forge.tmp\`（或项目约定的临时区），用完即清，绝不入 git。
- **生命周期纪律**：过程文档按「交付 → 复盘 → 知识沉淀 → 提请批准清理」时序管理，批准后删除或归档；\`probes/\`、\`walkthrough/\` 等过程文档永不进 git。

以上各目录的实际绝对路径一律经 forgeDirs 工具查询获取（dirKey 直接查锚目录；卷宗/任务日志等具体路径经 forgeResolvePath 目的地解析）——目录树承载结构规范，路径真值以工具查询为准。
`

  return `## Forge 任务管线（远征模式）

### 总纲与核心规则

- 状态存于 forge 管线的状态库（任务/提案/特性/文档四域，按工作区注册）；一切状态判断以管线工具的查询结果为准，不以盘上文件或记忆推断。
- 任务身份 = slug/local-id；blocked 任务派生修复任务携带 fix-N；偏差跟进携带 disc-N；slug 与 feature 目录名一致。
- 提案 accept/reject 仅在用户明示决定后记录。
- 阶段流转确认两分——用户动作即赞同、模糊才反问：用户消息明确指向下一阶段（拆任务、开始评审/成文、开跑、进下一段等）即视为赞同，直接调用管线工具流转提案或 feature 的状态并推进，不再反问；语义模糊（未明确指向阶段推进、存在多个候选下一阶段、无阶段指向词的短指令如「继续」「好」）一律归模糊，维持 ask_user_question 显式确认。
- 不可判定边界兜底：复合消息（多动作混杂）、疑问句、否定作用域（如「先不要 X」）、多目标指代、引用转述五类情形一律归模糊走反问；以「阶段指向词 + 目标对象 + 动作词 + 状态前提」四条件锚定判定，任一缺席即兜底反问。
- 隐式流转约定：隐式赞同流转后，在对话纪要与流转后回复中注明「隐式赞同：<用户动作>」；显式 rejected 提案不触发隐式翻转（superseded 同为不翻转例外，其翻转伴随 decided_at 覆写与 expedition 复活成链，为失效面最重路径）——该例外为提示词层软约束。${git}

${docs}
### 流程

\`\`\`mermaid
flowchart LR
    A[brainstorm] -->|"proposal.md"| B{用户裁决}
    B -->|"accept"| C[write-prd]
    C -->|"prd-spec / user-stories / ui-functions"| P[review-prd]
    P -->|"Blocker 清零·有 UI 面"| D["ui-design（有 UI 面）"]
    P -->|"Blocker 返工"| C
    P -->|"Blocker 清零·无 UI 面"| E[tech-design]
    D -->|"ui-design.md + prototype"| E
    E -->|"tech-design / ER / schema / handbook"| R[review-tech]
    R -->|"Blocker 清零·放行"| F[breakdown-tasks]
    R -->|"Blocker 返工"| E
    F -->|"任务清单"| G["/run-dag-tasks 派发"]
    G --> H[交付]
\`\`\`
`
}

/**
 * 远征模式子会话裁剪模板（自包含）。
 * 受众判据见文件头注：六条总纲/公约第四条/mermaid 流程图为主会话职责面，不入本版；
 * 共享基底（四类目录树存储约束 + 公约前三条 + git 句）与主会话远征版逐字双份。
 */
function expeditionSubagentSection(isGitRepo: boolean): string {
  const git = isGitRepo ? '\n- 项目为 git 仓库：git 纪律——提交按逻辑单元分批，不混杂无关改动。\n' : ''
  const docs = `### 文档位置与存储约束

文档根：\`{{forge_docs_root}}\`

\`\`\`text
├─ proposals/{slug}/   提案文档（proposal.md 及配套）
├─ features/{slug}/    特性阶段文档（prd/ design/ test/）
├─ probes/             探针（一次性验证脚本与取证产物）
└─ roundtables/{slug}/ 圆桌纪要（与提案/特性无关的会议纪要）
\`\`\`

存储约束：

- 入文档根仅四类：提案文档、特性阶段文档、探针产物、圆桌纪要。
- 代码与测试不入文档根——进仓库源码树。
- 过程产物只归档到对应 {slug} 子目录，不另设他处。
- 特性阶段文档产出后经管线工具登记，文件与登记一致。

产物管理公约（三条）：

- **放置纪律**：产物按存储地图对号入座——git 内只放交付物与活正本，过程性产物一律进 \`forge.docsRoot\`，不散落仓库源码树与根目录。
- **临时文件纪律**：临时文件（调试脚本、一次性探针、中间转储、临时截图）禁止丢在工作目录任意位置——统一放 \`forge.tmp\`（或项目约定的临时区），用完即清，绝不入 git。
- **生命周期纪律**：过程文档按「交付 → 复盘 → 知识沉淀 → 提请批准清理」时序管理，批准后删除或归档；\`probes/\`、\`walkthrough/\` 等过程文档永不进 git。

以上各目录的实际绝对路径一律经 forgeDirs 工具查询获取（dirKey 直接查锚目录；卷宗/任务日志等具体路径经 forgeResolvePath 目的地解析）——目录树承载结构规范，路径真值以工具查询为准。
`

  return `## Forge 工作纪律（子会话）

${docs}${git}`
}

/**
 * 突击模式段模板（自包含）。
 * 六条核心规则与远征版逐字相同——允许重复，人类可读性优先，禁止抽公共。
 */
function blitzSection(isGitRepo: boolean): string {
  const git = isGitRepo ? '\n- 项目为 git 仓库：git 纪律——提交按逻辑单元分批，不混杂无关改动。' : ''
  const docs = `### 文档位置与存储约束

文档根：\`{{forge_docs_root}}\`

\`\`\`text
├─ proposals/{slug}/   提案 + 直挂任务（无 feature 阶段文档）
├─ features/{slug}/    特性阶段文档（管线产出）
├─ probes/             探针（一次性验证脚本与取证产物）
└─ roundtables/{slug}/ 圆桌纪要（与提案无关的会议纪要）
\`\`\`

存储约束：

- 入文档根仅四类：提案文档、探针产物、圆桌纪要、特性阶段文档；突击不产特性阶段文档（features/ 为管线既有产物存放区）。
- 代码与测试不入文档根——进仓库源码树。
- 过程产物只归档到对应 {slug} 子目录，不另设他处。

产物管理公约（三条）：

- **放置纪律**：产物按存储地图对号入座——git 内只放交付物与活正本，过程性产物一律进 \`forge.docsRoot\`，不散落仓库源码树与根目录。
- **临时文件纪律**：临时文件（调试脚本、一次性探针、中间转储、临时截图）禁止丢在工作目录任意位置——统一放 \`forge.tmp\`（或项目约定的临时区），用完即清，绝不入 git。
- **生命周期纪律**：过程文档按「交付 → 复盘 → 知识沉淀 → 提请批准清理」时序管理，批准后删除或归档；\`probes/\`、\`walkthrough/\` 等过程文档永不进 git。

以上各目录的实际绝对路径一律经 forgeDirs 工具查询获取（dirKey 直接查锚目录；卷宗/任务日志等具体路径经 forgeResolvePath 目的地解析）——目录树承载结构规范，路径真值以工具查询为准。
`

  return `## Forge 任务管线（突击模式）

### 总纲与核心规则

- 状态存于 forge 管线的状态库（任务/提案/特性/文档四域，按工作区注册）；一切状态判断以管线工具的查询结果为准，不以盘上文件或记忆推断。
- 任务身份 = slug/local-id；blocked 任务派生修复任务携带 fix-N；偏差跟进携带 disc-N；slug 与 feature 目录名一致。
- 提案 accept/reject 仅在用户明示决定后记录。
- 阶段流转确认两分——用户动作即赞同、模糊才反问：用户消息明确指向下一阶段（拆任务、开始评审/成文、开跑、进下一段等）即视为赞同，直接调用管线工具流转提案或 feature 的状态并推进，不再反问；语义模糊（未明确指向阶段推进、存在多个候选下一阶段、无阶段指向词的短指令如「继续」「好」）一律归模糊，维持 ask_user_question 显式确认。
- 不可判定边界兜底：复合消息（多动作混杂）、疑问句、否定作用域（如「先不要 X」）、多目标指代、引用转述五类情形一律归模糊走反问；以「阶段指向词 + 目标对象 + 动作词 + 状态前提」四条件锚定判定，任一缺席即兜底反问。
- 隐式流转约定：隐式赞同流转后，在对话纪要与流转后回复中注明「隐式赞同：<用户动作>」；显式 rejected 提案不触发隐式翻转（superseded 同为不翻转例外，其翻转伴随 decided_at 覆写与 expedition 复活成链，为失效面最重路径）——该例外为提示词层软约束。${git}

${docs}
### 流程

\`\`\`mermaid
flowchart LR
    A[brainstorm] -->|"proposal.md"| B{用户裁决}
    B -->|"reject 返工提案"| A
    B -->|"accept"| C[quick-tasks]
    C -->|"任务清单"| D["/run-dag-tasks 派发"]
    D --> E[交付]
\`\`\`
`
}

/**
 * 突击模式子会话裁剪模板（自包含）。
 * 受众判据见文件头注：六条总纲/公约第四条/mermaid 流程图为主会话职责面，不入本版；
 * 共享基底（四类目录树存储约束 + 公约前三条 + git 句）与主会话突击版逐字双份。
 */
function blitzSubagentSection(isGitRepo: boolean): string {
  const git = isGitRepo ? '\n- 项目为 git 仓库：git 纪律——提交按逻辑单元分批，不混杂无关改动。\n' : ''
  const docs = `### 文档位置与存储约束

文档根：\`{{forge_docs_root}}\`

\`\`\`text
├─ proposals/{slug}/   提案 + 直挂任务（无 feature 阶段文档）
├─ features/{slug}/    特性阶段文档（管线产出）
├─ probes/             探针（一次性验证脚本与取证产物）
└─ roundtables/{slug}/ 圆桌纪要（与提案无关的会议纪要）
\`\`\`

存储约束：

- 入文档根仅四类：提案文档、探针产物、圆桌纪要、特性阶段文档；突击不产特性阶段文档（features/ 为管线既有产物存放区）。
- 代码与测试不入文档根——进仓库源码树。
- 过程产物只归档到对应 {slug} 子目录，不另设他处。

产物管理公约（三条）：

- **放置纪律**：产物按存储地图对号入座——git 内只放交付物与活正本，过程性产物一律进 \`forge.docsRoot\`，不散落仓库源码树与根目录。
- **临时文件纪律**：临时文件（调试脚本、一次性探针、中间转储、临时截图）禁止丢在工作目录任意位置——统一放 \`forge.tmp\`（或项目约定的临时区），用完即清，绝不入 git。
- **生命周期纪律**：过程文档按「交付 → 复盘 → 知识沉淀 → 提请批准清理」时序管理，批准后删除或归档；\`probes/\`、\`walkthrough/\` 等过程文档永不进 git。

以上各目录的实际绝对路径一律经 forgeDirs 工具查询获取（dirKey 直接查锚目录；卷宗/任务日志等具体路径经 forgeResolvePath 目的地解析）——目录树承载结构规范，路径真值以工具查询为准。
`

  return `## Forge 工作纪律（子会话）

${docs}${git}`
}

// docsRoot 派生单源 = contracts docsRootOfForgeDir（§2.8 收编——平台独立连接：
// Windows 风格（盘符/UNC）→ `\docs`，POSIX → `/docs`；dir 已归一去尾分隔符）。

/**
 * 管线段全文（纯胶水：模式归一 → 角色分流（subagent 键）→ 四模板选一 → XML 标签包裹）。
 * vars.mode / vars.isGitRepo 由调用点程序化注入（isGitRepo 由装配方以 forgeDir 探测）；
 * 段文本天然不含裸 {{ 占位与绝对路径——目录口径统一 dirKey 记法（AGENTS 1.7 工具唯一事实源）。
 */
export function renderForgePipelineSection(vars: ForgePipelineSectionVars = {}): string {
  const mode = modeOf(typeof vars.mode === 'string' ? vars.mode : undefined)
  const body =
    vars.subagent === true
      ? mode === 'blitz'
        ? blitzSubagentSection(vars.isGitRepo === true)
        : expeditionSubagentSection(vars.isGitRepo === true)
      : mode === 'blitz'
        ? blitzSection(vars.isGitRepo === true)
        : expeditionSection(vars.isGitRepo === true)
  // 标签行独立成 HTML 块：开标签后/闭标签前各留空行，段内 markdown（标题/列表/围栏）
  // 才不被 HTML 块吞掉内联化（GUI 按 markdown 渲染系统提示词）。
  return `<${XML_TAGS.forgePipeline}>\n\n${body}\n</${XML_TAGS.forgePipeline}>`
}

export { FORGE_COMMANDER_SECTION_NAME, FORGE_COMMANDER_SECTION_ORDER, renderCommanderSection }

/**
 * doc-style 独立段全文（dual-mode-overhaul：文档风格公约从 forge-pipeline 段拆出——
 * XML_TAGS.docStyle 封闭集扩集；双模式共用注入，零入参，单模板字符串）。
 */
export function renderDocStyleSection(): string {
  // 标签行独立成 HTML 块（同上——开标签后/闭标签前各留空行）。
  return `<${XML_TAGS.docStyle}>

## 文档风格公约

约束本工作区全部产出文档（含 PRD/走查记录/台账/README）：

- 图示优先用 mermaid（\`\`\`mermaid 代码块）；能用一张图说清的不用大段文字。
- 分点阐述：注意换行、逐点分行，不挤成一个大段落。
- 文字精简：只写结论与必要上下文，不复述代码与流程细节。
- 用词规范：不用怪词与生造词，用通用准确的技术表述。
- 不留调整修复叙事：不记录「改了哪里、为什么改、排查过程」等过程性内容，文档只呈现当前事实。

</${XML_TAGS.docStyle}>`
}
