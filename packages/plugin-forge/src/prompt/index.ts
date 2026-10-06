// forge:pipeline 系统提示段渲染（定位：业务——Interface 8 / Interface 9 标签表行 1；
// knowledge prompt 同型）。老 forge hook 注入文本平移（guide.md 状态层相关三部分），
// 单层不细分、内文纯文本；**不含 tool 说明**（dsh tool 注册面自带——工具名/参数说明
// 机械出自各 tool 定义，本段不复制）。段文本 = 最外层唯一标签 <forge-pipeline> 包裹
//（XML_TAGS.forgePipeline 单源——标签集四枚封闭，G1-14 pin）。
// 三部分：状态层说明 / 执行协议 / 受限面声明。
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
    '## Forge task pipeline',
    '',
    'This workspace runs on the forge task pipeline. Task, feature, and proposal state lives in a per-workspace state layer that is the single source of truth: task files on disk and any UI are projections of it. Never edit state by hand — state changes only through the pipeline verbs.',
    '',
    'Task identity is a natural key: a feature slug plus a per-feature local id, written as slug/local-id. Fix tasks spawned from a blocked task carry a fix-N local id; discrepancy follow-ups carry disc-N. Slugs match their feature directory name.',
    '',
    'Execution protocol:',
    '1. Receive work by claiming: a claim returns one ready task together with its dispatch brief, or reports that nothing is ready — in that case wait or finish; do not invent work. Dependencies must be completed or skipped before a task becomes ready.',
    '2. Execute exactly the claimed brief and submit the outcome once: success requires an execution summary and the quality-gate results (compile, format, lint, tests — report failures honestly, never fabricate them); blocked requires the concrete blocking reason.',
    '3. When blocked, spawn a fix task that carries the blocked task as its source and blocks it; when the fix completes, the source task is restored automatically. Keep fix chains shallow (at most six levels).',
    '4. Before deciding anything about a task, query it by slug and local id for its current status, prerequisites, records, and attached sessions.',
    '5. If a pipeline call reports the workspace as not registered, the session workspace is not a registered forge project — surface this to the user instead of working around it.',
    '',
    'Restricted face:',
    '- Status transitions outside the claim/submit flow (reopen, skip, suspend, reject) and feature-level transitions are human decisions: they are not available to agents. Ask the user when one seems needed.',
    '- Never write to the state layer storage, task files, or indexes directly, and never fork parallel state: the state layer is maintained exclusively through the pipeline verbs.',
    '- Proposal verdicts (accept or reject) are only recorded when the user has decided; registering a proposal or documenting one is fine at any time.',
  ].join('\n')
  return `<${XML_TAGS.forgePipeline}>\n${body}\n</${XML_TAGS.forgePipeline}>`
}
