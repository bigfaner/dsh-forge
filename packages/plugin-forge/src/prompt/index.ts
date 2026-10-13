// forge:pipeline / forge:doc-style 系统提示段渲染（定位：业务——Interface 8 / Interface 9
// 标签表行 1；knowledge prompt 同型）。dual-mode-overhaul 段重构终版：三段结构 MD 段体
//（### 总纲与核心规则 / ### 文档位置与存储约束 / ### 流程）+ 双模式独立渲染（mode 键——
// preset yml plugin-forge 行 config 注入，缺省回退远征）+ 文档风格公约拆为独立 <doc-style>
// 段（双模式共用注入）。执行协议与受限面整段删除（操作正本在 run-tasks / submit-task 技能）；
// **不含 tool 说明**（dsh tool 注册面自带——工具名/参数说明机械出自各 tool 定义，本段不复制；
// 环间确认规则点名 ask_user_question = 宿主问询工具，非 forge tool 注册面成员）。
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
 * 段渲染入参（1.16 文档位置动态注入 + dual-mode-overhaul 双模式键）。
 */
export interface ForgePipelineSectionVars {
  /**
   * 本项目 forge 文档根（绝对路径，调用点经 routing/projects 服务取实际值注入，不假设
   * `<ws>/.forge`）。缺省/空白/未知 = 回退：整段省略文档位置与目录树介绍（渲染绝不因此
   * 炸掉——纯函数零外抛）。
   */
  readonly forgeDir?: string
  /**
   * 管线模式（preset yml plugin-forge 行 config 的 mode 键）：expedition = 远征（缺省回退）、
   * blitz = 突击。双模式各自目录树与 mermaid 流程图。
   */
  readonly mode?: ForgePipelineMode
}

/** 模式归一（缺省/未知值回退远征——渲染纯函数永不炸） */
export function modeOf(mode: string | undefined): ForgePipelineMode {
  return mode === 'blitz' ? 'blitz' : 'expedition'
}

/**
 * 文档位置与存储约束段体（dual-mode-overhaul：去「中央 projects.forge_dir 单源」注记——
 * 路径即注入 forgeDir 的 docs 层；双模式各自目录树：远征提案/特性/探针三类，突击提案/探针
 * 两类；代码与测试入源码树；过程产物归 {slug} 子目录不另设他处）。树内 slug 占位用 `{slug}`
 * 而非 `<slug>`——段文本内层禁出现二级尖括号标签。
 */
function docLocationSection(forgeDir: string, mode: ForgePipelineMode): string[] {
  const root = forgeDir.replace(/[\\/]+$/, '')
  const expedition = mode === 'expedition'
  return [
    '### 文档位置与存储约束',
    '',
    '文档位置（本项目 forge 文档根，绝对路径）：',
    root,
    '',
    `目录树（${expedition ? '远征' : '突击'}模式文档面布局，相对上述根目录的 docs/ 层）：`,
    'docs/',
    '├─ docs/proposals/{slug}/   提案（proposal.md 与配套文档）',
    ...(expedition ? ['├─ docs/features/{slug}/    特性（manifest 与 prd/design/test 等阶段文档）'] : []),
    '└─ docs/probes/             探针（一次性验证脚本与取证产物）',
    '',
    '存储约束：',
    '- 代码与测试改动一律落工作区源码树，不入 forge 文档层。',
    '- 过程产物（走查截图/探针输出/取证）归所属提案或特性的 {slug} 子目录，不另设他处。',
    '',
  ]
}

/** 远征流程图（简要、无 worker 内部节点；各步固定产物标于箭头） */
const EXPEDITION_FLOW = [
  '```mermaid',
  'flowchart LR',
  '  A[brainstorm] -->|proposal.md| B[write-prd]',
  '  B -->|prd| C[ui-design]',
  '  C -->|ui 设计稿| D[tech-design]',
  '  D -->|design 文档| E[breakdown-tasks]',
  '  E -->|任务清单| F[派发]',
  '  F -->|实现与测试| G[eval]',
  '  G -->|验收报告| H[交付]',
  '```',
].join('\n')

