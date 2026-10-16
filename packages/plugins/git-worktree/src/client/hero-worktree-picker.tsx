// @dsh-forge/git-worktree client —— hero 选择控件（原型「新会话」卡逐位对照）：
// 触发 chip（一体两属性 feat/a · wt-a）+ 官方 Menu 弹层——一行一 worktree（分支图标 +
// 分支名 + worktree 名）、来源标记（所配目录内 = DSH）、失配行置灰、主 worktree 行无
// 删除图标、footer 左对齐「新建 worktree…」；ahead/behind 行内徽标懒加载（展开才拉 +
// 缓存）；非 git 项目零注入（返回 null 退回现状）。
// 难点 A 落法 = 产品自增行（影子渲染面就地并列，取证见
// .forge/docs/proposals/worktree-branch-management/walkthrough/hero-second-chip-decision.md）。
// 行面纯函数 heroWorktreeRows 单测直测（官方 Menu 开弹层门户面 SSR 不可达——
// apps/web HeroWorkspacePicker.test 同口径惯例），开弹层交互归 e2e。
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import { IconBranchOutlineRegular, IconChevronDownOutlineRegular, IconPlusOutlineRegular, IconTrashOutlineRegular } from './icons.js'
import { WorktreeRiskConfirmation } from './risk-confirmation.js'
import {
  aheadBehindSegments,
  inferSource,
  isCrossBranchRisk,
  pendingAheadBehindPaths,
  type WorktreeRow,
} from './model.js'
import type { AheadBehind } from '../worktree-ops.js'

const CREATE_ITEM_ID = '__dswt-create__'

/** 菜单行渲染模型（一行一 worktree：分支名 + worktree 名 + 徽标 + 删除 affordance） */
export interface WorktreeMenuRow {
  readonly path: string
  readonly branch: string | null
  readonly worktreeName: string
  readonly isMain: boolean
  /** 盘上失配 = false（置灰 + 「盘上失配」提示，不可选中） */
  readonly present: boolean
  /** 来源标记（所配目录内 = 'dsh'，徽标文案 DSH；自定义路径 = null 无标记） */
  readonly source: WorktreeMenuRowSource
  /** ahead 徽标（↑N；零值/未加载/失配 = null） */
  readonly ahead: string | null
  /** behind 徽标（↓N；零值/未加载/失配 = null） */
  readonly behind: string | null
}

export type WorktreeMenuRowSource = 'dsh' | null

/** 行面纯函数：行源 → 菜单行渲染模型（来源标记推断 + ahead/behind 徽标拆分同源） */
export function heroWorktreeRows(
  rows: readonly WorktreeRow[],
  worktreeDir: string | undefined,
  aheadBehind: ReadonlyMap<string, AheadBehind>,
): readonly WorktreeMenuRow[] {
  return rows.map((row) => {
    const counts =
      row.present && row.branch !== null
        ? aheadBehindSegments(aheadBehind.get(row.path) ?? { ahead: 0, behind: 0 })
        : { ahead: null, behind: null }
    return {
      path: row.path,
      branch: row.branch,
      worktreeName: row.worktreeName,
      isMain: row.isMain,
      present: row.present,
      source: inferSource(row.path, worktreeDir),
      ahead: counts.ahead,
      behind: counts.behind,
    }
  })
}

export interface HeroWorktreePickerProps {
  /** 能力位（身份归并层产出，UI 只消费）——非 git = 零注入 */
  readonly isGit: boolean
  /** 行源：worktree 全量清单（一行一 worktree） */
  readonly rows: readonly WorktreeRow[]
  /** 所配 worktree 存放目录（来源标记推断面；缺省 = 无来源标记） */
  readonly worktreeDir?: string | undefined
  /** 当前选中行（chip 一体两属性来源） */
  readonly selectedPath?: string | undefined
  /** 选中挂靠动作（单选，无二段流） */
  readonly onSelect: (path: string) => void
  /** footer「新建 worktree…」动作（弹窗由装配层挂） */
  readonly onCreate: () => void
  /** 行内删除动作（危险操作——二次确认弹窗由装配层挂） */
  readonly onDelete: (path: string) => void
  /** ahead/behind 懒加载器（展开才拉；缺省 = 不拉、无徽标） */
  readonly loadAheadBehind?: ((path: string) => Promise<AheadBehind>) | undefined
  /** 外部 ahead/behind 缓存（会话头/菜单共享，可选） */
  readonly aheadBehind?: ReadonlyMap<string, AheadBehind> | undefined
}

