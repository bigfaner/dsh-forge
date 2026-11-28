// forge:pipeline 系统提示段（plugin-spec 1.8 自 plugin-forge prompt/index.ts 迁入改写）。
// 唯一模式（用户裁决 2026-11 grilling）：四模板收编为主/子会话两份自包含模板、改写为
// Spec/Goal/AC 词汇——双模板面（mode 键与分模式分流）不迁入本包，目录树改 .forge/specs/{slug}/。
// 结构铁律沿用：不抽公共文本——主/子会话模板各自自包含；docs 块为函数内局部 const、
// 插值自占一行、尾部单换行。
// 目录口径（AGENTS 1.7）：目录占位统一 dirKey/相对根记法，实际绝对路径一律经 forge_dirs /
// forge_resolve_path 工具查询——目录真值唯一事实源 = 工具查询，段文本零 {{var}} 依赖
// （{{forge_docs_root}} 变量随 plugin-forge 残本一并退役，段文本禁用一切裸 {{。
// presetBinding 注入判据（核销报告 research/official-verification.md §3）：
// 缺省（spec 行 config 无 presetBinding）= 无条件注入；presetBinding=forge 绑定（M5
// 组合器经 config 约定缝下发）= 会话预设命中才注入、未命中空串过滤（官方 dsh-system-prompt
// 对空串 section 整体过滤，与「从未注册」逐字节一致）。会话预设 = 事件回放投影
// （出生头为基 + agent-preset/selected 覆盖，沿 task-loop tools/session.ts 同径机械，
// 不读裸出生头）；官方 blank-only 切预设 + 每次组装现求值 → 回调无需自行处理中途翻转。
// A1 自含形态：spec 包零预设知识——presetBinding 仅作不透明字符串比对，包内零预设词汇。
// forge:commander 段不迁（已在 plugins/task-loop/host/prompt/commander.ts——本包不承载）。
import { XML_TAGS } from '@dsh-forge/contracts'
import { FORGE_DOC_STYLE_SECTION_NAME, FORGE_DOC_STYLE_SECTION_ORDER, renderDocStyleSection } from '@dsh-forge/lib-api/tools/doc-style'
import type { SpecAssembleContext, SpecSessionEventFace, SpecSessionFace } from '../faces.js'

/** forge:pipeline 段名（Interface 8 定死） */
export const FORGE_PIPELINE_SECTION_NAME = 'forge:pipeline'

/** forge:pipeline 段序（order 510——knowledge 500 之后） */
export const FORGE_PIPELINE_SECTION_ORDER = 510

// forge:doc-style 段直迁在位（名称/段序/渲染本体单源已下沉 lib/api/tools/doc-style——
// 1.18 消插件间 import 活边；此处 re-export 保持消费面零改动）。
export { FORGE_DOC_STYLE_SECTION_NAME, FORGE_DOC_STYLE_SECTION_ORDER, renderDocStyleSection }

/** 段渲染入参（presetBinding 绑定值 + git 探测结果） */
export interface SpecPipelineSectionVars {
  /**
   * presetBinding 绑定值（M5 forge 组合器经 spec 行 config 约定缝下发的预设 id——
   * 不透明字符串）：缺省/undefined = 无条件注入；有值 = 会话预设投影命中才注入。
   */
  readonly presetBinding?: string
  /** 本项目是否为 git 仓库（调用点按项目根 `.git` 在场探测注入；渲染纯函数不做探测） */
  readonly isGitRepo?: boolean
  /** 子会话装配裁剪版（isSubagentAssembly 判据；缺省 = 主会话全文） */
  readonly subagent?: boolean
}

/**
 * 会话预设投影（事件回放——出生头为基 + 'agent-preset/selected' 覆盖；上游
 * dsh-agent-preset-registry agentPreset 投影同径："never the header alone"）。
 * 自尾向首取最近一次 string 型 agentPreset；无事件/形状漂移/日志缺席 = 出生头回落；
 * 两者皆缺席 = undefined。防御读取零外抛。
 */
