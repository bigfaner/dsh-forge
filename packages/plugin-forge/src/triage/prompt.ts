// triage · 处置代理提示词组装（S1c 第二层——「类型化提示词」件，decisions #16：与 worker
// 同款 in-process 形态 = 类型化提示词 + 收窄工具面 + 结构化决策输出）。输入四件套
// （proposal §1.4 第二层）：任务简报 / blocked reason 全文 / 池快照 / 最近记录。
// 纯函数——零 I/O 零上游依赖；输出契约在文内自释（四动作封闭枚举 + 末行单行 JSON）。
import type { PoolSnapshot } from '../dispatch-core/index.js'
import type { TaskRecordEntry, TaskSnapshot } from '@dsh-forge/contracts'

/** fix 链深余量（改进 6④——driver 沿 sourceTask 链现算；缺席 = 链数据不可得，退化现状） */
export interface TriageFixChain {
  readonly depth: number
  readonly limit: number
  readonly remaining: number
}

/** 组装入参（四件套——driver LoopTriageInput + 宿主现读的池/记录；改进 6 增补两可选件） */
export interface TriagePromptInput {
  readonly task: TaskSnapshot
  /** blocked 原因全文（只进本提示词与裁决问询——叙述面摘要，decisions #24） */
  readonly reason: string
  readonly pool: PoolSnapshot
  readonly records: readonly TaskRecordEntry[]
  /** 改进 6① 重试回灌——上次处置失败的输出/错误摘要（首次处置缺席） */
  readonly lastFailure?: string
  /** 改进 6④ fix 链深余量（缺席 = 不可得） */
  readonly fixChain?: TriageFixChain
  /** 无进展信号（FAIL-2 修正——零 commit 零 files 的 blocked 结算；claim fail-loud 径恒缺席） */
  readonly noProgress?: boolean
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
  const { task, reason, pool, records, lastFailure, fixChain, noProgress } = input
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
    // FAIL-2 修正：无进展形态不再跳过处置——信号入提示词供决策参考
    ...(noProgress === true
      ? [
          '<no-progress>',
          '本次结算没有任何进展信号（零提交、零文件改动）。请优先评估能否用 add-fix 修复阻塞根因，',
          '或用 split-remainder 保留潜在已完成部分；仅在确实无法自动处置时选择 ask-user。',
          '</no-progress>',
          '',
        ]
      : []),
    '<pool>',
    `待执行 ${pool.pending} · 执行中 ${pool.inProgress} · 阻塞 ${pool.blocked} · 前置未满足 ${pool.unmetPending}`,
    '</pool>',
    '',
    '<recent-records>',
    ...(records.length > 0 ? records.slice(-20).map(recordLine) : ['-（无记录）']),
    '</recent-records>',
    '',
    // 改进 6④：fix 链深/余量入参——余量不足时 add-fix 结构性被拒（宿主侧守卫同口径）
    ...(fixChain !== undefined
      ? [
          '<fix-chain>',
          `fix 链深: ${fixChain.depth}（上限 ${fixChain.limit}，剩余余量 ${fixChain.remaining}）`,
          ...(fixChain.remaining < 1
            ? ['余量不足——禁止选择 add-fix（修复链已到顶，创建修复任务必被拒绝）；请改选 split-remainder 或 ask-user。']
            : []),
          '</fix-chain>',
          '',
        ]
      : []),
    // 改进 6①：重试回灌——上次失败摘要 + 封闭枚举重申（消除无信息重试）
    ...(lastFailure !== undefined
      ? [
          '<last-failure>',
          '上一次处置分析失败，宿主拒绝原因/输出摘要如下——请针对性修正，不要重复同类错误：',
          lastFailure,
          '决策契约重申：只允许封闭四动作枚举 add-fix / wait-external / ask-user / split-remainder，输出唯一一行 JSON。',
          '</last-failure>',
          '',
        ]
      : []),
    '',
    '决策规则（四选一，封闭枚举，无第五种）：',
    '1. "add-fix" —— 阻塞可由一个修复任务解决（依赖安装、脚本修正、配置修补、测试修复等）。提供：',
    '   title（修复任务标题）、type（可选，任务类型，缺省 coding-fix）、taskDesc（可选，修复说明）、',
    '   note（可选，一句话修复内容摘要——给用户看）。',
    '2. "wait-external" —— 阻塞原因在其它任务源（另一个 feature/proposal 的工作需先落地，此刻建修复任务无意义）。',
    '   提供：externalSlug（外部任务源 slug）。',
    '3. "ask-user" —— 任务自身矛盾或无法自动处置（如验收标准与任务硬规则冲突），需要人工裁决。',
    '4. "split-remainder" —— 剩余范围是结构性独立范围（已完成部分应保留、不应重跑整个任务）。提供：',
    '   title（继任任务标题）、type（可选，任务类型，缺省同源任务）、taskDesc（可选，剩余范围说明）、',
    '   note（可选，一句话分割内容摘要——给用户看）。',
    '   分界指引：窄因可解整个源任务（修好即可继续原范围）→ 选 add-fix（源任务恢复后续跑）；',
    '   剩余是结构性独立范围（已完成部分有价值且不应重做）→ 选 split-remainder。',
    '',
    '输出契约（严格）：分析结束后，输出唯一一行 JSON（不带代码围栏、其后不得有任何文字）：',
    '{"action":"add-fix","title":"...","type":"coding-fix","taskDesc":"...","note":"..."}',
    '{"action":"wait-external","externalSlug":"..."}',
    '{"action":"ask-user"}',
    '{"action":"split-remainder","title":"...","type":"...","taskDesc":"...","note":"..."}',
  ]
  return lines.join('\n')
}
