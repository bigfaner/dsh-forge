// 时间线（定位：业务——AC5 块二：现状条[当前关联一览，六型条件] + 事件流[垂直时间线，
// 关联信息织入事件]）。verb 路由 = contracts TASK_RECORD_VERBS 六值穷尽（Implementation
// Notes）；评估事件 = eval 族 submit 记录的呈现路由（verb 词汇封闭六值——M2 评估结果落
// submit 记录，标签换「评估」+ 🔑 主会话织入）。节点分色：提交绿/领取蓝/阻塞琥珀/恢复绿/
// 人工转移蓝环（类位吃状态令牌——drawer.css）。
import type { ReactNode } from 'react'
import { TASK_STATUS_LABELS, type SessionTaskLinkCard, type TaskDetail, type TaskRecordEntry, type TaskRecordVerb } from '@dsh-forge/contracts'
import { isoTimeLabelZh } from '../../../components/time-label.js'
import { evalScoreOf, gateSummary, latestSubmitGateOf, taskKeyLabel, varsText } from './detail-model.js'
import { templateFamilyOf } from './type-templates/index.js'

export { evalScoreOf } from './detail-model.js' // 现状条「得分+严重度」条件同源投影（消费面重导出）

/** verb → 节点色类（v-submit 绿 / v-claim 蓝 / v-block 琥珀 / v-restore 绿 / v-human 蓝环） */
export const TASK_VERB_KIND: Readonly<Record<TaskRecordVerb, string>> = {
  add: 'v-add',
  claim: 'v-claim',
  submit: 'v-submit',
  transition: 'v-human',
  'auto-restore': 'v-restore',
  'auto-block': 'v-block',
}

/** verb 标签（六值穷尽；eval 族 submit → 「评估」——呈现路由非词汇变更） */
export function recordVerbLabel(verb: TaskRecordVerb, taskType: string): string {
  if (verb === 'submit' && templateFamilyOf(taskType) === 'eval') return '评估'
  switch (verb) {
    case 'add':
      return '创建'
    case 'claim':
      return '领取'
    case 'submit':
      return '提交'
    case 'transition':
      return '人工转移'
    case 'auto-restore':
      return '自动恢复'
    case 'auto-block':
      return '自动阻塞'
  }
}

/** 现状条条目（六型条件投影——渲染序 = 投影序） */
export type NowBarItem =
  | { readonly kind: 'blocked'; readonly reason: string }
  | { readonly kind: 'prereqs'; readonly items: readonly { readonly key: string; readonly statusZh: string }[] }
  | { readonly kind: 'sessions'; readonly items: readonly SessionTaskLinkCard[] }
  | { readonly kind: 'surface'; readonly key: string; readonly surfaceType: string }
  | { readonly kind: 'gate'; readonly passed: number; readonly total: number }
  | { readonly kind: 'score'; readonly score: string; readonly severity: string; readonly mainSession: boolean }

/** 现状条条目投影（六型条件：blocked / 前置[键+状态] / 挂接 pill 分型 / Surface[test 族] /
 *  质量门 M/N[gate 族] / 得分+严重度[eval 族——vars.score 自由文本承载]） */
export function nowBarItems(detail: TaskDetail): readonly NowBarItem[] {
  const items: NowBarItem[] = []
  if (detail.taskStatus === 'blocked' && detail.blockedReason !== undefined) {
    items.push({ kind: 'blocked', reason: detail.blockedReason })
  }
  if (detail.prerequisites.length > 0) {
    items.push({
      kind: 'prereqs',
      items: detail.prerequisites.map((p) => ({
        key: taskKeyLabel(p.slug, p.localId),
        statusZh: TASK_STATUS_LABELS[p.taskStatus].zh,
      })),
    })
  }
  if (detail.sessions.length > 0) {
    items.push({ kind: 'sessions', items: detail.sessions })
  }
  const family = templateFamilyOf(detail.taskType)
  if (family === 'test' && detail.surfaceKey !== undefined) {
    items.push({ kind: 'surface', key: detail.surfaceKey, surfaceType: detail.surfaceType ?? '?' })
  }
  if (family === 'gate') {
    const gate = latestSubmitGateOf(detail.records)
    if (gate !== undefined) {
      const summary = gateSummary(gate)
      items.push({ kind: 'gate', passed: summary.passed, total: summary.total })
    }
  }
  if (family === 'eval') {
    const score = evalScoreOf(detail)
    if (score !== undefined) {
      items.push({ kind: 'score', ...score })
    }
  }
  return items
}

