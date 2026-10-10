// UF-3 段一·文件浏览器（定位：业务——目录浏览 + 已注册标记 = ownership 预检可视化）。
// 数据进（phase/nav/registeredPaths）回调出（select/enter/jump/up/confirm/retry）的纯渲染面
// DirectoryBrowserView + 持导航/列举状态的装配壳 DirectoryBrowser（数据源注入——RPC 真身 /
// 测试替身；交互转移逻辑 = browser-actions，同 2.7 sidebar-actions 形制）。
// 形态纪律（AC5）：行语言对齐官方列表行刻度（h32 / hover interactive-bg / radius md——
// sidebar.css 同款官方行语言）；确认钮/上一级钮 = 官方 Button；「已注册」标记 = StateChip
// （官方 Tag 包装）；令牌唯一（browser.css，lint-tokens 机械执行）。
// 拦截语义（AC4）：列举失败 → 错误条相位，浏览器态不出（不 advance、不崩壳）；导航态保持
// 失败目标（重试口径 = nav.cwd）——语义落点 browser-actions。
// 2.9 复用面：「浏览…」改选经 startDir（起始目录）+ confirmLabel（「选择此文件夹」）参数化。
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  Button,
  IconChevronUpOutlineRegular,
  IconFolderCloseRegular,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { ErrorBar, SkeletonRows, StateChip } from '../../components/index.js'
import { browserActions } from './browser-actions.js'
import {
  canConfirm,
  crumbSegments,
  initialBrowserState,
  selectionOf,
  type BrowserSelection,
  type BrowserState,
} from './browser-model.js'
import { EMPTY_REGISTERED } from './dir-picker.js'
import { rpcDirSource, type DirSource, type ListingPhase } from './dir-source.js'
import './browser.css'

const SKELETON_ROWS = 4

/** 目录行（官方行语言：文件夹图标 + 名称 + 「已注册」标记；单击选中 / 双击进入 / 键盘同径） */
function DirRow({
  name,
  path,
  selected,
  registered,
  onSelect,
  onEnter,
}: {
  name: string
  path: string
  selected: boolean
  registered: boolean
  onSelect?: (dirPath: string) => void
  onEnter?: (dirPath: string) => void
}): ReactNode {
  return (
    <div
      className="dswf-fb-item"
      role="option"
      aria-selected={selected}
      data-selected={selected || undefined}
      data-registered={registered || undefined}
      data-dswf-path={path}
      tabIndex={0}
      onClick={onSelect === undefined ? undefined : () => { onSelect(path) }}
      onDoubleClick={onEnter === undefined ? undefined : () => { onEnter(path) }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onEnter?.(path)
        else if (event.key === ' ') {
          event.preventDefault()
          onSelect?.(path)
        }
      }}
    >
      <span className="dswf-fb-item-icon" aria-hidden="true">
        <IconFolderCloseRegular size={16} />
      </span>
      <span className="dswf-fb-item-name">{name}</span>
      {registered ? (
        <StateChip
          status="已注册"
          className="dswf-fb-reg"
        />
      ) : null}
    </div>
  )
}

/** 浏览器纯渲染面（数据进/回调出——静态标记可测；2.10 模态壳内嵌本体） */
export interface DirectoryBrowserViewProps {
  /** 导航态（cwd = 面包屑基准；selected = 行高亮） */
  readonly nav: BrowserState
  /** 列举相位（loading 骨架 / ready 行列 / error 错误条） */
  readonly phase: ListingPhase
  /** 已注册路径集合（ws_path 全集——行级标记判据） */
  readonly registeredPaths: ReadonlySet<string>
  /** 确认按钮文案（段一 =「下一步」；2.9 浏览改选 =「选择此文件夹」） */
  readonly confirmLabel: string
  /** 底部提示文案 */
  readonly hint: string
  /** 单击选中（唯一） */
  readonly onSelect?: (dirPath: string) => void
  /** 双击进入 */
  readonly onEnter?: (dirPath: string) => void
  /** 面包屑跳转 */
  readonly onJump?: (dirPath: string) => void
  /** 上一级（根目录禁用） */
  readonly onUp?: () => void
  /** 确认（选中目录 + 挂接预演标记） */
  readonly onConfirm?: (selection: BrowserSelection) => void
  /** 错误相位重试（重发 nav.cwd 目标） */
  readonly onRetry?: () => void
}

