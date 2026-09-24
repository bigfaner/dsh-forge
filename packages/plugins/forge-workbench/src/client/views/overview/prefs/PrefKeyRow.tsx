/**
 * The UF4 键行, BUILD half (task 5.1, ui-design 偏好编辑面 Layout/States):
 * 键名 (mono 12/18) + 值控件 + 继承/覆盖标注 — the CONTROL TYPE comes from
 * the API's type metadata (`PrefRow.control`, the 键→控件映射权威), never a
 * hardcoded key list: boolean → toggle / number → 数值输入 / text+list → 文本
 * 输入 (list = 逗号分隔文本, the API parses on save) / coverage → 百分比输入
 * + 「维持」 mode toggle (the CoverageStrategy's two value forms).
 *
 * States (ui-design States inherited/overridden/saving/save-error rows):
 *   inherited  — 次文字 「继承 · {来源层级}:{值}」 (the source tier label +
 *                the formatted EFFECTIVE value; null value → 「未设置」);
 *   overridden — Pill 「本级覆盖」 + [清除] (sm ghost) — the ONLY place the
 *                delete action lives;
 *   saving     — the control disables + the 0.1s-class inline spinner;
 *   save-error — 值控件 error 描边 + 行内错误说明 (12/18, role=alert) +
 *                [重试]; the DISPLAY value is the rolled-back pre-save value
 *                (the parent owns the rollback — this row just renders the
 *                rows it is given), 继承/覆盖徽标不变.
 *
 * Hard Rules (task 5.1): 值类型校验行内呈现,保存禁用越界值 — type-level
 * validation happens HERE and blocks the commit (the verb never fires with a
 * type-invalid payload); range semantics beyond the type (per-key min/max)
 * stay kernel-authoritative (ERR_PREF_VALUE_INVALID arrives as save-error,
 * the same inline face). 键集固定呈现 — the row renders exactly the key it
 * is handed; there is no free-key editing surface anywhere.
 */
import { useEffect, useState } from 'react'
import type { PrefRow } from '../../../ipc-types'
import type { WorkbenchKey } from '../../../locale/en'
import { ghostButtonStyle } from '../../tasks/launch/LaunchStates'

/** The save-error record the parent hands down (retry re-fires the attempt). */
export interface PrefSaveError {
  /** Which verb failed (retry re-fires it with the attempted value). */
  readonly kind: 'set' | 'clear'
  /** The attempted set value (absent for clear). */
  readonly value?: unknown
  /** Human text for the inline error line (the envelope's message). */
  readonly message: string
}

/** Inputs of {@link PrefKeyRow}. */
export interface PrefKeyRowProps {
  /** The locale seat (the shell's `t`). */
  readonly t: (key: WorkbenchKey) => string
  /** The registry row (effective value + source + type metadata + override bit). */
  readonly row: PrefRow
  /** saving 态 — the verb for THIS row is in flight. */
  readonly saving: boolean
  /** save-error 态 — the last verb for THIS row failed (inline face + retry). */
  readonly error: PrefSaveError | undefined
  /** Commit seam: fire setPrefs([{key, value}]) at the current tier. */
  readonly onCommit: (key: string, value: unknown) => void
  /** Clear seam: fire clearPrefOverride(key) at the current tier. */
  readonly onClear: (key: string) => void
  /** Retry seam: re-fire the errored attempt (set value or clear). */
  readonly onRetry: (key: string) => void
}

/** 键名 mono 12/18 (the key-address token). */
const keyStyle = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: '12px',
  lineHeight: '18px',
  minWidth: '0',
  overflowWrap: 'anywhere',
} as const

const rowStyle = {
  alignItems: 'center',
  display: 'flex',
  flexWrap: 'wrap',
  gap: '8px',
  padding: '7px 0',
} as const

/** 继承态 次文字 12/18 (ui-design: 「继承 · {层级}:{值}」). */
const sourceStyle = {
  color: 'var(--dsw-alias-label-secondary, inherit)',
  fontSize: '12px',
  lineHeight: '18px',
} as const

