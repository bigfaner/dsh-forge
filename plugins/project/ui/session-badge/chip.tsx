// session-badge —— 会话头 actions 槽只读一体 chip（绑定展示 + ahead/behind 次级小字 +
// sealed 失效变体）与挂载面 ForgeSessionWorktreeChip（WorktreeFaces 尾段拆出）。
// 样式对齐官方 AgentPresetLabel（模式标签）一体形态——radius-xs pill + fill-tsp-secondary
// 底 + 14px 分支图标（opacity .7）+ 12px 文本。完整信息卡（分支/worktree 名/
// 完整路径/项目根/ahead-behind/封存警示）经官方 HoverCard（inline + fitContent）呈现，
// 卡面宽度上限由 ./chip.css 解除（贴合内容、仅留视口上限，各行不换行）：
// 悬停或键盘聚焦展开，卡片 portal 到 body（官方头容器 overflow:clip 不再裁切——原自绘
// absolute 卡片整张落在裁剪区外只剩边线），指针可停驻卡片阅读选中，Escape/失焦收起。
// 封存态 = 失效变体（警示色 + 删除线）；非 git 项目零注入。
import { useEffect, useState, type ReactNode } from 'react'
import './chip.css'
import { aheadBehindInline, aheadBehindSegments } from '../worktree-picker/model.js'
import type { AheadBehind } from '@dsh-forge/contracts'
import { IconBranchOutlineRegular } from '../icons.js'
import { HoverCard } from '@deepseek-ai/dsh-client-ui-primitives'
import { useWorktreeSeal } from './seal-notice.js'
import { createForgeRpcClient, forgeRemoteMountSettled, waitForRemoteMountSettled, type WorktreeFacesRpc } from '../rpc.js'

const mono = { fontFamily: 'var(--ds-font-family-code, monospace)' } satisfies React.CSSProperties

/** 悬停展开延时（官方缺省 500ms 偏迟——chip 为高频查看面；点击锚点会收起，短延时让卡片先于点击出现） */
const CHIP_OPEN_DELAY_MS = 150

export interface SessionWorktreeChipProps {
  /** 能力位（身份归并层产出）——非 git = 零注入 */
  readonly isGit: boolean
  readonly branch: string
  readonly worktreeName: string
  /** worktree 完整路径（完整信息卡行；缺席 = 卡内不呈现该行） */
  readonly worktreePath?: string | undefined
  /** 归并项目根（完整信息卡行；缺席 = 卡内不呈现该行） */
  readonly projectRoot?: string | undefined
  /** ahead/behind（懒加载/缓存值；缺省 = 不展示） */
  readonly aheadBehind?: AheadBehind | undefined
  /** 封存态（挂靠 worktree 已被删——chip 转失效态） */
  readonly sealed?: boolean | undefined
}

/** 完整信息卡（受控呈现面导出 = 单测直测；壳 = 官方 HoverCard 卡面，本面只承载行内容——不自定位） */
export function SessionWorktreeInfoCard({
  branch,
  worktreeName,
  worktreePath,
  projectRoot,
  aheadBehind,
  sealed = false,
}: Omit<SessionWorktreeChipProps, 'isGit'>): ReactNode {
  // chip §2.3.1：ahead/behind 内联于分支名旁（`2↓ 16↑` 落后在前），独立「领先/落后」行移除
  const inlineAb = aheadBehind !== undefined ? aheadBehindInline(aheadBehind) : null
  const row = (label: string, value: ReactNode): ReactNode => (
    <div key={label} style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
      <span style={{ flex: 'none', color: 'var(--dsw-alias-label-tertiary)', fontSize: 12 }}>{label}</span>
      <span style={{ ...mono, color: 'var(--dsw-alias-label-primary)', fontSize: 12, whiteSpace: 'nowrap' }}>{value}</span>
    </div>
  )
  return (
    <div
      data-dswt-session-chip-popover=""
      style={{ display: 'flex', flexDirection: 'column', gap: 6, textAlign: 'left' }}
    >
      {sealed && (
        <div style={{ color: 'var(--dsw-alias-state-error-primary)', fontSize: 12 }}>
          worktree 已被删除，会话已封存——可查看历史，不可发送消息
        </div>
      )}
      {row(
        '分支',
        <>
          {branch}
          {inlineAb !== null && (
            <span data-dswt-chip-ab-inline="" style={{ marginLeft: 6, color: 'var(--dsw-alias-label-caption)' }}>
              {inlineAb}
            </span>
          )}
        </>,
      )}
      {row('worktree', worktreeName)}
      {projectRoot !== undefined && row('项目', projectRoot)}
      {worktreePath !== undefined && row('工作区', worktreePath)}
    </div>
  )
}

/**
 * 会话头只读一体 chip（注入 `conversation.session.header.actions` 槽——官方动作带，
 * 样式基准 = 官方 AgentPresetLabel 模式标签）。同名去重（branch ≡ worktree 名 = 单段
 * 展示，hero chip 同口径）。完整信息卡经官方 HoverCard 承载：悬停/键盘聚焦展开、
 * portal 到 body、指针可停驻卡片；点击锚点收起（HoverCard 固有语义）。
 * data 锚：data-dswt-session-chip / data-dswt-session-chip-popover。
 */
