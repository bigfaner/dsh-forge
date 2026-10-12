// forge:pipeline 系统提示段渲染（定位：业务——Interface 8 / Interface 9 标签表行 1；
// knowledge prompt 同型）。老 forge hook 注入文本平移（guide.md 状态层相关三部分），
// 单层不细分、内文纯文本；**不含 tool 说明**（dsh tool 注册面自带——工具名/参数说明
// 机械出自各 tool 定义，本段不复制）。段文本 = 最外层唯一标签 <forge-pipeline> 包裹
//（XML_TAGS.forgePipeline 单源——标签集四枚封闭，G1-14 pin）。
// 四部分：状态层说明 / 执行协议 / 受限面声明 / 文档风格公约。
// 注意：SystemPrompt 段文本默认 {{var}} 插值（未知引用会炸渲染）——文本禁用裸 {{。
import { XML_TAGS } from '@dsh-forge/contracts'

/** 段名（Interface 8 定死） */
export const FORGE_SECTION_NAME = 'forge:pipeline'

/** 段序（Interface 8 定死：order 510，升序拼接——knowledge 500 之后） */
export const FORGE_SECTION_ORDER = 510

/**
 * 管线段全文（纯函数；协议动词以自然语言表述——具体工具面由 dsh tool 注册面自描述，
 * 本段不点名工具，防「提示词与注册面双源漂移」）。
 */
export function renderForgePipelineSection(): string {
  const body = [
    '## Forge 任务管线',
    '',
    '本工作区运行于 forge 任务管线。任务（task）、特性（feature）与提案（proposal）的状态存放于每工作区的状态层，是唯一事实来源：盘上的任务文件与任何 UI 都是它的投影。禁止手改状态——状态只能经管线动词流转。',
    '',
    '任务身份是自然键：feature slug 加每 feature 的局部 id，写作 slug/local-id。由 blocked 任务派生的修复任务携带 fix-N 局部 id；偏差跟进携带 disc-N。slug 与其 feature 目录名一致。',
    '',
    '执行协议（操作级细节的正本在 run-tasks / submit-task 技能——派发循环、fix 链承接、提交结算均以指针引用，不在此复制）：',
    '1. 以领取承接工作：一次领取返回一个就绪任务及其派发简报，或报告当前无就绪任务——后者等待或收尾，不臆造工作。前置依赖完成或跳过后任务才就绪。',
    '2. 严格按所领简报执行并一次性结算提交：success 须附执行摘要与质量门结果（compile、format、lint、test——如实上报，绝不伪造）；blocked 须给出具体阻塞原因。',
    '3. blocked 时以该 blocked 任务为源派生 fix 任务并将其阻塞；fix 完成后源任务自动恢复。fix 链保持浅（至多六层）。',
    '4. 对任务做任何裁决前，先按 slug 与 local-id 查询其当前状态、前置、记录与挂接会话。',
    '5. 管线调用报告工作区未注册时，说明该会话工作区不是已注册的 forge 项目——向用户上报而非绕行。',
    '',
    '受限面：',
    '- 领取/提交流程之外的状态转移（reopen、skip、suspend、reject）与 feature 级转移是人类决定：代理不可用，看似需要时询问用户。',
    '- 禁止直写状态层存储、任务文件或索引，禁止另起平行状态：状态层只经管线动词维护。',
    '    - 提案裁决（accept 或 reject）仅在用户已决定时记录；登记提案或撰写文档随时可行。',
    '',
    '文档风格公约（约束本工作区全部产出文档，含 PRD/走查记录/台账/README）：',
    '- 图示优先用 mermaid（```mermaid 代码块）；能用一张图说清的不用大段文字。',
    '- 文字精简：只写结论与必要上下文，不复述代码与流程细节。',
    '- 不留调整修复叙事：不记录「改了哪里、为什么改、排查过程」等过程性内容，文档只呈现当前事实。',
  ].join('\n')
  return `<${XML_TAGS.forgePipeline}>\n${body}\n</${XML_TAGS.forgePipeline}>`
}
