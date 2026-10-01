/**
 * The C7 侦测行 (task 1.5; ui-design C7 Layout 代码区 → 侦测行): an
 * information statement, never an error-code dump — ✓ git 仓库 (· 检出 forge
 * 文档树) / 未检测到 git (信息态,零 git 强制) / 已注册项目 / 路径不存在 /
 * 父目录子仓 chips. ERR_FORGE_NOT_DETECTED is RETIRED (D1) and must never
 * appear here: 「未检测到 git」 is an info tone, not an error.
 */
import type { DetectReport } from '../../ipc-types'
import type { WorkbenchKey } from '../../locale/en'
import { ChromeButton } from '../chrome/ChromeButton'
import type { CardPhase } from './card-state'

export interface DetectRowProps {
  t: (key: WorkbenchKey) => string
  phase: CardPhase
  /** The report the phase was derived from (child chips + forge note). */
  report: DetectReport | null
  /** Chip pick → the card refills the code input and re-probes (一键选定). */
  onPickChild: (path: string) => void
}

type Tone = 'ok' | 'info' | 'warn' | 'error'

const TONE_COLOR: Record<Tone, string> = {
  ok: 'var(--dsw-alias-state-success-primary, rgb(34, 197, 94))',
  info: 'var(--dsw-alias-label-secondary, GrayText)',
  warn: 'var(--dsw-alias-state-warn-primary, rgb(245, 158, 11))',
  error: 'var(--dsw-alias-state-error-primary, rgb(236, 19, 19))',
}

const rowStyle = {
  fontSize: '12px',
  lineHeight: '18px',
  marginTop: '4px',
} as const

const chipsStyle = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '6px',
  marginTop: '6px',
} as const

const chipStyle = {
  background: 'transparent',
  border: '1px solid var(--dsh-border-color, CanvasText)',
  borderRadius: '14px',
  color: 'inherit',
  cursor: 'pointer',
  font: 'inherit',
  fontSize: '12px',
  height: '26px',
  padding: '0 12px',
} as const

/** The 侦测行: one statement per phase + the parent chips row (§5.4 一键选定). */
export function DetectRow(props: DetectRowProps) {
  const { phase, report } = props
  let text: string | null = null
  let tone: Tone = 'info'
  if (phase.kind === 'probing') {
    text = props.t('confirmCard.detect.probing')
  } else if (phase.kind === 'invalid-entry') {
    text = props.t('confirmCard.detect.invalid')
    tone = 'error'
  } else if (phase.kind === 'registered') {
    text = props.t('confirmCard.detect.registered')
    tone = 'ok'
  } else if (phase.kind === 'missing') {
    text = phase.variant === 'not-exists'
      ? props.t('confirmCard.detect.missing')
      : phase.variant === 'not-dir'
        ? props.t('confirmCard.detect.notDir')
        : props.t('confirmCard.detect.unreadable')
    tone = 'error'
  } else if (phase.kind === 'parent') {
    text = props.t('confirmCard.detect.parent')
    tone = 'warn'
  } else if (phase.kind === 'valid') {
    text = report !== null && report.forgeTreeHit
      ? props.t('confirmCard.detect.gitForge')
      : props.t('confirmCard.detect.git')
    tone = 'ok'
  } else if (phase.kind === 'nogit') {
    // 信息态,非错误(零 git 强制)— info tone, NOT error.
    text = props.t('confirmCard.detect.nogit')
    tone = 'info'
  }
  if (text === null) return null
  return (
    <div data-dsh-forge-confirm-detect="" data-tone={tone} aria-live="polite" style={{ ...rowStyle, color: TONE_COLOR[tone] }}>
      {text}
      {phase.kind === 'parent' && report !== null && (
        <div data-dsh-forge-confirm-chips="" style={chipsStyle}>
          {report.childRepos.map(child => (
            <ChromeButton
              key={child.path}
              type="button"
              data-dsh-forge-confirm-chip={child.name}
              title={child.path}
              style={chipStyle}
              onClick={() => { props.onPickChild(child.path) }}
            >
              {child.name}
            </ChromeButton>
          ))}
        </div>
      )}
    </div>
  )
}
