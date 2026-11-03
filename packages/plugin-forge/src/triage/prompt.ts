// triage · 处置代理提示词组装（S1c 第二层——「类型化提示词」件，decisions #16：与 worker
// 同款 in-process 形态 = 类型化提示词 + 收窄工具面 + 结构化决策输出）。输入四件套
// （proposal §1.4 第二层）+ 两信号（loop-recurrence-hardening §2.2.1）：任务简报 /
// blocked reason 全文 / 池快照 / 最近记录 / blocked 归类 / 台账 recurrence 链。
// 纯函数——零 I/O 零上游依赖；输出契约在文内自释（四动作封闭枚举 + 末行单行 JSON）。
// 工具面（同提案）：getBug/listBugs 只读台账两工具放行——提示词携带台账查询指引与升级
// 载荷纪律；写面（recordBug/resolveBug/submitTask/addTask）与 shell/fs 恒结构性不可达。
import {
  RECURRENCE_ESCALATION_THRESHOLD,
  recurrenceCandidateLines,
} from '../dispatch-core/index.js'
import type { PoolSnapshot } from '../dispatch-core/index.js'
import type { BugRecurrenceCandidate, TaskBlockClassification, TaskRecordEntry, TaskSnapshot } from '@dsh-forge/contracts'

/** fix 链深余量（改进 6④——driver 沿 sourceTask 链现算；缺席 = 链数据不可得，退化现状） */
export interface TriageFixChain {
  readonly depth: number
  readonly limit: number
  readonly remaining: number
}

/** 台账 recurrence 候选信号（T2/T3 结构化事实——程序面现查，语义判断留 agent）。
 *  recurrence-signal-tiering 渐进式披露：全史候选列表（含 fixed——软动作不被终态连坐），
 *  行内 status 标注；呈现限幅（top-5 lastSeenAt 降序 + errorType 计数）归组装渲染。 */
export interface TriageRecurrenceSignal {
  /** 本缝全史候选（scope 归属命中——每条八字段甄别口径，经 getBug 深挖） */
  readonly candidates: readonly BugRecurrenceCandidate[]
  /** 同缝计数（fullEdgeCount 最大值——单一计数源） */
  readonly count: number
}

/** 处置输入两信号（loop-recurrence-hardening §2.2.1——blocked 归类 + recurrence 链；任一缺席 = 该信号退化） */
export interface TriageSignals {
  /** 源任务 blocked 根因归类（records 结构化键读面——worker 自报，程序零语义判断） */
  readonly classification?: TaskBlockClassification
  /** 台账 recurrence 链查询结果（同缝计数 + 家族链——只读 face 现查） */
  readonly recurrence?: TriageRecurrenceSignal
}

