/**
 * The C3 区头 (task 1.4; workbench-layout-v2 §2.2 区头三图标 — dsh 源码同构):
 * 「项目」label + 🔍 (原地展开搜索: the label and the action cluster yield
 * to the input; debounce + Esc handling live in the browser) + ⚙ (视图选项
 * popover: 分组方式 按项目树/按项目/单列表 × 排序方式 手动排序/最近更新)
 * + ＋ (folder-plus, the C7 添加项目确认卡's entry seat — the only
 * registration entry). Menu card r20 pad4 per the ui-design Menu geometry.
 */
import { useEffect, useRef, useState } from 'react'
import { IconPersonalizationOutline16, IconSearchOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import { ChromeButton } from '../chrome/ChromeButton'
import type { TreeGrouping, TreeSorting, TreeViewOptions } from './tree-derive'
import type { TreeTranslate } from './SessionRow'
import type { WorkbenchKey } from '../../locale/en'

export interface TreeHeaderProps {
  t: TreeTranslate
  /** In-place search expansion (the input replaces label + actions). */
  searching: boolean
  searchValue: string
  onSearchOpen: () => void
  /** Raw input changes — the browser owns the 250ms debounce. */
  onSearchChange: (value: string) => void
  /** Esc / ✕ — clears the query AND exits the in-place search. */
  onSearchExit: () => void
  viewOptions: TreeViewOptions
  onViewOptionsChange: (options: TreeViewOptions) => void
  /** The ＋ C7 entry (添加项目确认卡, 唯一注册入口). */
  onAddProject: () => void
}

const headerStyle = {
  alignItems: 'center',
  display: 'flex',
  gap: '2px',
  height: '36px',
  minWidth: 0,
  padding: '0 4px',
} as const

const labelStyle = {
  color: 'var(--dsw-alias-label-secondary, GrayText)',
  flex: 1,
  fontSize: '13px',
  fontWeight: 500,
  lineHeight: '20px',
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const

const iconButtonStyle = {
  alignItems: 'center',
  background: 'transparent',
  border: 'none',
  borderRadius: '8px',
  color: 'var(--dsw-alias-label-secondary, GrayText)',
  cursor: 'pointer',
  display: 'inline-flex',
  flex: 'none',
  height: '28px',
  justifyContent: 'center',
  width: '28px',
} as const

const searchInputStyle = {
  background: 'transparent',
  border: 'none',
  color: 'var(--dsw-alias-label-primary, CanvasText)',
  flex: 1,
  font: 'inherit',
  fontSize: '13px',
  height: '28px',
  minWidth: 0,
  outline: 'none',
} as const

const popoverStyle = {
  background: 'var(--dsh-bg, Canvas)',
  border: '1px solid var(--dsh-border-color, CanvasText)',
  borderRadius: '20px',
  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.18)',
  minWidth: '190px',
  padding: '4px',
  position: 'absolute',
  right: '4px',
  top: 'calc(100% + 4px)',
  zIndex: 200,
} as const

const sectionLabelStyle = {
  color: 'var(--dsw-alias-label-tertiary, GrayText)',
  fontSize: '12px',
  lineHeight: '18px',
  padding: '7px 10px 3px',
} as const

const optionStyle = {
  alignItems: 'center',
  background: 'transparent',
  border: 'none',
  borderRadius: '14px',
  color: 'inherit',
  cursor: 'pointer',
  display: 'flex',
  font: 'inherit',
  fontSize: '13px',
  gap: '8px',
  padding: '7px 10px',
  textAlign: 'left',
  width: '100%',
} as const

const GROUP_OPTIONS: ReadonlyArray<{ value: TreeGrouping; key: WorkbenchKey }> = [
  { value: 'tree', key: 'tree.viewOptions.group.tree' },
  { value: 'by-project', key: 'tree.viewOptions.group.byProject' },
  { value: 'flat', key: 'tree.viewOptions.group.flat' },
]

const SORT_OPTIONS: ReadonlyArray<{ value: TreeSorting; key: WorkbenchKey }> = [
  { value: 'manual', key: 'tree.viewOptions.sort.manual' },
  { value: 'recent', key: 'tree.viewOptions.sort.recent' },
]

/** The dsw folder-plus glyph (no primitives export; prototype's path). */
export function FolderPlusGlyph(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M12 10.5v5M9.5 13h5" />
    </svg>
  )
}

