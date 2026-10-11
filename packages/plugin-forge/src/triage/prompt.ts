// triage · 处置代理提示词组装（S1c 第二层——「类型化提示词」件，decisions #16：与 worker
// 同款 in-process 形态 = 类型化提示词 + 收窄工具面 + 结构化决策输出）。输入四件套
// （proposal §1.4 第二层）：任务简报 / blocked reason 全文 / 池快照 / 最近记录。
// 纯函数——零 I/O 零上游依赖；输出契约在文内自释（三动作封闭枚举 + 末行单行 JSON）。
import type { PoolSnapshot } from '../dispatch-core/index.js'
import type { TaskRecordEntry, TaskSnapshot } from '@dsh-forge/contracts'

/** 组装入参（四件套——driver LoopTriageInput + 宿主现读的池/记录） */
export interface TriagePromptInput {
  readonly task: TaskSnapshot
  /** blocked 原因全文（只进本提示词与裁决问询——叙述面摘要，decisions #24） */
  readonly reason: string
  readonly pool: PoolSnapshot
  readonly records: readonly TaskRecordEntry[]
}

/** 记录行投影（时间线一行一条——verb → to/reason/summary 摘要，防长摘要刷屏） */
function recordLine(entry: TaskRecordEntry): string {
  const to = entry.toStatus ?? entry.fromStatus ?? '?'
  const note = entry.reason ?? entry.summary ?? ''
  const flat = note.replaceAll(/\s+/g, ' ').slice(0, 120)
  return `- [${entry.verb}] → ${to}${flat === '' ? '' : ` — ${flat}`}`
}

/** 处置代理提示词全文（worker 首条用户消息同位——一次性决策代理的唯一输入面） */
export function composeTriagePrompt(input: TriagePromptInput): string {
  const { task, reason, pool, records } = input
  const ac = task.acceptanceCriteria ?? []
  const lines: string[] = [
    '你是派发循环的异常处置分析员。一个任务在执行后被阻塞，且没有携带修复任务（修复路径缺位）。',
    '你的职责：基于下面的材料判断处置方案。你只做决策，不执行任何操作（你没有任何工具）。',
    '',
    '<task-context>',
    `任务: ${task.slug}/${task.localId} ${task.title}`,
    `类型: ${task.taskType}`,
    ...(task.taskDesc !== undefined ? ['', '任务说明:', task.taskDesc] : []),
    ...(ac.length > 0 ? ['', '验收清单:', ...ac.map((item) => `- ${item}`)] : []),
    '</task-context>',
    '',
    '<blocked-reason>',
    reason,
    '</blocked-reason>',
    '',
    '<pool>',
    `待执行 ${pool.pending} · 执行中 ${pool.inProgress} · 阻塞 ${pool.blocked} · 前置未满足 ${pool.unmetPending}`,
    '</pool>',
    '',
    '<recent-records>',
    ...(records.length > 0 ? records.slice(-20).map(recordLine) : ['-（无记录）']),
    '</recent-records>',
    '',
    '决策规则（三选一，封闭枚举，无第四种）：',
    '1. "add-fix" —— 阻塞可由一个修复任务解决（依赖安装、脚本修正、配置修补、测试修复等）。提供：',
    '   title（修复任务标题）、type（可选，任务类型，缺省 coding-fix）、taskDesc（可选，修复说明）、',
    '   note（可选，一句话修复内容摘要——给用户看）。',
    '2. "wait-external" —— 阻塞原因在其它任务源（另一个 feature/proposal 的工作需先落地，此刻建修复任务无意义）。',
    '   提供：externalSlug（外部任务源 slug）。',
    '3. "ask-user" —— 任务自身矛盾或无法自动处置（如验收标准与任务硬规则冲突），需要人工裁决。',
    '',
    '输出契约（严格）：分析结束后，输出唯一一行 JSON（不带代码围栏、其后不得有任何文字）：',
    '{"action":"add-fix","title":"...","type":"coding-fix","taskDesc":"...","note":"..."}',
    '{"action":"wait-external","externalSlug":"..."}',
    '{"action":"ask-user"}',
  ]
  return lines.join('\n')
}
