/**
 * The C3 左栏全项目树浏览器 (task 1.4 — the component BUILD over mock data;
 * the 1.6 assembly injects it into the upstream `sidebar.workspaces` seat
 * and adapts ctx.workspaces/ctx.sessions + listProjects onto the props):
 * 项目/会话/subagent three tiers × 分组(按项目树/按项目/单列表)× 排序
 * (手动/最近更新), per-group overflow folding, the archived read-only
 * partition, the 未分组 group with its 纳管 entry, the 区头 three icons
 * (🔍 in-place search / ⚙ view options / ＋ C7 entry) and the 56px collapsed
 * rail (ui-design §Component C3 + workbench-layout-v2 §2).
 *
 * State exposure (AC3): expansion + overflow ride the Interface 4 `tree`
 * block ({expandedProjects/expandedSessions/overflowOpen}) — internal by
 * default, every change reported through onLayoutChange for the P4
 * project-memory wiring; 分组×排序 = the user-level localStorage (C3 口径,
 * T4 note — never the project blob). Hard Rules: row language self-drawn
 * (no upstream internals), and the top level NEVER lists origin=subagent
 * rows (enforced in tree-derive, the SC7 assertion's home).
 */
import { Fragment, useEffect, useMemo, useState } from 'react'
import { IconChevronLeftOutline14, IconNewChatOutline16, IconSearchOutline16, IconSettingsOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import { OverflowRow } from './OverflowRow'
import { ProjectRow, type ProjectRowCommand } from './ProjectRow'
import { SessionRow, type SessionRowCommand, type TreeTranslate } from './SessionRow'
import { SubagentRow } from './SubagentRow'
import { FolderPlusGlyph, TreeHeader } from './TreeHeader'
import {
  DEFAULT_TREE_VIEW_OPTIONS, TREE_OVERFLOW_LIMIT, UNGROUPED_KEY, ancestorChainOf, deriveTree,
  normalizeSearch, projectMatches, relativeTimePart, sessionMatches, topNodeMatches,
} from './tree-derive'
import type {
  ProjectGroupNode, SubagentNode, TopSessionNode, TreeLayoutState, TreeSession,
  TreeViewOptions, TreeWorkspace,
} from './tree-derive'
import type { Project } from '../../ipc-types'

/** The user-level view-options persistence key (dsh 键同构; C3 口径). */
export const TREE_VIEW_STORAGE_KEY = 'dsh-forge.project-tree.view.v1'

/** The 250ms search debounce (workbench-layout-v2 §2.2). */
const SEARCH_DEBOUNCE_MS = 250

export interface ProjectTreeBrowserProps {
  t: TreeTranslate
  projects: readonly Project[]
  workspaces: readonly TreeWorkspace[]
  sessions: readonly TreeSession[]
  activeProjectId: string | null
  /** The open session (its ancestor chain default-expands, AC3). */
  activeSessionId?: string | null
  /** 56px rail mode (the sidebar's collapsed state). */
  collapsed?: boolean
  /** C3 degraded copy seat (the 2.5 lineage join's >100ms degrade). */
  lineageDegraded?: boolean
  /** Interface 4 tree block — parent-fed value wins (P4 wiring). */
  layout?: TreeLayoutState
  onLayoutChange?: (layout: TreeLayoutState) => void
  /** Controlled view options; omitted → the localStorage value. */
  viewOptions?: TreeViewOptions
  onViewOptionsChange?: (options: TreeViewOptions) => void
  /** Row click = 原位换台 (the 1.6 seat's switch). */
  onOpenProject?: (projectId: string) => void
  onNewSession?: (projectId: string) => void
  onOpenSession?: (sessionId: string) => void
  onSessionCommand?: (sessionId: string, command: SessionRowCommand) => void
  onProjectCommand?: (projectId: string, command: ProjectRowCommand) => void
  /** The inline-rename commit (行内编辑 → renameProject verb at the seat). */
  onRename?: (projectId: string, displayName: string) => void
  /** Archived partition rows: restore/remove (the 3.5 verbs, mocked now). */
  onArchivedCommand?: (projectId: string, command: 'restore' | 'remove') => void
  /** 未分组组头纳管入口. */
  onAdoptUngrouped?: () => void
  /** The ＋ C7 添加项目确认卡 entry. */
  onAddProject?: () => void
  onOpenSettings?: () => void
  onToggleCollapse?: () => void
  /** localStorage stand-in for hostless mounts; defaults to window's. */
  storage?: Pick<Storage, 'getItem' | 'setItem'>
  /** Clock injection for the relative-time ladder (test determinism). */
  now?: () => Date
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

const memoryStorage = (): StorageLike => {
  const map = new Map<string, string>()
  return {
    getItem: key => map.get(key) ?? null,
    setItem: (key, value) => { map.set(key, value) },
  }
}

const safeStorage = (): StorageLike => {
  try {
    if (typeof window !== 'undefined' && window.localStorage !== null) return window.localStorage
  } catch {
    // Hostless / storage denied — the in-memory stand-in keeps the mount alive.
  }
  return memoryStorage()
}

const isGrouping = (value: unknown): value is TreeViewOptions['grouping'] =>
  value === 'tree' || value === 'by-project' || value === 'flat'

const isSorting = (value: unknown): value is TreeViewOptions['sorting'] =>
  value === 'manual' || value === 'recent'

function loadViewOptions(storage: StorageLike): TreeViewOptions {
  try {
    const raw = storage.getItem(TREE_VIEW_STORAGE_KEY)
    if (raw !== null) {
      const parsed: unknown = JSON.parse(raw)
      if (typeof parsed === 'object' && parsed !== null) {
        const candidate = parsed as { grouping?: unknown; sorting?: unknown }
        if (isGrouping(candidate.grouping) && isSorting(candidate.sorting)) {
          return { grouping: candidate.grouping, sorting: candidate.sorting }
        }
      }
    }
  } catch {
    // Corrupt payload — the defaults stand.
  }
  return DEFAULT_TREE_VIEW_OPTIONS
}

const columnStyle = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  minWidth: 0,
} as const

const listStyle = {
  flex: 1,
  minWidth: 0,
  overflowY: 'auto',
  paddingBottom: '8px',
} as const

const noteStyle = {
  color: 'var(--dsw-alias-label-secondary, GrayText)',
  fontSize: '12px',
  lineHeight: '18px',
  padding: '6px 8px 6px 20px',
} as const

const sectionLabelStyle = {
  color: 'var(--dsw-alias-label-tertiary, GrayText)',
  fontSize: '12px',
  fontWeight: 500,
  lineHeight: '18px',
  padding: '10px 8px 4px 20px',
} as const

const ungroupedHeaderStyle = {
  alignItems: 'center',
  display: 'flex',
  gap: '8px',
  height: '32px',
  padding: '0 8px 0 20px',
} as const

const adoptButtonStyle = {
  background: 'transparent',
  border: '1px solid var(--dsh-border-color, CanvasText)',
  borderRadius: '14px',
  color: 'var(--dsw-alias-label-secondary, GrayText)',
  cursor: 'pointer',
  flex: 'none',
  font: 'inherit',
  fontSize: '12px',
  height: '24px',
  lineHeight: '16px',
  padding: '0 10px',
} as const

const railStyle = {
  alignItems: 'center',
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  height: '100%',
  padding: '10px 0',
  width: '56px',
} as const

const railButtonStyle = {
  alignItems: 'center',
  background: 'transparent',
  border: 'none',
  borderRadius: '10px',
  color: 'var(--dsw-alias-label-secondary, GrayText)',
  cursor: 'pointer',
  display: 'inline-flex',
  flex: 'none',
  height: '36px',
  justifyContent: 'center',
  width: '36px',
} as const

const railSpacerStyle = { flex: 1 } as const

/** The C3 tree browser — 区头 + grouped list (or the 56px rail collapsed). */
export function ProjectTreeBrowser(props: ProjectTreeBrowserProps) {
  const { t, projects, workspaces, sessions, activeProjectId, activeSessionId } = props
  const storage = useMemo(() => props.storage ?? safeStorage(), [props.storage])

  const [viewOptions, setViewOptions] = useState<TreeViewOptions>(
    () => props.viewOptions ?? loadViewOptions(storage),
  )
  const [layout, setLayout] = useState<TreeLayoutState>(
    () => props.layout ?? {
      expandedProjects: activeProjectId === null ? [] : [activeProjectId],
      expandedSessions: [],
      overflowOpen: [],
    },
  )
  const [searching, setSearching] = useState(false)
  const [rawQuery, setRawQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')

  // Parent-fed values win (the P4/seat wiring drives these).
  useEffect(() => {
    if (props.layout !== undefined) setLayout(props.layout)
  }, [props.layout])
  useEffect(() => {
    if (props.viewOptions !== undefined) setViewOptions(props.viewOptions)
  }, [props.viewOptions])
  // The active project default-expands (workbench-layout-v2 §2.3) whenever
  // the activation pointer moves — the add is one-shot per pointer change,
  // so a deliberate user collapse of the active project is not fought.
  useEffect(() => {
    if (activeProjectId === null) return
    setLayout(current => current.expandedProjects.includes(activeProjectId)
      ? current
      : { ...current, expandedProjects: [...current.expandedProjects, activeProjectId] })
  }, [activeProjectId])
  // Search debounce (250ms; the raw value never filters directly).
  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedQuery(normalizeSearch(rawQuery)) }, SEARCH_DEBOUNCE_MS)
    return () => { clearTimeout(timer) }
  }, [rawQuery])
  // Every layout transition (toggle, overflow, auto-expand, parent sync)
  // reports outward — the P4 project-memory wiring's single tap point.
  useEffect(() => {
    props.onLayoutChange?.(layout)
  }, [layout])

  const updateLayout = (next: TreeLayoutState): void => {
    setLayout(next)
  }
  const toggleInList = (list: readonly string[], id: string): string[] =>
    list.includes(id) ? list.filter(entry => entry !== id) : [...list, id]

  const changeViewOptions = (next: TreeViewOptions): void => {
    setViewOptions(next)
    try {
      storage.setItem(TREE_VIEW_STORAGE_KEY, JSON.stringify(next))
    } catch {
      // Persistence is best-effort; the session state stands.
    }
    props.onViewOptionsChange?.(next)
  }

  const openSearch = (): void => { setSearching(true) }
  const exitSearch = (): void => {
    setSearching(false)
    setRawQuery('')
    setDebouncedQuery('')
  }

  const derived = useMemo(
    () => deriveTree(projects, workspaces, sessions, viewOptions),
    [projects, workspaces, sessions, viewOptions],
  )
  const query = searching ? debouncedQuery : ''
  const expandedProjects = new Set(layout.expandedProjects)
  const expandedSessions = new Set([
    ...layout.expandedSessions,
    ...ancestorChainOf(activeSessionId ?? null, sessions),
  ])
  const overflowOpen = new Set(layout.overflowOpen)
  const nowMs = (props.now?.() ?? new Date()).getTime()

  const relativeTime = (iso: string): string => {
    const part = relativeTimePart(iso, nowMs)
    switch (part.kind) {
      case 'just-now': return t('tree.time.justNow')
      case 'minutes': return t('tree.time.minutes').replace('{n}', String(part.value))
      case 'hours': return t('tree.time.hours').replace('{n}', String(part.value))
      case 'days': return t('tree.time.days').replace('{n}', String(part.value))
    }
  }

  const openSession = (sessionId: string): void => { props.onOpenSession?.(sessionId) }
  const toggleSessionExpanded = (sessionId: string): void => {
    updateLayout({ ...layout, expandedSessions: toggleInList(layout.expandedSessions, sessionId) })
  }
  const toggleProjectExpanded = (projectId: string): void => {
    updateLayout({ ...layout, expandedProjects: toggleInList(layout.expandedProjects, projectId) })
  }
  const toggleOverflow = (groupKey: string): void => {
    updateLayout({ ...layout, overflowOpen: toggleInList(layout.overflowOpen, groupKey) })
  }

  // ———— the collapsed 56px rail(◂/⊕/🔍/＋/⚙;workbench-layout-v2 §2.4) ————

  if (props.collapsed === true) {
    return (
      <div data-dsh-forge-tree-rail style={railStyle}>
        <button
          type="button"
          data-dsh-forge-tree-rail-collapse=""
          aria-label={t('tree.rail.collapse')}
          title={t('tree.rail.collapse')}
          style={railButtonStyle}
          onClick={props.onToggleCollapse}
        >
          <IconChevronLeftOutline14 />
        </button>
        <button
          type="button"
          data-dsh-forge-tree-rail-new-session=""
          aria-label={t('tree.rail.newSession')}
          title={t('tree.rail.newSession')}
          style={railButtonStyle}
          onClick={() => { if (activeProjectId !== null) props.onNewSession?.(activeProjectId) }}
        >
          <IconNewChatOutline16 />
        </button>
        <button
          type="button"
          data-dsh-forge-tree-rail-search=""
          aria-label={t('tree.rail.search')}
          title={t('tree.rail.search')}
          style={railButtonStyle}
          onClick={() => {
            // 点击 = 展开侧栏并聚焦搜索框 (§2.4).
            props.onToggleCollapse?.()
            openSearch()
          }}
        >
          <IconSearchOutline16 />
        </button>
        <button
          type="button"
          data-dsh-forge-tree-rail-add=""
          aria-label={t('chrome.addProject')}
          title={t('chrome.addProject')}
          style={railButtonStyle}
          onClick={props.onAddProject}
        >
          <FolderPlusGlyph />
        </button>
        <span style={railSpacerStyle} />
        <button
          type="button"
          data-dsh-forge-tree-rail-settings=""
          aria-label={t('tree.rail.settings')}
          title={t('tree.rail.settings')}
          style={railButtonStyle}
          onClick={props.onOpenSettings}
        >
          <IconSettingsOutline16 />
        </button>
      </div>
    )
  }

  // ———— row emitters ————

  const renderSubagentTree = (nodes: readonly SubagentNode[]): JSX.Element[] =>
    nodes.flatMap((node) => {
      const id = node.session.sessionId
      return [
        <SubagentRow
          key={id}
          t={t}
          session={node.session}
          depth={node.depth + 1}
          active={activeSessionId === id}
          hasChildren={node.children.length > 0}
          expanded={expandedSessions.has(id)}
          relativeTime={relativeTime(node.session.updatedAt)}
          onOpen={openSession}
          onToggleExpanded={toggleSessionExpanded}
          onCommand={props.onSessionCommand}
        />,
        ...(expandedSessions.has(id) ? renderSubagentTree(node.children) : []),
      ]
    })

  const renderTopSession = (node: TopSessionNode, showLineage: boolean): JSX.Element => {
    const id = node.session.sessionId
    return (
      <Fragment key={id}>
        <SessionRow
          t={t}
          session={node.session}
          dot={node.dot}
          runningDescendantCount={node.runningDescendantCount}
          depth={1}
          active={activeSessionId === id}
          hasChildren={showLineage && node.children.length > 0}
          expanded={expandedSessions.has(id)}
          relativeTime={relativeTime(node.session.updatedAt)}
          onOpen={openSession}
          onToggleExpanded={toggleSessionExpanded}
          onCommand={props.onSessionCommand}
        />
        {showLineage && expandedSessions.has(id) && renderSubagentTree(node.children)}
      </Fragment>
    )
  }

  /** 溢出折叠 — 每组 > 5 条 (search bypasses the fold entirely). */
  const sliceWithOverflow = (
    groupKey: string, nodes: readonly TopSessionNode[],
  ): { shown: readonly TopSessionNode[]; fold: JSX.Element | null } => {
    if (query !== '' || nodes.length <= TREE_OVERFLOW_LIMIT) {
      return { shown: nodes, fold: null }
    }
    const open = overflowOpen.has(groupKey)
    return {
      shown: open ? nodes : nodes.slice(0, TREE_OVERFLOW_LIMIT),
      fold: (
        <OverflowRow
          t={t}
          groupKey={groupKey}
          total={nodes.length}
          open={open}
          onToggle={toggleOverflow}
        />
      ),
    }
  }

  const renderEmptyState = (projectId: string): JSX.Element => (
    <div data-dsh-forge-tree-empty={projectId} style={noteStyle}>
      <div style={{ paddingBottom: '6px' }}>{t('tree.empty.title')}</div>
      <button
        type="button"
        style={{
          background: 'transparent',
          border: 'none',
          borderRadius: '14px',
          color: 'var(--dsw-alias-link, LinkText)',
          cursor: 'pointer',
          font: 'inherit',
          fontSize: '13px',
          padding: '4px 8px',
        }}
        onClick={() => { props.onNewSession?.(projectId) }}
      >
        {t('tree.empty.newSession')}
      </button>
    </div>
  )

  // A session list block shared by project groups and the 未分组 group.
  const renderSessionBlock = (
    groupKey: string, nodes: readonly TopSessionNode[], showLineage: boolean,
    emptyProjectId?: string,
  ): JSX.Element => {
    const visible = query === '' ? nodes : nodes.filter(node => topNodeMatches(node, query))
    const { shown, fold } = sliceWithOverflow(groupKey, visible)
    return (
      <>
        {props.lineageDegraded === true && (
          <div data-dsh-forge-tree-degraded="" style={noteStyle}>{t('tree.degraded')}</div>
        )}
        {shown.map(node => renderTopSession(node, showLineage && props.lineageDegraded !== true))}
        {fold}
        {query === '' && visible.length === 0 && emptyProjectId !== undefined && renderEmptyState(emptyProjectId)}
      </>
    )
  }

  // ———— grouped rendering (按项目树 / 按项目) ————

  const renderGrouped = (): JSX.Element => {
    const showLineage = viewOptions.grouping === 'tree'
    const blocks = derived.projects.flatMap((group: ProjectGroupNode) => {
      const groupMatches = query !== ''
        && (projectMatches(group.project, query)
          || group.sessions.some(node => topNodeMatches(node, query)))
      if (query !== '' && !groupMatches) return []
      const expanded = query !== ''
        ? group.sessions.some(node => topNodeMatches(node, query)) || projectMatches(group.project, query)
        : expandedProjects.has(group.project.id)
      // A matched group always keeps its header (ancestor visibility); the
      // sessions under it filter on their own titles.
      return [
        <div key={group.project.id}>
          <ProjectRow
            t={t}
            project={group.project}
            expanded={expanded}
            active={group.project.id === activeProjectId}
            onOpen={(projectId) => { props.onOpenProject?.(projectId) }}
            onToggleExpanded={toggleProjectExpanded}
            onNewSession={props.onNewSession}
            onCommand={(projectId, command) => { props.onProjectCommand?.(projectId, command) }}
            onRename={props.onRename}
          />
          {expanded && renderSessionBlock(group.project.id, group.sessions, showLineage, group.project.id)}
        </div>,
      ]
    })

    // The 未分组 group (纳管入口 rides the header).
    const ungroupedMatches = query === ''
      || derived.ungrouped.some(node => topNodeMatches(node, query))
    const ungroupedBlock = derived.ungrouped.length > 0 && ungroupedMatches
      ? (
        <div key={UNGROUPED_KEY}>
          <div data-dsh-forge-tree-ungrouped="" style={ungroupedHeaderStyle}>
            <span style={{ color: 'var(--dsw-alias-label-secondary, GrayText)', fontSize: '13px', fontWeight: 500 }}>
              {t('tree.ungrouped')}
            </span>
            <button
              type="button"
              data-dsh-forge-tree-adopt=""
              style={adoptButtonStyle}
              onClick={props.onAdoptUngrouped}
            >
              {t('tree.ungrouped.adopt')}
            </button>
          </div>
          {renderSessionBlock(UNGROUPED_KEY, derived.ungrouped, showLineage)}
        </div>
      )
      : null

    // The archived read-only partition (降透明 + ⚠, 不挂会话).
    const archivedVisible = query === ''
      ? derived.archived
      : derived.archived.filter(project => projectMatches(project, query))
    const archivedBlock = archivedVisible.length > 0
      ? (
        <div key="archived" data-dsh-forge-tree-archived="">
          <div style={sectionLabelStyle}>
            {t('tree.archivedSection').replace('{n}', String(archivedVisible.length))}
          </div>
          {archivedVisible.map(project => (
            <ProjectRow
              key={project.id}
              t={t}
              project={project}
              expanded={false}
              active={project.id === activeProjectId}
              onOpen={() => { /* read-only: archived rows never switch */ }}
              onCommand={(projectId, command) => {
                if (command === 'restore' || command === 'remove') props.onArchivedCommand?.(projectId, command)
              }}
            />
          ))}
        </div>
      )
      : null

    return (
      <>
        {blocks}
        {ungroupedBlock}
        {archivedBlock}
      </>
    )
  }

  // ———— 单列表 rendering (flat: ↳ inline, 不逐层缩进) ————

  const renderFlat = (): JSX.Element => {
    const rows = derived.flat.filter(row =>
      query === ''
      || sessionMatches(row.session, query)
      || (row.project !== null && projectMatches(row.project, query)),
    )
    if (rows.length === 0) {
      return <div data-dsh-forge-tree-flat-empty="" style={noteStyle}>{t('tree.empty.title')}</div>
    }
    return (
      <>
        {rows.map((row) => {
          const id = row.session.sessionId
          return row.isSubagent
            ? (
              <SubagentRow
                key={id}
                t={t}
                session={row.session}
                depth={1}
                flat
                active={activeSessionId === id}
                hasChildren={false}
                expanded={false}
                relativeTime={relativeTime(row.session.updatedAt)}
                onOpen={openSession}
                onCommand={props.onSessionCommand}
              />
            )
            : (
              <SessionRow
                key={id}
                t={t}
                session={row.session}
                dot={row.dot}
                depth={0}
                flat
                active={activeSessionId === id}
                hasChildren={false}
                expanded={false}
                relativeTime={relativeTime(row.session.updatedAt)}
                onOpen={openSession}
                onCommand={props.onSessionCommand}
              />
            )
        })}
      </>
    )
  }

  return (
    <div data-dsh-forge-tree="" style={columnStyle}>
      <TreeHeader
        t={t}
        searching={searching}
        searchValue={rawQuery}
        onSearchOpen={openSearch}
        onSearchChange={setRawQuery}
        onSearchExit={exitSearch}
        viewOptions={viewOptions}
        onViewOptionsChange={changeViewOptions}
        onAddProject={() => { props.onAddProject?.() }}
      />
      <div data-dsh-forge-tree-list="" style={listStyle}>
        {viewOptions.grouping === 'flat' ? renderFlat() : renderGrouped()}
      </div>
    </div>
  )
}
