// 消息体组装纯函数（定位：业务——M3 4.1：UF-1/UF-3/UF-4「打开新会话预填 / 诊断发送」消息体单源）。
// 快照对齐源 = PRD prd-ui-functions.md「消息体示例」×5（①预填提案渠道 / ②任务失败远征 /
// ③任务失败突击 / ④feature 子图诊断 / ⑤派发指令单行）——本文件输出与示例逐字对齐
//（message-format.test.ts 快照断言锚）。组装序（tech-design Integration 消息体组装）：
// @path 第一行 → 名称/所属 → 摘要 → [状态|阶段] → 主体（诊断项/失败记录）→ 请求；
// **不含模式**（由会话预设承载——数据约束 5）；文档清单 = 相对容器目录真实路径 + 状态。
// 派发指令例外（v23）= `/run-tasks <容器标识>` 单行模板串接（DISPATCH_COMMAND_PREFIX 常量
// ——零纯函数，容器标识经 run-tasks 技能映射为 dispatchTask source 对，不参与本格式族）。
// 词汇口径注记：阶段/状态短语以 PRD 示例与 UF-4.1 chips 词汇为准（阶段「任务/已完成」——
// contracts FEATURE_STATUS_LABELS 的 chips 词汇「任务分解」为 M2 概览行用法，两 vocabulary
// 并存各自单源；提案状态 = PROPOSAL_STATUS_LABELS zh（示例①「评审中」同源）。
import type { FeatureStatus, ProposalStatus, TaskStatus, ViolationKind } from '@dsh-forge/contracts'
import { PROPOSAL_STATUS_LABELS, TASK_STATUS_LABELS } from '@dsh-forge/contracts'

/**
 * 消息体容器描述（@path 锚 + 标题/摘要 + 状态|阶段）。
 * TaskContainerSummary（taskDetail/queryTask 容器水化）与 ProposalCard/FeatureCard
 * 均可结构映射入本形状（诊断 = 前者；预填 = 后者）。
 */
export interface MessageContainer {
  /** 容器类型（决定 @path 前缀 features|proposals 段与所属种类词） */
  readonly kind: 'feature' | 'proposal'
  /** 容器标识（目录名——@path 锚） */
  readonly slug: string
  /**
   * @path 锚文档根前缀（docsRootOf 推导——工作区相对段[如 `.forge/docs`]或仓外绝对
   * 正斜杠路径；缺席 = `docs` 缺省锚）。消息内 @ 引用按会话工作区根解析，而文档事实
   * 源在 forge_dir 之下——标准 <ws>\.forge 部署需 `.forge/docs` 前缀锚才不悬空。
   */
  readonly docsRoot?: string
  readonly title: string
  readonly summary?: string
  /** 提案状态（proposal 渠道预填「状态：」行——ProposalCard.proposalStatus 映射） */
  readonly proposalStatus?: ProposalStatus
  /** feature 相位（feature 容器「阶段：」行——proposal 容器键缺席） */
  readonly phase?: FeatureStatus
}

/** 预填文档行（相对容器目录真实路径 + 可选状态——数据约束 5） */
export interface PrefillDocLine {
  /** 相对容器目录真实路径（如 `proposal.md` / `prd/prd-spec.md`——正斜杠） */
  readonly path: string
  /** 文档状态（提案文档 frontmatter 可选初值；缺席 = 无括注） */
  readonly status?: string
}

/** 阶段短语（PRD 示例②④ + UF-4.1 chips 词汇——`任务`/`已完成` 等短形） */
export const PHASE_PHRASES: Readonly<Record<FeatureStatus, string>> = {
  prd: '需求',
  design: '设计',
  tasks: '任务',
  'in-progress': '进行中',
  completed: '已完成',
  archived: '已归档',
}

/** 任务失败状态短语（PRD 示例②③用短形「阻塞」——与 chips 词汇「已阻塞」并存各自单源；
 *  4.4 导出消费：DiagToast 任务失败档状态行与消息体同一词汇单源） */
export const FAILURE_STATUS_PHRASES: Readonly<Partial<Record<TaskStatus, string>>> = {
  blocked: '阻塞',
  rejected: '已拒绝',
}

/** 派发指令前缀（v23 最小消息 = 前缀 + 容器标识单行串接——4.4 派发按钮消费） */
export const DISPATCH_COMMAND_PREFIX = '/run-tasks '

/**
 * 打开新会话请求（4.6 视图层中立形状——装配侧映射 openSessionWithPreset 输入）。
 * mode 在场 = agentPreset.select 切换（提案渠道 = 提案 mode·无溯源不切换；feature 渠道 =
 * 固定远征；诊断/派发 = 容器对应模式）；autosend = 例外成员（诊断两路 + 派发指令——
 * 预填渠道恒缺省不发送）。模式双值与 open-session OpenSessionMode 同词汇。
 */