/** 组装入参（四件套——driver LoopTriageInput + 宿主现读的池/记录；改进 6 增补件 + 本提案两信号） */
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
  /** 两信号（blocked 归类 + recurrence 链——任一在场即渲染 <signals> 节） */
  readonly signals?: TriageSignals
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
  const { task, reason, pool, records, lastFailure, fixChain, noProgress, signals } = input
  const ac = task.acceptanceCriteria ?? []
  const lines: string[] = [
    '你是派发循环的异常处置分析员（问题分类器）。一个任务在执行后被阻塞，且没有携带修复任务（修复路径缺位）。',
    '你的职责：基于下面的材料判断处置方案，必要时深挖缺陷台账背景。你只做决策与建议，不执行任何处置操作。',
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
    // loop-recurrence-hardening §2.2.1：只读台账工具面指引（何时查/查什么/结论指针化入载荷）
    '<ledger-tools>',
    '你可使用三个只读台账工具辅助研判（仅此三工具；缺陷写面与任务写面对你结构性不可达）：',
    '- getBug(bug_id)：查单条缺陷全卡与复发链上下文（链时间线 + 各次修复方案）。',
    '- listBugs(search/status/sort/offset/limit)：检索台账（七文本字段子串匹配——含 suspected 位置，',
    '  可按「哪个文件出过事」检索 + 分页）。',
    '- aggregateBugs(errorType?)：errorType 分组计数表（total/open/fixed/lastSeenAt；errorType 可选子串过滤）。',
    '何时查：signals 提示同族复发（或 blocked 原因与既往缺陷疑似同族）时，先 aggregateBugs 看分组计数，',
    '再 listBugs 按关键词（文件路径/errorType）检索',
    '同族候选，再 getBug 深挖前驱链与历史修复方案；errorType 归类遵循词表收敛纪律——先复用台账',
    '既有相近词，仅确无合适词才造新词（避免同义异词，如 race-condition vs concurrency-race）。',
    '结论纪律：台账内容不整段搬运——以指针化引用（bug_id / 卷宗路径）写进 escalate 升级载荷。',
    '聚合判据（SOP）：同 errorType 分组计数后，total≥3 ∧ open≥1 = 「同族复发未根治」——作为 escalate 的量化佐证',
    '（既往修复未根治的家族不宜再 add-fix 盲试）；total≥3 ∧ open=0 = 家族已收敛，按普通阻塞处置。',
    '</ledger-tools>',
    '',
    // FAIL-2 修正：无进展形态不再跳过处置——信号入提示词供决策参考
    ...(noProgress === true
      ? [
          '<no-progress>',
          '本次结算没有任何进展信号（零提交、零文件改动）。请优先评估能否用 add-fix 修复阻塞根因，',
          '或用 split-remainder 保留潜在已完成部分；仅在确实无法自动处置时选择 escalate。',
          '</no-progress>',
          '',
        ]
      : []),
    // loop-recurrence-hardening §2.2.1 两信号：blocked 归类 + 台账 recurrence 链（结构化事实）
    ...(signals !== undefined && (signals.classification !== undefined || signals.recurrence !== undefined)
      ? [
          '<signals>',
          ...(signals.classification !== undefined
            ? [
                `阻塞归类: ${signals.classification.kind}` +
                  `${signals.classification.recurrenceOf !== undefined ? `（自报前驱 ${signals.classification.recurrenceOf}）` : ''}`,
              ]
            : []),
          ...(signals.recurrence !== undefined
            ? [
                `台账 recurrence 候选（本缝全史 ${signals.recurrence.candidates.length} 条，含 fixed——状态见行内标注；同缝计数 ${signals.recurrence.count}）（限本任务卷宗归属；甄别判据 = suspected 位置，自行甄别后经 getBug 深挖）：`,
                ...recurrenceCandidateLines(signals.recurrence.candidates),
                ...(signals.recurrence.count >= RECURRENCE_ESCALATION_THRESHOLD
                  ? [
                      `同缝计数 ≥ ${RECURRENCE_ESCALATION_THRESHOLD}——禁止选择 add-fix（盲试修复必被宿主守卫软拒绝）；请选择 escalate 上浮排查。`,
                    ]
                  : []),
              ]
            : []),
          '</signals>',
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
            ? ['余量不足——禁止选择 add-fix（修复链已到顶，创建修复任务必被拒绝）；请改选 split-remainder 或 escalate。']
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
          '决策契约重申：只允许封闭四动作枚举 add-fix / wait-external / escalate / split-remainder，输出唯一一行 JSON。',
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
    '3. "escalate" —— 上浮主会话处置（任务自身矛盾或无法自动处置、同族复发需排查建模、自判高危不盲试）。',
    '   注意：escalate 是「上浮主会话」的决策动作，不是问用户的工具——主会话收报后通常按 SOP 自行',
    '   处置（如委派排查），是否问用户由主会话判断，你不预设也不承担问询。',
    '   可选载荷四节（建议携带——上浮必须带专业且充分的建议，不是裸转交；各文本节 ≤ 2000 字符，',
    '   证据指针 ≤ 8 条且指针化引用）：classification（问题归类：能力类别 + 判据）、disposition',
    '   （建议处置与理由）、delegateTarget（建议委派目标描述——派谁由主会话决定）、evidencePointers',
    '   （证据指针数组：recurrence 链 bug_id、卷宗/报告路径——不搬运全文）。',
    '4. "split-remainder" —— 剩余范围是结构性独立范围（已完成部分应保留、不应重跑整个任务）。提供：',
    '   title（继任任务标题）、type（可选，任务类型，缺省同源任务）、taskDesc（可选，剩余范围说明）、',
    '   note（可选，一句话分割内容摘要——给用户看）。',
    '   分界指引：窄因可解整个源任务（修好即可继续原范围）→ 选 add-fix（源任务恢复后续跑）；',
    '   剩余是结构性独立范围（已完成部分有价值且不应重做）→ 选 split-remainder。',
    '',
    // loop-recurrence-hardening §2.2.1 防盲试条款（SOP 自律落点——程序不判语义，自律入提示词）
    '防盲试条款：signals 显示同缝计数 ≥ ' + RECURRENCE_ESCALATION_THRESHOLD + ' 时禁止 add-fix，直接 escalate 上浮排查；',
    '你自判为可形式化形态（状态机无不变式、并发竞态/时序、修复只堵单点必复发类）时同样主动 escalate，',
    '不要用 add-fix 盲试——盲试的单点修复是家族复发链的成因本身。',
    '',
    '输出契约（严格）：分析结束后，输出唯一一行 JSON（不带代码围栏、其后不得有任何文字）：',
    '{"action":"add-fix","title":"...","type":"coding-fix","taskDesc":"...","note":"..."}',
    '{"action":"wait-external","externalSlug":"..."}',
    '{"action":"escalate"}',
    '{"action":"escalate","classification":"...","disposition":"...","delegateTarget":"...","evidencePointers":["<bug-id 或 路径>"]}',
    '{"action":"split-remainder","title":"...","type":"...","taskDesc":"...","note":"..."}',
  ]
  return lines.join('\n')
}