export function sessionAgentPresetOf(session: SpecSessionFace | undefined): string | undefined {
  if (typeof session?.snapshotEvents === 'function') {
    let events: readonly SpecSessionEventFace[]
    try {
      events = session.snapshotEvents()
    } catch {
      events = []
    }
    for (let i = events.length - 1; i >= 0; i--) {
      const event = events[i]
      if (event?.type !== 'agent-preset/selected') continue
      const preset = (event.data as { agentPreset?: unknown } | undefined)?.agentPreset
      return typeof preset === 'string' ? preset : undefined
    }
  }
  return session?.header?.agentPreset
}

/**
 * 子会话装配单点判据（prompt-scoping-and-desc-trim/1.2 同径）：官方 SessionHeader.origin
 * === 'subagent'；缺席/异常形状 = false（主会话）。
 */
export function isSubagentAssembly(context: SpecAssembleContext | undefined): boolean {
  return context?.agent?.session?.header?.origin === 'subagent'
}

/**
 * forge:pipeline 段 text 回调体（注入判据 + 角色分流单点）：
 * presetBinding 缺省 = 无条件注入；有绑定 = 会话预设投影命中该绑定值才注入、未命中
 * 空串（官方整体过滤语义）。渲染本体零探测零判据（纯胶水）。
 */
export function specPipelineSectionText(
  context: SpecAssembleContext | undefined,
  vars: Omit<SpecPipelineSectionVars, 'subagent'>,
): string {
  if (vars.presetBinding !== undefined && sessionAgentPresetOf(context?.agent?.session) !== vars.presetBinding) {
    return ''
  }
  return renderSpecPipelineSection({ ...vars, subagent: isSubagentAssembly(context) })
}

/** git 纪律行（isGitRepo 条件注入——主/子会话两模板逐字双份） */
function gitRule(): string {
  return '\n- 项目为 git 仓库：git 纪律——提交按逻辑单元分批，不混杂无关改动。'
}

/** 文档位置与存储约束块（唯一模式一套——主/子会话两模板逐字双份，不抽公共） */
function docsBlock(): string {
  return `### 文档位置与存储约束

文档根：\`.forge/\`（相对项目根；实际绝对路径经 forge_dirs 工具查询）

\`\`\`text
.forge/
├─ specs/{slug}/       Spec 文档（spec.md——用户旅程/改动范围/tiers 交付档位）
├─ probes/             探针（一次性验证脚本与取证产物，按 bugId 分子目录；不入 git）
├─ spikes/             Spike（探索验证的结论与脚本，按主题分子目录；不入 git）
└─ roundtables/{slug}/ 圆桌纪要
\`\`\`

存储约束：

- 入文档根仅四类：Spec 文档、探针、Spike、圆桌纪要。
- 代码与测试不入文档根——进仓库源码树。
- 过程产物只归档到对应 {slug} 子目录，不另设他处。
- Spec 文档落 specs/{slug}/spec.md（进 git 活正本）；Spec 状态以管线工具查询为准。

产物管理公约（三条）：

- **放置纪律**：产物按存储地图对号入座——git 内只放交付物与活正本，过程性产物一律进文档根，不散落仓库源码树与根目录。
- **临时文件纪律**：临时文件（调试脚本、一次性探针、中间转储、临时截图）禁止丢在工作目录任意位置——统一放临时区，用完即清，绝不入 git。
- **生命周期纪律**：过程文档按「交付 → 复盘 → 知识沉淀 → 提请批准清理」时序管理，批准后删除或归档；\`probes/\`、\`spikes/\`、\`walkthrough/\` 等过程文档永不进 git。

探索（探针与 Spike）——先检索后探索：\`knowledge_search\` 已有结论即复用并引用条目 id，不重复探索。仅以下情况探索；探索只读求证，不改产品代码，结论须能追溯到产物内的证据：

| 种类 | 何时做 | 回答什么 |
|---|---|---|
| 探针 | 一次性验证或取证：复现缺陷、判别根因、核验外部或官方机械的承重假设（装载通道、注册时序、版本行为）、走查取证 | 事实是什么 |
| Spike | 方案级不确定：对接外部系统、引入第三方库或新机制之前 | 可不可行、什么形态、代价多大 |

产物落点（目录经 \`forge_dirs\` 查询，不自行拼接）：

- 探针 → \`project.probes_dir\` 下 \`<bugId>/\`（缺陷链）或 \`<主题>/\`；顶层必须有 \`.md\` 结论——验证了什么、怎么验、结论、证据引用。排查建模报告落此顶层（同缝拦截据此放行）。
- Spike → \`project.spikes_dir\` 下 \`<主题>/\`；必须有 \`README.md\`——问题、结论（可行 / 不可行 / 条件可行）、关键取舍、证据；脚本仅作佐证。
- 两目录均不入 git；需长期保留的结论经 learn 技能进知识库。循环收口复盘时，本次循环产出的探针与 Spike 是事实材料。

以上各目录的实际绝对路径一律经 forge_dirs 工具查询获取（dirKey 直接查锚目录，带参键该工具会标明所需参数；卷宗、任务目录等带参路径经 forge_resolve_path 目的地解析）——目录树承载结构规范，路径真值以工具查询为准。
`
}