export function SessionWorktreeChip({
  isGit,
  branch,
  worktreeName,
  worktreePath,
  projectRoot,
  aheadBehind,
  sealed = false,
}: SessionWorktreeChipProps): ReactNode {
  if (!isGit) return null // 非 git 项目：会话头 actions 槽零注入
  const segments = aheadBehind !== undefined && !sealed ? aheadBehindSegments(aheadBehind) : null
  const errorColor = 'var(--dsw-alias-state-error-primary)'
  const deduped = branch === worktreeName // 同名去重（hero chip 同口径——默认派生名恒等）
  return (
    <HoverCard
      inline
      fitContent
      openDelayMs={CHIP_OPEN_DELAY_MS}
      anchor={
        <span
          data-dswt-session-chip={sealed ? 'sealed' : 'live'}
          tabIndex={0}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            height: 22,
            padding: '0 2px 0 0',
            borderRadius: 'var(--dsw-radius-xs)',
            fontSize: 12,
            lineHeight: '22px',
            color: sealed ? errorColor : 'var(--dsw-alias-label-tertiary)',
            background: 'var(--dsw-alias-fill-tsp-secondary)',
            whiteSpace: 'nowrap',
            maxWidth: 260,
            overflow: 'hidden',
          }}
        >
          <span style={{ opacity: 0.7, flex: 'none', display: 'inline-flex', color: sealed ? errorColor : 'var(--dsw-alias-label-primary)' }}>
            <IconBranchOutlineRegular size={14} />
          </span>
          <span style={{ ...mono, color: sealed ? errorColor : 'var(--dsw-alias-label-primary)', textDecoration: sealed ? 'line-through' : undefined }}>
            {deduped ? branch : `${branch} · ${worktreeName}`}
          </span>
          {segments !== null && (segments.ahead !== null || segments.behind !== null) && (
            <span data-dswt-chip-ab="" style={{ fontSize: 11, color: 'var(--dsw-alias-label-caption)' }}>
              {[segments.ahead, segments.behind].filter(Boolean).join(' ')}
            </span>
          )}
        </span>
      }
      content={
        <SessionWorktreeInfoCard
          branch={branch}
          worktreeName={worktreeName}
          worktreePath={worktreePath}
          projectRoot={projectRoot}
          aheadBehind={aheadBehind}
          sealed={sealed}
        />
      }
    />
  )
}

/**
 * 会话头 actions 槽只读 chip 挂载面（WorktreeFaces 尾段拆出；绑定展示 `feat/a · wt-a`
 * 一体形态；封存 = 失效变体；非 git / 无绑定（branch 缺席）= 零注入）。ahead/behind
 * 次级小字：sealed 恒不展示（失配无意义），live 态低频拉取由 chip 挂载期一次消费
 * （懒加载/缓存纪律）。
 */
export function ForgeSessionWorktreeChip({
  sessionId,
  makeRpc = createForgeRpcClient,
}: {
  readonly sessionId?: string | undefined
  readonly makeRpc?: () => WorktreeFacesRpc
}): ReactNode {
  const phase = useWorktreeSeal(sessionId, makeRpc)
  const [aheadBehind, setAheadBehind] = useState<AheadBehind | undefined>(undefined)
  const [info, setInfo] = useState<{ readonly worktreePath: string; readonly projectRoot: string } | undefined>(undefined)
  useEffect(() => {
    if (sessionId === undefined || phase.branch === null || phase.sealed) return
    // 传输构造 throw-safe（fix-13——官方 web 无 preload 桥：构造即抛，effect 同步抛 =
    // 渲染树崩溃；降级 = 跳过 ahead/behind 拉取，chip 本体不受累）。
    let alive = true
    let rpc: WorktreeFacesRpc
    try {
      rpc = makeRpc()
    } catch {
      return
    }
    const pullInfo = async (): Promise<void> => {
      const result = await rpc.worktree.seal({ sessionId })
      if (!alive) return
      if (result.projectRoot !== undefined && result.binding !== null) {
        setInfo({ worktreePath: result.binding.worktreePath, projectRoot: result.projectRoot })
      }
      if (result.projectRoot === undefined || result.binding === null) return
      const counts = await rpc.worktree.aheadBehind({ projectRoot: result.projectRoot, path: result.binding.worktreePath })
      if (alive) setAheadBehind(counts.counts ?? undefined)
    }
    void pullInfo().catch(() => {
      // 首拉失败且 mount 未落座（评审 L 粘滞降级缝——info/aheadBehind 整会话不出现）＝
      // 装配时序竞速窗口：等 mount 落座后重取一次（waitForRemoteMountSettled——订阅页内
      // mount 终态锚，禁自造轮询）；落座后的失败保持静默降级（chip 本体不受累）。
      if (!alive || forgeRemoteMountSettled()) return
      void waitForRemoteMountSettled().then(() => {
        if (alive) void pullInfo().catch(() => {})
      })
    })
    return () => {
      alive = false
    }
  }, [sessionId, phase.branch, phase.sealed, makeRpc])
  if (sessionId === undefined || !phase.isGit || phase.branch === null || phase.worktreeName === null) return null
  return (
    <SessionWorktreeChip
      isGit
      branch={phase.branch}
      worktreeName={phase.worktreeName}
      worktreePath={info?.worktreePath}
      projectRoot={info?.projectRoot}
      aheadBehind={aheadBehind}
      sealed={phase.sealed}
    />
  )
}