/** 会话 pill（双源分型：link = 派发⟞ / record = 执行⟞；可点跳会话——回调缺席 = 非交互呈现） */
function SessionPill({
  session,
  onOpenSession,
}: {
  readonly session: SessionTaskLinkCard
  readonly onOpenSession: ((sessionId: string) => void) | undefined
}): ReactNode {
  const label = `${session.source === 'link' ? '派发' : '执行'}⟞ ${session.sessionId}`
  if (onOpenSession === undefined) return <span className="dswf-td-sess">{label}</span>
  return (
    <button
      type="button"
      className="dswf-td-sess is-link"
      data-dswf-td-sess={session.sessionId}
      title="跳转会话"
      onClick={() => {
        onOpenSession(session.sessionId)
      }}
    >
      {label}
    </button>
  )
}

/** 现状条（块首——条件全缺 → 不渲染） */
export function TimelineNow({
  detail,
  onOpenSession,
}: {
  readonly detail: TaskDetail
  readonly onOpenSession?: (sessionId: string) => void
}): ReactNode {
  const items = nowBarItems(detail)
  if (items.length === 0) return null
  return (
    <div className="dswf-td-now" data-dswf-td-now="">
      <span className="dswf-td-now-k">现状</span>
      {items.map((item, index) => {
        switch (item.kind) {
          case 'blocked':
            return (
              <span className="dswf-td-now-item is-warn" key={index}>
                ⚠ {item.reason}
              </span>
            )
          case 'prereqs':
            return (
              <span className="dswf-td-now-item" key={index}>
                前置 {item.items.map((p) => `${p.key}（${p.statusZh}）`).join(' · ')}
              </span>
            )
          case 'sessions':
            return (
              <span className="dswf-td-now-item" key={index}>
                {item.items.map((session) => (
                  <SessionPill key={session.sessionId} session={session} onOpenSession={onOpenSession} />
                ))}
              </span>
            )
          case 'surface':
            return (
              <span className="dswf-td-now-item" key={index}>
                Surface {item.key}（{item.surfaceType}）
              </span>
            )
          case 'gate':
            return (
              <span className="dswf-td-now-item" key={index}>
                质量门 {item.passed}/{item.total}
              </span>
            )
          case 'score':
            return (
              <span className="dswf-td-now-item" key={index}>
                得分 {item.score}/100 · 严重度 {item.severity}
                {item.mainSession ? ' · 🔑 主会话' : ''}
              </span>
            )
        }
      })}
    </div>
  )
}

/** 事件说明行（织入信息——垂直缩进对齐） */
function Note({ children }: { readonly children: ReactNode }): ReactNode {
  return <div className="dswf-td-ev-note">{children}</div>
}

/** 事件织入（创建：前置声明 + fix 链；领取：digest + 派发⟞；提交：gate + commit 徽标/
 *  摘要/文件数 + 执行⟞；转移：from→to+reason；自动阻塞/恢复：语义行） */