/**
 * 主会话段模板（自包含，唯一模式）。
 * 总纲 = Spec/Goal/AC 词汇（状态库/AC 对齐键/状态机逐态表 + human-only 边/流转确认两分/隐式赞同）。
 */
function mainSection(isGitRepo: boolean): string {
  const git = isGitRepo ? gitRule() : ''
  return `## Forge 任务管线

### 总纲与核心规则

- 状态存于 spec 管线的状态库（Spec/Goal/AC/文档登记四域，按工作区注册）；一切状态判断以管线工具（forgeSpecs 查询族）的结果为准，不以盘上文件或记忆推断。
- Spec 身份 = slug；Spec 文档目录 = .forge/specs/{slug}/；Goal/AC 经 querySpec 父链追溯（spec → goals → acs）查询，不凭记忆复述。
- AC 判据 = 投影对齐键：判据文本逐字精确存储，匹配层 trim + 全半角折叠后精确相等即命中——任务侧承接面 = 自带 acceptance_criteria，拆解时与 AC 判据逐字一致（抄写漂移即投影 unmatched）。
- Spec 状态机 draft → awaiting_approval → approved → in_progress → awaiting_acceptance → completed；驳回（awaiting_approval → draft）与退回（awaiting_acceptance → in_progress）附理由留痕。各态含义与推进条件见下表；completed = 实现验收通过后的冻结快照，不是拆解前置。

| 状态 | 含义 | 进入条件 | 本环节做什么 | 输入 | 输出 |
|---|---|---|---|---|---|
| draft | 文档草稿 | create_spec 创建，或被驳回 | grilling：追问到共识，写 spec.md 与 Goal/AC | 用户想法 | spec.md、Goal、AC |
| awaiting_approval | 文档待评审 | 用户要求送审 | 不推进实现，等用户评审 | draft 终稿 | 用户裁决：通过 / 驳回 |
| approved | 文档定稿，可拆解 | 用户批准 | 拆解：to-tasks，AC 判据逐字落任务 acceptance_criteria，单次 batch_add_tasks | 已批准 spec 的 AC 清单 | 任务清单 |
| in_progress | 实现中 | 开始派发（approved → in_progress 机械边） | 派发循环执行任务，逐条结算 AC | 任务清单 | 代码、提交、AC 证据 |
| awaiting_acceptance | 实现完成，待验收 | Goals 全 completed 时链式收口进入 | 呈交证据，不做新改动，等用户验收 | AC 投影、提交清单 | 用户裁决：接受 / 退回 |
| completed | 验收通过，冻结 | 用户明示接受（agent 须有显式授权） | 不再改动、不再拆解；后续需求走新 spec | 用户接受 | 冻结快照 |

| 边 | 触发方 | 条件 |
|---|---|---|
| draft → awaiting_approval | agent | 用户要求送审 |
| awaiting_approval → draft | agent，附理由 | 用户驳回 |
| awaiting_approval → approved | agent | 用户批准（指向实现的指令如「拆解」「开做」亦算批准） |
| approved → in_progress | agent | 拆解并开始派发 |
| in_progress → awaiting_acceptance | 链式收口 | Goals 全 completed |
| awaiting_acceptance → in_progress | agent，附理由 | 用户退回 |
| awaiting_acceptance → completed | 用户，或经用户显式授权的 agent（human-only） | 用户明示验收通过 |
| completed 之后 | 无出边 | — |

- human-only 边：spec / milestone / roadmap 的 awaiting_acceptance → completed，以及 Goal 的 finalize_goal 确认。agent 只有在人类对该边显式授权后才可代写（如「验收通过」「标 completed」并点名对象）；无显式授权不得自写，也不得以「后续步骤需要」为由推断授权。
- 阶段流转确认两分——用户动作即赞同、模糊才反问：用户消息明确指向某一阶段（送审、批准、拆解、开跑、退回等）即视为赞同，调用管线工具流转并推进，不再反问；语义模糊（未明确指向阶段推进、存在多个候选下一阶段、无阶段指向词的短指令如「继续」「好」）一律归模糊，维持 ask_user_question 显式确认。
- 逐边推进：一次用户指令只走它指向的那一环及其后的机械边，禁止连推多态；human-only 边只认显式授权，不适用隐式赞同。
- 隐式流转约定：隐式赞同流转后，在对话纪要与流转后回复中注明「隐式赞同：<用户动作>」；驳回态 Spec 不触发隐式翻转——该例外为提示词层软约束。${git}
- 大需求走 Roadmap/Milestone 目标层级：Roadmap（产品级）→ Milestone（模块级）→ Spec（批次级，可选 milestone_id 挂链）；Milestone 达成 = 挂链 specs 全 completed（聚合派生查询期现算），验收确认 = transition_milestone / transition_roadmap（human-only 边）。
- 里程诊断工具缝：里程碑收口或派发推进时点调用一次 \`spec_stats\` 自报里程（N Spec / M Goal / K AC / 投影态分布）——查询期现算零落库，agent 主动调用，零新服务登记。

${docsBlock()}
### 流程

\`\`\`mermaid
flowchart LR
    A[grilling] -->|"spec.md + createSpec"| B{用户评审}
    B -->|"驳回退 draft"| A
    B -->|"approved"| E["to-tasks 拆解（approved 态）"]
    E -->|"任务清单"| F["/run-dag-tasks 派发（in_progress）"]
    F -->|"Goals 全 completed"| D["验收 awaiting_acceptance"]
    D -->|"completed（仅用户确认）"| G["冻结"]
    D -->|"退回"| F
\`\`\`
`
}

/**
 * 子会话裁剪模板（自包含）。
 * 受众判据：六条总纲/流程图为主会话职责面，不入本版；共享基底（文档位置与存储约束
 * + git 句）与主会话版逐字双份。
 */
function subagentSection(isGitRepo: boolean): string {
  const git = isGitRepo ? gitRule() + '\n' : ''
  return `## Forge 工作纪律（子会话）

${docsBlock()}${git}`
}

/**
 * 管线段全文（纯胶水：角色分流 → 两模板选一 → XML 标签包裹）。
 * 段文本天然不含裸 {{ 占位与绝对路径——目录口径统一相对根记法（AGENTS 1.7 工具唯一事实源）。
 */
export function renderSpecPipelineSection(vars: SpecPipelineSectionVars = {}): string {
  const body =
    vars.subagent === true ? subagentSection(vars.isGitRepo === true) : mainSection(vars.isGitRepo === true)
  // 标签行独立成 HTML 块：开标签后/闭标签前各留空行，段内 markdown（标题/列表/围栏）
  // 才不被 HTML 块吞掉内联化（GUI 按 markdown 渲染系统提示词）。
  return `<${XML_TAGS.forgePipeline}>\n\n${body}\n</${XML_TAGS.forgePipeline}>`
}
