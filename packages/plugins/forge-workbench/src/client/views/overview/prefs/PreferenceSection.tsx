/**
 * The UF4 偏好编辑面 section card, BUILD half (task 5.1, ui-design 偏好
 * 编辑面·三级): r14 · bg-layer-2 · pad 14, 标题「运行偏好」(16/24) —
 * 层级 segmented (全局/项目/Feature) + Feature 级的 feature 选择 Menu 卡 +
 * 键分组折叠区 + 键行 (PrefKeyRow). Mounted by the 5.2 integration on the
 * overview page (插件管理区之下 — OverviewPage owns the Placement); this
 * file's 5.2 additions are the reflux seam below.
 *
 * Data plane (ui-design Data Binding + Hard Rules): everything flows through
 * the PrefsFace seam — getPrefs answers EVERY registry key with type/control/
 * group metadata, so the group accordion AND the per-key control choice are
 * metadata-driven (the UI hardcodes no key list; surfaces never appear
 * because the registry excludes them — PRD D3). 修改仅经偏好 API: every
 * write is setPrefs/clearPrefOverride on the CURRENT tier's scope (feature
 * scope = `<projectId>/<featureSlug>`), never a second writer.
 *
 * Save chain (ui-design Interactions 修改值/「清除」/save-error rows): a
 * change optimistically patches the DISPLAYED value (badges untouched), the
 * row spins; success → toast 「已保存」 (connected changes MERGE into the one
 * toast instance — a refreshed timer, never a stack) + a silent re-read so
 * the effective value/source/override land authoritatively (生效值即时
 * 更新); failure → the rows roll back to the pre-save snapshot (显示值回滚,
 * 继承/覆盖徽标不变) and the row carries the inline save-error + [重试]
 * (失败不经 toast — the error is visible ON the row).
 *
 * Accordion 会话期记忆: the collapsed-group set is MODULE-scoped (survives
 * unmount/remount — the 5.2 page switches must not fold everything back
 * open); `resetPrefGroupSessionMemory` is the spec-isolation seam.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { PrefRow, PrefScope, WorkbenchEvent } from '../../../ipc-types'
import type { PrefsFace } from '../../../contract'
import type { WorkbenchKey } from '../../../locale/en'
import { ChromeButton } from '../../../components/chrome/ChromeButton'
import { TOAST_Z, ghostButtonStyle } from '../../tasks/launch/LaunchStates'
import { createMockPrefsFace } from '../../../mocks/workbench'
import { PrefKeyRow, type PrefSaveError } from './PrefKeyRow'
import { ScopeSegmented, type PrefTier } from './ScopeSegmented'

/**
 * The session-scoped accordion memory (展开/折叠 状态记忆于会话期). A plain
 * module Set: NOT component state, so a remount (tab switch once 5.2 mounts
 * the section) keeps the fold. TEST/BUILD-ONLY reset seam below.
 */
const collapsedGroupsSession = new Set<string>()

/** TEST/BUILD-ONLY: reset the session accordion memory (spec isolation). */
export function resetPrefGroupSessionMemory(): void {
  collapsedGroupsSession.clear()
}

/** The section's active-project binding (the 项目 tier's premise + label). */
export interface PrefProjectRef {
  readonly id: string
  readonly displayName: string
}

/** A feature-picker entry (the Feature tier's premise). */
export interface PrefFeatureRef {
  readonly slug: string
}