/** 区头 h36 — label + 🔍/⚙/＋, or the in-place search input while searching. */
export function TreeHeader(props: TreeHeaderProps) {
  const { t, searching, viewOptions } = props
  const [menuOpen, setMenuOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const onDocumentMouseDown = (event: MouseEvent): void => {
      if (!wrapRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDocumentMouseDown)
    return () => { document.removeEventListener('mousedown', onDocumentMouseDown) }
  }, [menuOpen])

  // The rail 🔍 seat also lands here: whenever the search is open the input
  // takes focus (the browser opens the mode; this effect focuses).
  useEffect(() => {
    if (searching) inputRef.current?.focus()
  }, [searching])

  const pick = (patch: Partial<TreeViewOptions>): void => {
    props.onViewOptionsChange({ ...viewOptions, ...patch })
    setMenuOpen(false)
  }

  return (
    <div ref={wrapRef} data-dsh-forge-tree-header style={{ position: 'relative', ...headerStyle }}>
      {searching
        ? (
          <>
            <input
              ref={inputRef}
              type="search"
              data-dsh-forge-tree-search-input=""
              aria-label={t('tree.search.placeholder')}
              placeholder={t('tree.search.placeholder')}
              value={props.searchValue}
              style={searchInputStyle}
              onChange={(event) => { props.onSearchChange(event.target.value) }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault()
                  props.onSearchExit()
                }
              }}
            />
            <ChromeButton
              type="button"
              data-dsh-forge-tree-search-exit=""
              aria-label={t('tree.search.exit')}
              style={iconButtonStyle}
              onClick={props.onSearchExit}
            >
              ✕
            </ChromeButton>
          </>
        )
        : (
          <>
            <span style={labelStyle}>{t('tree.label')}</span>
            <ChromeButton
              type="button"
              data-dsh-forge-tree-search-btn=""
              aria-label={t('tree.search.open')}
              title={t('tree.search.open')}
              style={iconButtonStyle}
              onClick={props.onSearchOpen}
            >
              <IconSearchOutline16 />
            </ChromeButton>
            <ChromeButton
              type="button"
              data-dsh-forge-tree-view-btn=""
              aria-label={t('tree.viewOptions')}
              title={t('tree.viewOptions')}
              aria-haspopup="menu"
              aria-expanded={menuOpen ? 'true' : 'false'}
              style={iconButtonStyle}
              onClick={() => { setMenuOpen(!menuOpen) }}
            >
              <IconPersonalizationOutline16 />
            </ChromeButton>
            <ChromeButton
              type="button"
              data-dsh-forge-tree-add-btn=""
              aria-label={t('chrome.addProject')}
              title={t('chrome.addProject')}
              style={iconButtonStyle}
              onClick={props.onAddProject}
            >
              <FolderPlusGlyph />
            </ChromeButton>
          </>
        )}
      {menuOpen && (
        <div role="menu" data-dsh-forge-tree-viewmenu="" aria-label={t('tree.viewOptions')} style={popoverStyle}>
          <div style={sectionLabelStyle}>{t('tree.viewOptions.group')}</div>
          {GROUP_OPTIONS.map(({ value, key }) => (
            <button
              key={value}
              type="button"
              role="menuitemradio"
              aria-checked={viewOptions.grouping === value ? 'true' : 'false'}
              data-dsh-forge-tree-viewopt={`grouping:${value}`}
              style={optionStyle}
              onClick={() => { pick({ grouping: value }) }}
            >
              {t(key)}
              {viewOptions.grouping === value && <span aria-hidden="true" style={{ marginLeft: 'auto' }}>✓</span>}
            </button>
          ))}
          <div role="separator" style={{ background: 'var(--dsh-border-color, CanvasText)', height: '1px', margin: '4px 6px', opacity: 0.4 }} />
          <div style={sectionLabelStyle}>{t('tree.viewOptions.sort')}</div>
          {SORT_OPTIONS.map(({ value, key }) => (
            <button
              key={value}
              type="button"
              role="menuitemradio"
              aria-checked={viewOptions.sorting === value ? 'true' : 'false'}
              data-dsh-forge-tree-viewopt={`sorting:${value}`}
              style={optionStyle}
              onClick={() => { pick({ sorting: value }) }}
            >
              {t(key)}
              {viewOptions.sorting === value && <span aria-hidden="true" style={{ marginLeft: 'auto' }}>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