function eventWeaves(record: TaskRecordEntry, detail: TaskDetail, onOpenSession: ((sessionId: string) => void) | undefined): ReactNode {
  const vars = detail.vars ?? {}
  switch (record.verb) {
    case 'add': {
      const prereqs = detail.prerequisites.map((p) => taskKeyLabel(p.slug, p.localId))
      const fixSource = detail.sourceTask !== undefined ? taskKeyLabel(detail.sourceTask.slug, detail.sourceTask.localId) : undefined
      const rootCause = varsText(vars, 'rootCause')
      const sourceFiles = varsText(vars, 'sourceFiles')
      const testScript = varsText(vars, 'testScript')
      return (
        <>
          {prereqs.length > 0 ? <Note>{`前置声明 ← ${prereqs.join(' · ')}`}</Note> : null}
          {fixSource !== undefined || rootCause !== undefined ? (
            <Note>
              {`fix 链${fixSource !== undefined ? `：来源 ${fixSource}` : ''}${rootCause !== undefined ? ` · 根因：${rootCause}` : ''}`}
            </Note>
          ) : null}
          {sourceFiles !== undefined ? <Note>{sourceFiles}</Note> : null}
          {testScript !== undefined ? <Note>{`$ ${testScript}`}</Note> : null}
        </>
      )
    }
    case 'claim': {
      const dispatch = record.sessionId !== undefined ? { sessionId: record.sessionId } : undefined
      return (
        <>
          {record.digest !== undefined ? <Note>{`digest ${record.digest}`}</Note> : null}
          {dispatch !== undefined ? (
            <Note>
              <SessionPill
                session={{
                  taskId: detail.taskId,
                  slug: detail.slug,
                  localId: detail.localId,
                  title: detail.title,
                  taskStatus: detail.taskStatus,
                  sessionId: dispatch.sessionId,
                  source: 'link',
                }}
                onOpenSession={onOpenSession}
              />
            </Note>
          ) : null}
        </>
      )
    }
    case 'submit': {
      const summary = gateSummary(
        record.gate ?? { compile: false, fmt: false, lint: false, test: false },
      )
      const isEval = templateFamilyOf(detail.taskType) === 'eval'
      return (
        <>
          {record.gate !== undefined ? (
            <Note>
              {`gate ${summary.passed}/${summary.total}`}
              {record.gate.coverage !== undefined ? ` · 覆盖率 ${Math.round(record.gate.coverage * 100)}%` : ''}
            </Note>
          ) : null}
          {isEval && detail.mainSession ? <Note>🔑 主会话</Note> : null}
          {record.commitHash !== undefined ? (
            <Note>
              <span className="dswf-td-commit" data-dswf-td-commit={record.commitHash}>
                {record.commitHash}
              </span>
              {record.summary !== undefined ? ` ${record.summary}` : ''}
              {record.files !== undefined ? `（${record.files.length} 文件）` : ''}
            </Note>
          ) : record.summary !== undefined ? (
            <Note>{record.summary}</Note>
          ) : null}
          {record.sessionId !== undefined ? (
            <Note>
              <SessionPill
                session={{
                  taskId: detail.taskId,
                  slug: detail.slug,
                  localId: detail.localId,
                  title: detail.title,
                  taskStatus: detail.taskStatus,
                  sessionId: record.sessionId,
                  source: 'record',
                }}
                onOpenSession={onOpenSession}
              />
            </Note>
          ) : null}
        </>
      )
    }
    case 'transition':
      return (
        <>
          <Note>{`${statusZh(record.fromStatus)} → ${statusZh(record.toStatus)}${record.reason !== undefined ? ` · reason: ${record.reason}` : ''}`}</Note>
        </>
      )
    case 'auto-restore':
      return (
        <>
          <Note>{`${statusZh(record.fromStatus)} → ${statusZh(record.toStatus)}（边保留）`}</Note>
          {record.summary !== undefined || record.reason !== undefined ? (
            <Note>{record.summary ?? record.reason}</Note>
          ) : null}
        </>
      )
    case 'auto-block':
      return (
        <>
          {record.summary !== undefined || record.reason !== undefined ? (
            <Note>{record.summary ?? record.reason}</Note>
          ) : null}
        </>
      )
  }
}

function statusZh(status: string | undefined): string {
  if (status === undefined) return '—'
  return TASK_STATUS_LABELS[status as keyof typeof TASK_STATUS_LABELS]?.zh ?? status
}

/** 事件流（垂直时间线——记录序 = append-only 自增序[旧 → 新]；verb 穷尽路由） */
export function TimelineEvents({
  detail,
  onOpenSession,
  now,
}: {
  readonly detail: TaskDetail
  readonly onOpenSession?: (sessionId: string) => void
  readonly now: number
}): ReactNode {
  if (detail.records.length === 0) {
    return (
      <div className="dswf-td-line">
        <div className="dswf-td-ev">
          <div className="dswf-td-ev-note">暂无记录</div>
        </div>
      </div>
    )
  }
  return (
    <div className="dswf-td-line">
      {detail.records.map((record, index) => (
        <div
          className={`dswf-td-ev ${TASK_VERB_KIND[record.verb]}`}
          key={`${index}-${record.verb}`}
          data-dswf-td-ev-verb={record.verb}
        >
          <div className="dswf-td-ev-head">
            <span className="dswf-td-ev-verb">{recordVerbLabel(record.verb, detail.taskType)}</span>
            <span className="dswf-td-ev-at" title={record.createdAt}>
              {isoTimeLabelZh(record.createdAt, now)}
            </span>
          </div>
          {eventWeaves(record, detail, onOpenSession)}
        </div>
      ))}
    </div>
  )
}