const mono = {
  fontFamily: 'var(--ds-font-family-code, monospace)',
} satisfies React.CSSProperties

/**
 * 触发 chip（官方 WorkspaceChip 实机规格逐位对照——HeroShell.module.css `.workspace`：
 * 透明底 + radius-sm、hover/展开 `interactive-bg-hover` 填充、min-height 28、padding 0 8、
 * gap 4、13px/500/20px label-primary、前分支图标 16（对位官方文件夹 16）+ 尾 chevron 12
 * caption 色、label 溢出省略、max-width min(100%,360px)；最大区别于旧胶囊自绘面）。
 */
function TriggerChip({
  row,
  open,
  onToggle,
}: {
  readonly row: WorktreeRow | undefined
  readonly open: boolean
  readonly onToggle: () => void
}): ReactNode {
  const [hover, setHover] = useState(false)
  return (
    <button
      type="button"
      data-dswt-hero-trigger=""
      aria-haspopup="menu"
      aria-expanded={open}
      onClick={onToggle}
      onMouseEnter={() => {
        setHover(true)
      }}
      onMouseLeave={() => {
        setHover(false)
      }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        minHeight: 28,
        maxWidth: 'min(100%, 360px)',
        padding: '0 8px',
        borderRadius: 'var(--dsw-radius-sm)',
        border: 'none',
        background: hover || open ? 'var(--dsw-alias-interactive-bg-hover)' : 'transparent',
        fontSize: 13,
        fontWeight: 500,
        lineHeight: '20px',
        color: 'var(--dsw-alias-label-primary)',
        cursor: 'pointer',
        fontFamily: 'inherit',
      }}
    >
      <span style={{ display: 'inline-flex', flex: 'none', color: 'var(--dsw-alias-label-primary)' }}>
        <IconBranchOutlineRegular size={16} />
      </span>
      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {row ? `${row.branch ?? ''} · ${row.worktreeName}` : '选择 worktree…'}
      </span>
      <span style={{ display: 'inline-flex', flex: 'none', color: 'var(--dsw-alias-label-caption)' }}>
        <IconChevronDownOutlineRegular size={12} />
      </span>
    </button>
  )
}

/** 行标签：分支名（行属性）+ worktree 名 + 徽标区（ahead/behind + 来源标记）+ 删除图标 */
function rowLabel(
  row: WorktreeMenuRow,
  onDelete: () => void,
): ReactNode {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, width: '100%', minWidth: 0 }}>
      <span style={{ ...mono, fontSize: 12, color: 'var(--dsw-alias-label-primary)' }}>{row.branch ?? ''}</span>
      <span style={{ fontSize: 12, color: 'var(--dsw-alias-label-tertiary)' }}>{row.worktreeName}</span>
      <span style={{ flex: 1 }} />
      {row.ahead !== null && (
        <span data-dswt-ab-ahead="" style={{ ...mono, fontSize: 11, color: 'var(--dsw-alias-state-success-primary)' }}>
          {row.ahead}
        </span>
      )}
      {row.behind !== null && (
        <span data-dswt-ab-behind="" style={{ ...mono, fontSize: 11, color: 'var(--dsw-alias-state-warn-primary)' }}>
          {row.behind}
        </span>
      )}
      {row.source !== null && (
        <span
          data-dswt-src={row.source}
          style={{
            fontSize: 11,
            color: 'var(--dsw-alias-label-caption)',
            border: '0.5px solid var(--dsw-alias-border-l2)',
            borderRadius: 999,
            padding: '0 6px',
          }}
        >
          DSH
        </span>
      )}
      {/* 删除 = 行右侧图标（hover 显现——fading 动作组惯例）；主 worktree 行无删除图标 */}
      {!row.isMain && (
        <span
          data-dswt-del={row.path}
          role="button"
          aria-label={`删除 worktree ${row.worktreeName}`}
          onClick={(event) => {
            event.stopPropagation()
            onDelete()
          }}
          style={{
            marginLeft: 4,
            display: 'inline-flex',
            color: 'var(--dsw-alias-label-tertiary)',
            opacity: 0,
            transition: 'opacity .15s var(--ds-ease-in-out, ease)',
            cursor: 'pointer',
          }}
          onMouseEnter={(event: React.MouseEvent<HTMLSpanElement>) => {
            event.currentTarget.style.color = 'var(--dsw-alias-state-error-primary)'
          }}
          onMouseLeave={(event: React.MouseEvent<HTMLSpanElement>) => {
            event.currentTarget.style.color = 'var(--dsw-alias-label-tertiary)'
          }}
        >
          <IconTrashOutlineRegular size={14} />
        </span>
      )}
    </span>
  )
}

