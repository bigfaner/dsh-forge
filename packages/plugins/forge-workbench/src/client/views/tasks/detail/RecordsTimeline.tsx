/**
 * The UF3 执行记录 section body (task 5.7): the forge execution records as
 * a timeline — per entry: time + kind + the per-change 来源 badge
 * ([会话]/[终端]; null renders no badge — BIZ-task-ops-001: the board
 * presents sources, never writes) + the record's summary rendered through
 * the shared READ-ONLY MarkdownView (the 5.2 module's own contract names
 * execution records among its prose surfaces; an empty summary renders
 * nothing). Timestamps ride the deterministic formatter (ISO in, fixed
 * `YYYY-MM-DD HH:mm` out; the full ISO always rides `title`).
 */
import { MarkdownView } from '../../../components/common/MarkdownView'
import type { TaskRecord } from '../../../ipc-types'
import { sourceBadgeStyle } from '../TaskRow'
import { formatTimestamp } from '../../overview/format'
import type { TaskStatusTranslate } from '../../../i18n/task-status'

/** 空分区 hint: one 12/18 secondary line (ui-design UF3 空分区). */
const emptyHintStyle = {
  color: 'var(--dsw-alias-label-secondary, inherit)',
  fontSize: '12px',
  lineHeight: '18px',
  margin: '0',
} as const

/** The timestamp cell: 12/18 secondary, ISO original on `title`. */
const timeStyle = {
  color: 'var(--dsw-alias-label-secondary, inherit)',
  flex: '0 0 auto',
  fontSize: '12px',
  lineHeight: '18px',
  whiteSpace: 'nowrap',
} as const

/** The record's kind (task type, 2.5 dialect): mono secondary. */
const kindStyle = {
  color: 'var(--dsw-alias-label-secondary, inherit)',
  flex: '0 0 auto',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: '12px',
  lineHeight: '18px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const

/** Inputs of {@link RecordsTimeline}. */
export interface RecordsTimelineProps {
  /** The locale seat (the shell's `t`). */
  t: TaskStatusTranslate
  /** forge execution records (getTaskDetail's, verbatim). */
  records: readonly TaskRecord[]
}

/**
 * The timeline. Empty input renders the section's empty hint (无记录 is a
 * normal young-task state, not an error).
 */
export function RecordsTimeline(props: RecordsTimelineProps) {
  if (props.records.length === 0) {
    return <p data-dsh-forge-detail-records-empty="" style={emptyHintStyle}>{props.t('detail.records.empty')}</p>
  }
  return (
    <ol data-dsh-forge-detail-records="" style={{ display: 'flex', flexDirection: 'column', gap: '10px', listStyle: 'none', margin: '0', padding: '0' }}>
      {props.records.map((record, index) => (
        <li key={`${record.at}:${index}`} data-dsh-forge-detail-record={index} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span style={{ alignItems: 'center', display: 'flex', gap: '8px', minWidth: 0 }}>
            <time dateTime={record.at} title={record.at} style={timeStyle}>{formatTimestamp(record.at)}</time>
            <span title={record.kind} style={kindStyle}>{record.kind}</span>
            {record.source !== null && (
              <span data-dsh-forge-badge={`source:${record.source}`} style={sourceBadgeStyle}>
                {props.t(record.source === 'session' ? 'tasks.source.session' : 'tasks.source.terminal')}
              </span>
            )}
          </span>
          {record.summary !== '' && <MarkdownView markdown={record.summary} />}
        </li>
      ))}
    </ol>
  )
}
