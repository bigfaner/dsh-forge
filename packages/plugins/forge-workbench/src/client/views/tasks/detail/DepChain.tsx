/**
 * The UF3 依赖链 section body (task 5.7): the upstream TRANSITIVE chain in
 * the topological order getTaskDetail serves — the same blocker path the
 * DAG (视图 A) draws (AC: 与视图 A 图同源同序), rendered as an indented
 * list instead of edges: each level indents one step, the last hop carries
 * the 「→ 本任务」 terminator, and every item's status rides the shared
 * vocabulary (StateDot + label, i18n/task-status.ts — the Hard Rule).
 *
 * Items are navigation, the board's ONLY interaction family: a row is a
 * button that hands the qualified key to the selection seam (链上任务可点
 * 击跳转选中) when {@link DepChainProps.onNavigate} is present; without a
 * handler the rows render as inert text (never a dead control).
 */
import { StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TaskDepChainEntry } from '../../../ipc-types'
import { TASK_STATUS_DOT_STATE, taskStatusLabel, type TaskStatusTranslate } from '../../../i18n/task-status'

/** 12/18 mono secondary (task ids — the ui-design 代码栈 text). */
const monoSecondaryStyle = {
  color: 'var(--dsw-alias-label-secondary, inherit)',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: '12px',
  lineHeight: '18px',
} as const

const shortLabelStyle = {
  color: 'var(--dsw-alias-label-secondary, inherit)',
  flex: '0 0 auto',
  fontSize: '12px',
  lineHeight: '18px',
} as const

/** 空分区 hint: one 12/18 secondary line (ui-design UF3 空分区). */
const emptyHintStyle = {
  color: 'var(--dsw-alias-label-secondary, inherit)',
  fontSize: '12px',
  lineHeight: '18px',
  margin: '0',
} as const

/** One chain row (both variants): dot + key(mono) + status label. */
const rowBaseStyle = {
  alignItems: 'center',
  display: 'flex',
  font: 'inherit',
  gap: '6px',
  padding: '2px 0',
  textAlign: 'left',
  width: '100%',
} as const

/** Inputs of {@link DepChain}. */
export interface DepChainProps {
  /** The locale seat (the shell's `t`). */
  t: TaskStatusTranslate
  /** The transitive upstream chain, topological order, qualified keys. */
  entries: readonly TaskDepChainEntry[]
  /** Selection navigation — present makes rows activatable; absent rows stay text. */
  onNavigate?: ((taskKey: string) => void) | undefined
}

/** The per-level indent step (上游 blocker 链逐级缩进). */
const INDENT_PX = 16

/**
 * The chain list. Empty input renders the section's empty hint — a task
 * with no upstream blockers is a root, not an error.
 */
export function DepChain(props: DepChainProps) {
  if (props.entries.length === 0) {
    return <p data-dsh-forge-detail-dep-empty="" style={emptyHintStyle}>{props.t('detail.depChain.empty')}</p>
  }
  return (
    <ol data-dsh-forge-detail-dep-chain="" style={{ display: 'flex', flexDirection: 'column', gap: '2px', listStyle: 'none', margin: '0', padding: '0' }}>
      {props.entries.map((entry, index) => {
        const last = index === props.entries.length - 1
        const body = (
          <>
            <StateDot state={TASK_STATUS_DOT_STATE[entry.status]} />
            <span title={entry.key} style={monoSecondaryStyle}>{entry.key}</span>
            <span style={shortLabelStyle}>{taskStatusLabel(entry.status, props.t)}</span>
            {last && <span style={shortLabelStyle}>→ {props.t('detail.depChain.self')}</span>}
          </>
        )
        const style = { ...rowBaseStyle, marginLeft: `${index * INDENT_PX}px` }
        return (
          <li key={entry.key} data-dsh-forge-detail-dep={entry.key}>
            {props.onNavigate === undefined
              ? <span style={style} title={entry.title}>{body}</span>
              : (
                <button
                  type="button"
                  aria-label={`${entry.key} · ${entry.title}`}
                  title={entry.title}
                  style={{ ...style, background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer' }}
                  onClick={() => { props.onNavigate?.(entry.key) }}
                >
                  {body}
                </button>
              )}
          </li>
        )
      })}
    </ol>
  )
}
