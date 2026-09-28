/**
 * One 挂接历史 row's EXPANDED lineage body (M4 task 2.6, ui-design §Component
 * C5 Layout): the linked TOP session's origin='subagent' descendants — the
 * lineage service's deriveSessionLineage product (DFS tree order, capped at
 * LINEAGE_DESCENDANT_LIMIT with the 「查看全部」 fold riding the full total),
 * styled after C3's 展开态 rows: ↳ prefix + mono 12px name + the entry's own
 * running dot + 12px/级 depth indent. The NAME is the hit's title verbatim —
 * the dispatch appendix's naming convention (task 2.8) makes a compliant
 * subagent session read as 「任务 id + title」, so the list presents the
 * 执行 subagent 标识 without re-deriving it here.
 *
 * Each entry's tail [打开] ghost (sm) rides the SUBAGENT arm of the C5 open
 * seam — the hit's address triple verbatim (Interface 6's SubagentAddress;
 * the channel implementation itself is 2.7's session-open.ts — this file
 * only hands the address to the injected callback).
 */
import { StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import { ChromeButton } from '../../../components/chrome/ChromeButton'
import { ghostButtonStyle } from '../launch/LaunchStates'
import type { TaskStatusTranslate } from '../../../i18n/task-status'
import { fillTemplate } from '../../overview/format'
import type { SubagentHit } from '../../../lineage'

/** 12/18 mono secondary — the descendant name stack (C3's subagent-row vocabulary). */
const nameStyle = {
  color: 'var(--dsw-alias-label-secondary, inherit)',
  flex: '1 1 auto',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: '12px',
  lineHeight: '18px',
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const

/** 12/18 secondary — the 查看全部 fold + the empty hint. */
const noteStyle = {
  color: 'var(--dsw-alias-label-secondary, inherit)',
  fontSize: '12px',
  lineHeight: '18px',
  margin: '0',
} as const

/** Inputs of {@link LinkDescendants}. */
export interface LinkDescendantsProps {
  /** The locale seat (the shell's `t`). */
  t: TaskStatusTranslate
  /** The DFS-ordered descendants (deriveSessionLineage's ≤20 hits). */
  hits: readonly SubagentHit[]
  /** The FULL recursive count — `total > hits.length` folds behind 「查看全部」. */
  total: number
  /** The subagent open seam's presence — absent rows stay informational. */
  openEnabled: boolean
  /** The subagent arm of the C5 open seam (the hit's address triple rides it). */
  onOpen: (hit: SubagentHit) => void
}

/**
 * The descendant list. An empty tree is a NORMAL state (a top session that
 * spawned nothing), not an error — it renders the one-line empty hint.
 */
export function LinkDescendants(props: LinkDescendantsProps) {
  return (
    <>
      {props.hits.length === 0
        ? <p data-dsh-forge-detail-descendants-empty="" style={noteStyle}>{props.t('detail.links.descendants.empty')}</p>
        : (
          <ul
            data-dsh-forge-detail-descendants=""
            style={{ display: 'flex', flexDirection: 'column', gap: '2px', listStyle: 'none', margin: '0', padding: '0' }}
          >
            {props.hits.map(hit => (
              <li
                key={hit.sessionId}
                data-dsh-forge-detail-descendant={hit.sessionId}
                style={{
                  alignItems: 'center',
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '8px',
                  minWidth: 0,
                  // C3's indent ladder, 12px per depth level from the linked top.
                  paddingLeft: `${(hit.depth - 1) * 12}px`,
                }}
              >
                <span aria-hidden="true" style={{ color: 'var(--dsw-alias-label-tertiary, GrayText)', flex: '0 0 auto' }}>↳</span>
                <span title={hit.title} style={nameStyle}>{hit.title}</span>
                {hit.running
                  ? (
                    <span
                      aria-label={props.t('tree.dot.running')}
                      role="img"
                      style={{ flex: '0 0 auto' }}
                      title={props.t('tree.dot.running')}
                    >
                      <StateDot state="ongoing" />
                    </span>
                  )
                  : <span aria-hidden="true" style={{ flex: '0 0 auto', width: '10px' }} />}
                {props.openEnabled && (
                  <ChromeButton
                    type="button"
                    data-dsh-forge-detail-descendant-open={hit.sessionId}
                    style={ghostButtonStyle}
                    onClick={() => { props.onOpen(hit) }}
                  >
                    {props.t('detail.links.open')}
                  </ChromeButton>
                )}
              </li>
            ))}
          </ul>
        )}
      {props.total > props.hits.length && (
        <p data-dsh-forge-detail-descendants-more={props.total} style={noteStyle}>
          {fillTemplate(props.t('detail.links.descendants.more'), { n: String(props.total) })}
        </p>
      )}
    </>
  )
}