/**
 * hero worktree 选择控件（非 git 项目返回 null——hero 区零注入，退回现状）。
 * data 锚：触发 chip = data-dswt-hero-trigger；弹层卡 = .dswt-hero-menu（Menu
 * listClassName——portal 面唯一可达样式钩）。
 */
export function HeroWorktreePicker({
  isGit,
  rows,
  worktreeDir,
  selectedPath,
  onSelect,
  onCreate,
  onDelete,
  loadAheadBehind,
  aheadBehind: externalCache,
}: HeroWorktreePickerProps): ReactNode {
  const [open, setOpen] = useState(false)
  const [lazyCache, setLazyCache] = useState<ReadonlyMap<string, AheadBehind>>(new Map())
  // 1.19 风险确认待决行（跨分支改选——确认才走挂靠编排，取消保持原选）
  const [riskPath, setRiskPath] = useState<string | null>(null)

  // ahead/behind 懒加载：菜单展开才拉（收起恒不拉）；外部缓存优先，内部缓存兜重拉。
  const cache = useMemo(
    () => new Map([...(externalCache ?? []), ...lazyCache]),
    [externalCache, lazyCache],
  )
  useEffect(() => {
    if (!open || loadAheadBehind === undefined) return
    for (const path of pendingAheadBehindPaths(open, rows, cache)) {
      loadAheadBehind(path).then(
        (counts) => {
          setLazyCache((prev) => new Map(prev).set(path, counts))
        },
        () => {}, // 拉取失败 fail-soft：无徽标即无展示，不阻塞菜单
      )
    }
  }, [open, rows, cache, loadAheadBehind])

  if (!isGit) return null // 非 git 项目：hero 区零注入（能力位条件渲染，UI 只消费）

  const selected = rows.find((row) => row.path === selectedPath)
  // 1.19 主树当前检出分支（跨分支风险判定基准——主行 branch，detached/bare = null 保守判风险）
  const mainBranch = rows.find((row) => row.isMain)?.branch ?? null
  const riskRow = riskPath !== null ? rows.find((row) => row.path === riskPath) : undefined

  const items = heroWorktreeRows(rows, worktreeDir, cache).map((row) => ({
    id: row.path,
    label: row.present
      ? rowLabel(row, () => onDelete(row.path))
      : (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, width: '100%' }}>
          <span style={{ ...mono, fontSize: 12 }}>{row.branch ?? ''}</span>
          <span style={{ fontSize: 12 }}>{row.worktreeName}</span>
          <span style={{ flex: 1 }} />
          <span data-dswt-dead-note="" style={{ fontSize: 11, color: 'var(--dsw-alias-state-error-primary)' }}>
            盘上失配
          </span>
        </span>
      ),
    icon: <IconBranchOutlineRegular size={14} />,
    disabled: !row.present, // 失配行置灰（不可选中——提示清理后随刷新自愈）
  }))

  return (
    <>
    <Menu
      open={open}
      anchor={<TriggerChip row={selected} open={open} onToggle={() => {
        setOpen((value) => !value)
      }} />}
      items={items}
      footer={[{ id: CREATE_ITEM_ID, label: '新建 worktree…', icon: <IconPlusOutlineRegular size={14} /> }]}
      selectedId={selectedPath}
      selection="fill"
      onClose={() => {
        setOpen(false)
      }}
      onSelect={(id) => {
        if (id === CREATE_ITEM_ID) {
          setOpen(false)
          onCreate()
          return
        }
        setOpen(false)
        // 1.19 风险确认门：目标行分支 ≠ 主树当前检出分支 → 先弹确认框，确认才走挂靠编排；
        // 同分支重选不弹框直接切换（isCrossBranchRisk 纯函数单源）。
        const target = rows.find((row) => row.path === id)?.branch ?? null
        if (isCrossBranchRisk(target, mainBranch)) {
          setRiskPath(id)
          return
        }
        onSelect(id)
      }}
      listClassName="dswt-hero-menu"
      className="dswt-hero-anchor"
    />
    {riskRow !== undefined && (
      <WorktreeRiskConfirmation
        open={riskPath !== null}
        targetBranch={riskRow.branch}
        currentBranch={mainBranch}
        onCancel={() => {
          setRiskPath(null) // 取消：保持原选（零编排）
        }}
        onConfirm={() => {
          const path = riskPath
          setRiskPath(null)
          if (path !== null) onSelect(path)
        }}
      />
    )}
    </>
  )
}