export interface SessionOpenRequest {
  readonly mode?: 'expedition' | 'blitz'
  readonly prefill: string
  readonly autosend?: boolean
}

/**
 * 路径归一（flows/add-project form-model normalizeDirPath 同口径镜像——本模块零跨视图
 * import）：`/` → `\` + 去尾分隔符（盘符根 `Z:\` → `Z:`——拼接/比较统一基准）。
 */
function normalizeFsPath(path: string): string {
  return path.replaceAll('/', '\\').replace(/\\+$/, '')
}

/** 全反斜杠 → 正斜杠（@ 锚正斜杠口径——浏览器安全字符串运算，零 node:path） */
function toForwardSlashes(path: string): string {
  return path.replaceAll('\\', '/')
}

/** 大小写不敏感前缀判定（Windows 盘符/目录名大小写漂移容忍——长度取前缀原长切片） */
function startsWithIgnoreCase(haystack: string, prefix: string): boolean {
  return haystack.length >= prefix.length && haystack.slice(0, prefix.length).toLowerCase() === prefix.toLowerCase()
}

/**
 * @ 锚文档根推导（纯函数——字符串运算零 node:path）：镜像 flows/add-project form-model
 * normalizeDirPath / isForgeDirExternal 归一口径（`/` → `\`、去尾分隔、大小写不敏感、
 * 段边界敏感）。三分支：仓内（forge = <ws>\…）→ forge 去工作区前缀段 + `/docs`
 * （如 `.forge/docs`）；forge = 工作区根 → `docs`；仓外（注册可仓外）→ 全正斜杠
 * 绝对路径 + `/docs`（@ 引用按工作区根解析需绝对锚）。
 */
export function docsRootOf(workspaceDir: string, forgeDir: string): string {
  const ws = normalizeFsPath(workspaceDir)
  const forge = normalizeFsPath(forgeDir)
  if (ws === '' || forge === '') return `${toForwardSlashes(forge)}/docs`
  if (forge.toLowerCase() === ws.toLowerCase()) return 'docs'
  if (startsWithIgnoreCase(forge, `${ws}\\`)) {
    return `${toForwardSlashes(forge.slice(ws.length + 1))}/docs`
  }
  return `${toForwardSlashes(forge)}/docs`
}

/** @path 第一行（容器目录锚——`@<docsRoot>/features|proposals/<标识>/`；docsRoot 缺席回退 `docs`） */
function pathLine(container: MessageContainer): string {
  return `@${container.docsRoot ?? 'docs'}/${container.kind === 'feature' ? 'features' : 'proposals'}/${container.slug}/`
}

/**
 * 打开新会话现状预填（PRD 示例①逐字对齐；UF-1.4 / UF-4.5）：
 * `@path` 第一行 → `名称：` → [`摘要：`] → `状态：`（提案）| `阶段：`（feature）→
 * `已生成文档：` + `· 路径（状态）` 逐行 → 空行 → `我的意图：` 空位（末行）。
 * **不含模式**（由会话预设承载）；摘要/状态缺席 = 行省略；文档无状态 = 无括注。
 * @param container 容器（提案渠道带 proposalStatus / feature 渠道带 phase）
 * @param docs 文档清单（相对容器目录真实路径 + 可选状态；空清单 = 仅节标题）
 */
export function formatPrefill(container: MessageContainer, docs: readonly PrefillDocLine[]): string {
  const lines: string[] = [pathLine(container), `名称：${container.title}`]
  if (container.summary !== undefined) lines.push(`摘要：${container.summary}`)
  if (container.kind === 'feature') {
    if (container.phase !== undefined) lines.push(`阶段：${PHASE_PHRASES[container.phase]}`)
  } else if (container.proposalStatus !== undefined) {
    lines.push(`状态：${PROPOSAL_STATUS_LABELS[container.proposalStatus].zh}`)
  }
  lines.push('已生成文档：')
  for (const doc of docs) {
    lines.push(doc.status === undefined ? `· ${doc.path}` : `· ${doc.path}（${doc.status}）`)
  }
  lines.push('', '我的意图：')
  return lines.join('\n')
}

/** 诊断失败记录行（时间线失败记录——verb + 时刻 + 注记） */
export interface DiagRecordLine {
  /** 记录动词（task_records.verb——如 `auto-block` / `submit`） */
  readonly verb: string
  /** ISO-8601 时刻（createdAt——展示取字符串字面月日时分，不做时区换算） */
  readonly at: string
  /** 注记（reason ?? summary——调用面映射 TaskRecordEntry） */
  readonly note?: string
}

