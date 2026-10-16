// Bug 详情弹框（定位：业务——fix-bug 概览 Bug 子 tab 行点击详情；真 dialog 自持皮
// ——dswf-ov-bdialog-* + bug-dialog.css，不借 drawer 视觉类；拖动行为机械仍复用
// drawer 先例：taskDrawerHeadDragProps / drawerPositionFromDrag / useTaskDrawerEscape）。
// 布局 = 双列表单（label 定宽列左 / value 弹性列右，overflow-wrap 只断长 token——少换行）
// + 纵向滚动（body overflow-y——内容多不溢出）；宽 880 = 440 任务弹窗两倍（2026-10-14
// 用户裁决）。头部 = 摘要（无 label 独立行左对齐）+ 状态·错误类型 chips（右对齐）；
// 表单行集：五字段/修复证据(fixed)/未修原因(unresolved)/发现·修复(会话 pill)/来源/
// 登记时间(带年份 fullStampOf)。会话 pill 沿
// sessionTitleOfOrId 契约：命中 = 可点击 title（onOpenSession 跳转 + 关弹框）；缺席 =
// fail-soft 回退 sessionId 不可点击。
// bug-recurrence-chain 1.7：链时间线区（mockup ②区逐位对照）——摘要行下浅底圆角块：
// 题头「复发链（N 条 · 沿 recurrenceOf 回溯）」+ 垂直轨道（链根在上、末节点无轨）；节点 =
// 状态点 + summary（链根/复发① 定位词）+ 状态 Tag + 日期 + commit 短哈希 + fixApproach
// 首行；当前条底色高亮 +「本条」标记 + recurrenceOf → 前一条定位词标注；点其他节点同框
// 切换该条全卡（链区当前条随 activeId 重算）。chain 缺席/单条 = 无链区、既有面零变化。
import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { BUG_STATUS_LABELS, type BugCard, type BugCommitFile } from '@dsh-forge/contracts'
import { Button, IconCloseFillRegular, StateDot, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import { fullStampOf, diagStampOf } from '../message-format.js'
import { BUG_STATUS_DOT_STATE, chainEntryKind } from './bug-list.js'
import {
  defaultDrawerPosition,
  drawerPositionFromDrag,
  type DrawerModalPosition,
} from '../drawer/collapse.js'
import { taskDrawerHeadDragProps, useTaskDrawerEscape, type TaskDrawerDragKind } from '../drawer/index.js'
import { preloadRpcClientFactory, type RpcClientFactory } from '../../../rpc/index.js'
import './bug-dialog.css'

/** 弹框宽（结构刻度：440 任务弹窗两倍——2026-10-14 用户裁决「宽度放大一倍」；
 *  拖移钳制/起始位计算同源入参） */
const BUG_DIALOG_WIDTH = 880

/** 五字段表单行序（提案线框：Bug → Trigger → Expected → Actual → Suspected） */
const KV_FIELDS: readonly { readonly key: string; readonly label: string }[] = [
  { key: 'bug', label: 'Bug' },
  { key: 'trigger', label: 'Trigger' },
  { key: 'expected', label: 'Expected' },
  { key: 'actual', label: 'Actual' },
  { key: 'suspected', label: 'Suspected' },
]

function kvValueOf(bug: BugCard, key: string): string {
  switch (key) {
    case 'bug':
      return bug.bugDesc
    case 'trigger':
      return bug.triggerDesc
    case 'expected':
      return bug.expected
    case 'actual':
      return bug.actual
    default:
      return bug.suspected ?? '—'
  }
}

/** 双列表单行（label 定宽列 + value 弹性列——表单语言单源；kv = 五字段锚
 *  data-dswf-ov-bdialog-kv={key}；data = 专用锚 data-dswf-ov-bdialog-{data}） */
function FormRow({ label, kv, data, children }: { readonly label: string; readonly kv?: string; readonly data?: string; readonly children: ReactNode }): ReactNode {
  return (
    <div
      className="dswf-ov-bdialog-row"
      {...(kv !== undefined ? { 'data-dswf-ov-bdialog-kv': kv } : {})}
      {...(data !== undefined ? { [`data-dswf-ov-bdialog-${data}`]: '' } : {})}
    >
      <span className="dswf-ov-bdialog-label">{label}</span>
      <span className="dswf-ov-bdialog-value">{children}</span>
    </div>
  )
}

/** 会话 pill（sessionTitleOfOrId 契约）：命中 title 且 onOpenSession 在场 = 可点击按钮
 *  （跳会话 + 关弹框两动作一体）；解析器缺席/未命中 = fail-soft 回退 sessionId 静态文本。 */
function SessionPill({
  sessionId,
  sessionTitleOf,
  onOpenSession,
  onClose,
}: {
  readonly sessionId: string
  readonly sessionTitleOf?: (sessionId: string) => string | undefined
  readonly onOpenSession?: (sessionId: string) => void
  readonly onClose: () => void
}): ReactNode {
  const title = sessionTitleOf?.(sessionId)
  if (title === undefined || onOpenSession === undefined) {
    return <span data-dswf-ov-bsess-id={sessionId}>{sessionId}</span>
  }
  return (
    <button
      type="button"
      className="dswf-ov-bdialog-sesslink"
      data-dswf-ov-bsess={sessionId}
      onClick={() => {
        onOpenSession(sessionId)
        onClose()
      }}
    >
      {`⟞ ${title}`}
    </button>
  )
}

/** 链时间线区（mockup ②区逐位对照）：题头 + 垂直轨道节点集。节点整行可点（role=button
 *  键盘可达——行点击同款交互词汇）→ 同框切换该条全卡；当前条 is-cur 高亮 +「本条」 +
 *  recurrenceOf → 前一条定位词标注；末节点 css 无轨。 */
function ChainSection({
  entries,
  activeId,
  onSelect,
}: {
  readonly entries: readonly BugCard[]
  readonly activeId: string
  readonly onSelect: (bugId: string) => void
}): ReactNode {
  const handleKey = (bugId: string) => (event: ReactKeyboardEvent<HTMLElement>): void => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onSelect(bugId)
    }
  }
  return (
    <div className="dswf-ov-bdialog-chain" data-dswf-ov-bdialog-chain="">
      <div className="dswf-ov-bdialog-chain-title">{`复发链（${entries.length} 条 · 沿 recurrenceOf 回溯）`}</div>
      <div className="dswf-ov-bdialog-tl">
        {entries.map((entry, index) => {
          const cur = entry.bugId === activeId
          const metaBits = [diagStampOf(entry.createdAt)]
          if (cur && index > 0) metaBits.push(`recurrenceOf → ${chainEntryKind(index - 1)}`)
          if (entry.commitHash !== undefined) metaBits.push(entry.commitHash.slice(0, 7))
          if (entry.fixApproach !== undefined) metaBits.push(`修法：${entry.fixApproach.split('\n')[0] ?? ''}`)
          return (
            <div
              key={entry.bugId}
              className={`dswf-ov-bdialog-chain-node${cur ? ' is-cur' : ''}`}
              data-dswf-ov-bdialog-chain-node={entry.bugId}
              {...(cur ? { 'data-dswf-ov-bdialog-node-cur': entry.bugId } : {})}
              role="button"
              tabIndex={0}
              onClick={() => {
                onSelect(entry.bugId)
              }}
              onKeyDown={handleKey(entry.bugId)}
            >
              <span className="dswf-ov-bdialog-rail">
                <StateDot state={BUG_STATUS_DOT_STATE[entry.bugStatus]} size={8} />
              </span>
              <span className="dswf-ov-bdialog-nodebody">
                <span className="dswf-ov-bdialog-noderow">
                  <span className="dswf-ov-bdialog-nodesum">{`${chainEntryKind(index)} · ${entry.summary}`}</span>
                  <Tag tone="neutral">{BUG_STATUS_LABELS[entry.bugStatus].zh}</Tag>
                  {cur ? (
                    <span className="dswf-ov-bdialog-nodekind" data-dswf-ov-bdialog-node-kind="">
                      本条
                    </span>
                  ) : null}
                </span>
                <span className="dswf-ov-bdialog-nodemeta">{metaBits.join(' · ')}</span>
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export interface BugDialogProps {
  /** 当前 Bug（列表行 BugCard 全量投影——详情零二次拉取） */
  readonly bug: BugCard
  /** 关闭（✕ / Esc / 会话 pill 跳转一并） */
  readonly onClose: () => void
  /** 会话 pill 跳转（装配注入 uiWorkspace.openSession——ShellHost 递达先例；缺席 = pill 不可点击） */
  readonly onOpenSession?: (sessionId: string) => void
  /** 会话名解析器（dsh 账本快照 displayTitle 窄读——注入面同任务弹窗缝；缺席/未命中回退 id） */
  readonly sessionTitleOf?: (sessionId: string) => string | undefined
  /** 项目锚（fixed 证据变更文件拉取参——缺席 = 变更控件不呈现） */
  readonly projectId?: string
  /** RPC client 构造器（缺省 preload 真身；注入 = 测试面） */
  readonly makeClient?: RpcClientFactory
  /** 复发链条目（时间正序、链根在前——listBugs 行集链投影注入；缺席/单条 = 无链区零变化） */
  readonly chain?: readonly BugCard[]
}

/** 变更文件区本地态（惰性拉取——展开首拍 commitFiles；点文件现拉 diff，已拉缓存复用） */
interface FilesState {
  readonly open: boolean
  readonly files: readonly BugCommitFile[] | null
  readonly error: string | null
  readonly openPath: string | null
  readonly diffs: Readonly<Record<string, string>>
}

/** Bug 详情弹框（可拖动 dialog——宽恒 880；标题栏拖移 + 视口钳制 4px 边距/标题栏恒可见，
 *  数学面 = drawer/collapse drawerPositionFromDrag 同刻度复用；位 = 逐开本地态关闭即弃）。
 *  链注入时 = 当前条本地态（activeId 初始为打开条；点链节点同框切换全卡）。 */
export function BugDialog({ bug, onClose, onOpenSession, sessionTitleOf, projectId, makeClient, chain }: BugDialogProps): ReactNode {
  useTaskDrawerEscape(bug.bugId, onClose)
  const clientFactory = makeClient ?? preloadRpcClientFactory
  // 链同框切换态：chain ≥ 2 条在场 = 链区呈现 + activeId 切换（缺席/孤条 = 恒打开条零链区）
  const chainEntries = chain !== undefined && chain.length >= 2 ? chain : undefined
  const [activeId, setActiveId] = useState(bug.bugId)
  const active = chainEntries?.find((entry) => entry.bugId === activeId) ?? bug
  const selectActive = useCallback((bugId: string): void => {
    setActiveId(bugId)
  }, [])
  // 打开条变更（外层重开）= 当前条回打开条；当前条变更（同框切换）= 变更文件区复位重算
  useEffect(() => {
    setActiveId(bug.bugId)
  }, [bug.bugId])
  useEffect(() => {
    setFilesState((prev) => (prev.open || prev.files !== null || prev.error !== null || prev.openPath !== null ? { open: false, files: null, error: null, openPath: null, diffs: {} } : prev))
    filesSeqRef.current += 1
  }, [activeId])
  // 变更文件区（fixed + projectId + commitHash 三键在场——惰性拉取：展开首拍清单，点文件
  // 现拉 diff 已拉缓存复用；序号守卫同 useSessionTaskPills 口径——旧拍不落点）
  const [filesState, setFilesState] = useState<FilesState>({ open: false, files: null, error: null, openPath: null, diffs: {} })
  const filesSeqRef = useRef(0)
  const canShowFiles = active.bugStatus === 'fixed' && active.commitHash !== undefined && projectId !== undefined
  const toggleFiles = useCallback((): void => {
    setFilesState((prev) => ({ ...prev, open: !prev.open }))
  }, [])
  useEffect(() => {
    if (!filesState.open || filesState.files !== null || filesState.error !== null) return
    if (projectId === undefined || active.commitHash === undefined) return
    const seq = ++filesSeqRef.current
    let alive = true
    void clientFactory()
      .bugs.commitFiles({ projectId, commitHash: active.commitHash })
      .then((files) => {
        if (alive && seq === filesSeqRef.current) setFilesState((prev) => ({ ...prev, files }))
      })
      .catch((err: unknown) => {
        if (alive && seq === filesSeqRef.current) {
          setFilesState((prev) => ({ ...prev, error: err instanceof Error ? err.message : String(err) }))
        }
      })
    return () => {
      alive = false
    }
  }, [filesState.open, filesState.files, filesState.error, projectId, active.commitHash, clientFactory])
  const handleFileClick = useCallback(
    (path: string): void => {
      if (projectId === undefined || active.commitHash === undefined) return
      setFilesState((prev) => ({ ...prev, openPath: prev.openPath === path ? null : path }))
      if (filesState.diffs[path] !== undefined) return // 已拉缓存复用
      const seq = ++filesSeqRef.current
      let alive = true
      void clientFactory()
        .bugs.fileDiff({ projectId, commitHash: active.commitHash, path })
        .then(({ diff }) => {
          if (alive && seq === filesSeqRef.current) {
            setFilesState((prev) => ({ ...prev, diffs: { ...prev.diffs, [path]: diff } }))
          }
        })
        .catch(() => {
          if (alive && seq === filesSeqRef.current) {
            setFilesState((prev) => ({ ...prev, diffs: { ...prev.diffs, [path]: '（diff 拉取失败）' } }))
          }
        })
    },
    [projectId, active.commitHash, clientFactory, filesState.diffs],
  )
  const [position, setPosition] = useState<DrawerModalPosition | null>(null)
  const positionRef = useRef<DrawerModalPosition | null>(null)
  const applyPosition = useCallback((next: DrawerModalPosition): void => {
    positionRef.current = next
    setPosition(next)
  }, [])
  // 默认起始位（mount 效应按视口计算——水平居中 + 14vh；SSR 首帧 CSS 居中兜底同任务弹窗）
  useEffect(() => {
    if (positionRef.current !== null) return
    applyPosition(defaultDrawerPosition(window.innerWidth, window.innerHeight, BUG_DIALOG_WIDTH))
  }, [applyPosition])
  const dragRef = useRef<{ readonly startClientX: number; readonly startClientY: number; readonly startLeft: number; readonly startTop: number } | null>(null)
  const handleDragStart = useCallback(
    (_kind: TaskDrawerDragKind, clientX: number, clientY: number): void => {
      const start = positionRef.current ?? defaultDrawerPosition(window.innerWidth, window.innerHeight, BUG_DIALOG_WIDTH)
      if (positionRef.current === null) applyPosition(start)
      dragRef.current = { startClientX: clientX, startClientY: clientY, startLeft: start.left, startTop: start.top }
    },
    [applyPosition],
  )
  const handleDragMove = useCallback(
    (clientX: number, clientY: number): void => {
      const drag = dragRef.current
      if (drag === null) return
      applyPosition(
        drawerPositionFromDrag(
          { left: drag.startLeft, top: drag.startTop },
          drag.startClientX,
          drag.startClientY,
          clientX,
          clientY,
          window.innerWidth,
          window.innerHeight,
          BUG_DIALOG_WIDTH,
        ),
      )
    },
    [applyPosition],
  )
  const handleDragEnd = useCallback((): void => {
    dragRef.current = null
  }, [])
  const dragProps = taskDrawerHeadDragProps(handleDragStart, handleDragMove, handleDragEnd)
  const style: Record<string, string> =
    position === null
      ? { width: `${BUG_DIALOG_WIDTH}px` }
      : { width: `${BUG_DIALOG_WIDTH}px`, left: `${position.left}px`, top: `${position.top}px`, transform: 'none' }

  return (
    <aside
      className="dswf-ov-bdialog"
      role="dialog"
      aria-label="Bug 详情"
      style={style}
      data-dswf-ov-bdialog=""
      data-dswf-ov-bdialog-id={bug.bugId}
    >
      <div className="dswf-ov-bdialog-head" data-dswf-ov-bdialog-head="" {...dragProps}>
        <span aria-hidden="true">⠿</span>
        <span>Bug 详情</span>
        <span className="dswf-ov-bdialog-spacer" />
        <Button variant="ghost" size="sm" className="dswf-ov-bdialog-close" data-dswf-ov-bdialog-close="" aria-label="关闭弹框" onClick={onClose}>
          <IconCloseFillRegular size={14} />
        </Button>
      </div>
      <div className="dswf-ov-bdialog-body" data-dswf-ov-bdialog-body="">
        <div className="dswf-ov-bdialog-summaryline">
          <span className="dswf-ov-bdialog-summarytext" data-dswf-ov-bdialog-summary="">{active.summary}</span>
          <span className="dswf-ov-bdialog-chips">
            <span data-dswf-ov-bdialog-status={active.bugStatus}>
              <Tag tone="neutral">{BUG_STATUS_LABELS[active.bugStatus].zh}</Tag>
            </span>
            {active.errorType !== undefined ? (
              <span data-dswf-ov-bdialog-type={active.errorType}>
                <Tag tone="neutral">{active.errorType}</Tag>
              </span>
            ) : null}
          </span>
        </div>
        {chainEntries !== undefined ? <ChainSection entries={chainEntries} activeId={active.bugId} onSelect={selectActive} /> : null}
        {KV_FIELDS.map(({ key, label }) => (
          <FormRow key={key} label={label} kv={key}>
            {kvValueOf(active, key)}
          </FormRow>
        ))}
        {active.bugStatus === 'fixed' ? (
          <FormRow label="修复证据" data="evidence">
            {[
              ...(active.commitHash !== undefined ? [`commit ${active.commitHash}`] : []),
              ...(active.worktree !== undefined ? [`worktree ${active.worktree}`] : []),
              ...(active.branch !== undefined ? [`branch ${active.branch}`] : []),
            ].join(' · ') || '—'}
          </FormRow>
        ) : null}
        {canShowFiles ? (
          <div className="dswf-ov-bdialog-row" data-dswf-ov-bdialog-files="">
            <span className="dswf-ov-bdialog-label">变更</span>
            <span className="dswf-ov-bdialog-value dswf-ov-bdialog-fileswrap">
              <button type="button" className="dswf-ov-bdialog-sesslink" data-dswf-ov-bdialog-files-toggle="" onClick={toggleFiles}>
                {filesState.files === null
                  ? `${filesState.open ? '▾' : '▸'} 变更内容`
                  : `${filesState.open ? '▾' : '▸'} 变更内容（${filesState.files.length}）`}
              </button>
              {filesState.open && filesState.files === null && filesState.error === null ? <span>加载中…</span> : null}
              {filesState.open && filesState.error !== null ? <span>加载失败：{filesState.error}</span> : null}
              {filesState.open && filesState.files !== null ? (
                <span className="dswf-ov-bdialog-filelist">
                  {filesState.files.length === 0 ? <span>（无变更文件）</span> : null}
                  {filesState.files.map((f) => (
                    <span key={f.path} className="dswf-ov-bdialog-fileitem">
                      <button
                        type="button"
                        className="dswf-ov-bdialog-sesslink"
                        data-dswf-ov-bdialog-file={f.path}
                        onClick={() => handleFileClick(f.path)}
                      >
                        {`${f.status} ${f.path}`}
                      </button>
                      {filesState.openPath === f.path ? (
                        <pre className="dswf-ov-bdialog-diff" data-dswf-ov-bdialog-diff={f.path}>
                          {filesState.diffs[f.path] ?? '加载中…'}
                        </pre>
                      ) : null}
                    </span>
                  ))}
                </span>
              ) : null}
            </span>
          </div>
        ) : null}
        {active.bugStatus === 'unresolved' && active.unresolvedReason !== undefined ? (
          <FormRow label="未修原因" data="unresolved">
            {active.unresolvedReason}
          </FormRow>
        ) : null}
        {active.bugStatus === 'fixed' && active.fixApproach !== undefined ? (
          <FormRow label="修复方案" data="fix-approach">
            {active.fixApproach}
          </FormRow>
        ) : null}
        <div className="dswf-ov-bdialog-row" data-dswf-ov-bdialog-people="">
          <span className="dswf-ov-bdialog-label">发现</span>
          <span className="dswf-ov-bdialog-value">
            <span data-dswf-ov-bdialog-reporter="">{active.reporter}</span>
            {active.reportSessionId !== undefined ? (
              <SessionPill sessionId={active.reportSessionId} sessionTitleOf={sessionTitleOf} onOpenSession={onOpenSession} onClose={onClose} />
            ) : null}
          </span>
        </div>
        {active.fixer !== undefined ? (
          <div className="dswf-ov-bdialog-row" data-dswf-ov-bdialog-fixer="">
            <span className="dswf-ov-bdialog-label">修复</span>
            <span className="dswf-ov-bdialog-value">
              <span>{active.fixer}</span>
              {active.fixSessionId !== undefined ? (
                <SessionPill sessionId={active.fixSessionId} sessionTitleOf={sessionTitleOf} onOpenSession={onOpenSession} onClose={onClose} />
              ) : null}
            </span>
          </div>
        ) : null}
        {active.sourceTaskId !== undefined ? (
          <FormRow label="来源" data="source">
            {`任务 ${active.sourceTaskId}`}
          </FormRow>
        ) : null}
        <FormRow label="登记时间">
          <span>{fullStampOf(active.createdAt)}</span>
        </FormRow>
      </div>
    </aside>
  )
}
