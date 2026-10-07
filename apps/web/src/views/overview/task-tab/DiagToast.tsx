// DiagToast（定位：业务——M3 4.4 UF-3 诊断结果 toast：1s/5s 双档 + 「发送给 agent」）。
// 三档（ui-design UF-3 States）：子图成功「子图健康 ✓」1s 自消；失败族 5s 自消——
// 子图失败（标题 + 五类检查逐项·✗ 含违规描述）与任务失败（v19–v21：所属背景 + 状态 +
// 原因 + 最近记录 ≤3 + 任务键）两构造档 + 服务异常档（错误 toast + 再点诊断重试——
// 留场不吞错）。「发送给 agent」= fail 档独有动作钮——payload 直喂 4.1 formatDiagMessage
//（消息体单源），发送编排（openSessionWithPreset autosend——发往容器对应模式）归 4.6 接线。
// 受控 result（undefined = 不呈现）：重跑即重现零陈旧滞留 = 装载侧整体替换 result——
// 计时随 result 引用重置（新诊断新计时；切换 feature 旧 toast 不复活）。
// 锚定：absolute 定位贴触发钮左侧（css right:100%——4.6 将本件置于「诊断」钮 relative
// 包裹内；ui-design v5 ⑨ 裁决：右缘贴按钮左缘 + 垂直对齐）。
import { useEffect, type ReactNode } from 'react'
import type { TaskStatus } from '@dsh-forge/contracts'
import { TASK_STATUS_LABELS } from '@dsh-forge/contracts'
import {
  DIAG_CHECK_NAMES,
  FAILURE_STATUS_PHRASES,
  PHASE_PHRASES,
  diagStampOf,
  type MessageContainer,
  type SubgraphDiagInput,
  type TaskFailureDiagInput,
} from '../message-format.js'
import './task-tab.css'

/** 双档时长（ui-design UF-3 States：成功 1s 自消 / 失败 5s 自消） */
export const DIAG_TOAST_OK_MS = 1000
export const DIAG_TOAST_FAIL_MS = 5000

/** toast 呈现行（tone → css is-ok/is-bad/is-plain 三色） */
export interface DiagToastLine {
  readonly tone: 'ok' | 'bad' | 'plain'
  readonly text: string
}

/** 「发送给 agent」payload（formatDiagMessage 直喂——诊断两路消息体单源） */
export type DiagToastSendPayload = SubgraphDiagInput | TaskFailureDiagInput

/** toast 结果三档（ok 无发送钮；fail 带发送；error 服务异常无消息可发） */
export type DiagToastResult =
  | { readonly tier: 'ok'; readonly title: string; readonly subtitle: string }
  | { readonly tier: 'fail'; readonly title: string; readonly lines: readonly DiagToastLine[]; readonly send: DiagToastSendPayload }
  | { readonly tier: 'error'; readonly title: string; readonly lines: readonly DiagToastLine[] }

/** 双档时长映射（ok → 1s；fail/error 失败族 → 5s） */
export function diagToastDurationMs(result: DiagToastResult): number {
  return result.tier === 'ok' ? DIAG_TOAST_OK_MS : DIAG_TOAST_FAIL_MS
}

/** 子图诊断成功档（「子图健康 ✓」+ 五类检查全通过副行——检查名与消息体同读序单源；
 *  诊断对象 = 当前 feature pill（一次一 feature，M2 既定口径）——标题不带容器名沿原型） */
export function subgraphDiagOk(): DiagToastResult {
  return {
    tier: 'ok',
    title: '子图健康 ✓',
    subtitle: `五类检查全部通过（${DIAG_CHECK_NAMES.map((check) => check.name).join(' / ')}）`,
  }
}

/**
 * 子图诊断失败档（标题 = 诊断失败 · 容器标题；五类检查固定读序逐项——命中类 ✗ 行含
 * 违规描述[服务端 message 自带任务键]，未命中类 ✓ 行）。发送负载 = SubgraphDiagInput
 * 原样（validateFeatureTasks 恒 feature 容器——调用面喂 MessageContainer）。
 */
export function subgraphDiagFail(
  container: MessageContainer,
  violations: readonly { readonly kind: SubgraphDiagInput['violations'][number]['kind']; readonly message: string }[],
): DiagToastResult {
  const lines: DiagToastLine[] = []
  for (const check of DIAG_CHECK_NAMES) {
    const hits = violations.filter((violation) => violation.kind === check.kind)
    if (hits.length === 0) {
      lines.push({ tone: 'ok', text: `✓ ${check.name}` })
      continue
    }
    for (const violation of hits) lines.push({ tone: 'bad', text: `✗ ${check.name} — ${violation.message}` })
  }
  return { tier: 'fail', title: `诊断失败 · ${container.title}`, lines, send: { kind: 'subgraph', container, violations } }
}