/** 任务失败诊断输入（UF-3.5——blocked/rejected 任务「诊断失败」自动发送） */
export interface TaskFailureDiagInput {
  readonly kind: 'task-failure'
  /** 所属容器（feature 容器带 phase → 阶段行；突击提案容器无——PRD 示例②③两态） */
  readonly container: MessageContainer
  /** 任务自然键（'slug/localId'） */
  readonly taskKey: string
  readonly taskTitle: string
  /** 任务状态（blocked/rejected——其它值防御性走 chips 词汇） */
  readonly taskStatus: TaskStatus
  /** 失败原因（状态行尾——blockedReason / 最近失败记录原因） */
  readonly reason: string
  /** 失败记录清单（最近记录——调用面截取） */
  readonly records: readonly DiagRecordLine[]
}

/** feature 子图诊断输入（UF-3.4——validateFeatureTasks 失败「发送给 agent」自动发送） */
export interface SubgraphDiagInput {
  readonly kind: 'subgraph'
  /** 所属容器（validateFeatureTasks 为 feature 域校验——恒 feature 容器带 phase） */
  readonly container: MessageContainer
  /** 五类检查违规（ValidateReport.violations——命中 kinds 逐条 ✗ 行，其余 ✓ 行） */
  readonly violations: readonly { readonly kind: ViolationKind; readonly message: string }[]
}

/** ISO-8601 → `MM-DD HH:mm`（字符串字面直取——展示层零时区换算，快照确定性；
 *  4.4 导出消费：DiagToast 任务失败档记录行与消息体同一刻度单源） */
export function diagStampOf(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso)
  if (m === null) return iso
  return `${m[2]}-${m[3]} ${m[4]}:${m[5]}`
}

/** 消息体内部消费（同形改名引用——零行为变化） */
const stampOf = diagStampOf

/** 五类检查中文名（固定读序——PRD 示例④ ✓/✗ 行与请求行括注同源；
 *  4.4 导出消费：DiagToast 子图失败档五项逐行与消息体同一读序单源） */
export const DIAG_CHECK_NAMES: ReadonlyArray<{ readonly kind: ViolationKind; readonly name: string }> = [
  { kind: 'phase-invariant', name: '派生不变量' },
  { kind: 'cycle', name: '依赖无环' },
  { kind: 'liveness', name: 'Liveness' },
  { kind: 'record-chain', name: '记录链完整性' },
  { kind: 'topology', name: '拓扑可分层' },
]

/**
 * 诊断消息体（PRD 示例②③④逐字对齐；错误直达修复无需用户意图——autosend 例外成员）：
 * `@path` 第一行 → `所属：标题（feature|突击提案）` → [`摘要：`] → [`阶段：`（feature）] →
 * 主体（任务失败 = `任务：`/`状态：短语 — 原因`/`失败记录：` 逐行；子图 = `诊断：` + 五类
 * ✓/✗ 逐行）→ `请求：请排查修复（…）`。
 * @param input 任务失败（feature/突击提案容器两态）| feature 子图诊断
 */
export function formatDiagMessage(input: TaskFailureDiagInput | SubgraphDiagInput): string {
  const lines: string[] = [pathLine(input.container)]
  const kindWord = input.container.kind === 'feature' ? 'feature' : '突击提案'
  lines.push(`所属：${input.container.title}（${kindWord}）`)
  if (input.container.summary !== undefined) lines.push(`摘要：${input.container.summary}`)
  if (input.container.kind === 'feature' && input.container.phase !== undefined) {
    lines.push(`阶段：${PHASE_PHRASES[input.container.phase]}`)
  }
  if (input.kind === 'task-failure') {
    const phrase = FAILURE_STATUS_PHRASES[input.taskStatus] ?? TASK_STATUS_LABELS[input.taskStatus].zh
    lines.push(`任务：${input.taskKey} ${input.taskTitle}`)
    lines.push(`状态：${phrase} — ${input.reason}`)
    lines.push('失败记录：')
    for (const record of input.records) {
      lines.push(record.note === undefined ? `· ${record.verb} ${stampOf(record.at)}` : `· ${record.verb} ${stampOf(record.at)} ${record.note}`)
    }
    lines.push('请求：请排查修复（任务时间线见概览 → 任务子 tab → 该任务详情）')
  } else {
    lines.push('诊断：validateFeatureTasks 失败')
    for (const check of DIAG_CHECK_NAMES) {
      const hits = input.violations.filter((v) => v.kind === check.kind)
      if (hits.length === 0) {
        lines.push(`✓ ${check.name}`)
        continue
      }
      for (const violation of hits) lines.push(`✗ ${check.name} — ${violation.message}`)
    }
    lines.push(`请求：请排查修复（五类检查 = ${DIAG_CHECK_NAMES.map((c) => c.name).join(' / ')}）`)
  }
  return lines.join('\n')
}