/** 覆盖态 Pill「本级覆盖」(the 徽标 Pill geometry — neutral fill). */
const overridePillStyle = {
  background: 'var(--dsh-interactive-bg-hover, rgba(128, 128, 128, 0.2))',
  borderRadius: '8px',
  flex: '0 0 auto',
  fontSize: '12px',
  lineHeight: '18px',
  padding: '0 6px',
  whiteSpace: 'nowrap',
} as const

const valueAreaStyle = {
  alignItems: 'center',
  display: 'flex',
  gap: '8px',
  marginLeft: 'auto',
} as const

const controlBaseStyle = {
  border: '1px solid var(--dsh-border-color, CanvasText)',
  borderRadius: '8px',
  font: 'inherit',
  fontSize: '12px',
  lineHeight: '18px',
  padding: '3px 8px',
} as const

/** save-error 描边 (ui-design States: 值控件 error 描边). */
const controlErrorStyle = {
  ...controlBaseStyle,
  border: '1.5px solid var(--dsw-alias-state-error-primary, rgb(236, 19, 19))',
} as const

/** The inline error line (12/18) + retry — NEVER a toast (Hard Rule: 行内). */
const errorLineStyle = {
  alignItems: 'center',
  color: 'var(--dsw-alias-state-error-primary, rgb(236, 19, 11))',
  display: 'flex',
  fontSize: '12px',
  gap: '8px',
  lineHeight: '18px',
} as const

const retryButtonStyle = {
  ...ghostButtonStyle,
  height: '24px',
  padding: '0 8px',
} as const

const clearButtonStyle = {
  ...ghostButtonStyle,
  height: '24px',
  padding: '0 8px',
} as const

/** The coverage 「维持」 mode toggle (ghost pill, aria-pressed carries the mode). */
const maintainButtonStyle = {
  ...ghostButtonStyle,
  height: '24px',
  padding: '0 8px',
} as const

/** The 0.1s-class saving spinner (SMIL, the launch-spinner form). */
function SavingSpinner(props: { label: string }): React.ReactElement {
  return (
    <span
      data-dsh-forge-pref-saving=""
      role="status"
      aria-label={props.label}
      style={{ alignItems: 'center', display: 'inline-flex', flex: '0 0 auto' }}
    >
      <svg viewBox="0 0 16 16" width="14" height="14" focusable="false" aria-hidden="true">
        <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.25" />
        <path d="M 8 2 A 6 6 0 0 1 14 8" fill="none" stroke="currentColor" strokeWidth="2">
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0 8 8"
            to="360 8 8"
            dur="0.6s"
            repeatCount="indefinite"
          />
        </path>
      </svg>
    </span>
  )
}

/** Format an effective value for the 继承 annotation (locale-aware forms). */
export function formatPrefValue(value: unknown, t: (key: WorkbenchKey) => string): string {
  if (value === null || value === undefined) return t('overview.prefs.row.unset')
  if (typeof value === 'boolean') return String(value)
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'object') {
    const strategy = value as { type?: unknown; percentage?: unknown }
    if (strategy.type === 'maintain') return t('overview.prefs.coverage.maintain')
    if (strategy.type === 'percentage' && typeof strategy.percentage === 'number') {
      return `${String(strategy.percentage)}%`
    }
  }
  return JSON.stringify(value)
}

/** The source tier's label (the closed 枚举 label map; null → 未设置 tier). */
function sourceLabel(source: PrefRow['source'], t: (key: WorkbenchKey) => string): string {
  switch (source) {
    case 'global': return t('overview.prefs.source.global')
    case 'project': return t('overview.prefs.source.project')
    case 'feature': return t('overview.prefs.source.feature')
    case 'default': return t('overview.prefs.source.default')
    default: return t('overview.prefs.row.unset')
  }
}

/** The textual seeds for number/percentage drafts (null → empty input). */
function numberSeed(value: unknown): string {
  return typeof value === 'number' ? String(value) : ''
}

/**
 * One registry key row. The control commits on change (toggle), blur/Enter
 * (typed inputs — number/text/list/percentage), with Escape resetting the
 * draft to the row's effective value. Type-invalid drafts mark the row
 * inline AND never fire the verb (Hard Rule: 保存禁用越界值).
 */