export function DirectoryBrowserView({
  nav,
  phase,
  registeredPaths,
  confirmLabel,
  hint,
  onSelect,
  onEnter,
  onJump,
  onUp,
  onConfirm,
  onRetry,
}: DirectoryBrowserViewProps): ReactNode {
  const crumbs = nav.cwd === null ? [] : crumbSegments(nav.cwd)
  const parentPath = phase.phase === 'ready' ? phase.listing.parentPath : null
  const confirmable = canConfirm(nav)

  const confirm = (): void => {
    if (nav.selected !== null) onConfirm?.(selectionOf(nav.selected, registeredPaths))
  }

  return (
    <div className="dswf-fb" data-dswf-fb="browser">
      <div className="dswf-fb-bar">
        {/* D30：原生 title 退役——官方 Tooltip（禁用态锚定 = dswf-tipwrap 包裹 span） */}
        <Tooltip label="上一级" portal>
          <span className="dswf-tipwrap">
            <Button
              variant="ghost"
              size="sm"
              className="dswf-fb-up"
              aria-label="上一级"
              disabled={parentPath === null}
              onClick={onUp}
            >
              <IconChevronUpOutlineRegular size={16} />
            </Button>
          </span>
        </Tooltip>
        <Tooltip label={nav.cwd ?? ''} disabled={nav.cwd === null} portal>
          <nav className="dswf-fb-crumb" aria-label="目录位置">
            {crumbs.map((segment, index) => {
              const current = index === crumbs.length - 1
              return (
                <span className="dswf-fb-crumb-slot" key={segment.path}>
                  {index > 0 ? (
                    <span className="dswf-fb-crumb-sep" aria-hidden="true">
                      ›
                    </span>
                  ) : null}
                  {current ? (
                    <span className="dswf-fb-crumb-seg dswf-fb-crumb-current" aria-current="page">
                      {segment.name}
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="dswf-fb-crumb-seg"
                      data-dswf-jump={segment.path}
                      onClick={onJump === undefined ? undefined : () => { onJump(segment.path) }}
                    >
                      {segment.name}
                    </button>
                  )}
                </span>
              )
            })}
          </nav>
        </Tooltip>
      </div>

      {phase.phase === 'error' ? (
        <ErrorBar
          className="dswf-fb-error"
          message={`目录加载失败：${phase.message}`}
          retryClassName="dswf-fb-retry"
          anchor="data-dswf-fb-error"
          textClassName="dswf-fb-error-text"
          onRetry={onRetry}
        />
      ) : null}

      <div className="dswf-fb-list" role="listbox" aria-label="目录列表">
        {phase.phase === 'loading' ? (
          <SkeletonRows
            className="dswf-fb-skeleton"
            rowClassName="dswf-fb-skeleton-row"
            rows={SKELETON_ROWS}
            anchor="data-dswf-fb-skeleton"
          />
        ) : phase.phase === 'ready' && phase.listing.entries.length === 0 ? (
          <div className="dswf-fb-empty">空文件夹</div>
        ) : phase.phase === 'ready' ? (
          phase.listing.entries.map((entry) => (
            <DirRow
              key={entry.path}
              name={entry.name}
              path={entry.path}
              selected={entry.path === nav.selected}
              registered={registeredPaths.has(entry.path)}
              onSelect={onSelect}
              onEnter={onEnter}
            />
          ))
        ) : null}
      </div>

      <div className="dswf-fb-footer">
        <p className="dswf-fb-hint">{hint}</p>
        <Tooltip label={nav.selected ?? '先在列表中选中一个文件夹'} portal>
          <span className="dswf-tipwrap">
            <Button
              variant="primary"
              size="md"
              className="dswf-fb-confirm"
              disabled={!confirmable}
              onClick={onConfirm === undefined ? undefined : confirm}
            >
              {confirmLabel}
            </Button>
          </span>
        </Tooltip>
      </div>
    </div>
  )
}

/** DirectoryBrowser 装配壳 props */
export interface DirectoryBrowserProps {
  /** 目录数据源（缺省 = RPC 真身 forge:fs/listDir；注入 = 测试/桩面） */
  readonly source?: DirSource
  /** 起始目录（缺省 = 用户主目录——source 缺省请求；2.9「浏览…」改选传当前值） */
  readonly startDir?: string
  /** 已注册路径集合（缺省 = 空集不标记；2.10 组装接 forge:projects/list ws_path 全集） */
  readonly registeredPaths?: ReadonlySet<string>
  /** 确认按钮文案（缺省「下一步」——段一口径） */
  readonly confirmLabel?: string
  /** 底部提示文案（缺省 = 段一口径） */
  readonly hint?: string
  /** 确认回调（选中目录 + 挂接预演标记——命中项进入表单后走挂接语义） */
  readonly onConfirm?: (selection: BrowserSelection) => void
}

const DEFAULT_HINT =
  '单击选中，双击进入；标记「已注册」的目录将挂接既有工作区（不再重复登记）。'

/**
 * 文件浏览器本体（导航/选中状态壳 + RPC 数据源装配；交互逻辑 = browser-actions 注入
 * setState/getState 面——竞态守卫与拦截语义见该模块单测）。
 */
export function DirectoryBrowser({
  source,
  startDir,
  registeredPaths = EMPTY_REGISTERED,
  confirmLabel = '下一步',
  hint = DEFAULT_HINT,
  onConfirm,
}: DirectoryBrowserProps): ReactNode {
  const [nav, setNav] = useState<BrowserState>(() => initialBrowserState(startDir))
  const [phase, setPhase] = useState<ListingPhase>({ phase: 'loading' })
  const startedRef = useRef(false)
  const effectiveSource = useMemo<DirSource>(() => source ?? rpcDirSource(), [source])
  // 最新态 ref 桥（actions 读到 render 后最新值，不随每渲染重建）
  const navRef = useRef(nav)
  navRef.current = nav
  const phaseRef = useRef(phase)
  phaseRef.current = phase

  const actions = useMemo(
    () =>
      browserActions({
        source: effectiveSource,
        setNav: (updater) => {
          setNav(updater)
        },
        setPhase,
        getNav: () => navRef.current,
        getPhase: () => phaseRef.current,
      }),
    [effectiveSource],
  )

  useEffect(() => {
    if (startedRef.current) return // mount 载入一次（startDir 为初始口径，非响应式依赖）
    startedRef.current = true
    actions.load(startDir)
  }, [actions, startDir])

  return (
    <DirectoryBrowserView
      nav={nav}
      phase={phase}
      registeredPaths={registeredPaths}
      confirmLabel={confirmLabel}
      hint={hint}
      onSelect={actions.select}
      onEnter={actions.load}
      onJump={actions.load}
      onUp={actions.up}
      onConfirm={onConfirm}
      onRetry={actions.retry}
    />
  )
}