/** Inputs of {@link PreferenceSection}. */
export interface PreferenceSectionProps {
  /** The locale seat (the shell's `t`). */
  readonly t: (key: WorkbenchKey) => string
  /** The ACTIVE project (absent → 项目/Feature tiers disabled, 仅「全局」可用). */
  readonly activeProject?: PrefProjectRef | undefined
  /** The active project's features (empty → Feature tier disabled + tooltip). */
  readonly features?: readonly PrefFeatureRef[] | undefined
  /** The section face — absent members fall back to the build-stage mock (5.2 injects the IPC face). */
  readonly face?: Partial<PrefsFace> | undefined
  /**
   * UF4 reflux seam (task 5.2, tech-design §Interface 1 事件扩展): the
   * shared single-subscriber event channel (the 5.2 assembly hands
   * getWorkbenchEventSource(bridge).subscribe). The section filters pushed
   * `prefs_updated { scope, scopeId }` events against the CURRENT scope's
   * resolution-chain addresses (global ⊂ project ⊂ feature — a global write
   * moves a project-tier row's effective value too) and silently re-reads:
   * rows stay mounted, no skeleton, no manual refresh. Absent = the
   * build-stage form (no push channel).
   */
  readonly subscribeEvents?: ((listener: (events: readonly WorkbenchEvent[]) => void) => (() => void)) | undefined
}

/** ui-design 区块卡: r14 · bg-layer-2 · pad 14. */
const cardStyle = {
  background: 'var(--dsw-alias-bg-layer-2, var(--dsh-bg, Canvas))',
  border: '1px solid var(--dsh-border-color, CanvasText)',
  borderRadius: '14px',
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  minWidth: '0',
  padding: '14px',
} as const

const titleStyle = {
  fontSize: '16px',
  fontWeight: 500,
  lineHeight: '24px',
  margin: '0',
} as const

/** 12/18 次文字 (the resolve hint under the title). */
const hintStyle = {
  color: 'var(--dsw-alias-label-secondary, inherit)',
  fontSize: '12px',
  lineHeight: '18px',
  margin: '0',
} as const

const headerRowStyle = {
  alignItems: 'center',
  display: 'flex',
  flexWrap: 'wrap',
  gap: '10px',
} as const

const errorCardStyle = {
  ...cardStyle,
  border: '1.5px solid var(--dsw-alias-state-error-primary, rgb(236, 19, 19))',
  gap: '8px',
} as const

/** md primary pill (the load-error retry — the overview retry precedent). */
const retryButtonStyle = {
  background: 'var(--dsw-alias-link, rgb(65, 118, 230))',
  border: 'none',
  borderRadius: '18px',
  color: '#fff',
  cursor: 'pointer',
  font: 'inherit',
  height: '36px',
  padding: '0 16px',
} as const

/** Skeleton row: gray ghost with the 0.3s shimmer loop (the overview precedent). */
const skeletonRowStyle = {
  background: 'var(--dsh-interactive-bg-hover, rgba(128, 128, 128, 0.2))',
  borderRadius: '9px',
  height: '32px',
  overflow: 'hidden',
} as const

/** The toast (z1100, role=status per ui-design 全局规则; explicit dismiss + merged timer). */
const toastCardStyle = {
  alignItems: 'flex-start',
  background: 'var(--dsh-bg, Canvas)',
  border: '1px solid var(--dsh-border-color, CanvasText)',
  borderRadius: '14px',
  bottom: '16px',
  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.18)',
  display: 'flex',
  gap: '10px',
  maxWidth: '360px',
  padding: '12px 14px',
  position: 'fixed',
  right: '16px',
  zIndex: TOAST_Z,
} as const

const toastBodyStyle = {
  fontSize: '14px',
  lineHeight: '22px',
  margin: '0',
} as const

/** Group accordion header (the 手风琴 trigger). */
const groupHeaderStyle = {
  alignItems: 'center',
  background: 'transparent',
  border: 'none',
  borderRadius: '8px',
  color: 'inherit',
  cursor: 'pointer',
  display: 'flex',
  font: 'inherit',
  fontSize: '14px',
  fontWeight: 500,
  gap: '6px',
  lineHeight: '22px',
  padding: '8px 6px',
  textAlign: 'left',
  width: '100%',
} as const

const chevronStyle = {
  display: 'inline-block',
  flex: '0 0 auto',
  transition: 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
} as const

