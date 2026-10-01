/**
 * The 开始页 body + chip title (M4 task 2.2, layout §4.1): the forge
 * take-over of the right column's door page. The body renders the muted
 * compass watermark (56px, NO heading — a browser start page shows its doors
 * without a caption) over the THREE cards — 项目概览 / 新建终端 / 浏览器 —
 * each 标题/说明 two lines, and picking one opens that kind's page IN THIS
 * TAB'S PLACE (`replaceTab` — the guide is a doorway, not a page that stays
 * open). The two engine cards are the upstream kinds themselves (terminal /
 * browser): the click walks the upstream existing face (openTab), never a
 * new terminal implementation; no menu beyond what the upstream body owns.
 *
 * Registered under the forge guide definition's id in the keyed
 * `sidebar.right.pane.tab` (body) and `sidebar.right.pane.tab.title` (chip)
 * seats — the extension take-over means the shipped GuideBody/GuideTitle no
 * longer dispatch for the `guide` kind while the forge plugin is live; the
 * native strip's ＋/seed/close-protection invariants all land HERE (see
 * tab-kinds.ts). The strip mechanics around the page (chips/×/＋/⛶/面板钮,
 * §4.2) stay the native docking kit's — zero forge code.
 */
import type { ReactNode } from 'react'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import { IconFolderClose16, IconGlobeOutline14 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TabKindTranslate } from './tab-kinds'

/** The injected share every forge tab body receives (the registration's face). */
export interface ForgeTabFace {
  /** The plugin locale seat (the client apply's bound `t`). */
  readonly t: TabKindTranslate
}

/**
 * The compass: a ring with the needle's rhombus pointing north-east (the
 * upstream door page's glyph geometry, drawn locally — the shipped one is
 * not exported; the watermark is 56px in the body, 14px in the chip).
 */
export function CompassGlyph({ size = 16 }: { size?: number }): ReactNode {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" />
      <path d="M 10.9 5.1 L 9.1 9.1 L 5.1 10.9 L 6.9 6.9 Z" fill="currentColor" />
    </svg>
  )
}

/** The terminal card's glyph: a prompt chevron over an underscore. */
function TerminalGlyph(): ReactNode {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 4.5 L7 8 L3 11.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8.5 11.5 H13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

/** One door card: the glyph, the title line, the description line. */
function GuideCard({ kind, title, description, glyph, onPick }: {
  kind: string
  title: string
  description: string
  glyph: ReactNode
  onPick: (kind: string) => void
}): ReactNode {
  return (
    <button
      type="button"
      data-dsh-forge-guide-card={kind}
      aria-label={title}
      onClick={() => { onPick(kind) }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
        width: 'min(380px, 100%)',
        minHeight: '56px',
        padding: '12px 16px',
        borderRadius: '24px',
        border: 'none',
        background: 'var(--dsh-bg, var(--dsw-alias-interactive-bg-hover, rgba(128, 128, 128, 0.12)))',
        color: 'inherit',
        font: 'inherit',
        textAlign: 'left',
        cursor: 'pointer',
      }}
    >
      <span aria-hidden="true" style={{ display: 'inline-flex', flexShrink: 0 }}>{glyph}</span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
        <span data-dsh-forge-guide-card-title="" style={{ fontSize: '14px', lineHeight: '22px', fontWeight: 500 }}>{title}</span>
        <span data-dsh-forge-guide-card-description="" style={{ fontSize: '12px', lineHeight: '18px', color: 'var(--dsw-alias-label-secondary, rgb(97, 102, 107))' }}>{description}</span>
      </span>
    </button>
  )
}

/** The guide body's composed props. */
export type GuideTabProps =
  & PropsRuntime<'sidebar.right.pane.tab'>
  & InjectFace<ForgeTabFace>

/**
 * The 开始页 body: the compass watermark over the three door cards. Picking
 * a card opens that kind IN PLACE (replaceTab) — the 开始页 is the 门, not a
 * resident page (§4.1 卡片点击 = 原位替换).
 */
export function GuideTab({ useTabInfo, t }: GuideTabProps): ReactNode {
  const { tab } = useTabInfo()
  const onPick = (kind: string): void => { tab.actions.openTab(kind, { replaceTab: true }) }
  return (
    <div
      data-dsh-forge-guide=""
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '14px',
        height: '100%',
        padding: '24px 20px',
        overflowY: 'auto',
      }}
    >
      {/* 56px 罗盘水印,无标题文案 (§4.1) */}
      <span
        data-dsh-forge-guide-watermark=""
        aria-hidden="true"
        style={{ display: 'inline-flex', color: 'var(--dsw-alias-label-tertiary, rgb(129, 133, 140))', marginBottom: '8px' }}
      >
        <CompassGlyph size={56} />
      </span>
      <GuideCard
        kind="overview"
        title={t('rightbar.guide.overview.title')}
        description={t('rightbar.guide.overview.description')}
        glyph={<IconFolderClose16 />}
        onPick={onPick}
      />
      <GuideCard
        kind="terminal"
        title={t('rightbar.guide.terminal.title')}
        description={t('rightbar.guide.terminal.description')}
        glyph={<TerminalGlyph />}
        onPick={onPick}
      />
      <GuideCard
        kind="browser"
        title={t('rightbar.guide.browser.title')}
        description={t('rightbar.guide.browser.description')}
        glyph={<IconGlobeOutline14 />}
        onPick={onPick}
      />
    </div>
  )
}

/** The chip title's composed props (the same dispatch, `title: true` in its hook context). */
export type GuideTabTitleProps =
  & PropsRuntime<'sidebar.right.pane.tab.title'>

/**
 * The 开始 chip: the compass glyph before the tab's captured title (「开始」)
 * — the upstream GuideTitle treatment, drawn on the forge take-over's own
 * registration key.
 */
export function GuideTabTitle({ useTabInfo }: GuideTabTitleProps): ReactNode {
  const { tab } = useTabInfo()
  return (
    <span data-dsh-forge-guide-title="" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
      <span aria-hidden="true" style={{ display: 'inline-flex' }}><CompassGlyph size={14} /></span>
      {tab.title}
    </span>
  )
}