export function PrefKeyRow(props: PrefKeyRowProps) {
  const { t, row, saving } = props
  const [draft, setDraft] = useState<string>(() => typedSeed(row))
  const [invalid, setInvalid] = useState<string | undefined>(undefined)

  // Re-seed the draft whenever the row's effective value settles elsewhere
  // (a completed save's refetch, a rollback, a tier switch re-render).
  useEffect(() => {
    setDraft(typedSeed(row))
    setInvalid(undefined)
  }, [row.key, row.value])

  const commitTyped = (): void => {
    if (invalid !== undefined || saving) return
    if (draft === typedSeed(row)) return // unchanged — nothing to save
    switch (row.type) {
      case 'number': {
        const parsed = Number(draft)
        if (draft.trim() === '' || !Number.isInteger(parsed)) {
          setInvalid(t('overview.prefs.row.invalidNumber'))
          return
        }
        props.onCommit(row.key, parsed)
        return
      }
      case 'text': {
        const trimmed = draft.trim()
        if (trimmed === '') {
          setInvalid(t('overview.prefs.row.invalidText'))
          return
        }
        props.onCommit(row.key, trimmed)
        return
      }
      case 'list': {
        const entries = draft.split(',').map(item => item.trim()).filter(item => item !== '')
        if (entries.length === 0) {
          setInvalid(t('overview.prefs.row.invalidList'))
          return
        }
        // The comma-separated TEXT rides to the API — 解析为列表 is the
        // kernel's normalizePrefValue leg (ui-design: 保存时经偏好 API 解析).
        props.onCommit(row.key, draft)
        return
      }
      case 'coverage': {
        const parsed = Number(draft)
        if (draft.trim() === '' || !Number.isInteger(parsed) || parsed < 0 || parsed > 100) {
          setInvalid(t('overview.prefs.row.invalidPercent'))
          return
        }
        props.onCommit(row.key, { type: 'percentage', percentage: parsed })
        return
      }
      default:
        return
    }
  }

  const controlStyle = props.error !== undefined ? controlErrorStyle : controlBaseStyle
  const ariaLabel = row.key

  const control = (): React.ReactElement => {
    switch (row.control) {
      case 'toggle':
        return (
          <input
            type="checkbox"
            data-dsh-forge-pref-control="toggle"
            aria-label={ariaLabel}
            checked={row.value === true}
            disabled={saving}
            onChange={(event) => { props.onCommit(row.key, event.target.checked) }}
          />
        )
      case 'number-input':
        return (
          <input
            type="number"
            step="1"
            data-dsh-forge-pref-control="number-input"
            aria-label={ariaLabel}
            value={draft}
            disabled={saving}
            style={controlStyle}
            onChange={(event) => { setDraft(event.target.value); setInvalid(undefined) }}
            onBlur={commitTyped}
            onKeyDown={(event) => {
              if (event.key === 'Enter') { event.preventDefault(); commitTyped() }
              else if (event.key === 'Escape') { setDraft(typedSeed(row)); setInvalid(undefined) }
            }}
          />
        )
      case 'text-input':
        return (
          <input
            type="text"
            data-dsh-forge-pref-control="text-input"
            aria-label={ariaLabel}
            value={draft}
            disabled={saving}
            style={{ ...controlStyle, minWidth: '160px' }}
            onChange={(event) => { setDraft(event.target.value); setInvalid(undefined) }}
            onBlur={commitTyped}
            onKeyDown={(event) => {
              if (event.key === 'Enter') { event.preventDefault(); commitTyped() }
              else if (event.key === 'Escape') { setDraft(typedSeed(row)); setInvalid(undefined) }
            }}
          />
        )
      case 'coverage-input': {
        const strategy = row.value
        const maintain = typeof strategy === 'object' && strategy !== null
          && (strategy as { type?: unknown }).type === 'maintain'
        return (
          <>
            <input
              type="number"
              min="0"
              max="100"
              step="1"
              data-dsh-forge-pref-control="coverage-input"
              aria-label={ariaLabel}
              value={draft}
              disabled={saving || maintain}
              style={{ ...controlStyle, opacity: maintain ? 0.5 : 1 }}
              onChange={(event) => { setDraft(event.target.value); setInvalid(undefined) }}
              onBlur={commitTyped}
              onKeyDown={(event) => {
                if (event.key === 'Enter') { event.preventDefault(); commitTyped() }
                else if (event.key === 'Escape') { setDraft(typedSeed(row)); setInvalid(undefined) }
              }}
            />
            <button
              type="button"
              data-dsh-forge-pref-coverage-maintain=""
              aria-pressed={maintain ? 'true' : 'false'}
              aria-label={`${row.key} — ${t('overview.prefs.coverage.maintain')}`}
              disabled={saving}
              title={t('overview.prefs.coverage.maintain')}
              style={maintainButtonStyle}
              onClick={() => {
                if (maintain) {
                  // 维持 → 百分比:commit the typed draft (validated leg above).
                  commitTyped()
                } else {
                  props.onCommit(row.key, { type: 'maintain' })
                }
              }}
            >
              {t('overview.prefs.coverage.maintain')}
            </button>
          </>
        )
      }
      default:
        // Unknown control metadata renders the raw formatted value (the
        // 兜底透出 discipline — data-derived enums never blank the row).
        return <span style={sourceStyle}>{formatPrefValue(row.value, t)}</span>
    }
  }

  return (
    <div data-dsh-forge-pref-row={row.key} style={rowStyle}>
      <span style={keyStyle}>{row.key}</span>
      <span style={valueAreaStyle}>
        {control()}
        {saving && <SavingSpinner label={t('overview.prefs.row.saving')} />}
        {row.override
          ? (
            <>
              <span data-dsh-forge-pref-override="" style={overridePillStyle}>
                {t('overview.prefs.row.overridden')}
              </span>
              <button
                type="button"
                data-dsh-forge-pref-clear=""
                aria-label={`${row.key} — ${t('overview.prefs.row.clear')}`}
                disabled={saving}
                style={clearButtonStyle}
                onClick={() => { props.onClear(row.key) }}
              >
                {t('overview.prefs.row.clear')}
              </button>
            </>
          )
          : (
            <span data-dsh-forge-pref-source="" style={sourceStyle}>
              {t('overview.prefs.row.inherited')
                .replace('{source}', sourceLabel(row.source, t))
                .replace('{value}', formatPrefValue(row.value, t))}
            </span>
          )}
      </span>
      {invalid !== undefined && (
        <span data-dsh-forge-pref-invalid="" role="alert" style={errorLineStyle}>
          {invalid}
        </span>
      )}
      {props.error !== undefined && (
        <span
          data-dsh-forge-pref-save-error=""
          role="alert"
          style={errorLineStyle}
        >
          {t('overview.prefs.row.saveError').replace('{message}', props.error.message)}
          <button
            type="button"
            data-dsh-forge-pref-retry=""
            aria-label={`${row.key} — ${t('overview.prefs.row.retry')}`}
            disabled={saving}
            style={retryButtonStyle}
            onClick={() => { props.onRetry(row.key) }}
          >
            {t('overview.prefs.row.retry')}
          </button>
        </span>
      )}
    </div>
  )
}

/** The typed-control seed: number/percentage → digits; text → as-is; list → joined. */
function typedSeed(row: PrefRow): string {
  if (row.control === 'number-input' || row.control === 'coverage-input') {
    if (row.control === 'coverage-input') {
      const strategy = row.value
      if (typeof strategy === 'object' && strategy !== null) {
        const coverage = strategy as { type?: unknown; percentage?: unknown }
        if (coverage.type === 'percentage' && typeof coverage.percentage === 'number') {
          return String(coverage.percentage)
        }
      }
      return ''
    }
    return numberSeed(row.value)
  }
  if (row.type === 'list') {
    return Array.isArray(row.value) ? row.value.join(', ') : typeof row.value === 'string' ? row.value : ''
  }
  return typeof row.value === 'string' ? row.value : ''
}