const groupBodyStyle = {
  display: 'flex',
  flexDirection: 'column',
  transition: 'opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
} as const

/** ui-design Menu 卡: r20, pad 4, min-w 218 (the switcher precedent), below the header row. */
const menuStyle = {
  background: 'var(--dsh-bg, Canvas)',
  border: '1px solid var(--dsh-border-color, CanvasText)',
  borderRadius: '20px',
  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.18)',
  left: '0',
  minWidth: '218px',
  padding: '4px',
  position: 'absolute',
  top: 'calc(100% + 6px)',
  zIndex: 150,
} as const

const menuItemStyle = {
  alignItems: 'center',
  background: 'transparent',
  border: 'none',
  borderRadius: '14px',
  color: 'inherit',
  cursor: 'pointer',
  display: 'flex',
  font: 'inherit',
  gap: '8px',
  padding: '7px 10px',
  textAlign: 'left',
  width: '100%',
} as const

const menuWrapStyle = {
  display: 'inline-flex',
  position: 'relative',
} as const

/** The closed group-label map (数据衍生枚举 label 映射; unknown → raw value 兜底). */
const GROUP_LABEL_KEYS: Partial<Record<PrefRow['group'], WorkbenchKey>> = {
  auto: 'overview.prefs.group.auto',
  worktree: 'overview.prefs.group.worktree',
  coverage: 'overview.prefs.group.coverage',
  eval: 'overview.prefs.group.eval',
}

/** Human text for a verb rejection (the serialized shape's message, or String). */
function describeVerbError(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'message' in error
    && typeof (error as { message: unknown }).message === 'string') {
    return (error as { message: string }).message
  }
  return String(error)
}

/** Stable identity for the load effect (scope → string key). */
function scopeKeyOf(scope: PrefScope | undefined): string | undefined {
  if (scope === undefined) return undefined
  if (scope === 'global') return 'global'
  if ('project' in scope) return `project:${scope.project}`
  return `feature:${scope.feature}`
}

/**
 * The kernel's prefs_updated push (the main-side WorkbenchEvent twin,
 * prefs-service.ts prefsUpdatedEvent: global → scopeId '' / project → the
 * project id / feature → `<projectId>/<featureSlug>`). Declared locally —
 * the client union lands the variant with the e2e lane; the narrowing below
 * is structural, never a shape assumption beyond the payload contract.
 */
interface PrefsUpdatedEvent {
  readonly type: 'prefs_updated'
  readonly scope: 'global' | 'project' | 'feature'
  readonly scopeId: string
}

/** Narrow a pushed event to the prefs_updated form (anything else → undefined). */
function asPrefsUpdated(event: WorkbenchEvent): PrefsUpdatedEvent | undefined {
  const candidate = event as WorkbenchEvent | PrefsUpdatedEvent
  return candidate.type === 'prefs_updated' ? candidate : undefined
}

/**
 * One scope's resolution-chain addresses (the prefs-repo prefScopeChain
 * twin): global → [global]; project → [project, global]; feature →
 * [feature, its project, global]. A prefs_updated at any of these addresses
 * can move THIS scope's effective values, so the reflux listens to exactly
 * this set — never more (a foreign project/slug never re-reads), never less
 * (a global write moves an inherited project-tier row).
 */
function scopeChainAddresses(scope: PrefScope): ReadonlyArray<readonly [PrefsUpdatedEvent['scope'], string]> {
  if (scope === 'global') return [['global', '']]
  if ('project' in scope) return [['project', scope.project], ['global', '']]
  const slash = scope.feature.indexOf('/')
  const projectId = slash === -1 ? '' : scope.feature.slice(0, slash)
  return [['feature', scope.feature], ['project', projectId], ['global', '']]
}

/**
 * The UF4 section. The load state machine (loading 骨架 / load-error 重试 /
 * ready rows) keys on the current scope; per-row save state (saving spinners,
 * inline errors) rides Maps keyed by key and CLEARS on every tier change
 * (stale-tier errors never bleed into the next view).
 */