/** 突击流程图（同上口径） */
const BLITZ_FLOW = [
  '```mermaid',
  'flowchart LR',
  '  A[brainstorm] -->|proposal.md| B[用户裁决]',
  '  B -->|裁决记录| C[quick-tasks]',
  '  C -->|任务清单| D[派发]',
  '  D -->|实现与验收| E[交付]',
  '```',
].join('\n')

/** 总纲四条规则（含环间确认铁律——dual-mode-overhaul 用户裁决） */
const CORE_RULES = [
  '1. 状态层唯一事实来源：任务（task）、特性（feature）与提案（proposal）的状态存放于每工作区的状态层，盘上的任务文件与任何 UI 都是它的投影；禁止手改状态——状态只能经管线动词流转。',
  '2. 任务身份是自然键：feature slug 加每 feature 的局部 id，写作 slug/local-id；blocked 派生的修复任务携带 fix-N 局部 id，偏差跟进携带 disc-N；对任务做任何裁决前，先查询其当前状态、前置与记录。',
  '3. 工作以领取承接：一次领取返回一个就绪任务及其派发简报；严格按简报执行并一次性结算提交——success 附执行摘要与质量门结果（compile、format、lint、test，如实上报绝不伪造），blocked 给出具体阻塞原因并以该任务为源派生 fix 任务（fix 链至多六层）。',
  '4. 环间确认：进入流程下一环节前，使用 ask_user_question 工具显式向用户确认；确认后推进，并同步调用管线工具流转提案或 feature 的状态；未确认不得推进。',
].join('\n')

/**
 * 管线段全文（纯函数；协议动词以自然语言表述——具体工具面由 dsh tool 注册面自描述，
 * 本段不点名 forge 工具，防「提示词与注册面双源漂移」）。vars.forgeDir / vars.mode 由调用点
 * 程序化注入实际值（非提示词侧插值），故段文本天然不含裸 {{ 占位。
 */
export function renderForgePipelineSection(vars: ForgePipelineSectionVars = {}): string {
  const forgeDir = typeof vars.forgeDir === 'string' ? vars.forgeDir.trim() : ''
  const mode = modeOf(typeof vars.mode === 'string' ? vars.mode : undefined)
  const body = [
    '## Forge 任务管线',
    '',
    '### 总纲与核心规则',
    '',
    '本工作区运行于 forge 任务管线，四条核心规则约束全程：',
    CORE_RULES,
    '',
    ...(forgeDir === '' ? [] : docLocationSection(forgeDir, mode)),
    '### 流程',
    '',
    mode === 'expedition'
      ? '远征模式全流程（ui-design 仅在存在 UI 面时执行，无 UI 面直入 tech-design）：'
      : '突击模式短流程（提案直挂任务，无 PRD/设计/阶段门）：',
    '',
    mode === 'expedition' ? EXPEDITION_FLOW : BLITZ_FLOW,
  ].join('\n')
  return `<${XML_TAGS.forgePipeline}>\n${body}\n</${XML_TAGS.forgePipeline}>`
}

/**
 * doc-style 独立段全文（dual-mode-overhaul：文档风格公约从 forge-pipeline 段拆出——
 * XML_TAGS.docStyle 封闭集扩集；双模式共用注入，零入参）。
 */
export function renderDocStyleSection(): string {
  const body = [
    '## 文档风格公约',
    '',
    '以下公约约束本工作区全部产出文档（含 PRD/走查记录/台账/README）：',
    '- 图示优先用 mermaid（```mermaid 代码块）；能用一张图说清的不用大段文字。',
    '- 文字精简：只写结论与必要上下文，不复述代码与流程细节。',
    '- 不留调整修复叙事：不记录「改了哪里、为什么改、排查过程」等过程性内容，文档只呈现当前事实。',
  ].join('\n')
  return `<${XML_TAGS.docStyle}>\n${body}\n</${XML_TAGS.docStyle}>`
}