/** 任务失败状态行短语（消息体 FAILURE_STATUS_PHRASES 同词汇——blocked/rejected 短形，其余防御走 chips） */
function failurePhrase(status: TaskStatus): string {
  return FAILURE_STATUS_PHRASES[status] ?? TASK_STATUS_LABELS[status].zh
}

/**
 * 任务失败档（v19–v21）：标题 = 任务失败 · 任务标题；行集 = 所属（含种类词 + feature
 * 阶段段）+ 摘要 + 状态·原因（bad）+ 最近记录 ≤3（防御性 slice(-3)——调用面已截取则
 * 原样）+ 任务键。发送负载 = 输入原样回传（formatDiagMessage 直喂）。
 */
export function taskFailureDiagToast(input: TaskFailureDiagInput): DiagToastResult {
  const kindWord = input.container.kind === 'feature' ? 'feature' : '突击提案'
  const phaseSuffix =
    input.container.kind === 'feature' && input.container.phase !== undefined
      ? ` · 阶段：${PHASE_PHRASES[input.container.phase]}`
      : ''
  const lines: DiagToastLine[] = [{ tone: 'plain', text: `所属：${input.container.title}（${kindWord}）${phaseSuffix}` }]
  if (input.container.summary !== undefined) lines.push({ tone: 'plain', text: `摘要：${input.container.summary}` })
  lines.push({ tone: 'bad', text: `状态：${failurePhrase(input.taskStatus)} — ${input.reason}` })
  for (const record of input.records.slice(-3)) {
    lines.push({
      tone: 'plain',
      text:
        record.note === undefined
          ? `· ${record.verb} ${diagStampOf(record.at)}`
          : `· ${record.verb} ${diagStampOf(record.at)} ${record.note}`,
    })
  }
  lines.push({ tone: 'plain', text: `任务键：${input.taskKey}` })
  return { tier: 'fail', title: `任务失败 · ${input.taskTitle}`, lines, send: input }
}

/** 服务异常档（States 服务异常行：错误呈现 + 再点诊断重试语义——留场不吞错） */
export function diagServiceError(message: string): DiagToastResult {
  return {
    tier: 'error',
    title: '诊断服务异常',
    lines: [
      { tone: 'plain', text: message },
      { tone: 'plain', text: '再点「诊断」重试（留场不吞错）' },
    ],
  }
}

export interface DiagToastProps {
  /** 当前结果（undefined = 不呈现——受控整体替换 = 零陈旧滞留） */
  readonly result: DiagToastResult | undefined
  /** 自动消失回调（双档计时到点——装载侧置 undefined） */
  readonly onDismiss: () => void
  /** 「发送给 agent」（fail 档独有——缺席 = 无动作钮呈现） */
  readonly onSend?: (payload: DiagToastSendPayload) => void
}

/**
 * 诊断结果 toast（AC2）：双档计时（result 引用变化即重置——重跑新计时）+ 行集 tone
 * 呈现 + 发送钮。计时归 useEffect setTimeout（SSR 静态可测面 = 纯时长映射 + markup）。
 */
export function DiagToast({ result, onDismiss, onSend }: DiagToastProps): ReactNode {
  useEffect(() => {
    if (result === undefined) return
    const handle = setTimeout(onDismiss, diagToastDurationMs(result))
    return () => {
      clearTimeout(handle)
    }
  }, [result, onDismiss])
  if (result === undefined) return null
  return (
    <div className={`dswf-tt-diagtoast is-${result.tier}`} role="status" data-dswf-tt-diagtoast={result.tier}>
      <div className="dswf-tt-diagtoast-title">{result.title}</div>
      {result.tier === 'ok' ? <div className="dswf-tt-diagtoast-sub">{result.subtitle}</div> : null}
      {result.tier !== 'ok'
        ? result.lines.map((line, index) => (
            <div key={index} className={`dswf-tt-diagtoast-line is-${line.tone}`}>
              {line.text}
            </div>
          ))
        : null}
      {result.tier === 'fail' && onSend !== undefined ? (
        <button
          type="button"
          className="dswf-tt-diagtoast-send"
          data-dswf-tt-diagtoast-send=""
          onClick={() => {
            onSend(result.send)
          }}
        >
          发送给 agent
        </button>
      ) : null}
    </div>
  )
}