export function PreferenceSection(props: PreferenceSectionProps) {
  const t = props.t
  const [defaultFace] = useState(() => createMockPrefsFace())
  // Identity-stable for given props (the load effect keys on the face — a
  // fresh spread per render would loop it forever; the OverviewPage
  // migrationFace precedent. Callers hand a stable `face` prop identity.)
  const face: PrefsFace = useMemo(
    () => ({ ...defaultFace, ...props.face }),
    [defaultFace, props.face],
  )

  const features = props.features ?? []
  const projectDisabled = props.activeProject === undefined
  const featureDisabled = props.activeProject === undefined || features.length === 0

  const [tier, setTier] = useState<PrefTier>('global')
  const [featureSlug, setFeatureSlug] = useState<string | undefined>(undefined)
  const [phase, setPhase] = useState<'loading' | 'ready' | 'load-error'>('loading')
  const [rows, setRows] = useState<readonly PrefRow[] | undefined>(undefined)
  const [savingKeys, setSavingKeys] = useState<ReadonlySet<string>>(new Set())
  const [saveErrors, setSaveErrors] = useState<ReadonlyMap<string, PrefSaveError>>(new Map())
  const [toastText, setToastText] = useState<string | undefined>(undefined)
  const [menuOpen, setMenuOpen] = useState(false)
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(
    () => new Set(collapsedGroupsSession),
  )

  const rowsRef = useRef<readonly PrefRow[] | undefined>(undefined)
  rowsRef.current = rows
  const savingKeysRef = useRef<ReadonlySet<string>>(new Set())
  savingKeysRef.current = savingKeys
  const toastTimer = useRef<number | undefined>(undefined)
  const menuWrapRef = useRef<HTMLDivElement>(null)

  const scope = useMemo<PrefScope | undefined>(() => {
    if (tier === 'global') return 'global'
    if (tier === 'project') {
      return props.activeProject === undefined ? undefined : { project: props.activeProject.id }
    }
    if (props.activeProject === undefined || featureSlug === undefined) return undefined
    return { feature: `${props.activeProject.id}/${featureSlug}` }
  }, [tier, props.activeProject, featureSlug])
  const scopeRef = useRef<PrefScope | undefined>(undefined)
  scopeRef.current = scope
  const scopeKey = scopeKeyOf(scope)

  // Disabled-tier fallback (ui-design: 无激活项目时仅「全局」可用) — a tier
  // whose premise vanished beneath it falls back to 全局 and sheds its
  // per-tier write state.
  useEffect(() => {
    if (tier === 'project' && projectDisabled) setTier('global')
    else if (tier === 'feature' && featureDisabled) setTier('global')
  }, [tier, projectDisabled, featureDisabled])

  // Feature-selection hygiene: a roster change that drops the selected slug
  // resets the picker (a dangling address must never reach the scope).
  useEffect(() => {
    if (featureSlug !== undefined && !features.some(feature => feature.slug === featureSlug)) {
      setFeatureSlug(undefined)
    }
  }, [features, featureSlug])

  // The scope load: 首载 / 切层级 (skeleton through settle; ui-design loading
  // 态) with stale-response guarding (a fast tier flip must not resurrect an
  // older scope's rows). Per-tier write state clears with the scope.
  useEffect(() => {
    if (scopeKey === undefined) return
    let alive = true
    setPhase('loading')
    setSavingKeys(new Set())
    setSaveErrors(new Map())
    void face.getPrefs(scopeRef.current!).then((next) => {
      if (!alive) return
      setRows(next)
      setPhase('ready')
    }).catch(() => {
      if (!alive) return
      setRows(undefined)
      setPhase('load-error')
    })
    return () => { alive = false }
  }, [scopeKey, face])

  // Menu outside-pointer close (the switcher precedent).
  useEffect(() => {
    if (!menuOpen) return
    const onDocumentMouseDown = (event: MouseEvent): void => {
      if (!menuWrapRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDocumentMouseDown)
    return () => { document.removeEventListener('mousedown', onDocumentMouseDown) }
  }, [menuOpen])

  // The prefs_updated reflux (task 5.2, AC3): a pushed write at any of the
  // current scope's chain addresses silently re-reads the rows. Skipped
  // while a save is in flight — the write's own authoritative refetch lands
  // the same rows, and a mid-save re-read must not stomp the optimistic
  // display value back to the pre-write state.
  useEffect(() => {
    const subscribe = props.subscribeEvents
    if (subscribe === undefined) return
    return subscribe((events) => {
      if (rowsRef.current === undefined || savingKeysRef.current.size > 0) return
      const scope = scopeRef.current
      if (scope === undefined) return
      const chain = scopeChainAddresses(scope)
      const hit = events.some((event) => {
        const pushed = asPrefsUpdated(event)
        return pushed !== undefined
          && chain.some(([kind, id]) => pushed.scope === kind && pushed.scopeId === id)
      })
      if (!hit) return
      void face.getPrefs(scope).then((next) => {
        if (scopeKeyOf(scopeRef.current) !== scopeKeyOf(scope)) return
        if (rowsRef.current === undefined || savingKeysRef.current.size > 0) return
        setRows(next)
      }).catch(() => {
        // A failed reflux read keeps the current rows (the next explicit
        // read retries; never an error wall behind a push).
      })
    })
  }, [props.subscribeEvents, face])

  // Toast timer lifecycle (连改合并: every success REFRESHES the one timer).
  useEffect(() => () => {
    if (toastTimer.current !== undefined) window.clearTimeout(toastTimer.current)
  }, [])

  const showSavedToast = (): void => {
    setToastText(t('overview.prefs.toast.saved'))
    if (toastTimer.current !== undefined) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => { setToastText(undefined) }, 2500)
  }

  /** Authoritative re-read WITHOUT the skeleton (post-write; 生效值即时更新). */
  const refetchSilently = async (written: PrefScope): Promise<void> => {
    if (scopeRef.current === undefined || scopeKeyOf(scopeRef.current) !== scopeKeyOf(written)) {
      return // the user moved tiers — the next load reads the fresh rows
    }
    try {
      const next = await face.getPrefs(written)
      if (scopeKeyOf(scopeRef.current) === scopeKeyOf(written)) setRows(next)
    } catch {
      // A failed post-write refresh keeps the optimistic rows (never an
      // error wall behind a SUCCEEDED save).
    }
  }

  /** One setPrefs leg: optimistic display → verb → refetch | rollback+inline. */
  const runSet = async (key: string, value: unknown): Promise<void> => {
    const scope = scopeRef.current
    if (scope === undefined || savingKeys.has(key)) return
    const snapshot = rowsRef.current
    setSavingKeys((prev) => { const next = new Set(prev); next.add(key); return next })
    setSaveErrors((prev) => { const next = new Map(prev); next.delete(key); return next })
    // Optimistic DISPLAY value only — the badges stay until the refetch
    // confirms (save-error must find them unchanged for the rollback).
    setRows(prev => prev?.map(row => row.key === key ? { ...row, value } : row) ?? prev)
    try {
      await face.setPrefs(scope, [{ key, value }])
      showSavedToast()
      await refetchSilently(scope)
    } catch (error) {
      setRows(snapshot ?? undefined)
      setSaveErrors((prev) => {
        const next = new Map(prev)
        next.set(key, { kind: 'set', value, message: describeVerbError(error) })
        return next
      })
    } finally {
      setSavingKeys((prev) => { const next = new Set(prev); next.delete(key); return next })
    }
  }

  /** One clearPrefOverride leg: verb → refetch (fall back) | inline error. */
  const runClear = async (key: string): Promise<void> => {
    const scope = scopeRef.current
    if (scope === undefined || savingKeys.has(key)) return
    setSavingKeys((prev) => { const next = new Set(prev); next.add(key); return next })
    setSaveErrors((prev) => { const next = new Map(prev); next.delete(key); return next })
    try {
      await face.clearPrefOverride(scope, key)
      showSavedToast()
      await refetchSilently(scope)
    } catch (error) {
      setSaveErrors((prev) => {
        const next = new Map(prev)
        next.set(key, { kind: 'clear', message: describeVerbError(error) })
        return next
      })
    } finally {
      setSavingKeys((prev) => { const next = new Set(prev); next.delete(key); return next })
    }
  }

  /** save-error [重试]: re-fire the row's recorded attempt (set value or clear). */
  const retry = (key: string): void => {
    const recorded = saveErrors.get(key)
    if (recorded === undefined) return
    if (recorded.kind === 'clear') void runClear(key)
    else void runSet(key, recorded.value)
  }

  /** Metadata-driven group list (first-appearance order; no hardcoded set). */
  const groups = useMemo(() => {
    const seen: PrefRow['group'][] = []
    for (const row of rows ?? []) {
      if (!seen.includes(row.group)) seen.push(row.group)
    }
    return seen
  }, [rows])

  const toggleGroup = (group: string): void => {
    if (collapsedGroupsSession.has(group)) collapsedGroupsSession.delete(group)
    else collapsedGroupsSession.add(group)
    setCollapsedGroups(new Set(collapsedGroupsSession))
  }

  const reload = (): void => {
    if (scopeKey === undefined) return
    setPhase('loading')
    void face.getPrefs(scopeRef.current!).then((next) => {
      setRows(next)
      setPhase('ready')
    }).catch(() => {
      setRows(undefined)
      setPhase('load-error')
    })
  }

  const selectedFeature = features.find(feature => feature.slug === featureSlug)

  return (
    <section data-dsh-forge-prefs-section="" aria-label={t('overview.prefs.title')} style={cardStyle}>
      <div style={headerRowStyle}>
        <h3 style={titleStyle}>{t('overview.prefs.title')}</h3>
        <span style={hintStyle}>{t('overview.prefs.resolveHint')}</span>
        <div style={{ marginLeft: 'auto' }}>
          <ScopeSegmented
            t={t}
            tier={tier}
            onTierChange={(next) => { setMenuOpen(false); setTier(next) }}
            projectDisabled={projectDisabled}
            featureDisabled={featureDisabled}
            projectLabel={props.activeProject?.displayName}
          />
        </div>
      </div>

      {/* Feature 级: feature 选择 Menu 卡 (仅 Feature 级出现 — ui-design). */}
      {tier === 'feature' && (
        <div ref={menuWrapRef} data-dsh-forge-prefs-feature-menu="" style={menuWrapStyle}>
          <ChromeButton
            type="button"
            aria-haspopup="menu"
            aria-expanded={menuOpen ? 'true' : 'false'}
            aria-label={t('overview.prefs.feature.menuLabel')}
            data-dsh-forge-prefs-feature-trigger=""
            style={ghostButtonStyle}
            onClick={() => { setMenuOpen(open => !open) }}
            onKeyDown={(event) => {
              if (!menuOpen && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
                event.preventDefault()
                setMenuOpen(true)
              }
            }}
          >
            {selectedFeature !== undefined ? selectedFeature.slug : t('overview.prefs.feature.select')}
            <span aria-hidden="true">▾</span>
          </ChromeButton>
          {menuOpen && (
            <div role="menu" aria-label={t('overview.prefs.feature.menuLabel')} style={menuStyle}>
              {features.map(feature => (
                <ChromeButton
                  key={feature.slug}
                  type="button"
                  role="menuitemradio"
                  aria-checked={feature.slug === featureSlug ? 'true' : 'false'}
                  data-dsh-forge-prefs-feature-item={feature.slug}
                  style={menuItemStyle}
                  onClick={() => {
                    setFeatureSlug(feature.slug)
                    setMenuOpen(false)
                  }}
                >
                  <span>{feature.slug}</span>
                  {feature.slug === featureSlug && <span aria-hidden="true" style={{ marginLeft: 'auto' }}>✓</span>}
                </ChromeButton>
              ))}
            </div>
          )}
        </div>
      )}

      {phase === 'loading' && (
        <div
          role="status"
          aria-label={t('overview.prefs.loading')}
          aria-busy="true"
          data-dsh-forge-prefs-skeleton=""
          style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
        >
          {[0, 1, 2, 3, 4].map(index => (
            <div key={index} style={skeletonRowStyle} aria-hidden="true">
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height="100%" focusable="false">
                <rect width="100" height="100" fill="currentColor" opacity="0.12">
                  <animate attributeName="opacity" values="0.12;0.3;0.12" dur="0.3s" repeatCount="indefinite" />
                </rect>
              </svg>
            </div>
          ))}
        </div>
      )}

      {phase === 'load-error' && (
        <div data-dsh-forge-prefs-error="" role="alert" style={errorCardStyle}>
          <h4 style={titleStyle}>{t('overview.prefs.loadError.title')}</h4>
          <div style={{ display: 'flex', gap: '8px' }}>
            <ChromeButton
              type="button"
              data-dsh-forge-prefs-retry=""
              style={retryButtonStyle}
              onClick={reload}
            >
              {t('overview.prefs.loadError.retry')}
            </ChromeButton>
          </div>
        </div>
      )}

      {phase === 'ready' && rows !== undefined && tier === 'feature' && featureSlug === undefined && (
        <p data-dsh-forge-prefs-feature-hint="" style={hintStyle}>
          {t('overview.prefs.feature.hint')}
        </p>
      )}

      {phase === 'ready' && rows !== undefined && (tier !== 'feature' || featureSlug !== undefined) && (
        <div data-dsh-forge-prefs-groups="">
          {groups.map((group) => {
            const collapsed = collapsedGroups.has(group)
            const labelKey = GROUP_LABEL_KEYS[group]
            return (
              <div key={group} data-dsh-forge-pref-group={group}>
                <button
                  type="button"
                  data-dsh-forge-pref-group-header={group}
                  aria-expanded={collapsed ? 'false' : 'true'}
                  style={groupHeaderStyle}
                  onClick={() => { toggleGroup(group) }}
                >
                  <span aria-hidden="true" style={{ ...chevronStyle, transform: collapsed ? 'none' : 'rotate(90deg)' }}>▸</span>
                  {labelKey !== undefined ? t(labelKey) : String(group)}
                </button>
                {!collapsed && (
                  <div data-dsh-forge-pref-group-body={group} style={groupBodyStyle}>
                    {rows
                      .filter(row => row.group === group)
                      .map(row => (
                        <PrefKeyRow
                          key={row.key}
                          t={t}
                          row={row}
                          saving={savingKeys.has(row.key)}
                          error={saveErrors.get(row.key)}
                          onCommit={(key, value) => { void runSet(key, value) }}
                          onClear={(key) => { void runClear(key) }}
                          onRetry={retry}
                        />
                      ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {toastText !== undefined && (
        <div role="status" aria-live="polite" data-dsh-forge-prefs-toast="" style={toastCardStyle}>
          <p style={toastBodyStyle}>{toastText}</p>
          <ChromeButton
            type="button"
            aria-label={t('overview.prefs.toast.dismiss')}
            data-dsh-forge-prefs-toast-dismiss=""
            style={{ ...ghostButtonStyle, height: '24px', padding: '0 8px' }}
            onClick={() => {
              if (toastTimer.current !== undefined) window.clearTimeout(toastTimer.current)
              setToastText(undefined)
            }}
          >
            <span aria-hidden="true">✕</span>
          </ChromeButton>
        </div>
      )}
    </section>
  )
}
