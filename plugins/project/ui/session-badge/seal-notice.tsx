// session-badge —— 封存三通道提示（均提示性视觉，「不可发送」硬保证在 host 发送拦截
// 面，UI 不做硬禁用——官方 composer 无禁用 API）：
// ① SealNotice——一次性 notice banner，紧贴会话头分界线置顶（官方 notice 形态）；
// ② SealedComposerPlaceholder——composer 占位文案（提示性）；
// ③ chip 失效态见 ./chip.tsx（sealed 变体）。
// WorktreeFaces 尾段拆出件亦在本文件：seal 快照单源（WorktreeSealPhase + useWorktreeSeal
// ——chip 失效态与 notice/占位两提示通道共读）+ chat 列顶部 portal（ChatFlowTop）+
// 封存 overlay 挂载面 ForgeWorktreeSealOverlay + branch 漂移 banner。
import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { IconWarningTriangleOutlineRegular } from '../icons.js'
import { preloadRpcClientFactory, type WorktreeFacesRpc } from '../rpc.js'

export interface SealNoticeProps {
  /** 被删 worktree 名（banner 引述） */
  readonly worktreeName: string
  /** 一次性关闭（dismiss 后装配层不再渲染——一次性语义） */
  readonly onClose: () => void
}

/**
 * 封存 notice banner（警告色描边 + 8% 警告底 + 上边线免除——紧贴会话头分界线置顶）。
 * data 锚：data-dswt-seal-notice。
 */
export function SealNotice({ worktreeName, onClose }: SealNoticeProps): ReactNode {
  return (
    <div
      data-dswt-seal-notice=""
      role="status"
      style={{
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start',
        border: '0.5px solid var(--dsw-alias-state-warn-primary)',
        borderTop: 'none',
        borderRadius: '0 0 12px 12px',
        padding: '10px 14px',
        marginBottom: 12,
        fontSize: 13,
        lineHeight: '20px',
        color: 'var(--dsw-alias-label-primary)',
        background: 'color-mix(in srgb, var(--dsw-alias-state-warn-primary) 8%, transparent)',
      }}
    >
      <span style={{ display: 'inline-flex', color: 'var(--dsw-alias-state-warn-primary)' }} aria-hidden="true">
        <IconWarningTriangleOutlineRegular size={15} />
      </span>
      <span>
        该会话挂靠的 worktree{' '}
        <b style={{ fontFamily: 'var(--ds-font-family-code, monospace)' }}>{worktreeName}</b>{' '}
        已被删除，会话已封存——可查看历史，不可发送消息。
      </span>
      <span
        role="button"
        aria-label="关闭提示"
        data-dswt-seal-notice-close=""
        onClick={onClose}
        style={{
          marginLeft: 'auto',
          color: 'var(--dsw-alias-label-tertiary)',
          cursor: 'pointer',
          fontSize: 12,
          lineHeight: '20px',
        }}
      >
        ✕
      </span>
    </div>
  )
}

/**
 * composer 封存占位文案（提示性——不硬禁用；composer 本体为官方件，产品侧仅让
 * 占位行呈现封存语义）。data 锚：data-dswt-seal-placeholder。
 */
export function SealedComposerPlaceholder(): ReactNode {
  return (
    <div
      data-dswt-seal-placeholder=""
      style={{
        border: '0.5px dashed var(--dsw-alias-border-l2)',
        borderRadius: 16,
        padding: '12px 14px',
        fontSize: 14,
        lineHeight: '22px',
        color: 'var(--dsw-alias-label-caption)',
        background: 'var(--dsw-alias-bg-module-platform)',
      }}
    >
      worktree 已删除，会话已封存——可查看历史
    </div>
  )
}

export interface BranchDriftNoticeProps {
  /** 留痕 branch（forge/worktree-bind 创建时刻快照） */
  readonly bindBranch: string
  /** 实时 branch（host 解析面） */
  readonly branch: string
}

/**
 * branch 漂移 warning banner（binding-derivation §2.2——非阻断，切回即消失：判定随
 * seal 渲染现算，无关闭态无状态残留；SealNotice 同款警告形态但保留圆角）。data 锚：
 * data-dswt-bind-drift-notice。
 */
export function BranchDriftNotice({ bindBranch, branch }: BranchDriftNoticeProps): ReactNode {
  return (
    <div
      data-dswt-bind-drift-notice=""
      role="status"
      style={{
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start',
        border: '0.5px solid var(--dsw-alias-state-warn-primary)',
        borderRadius: 12,
        padding: '10px 14px',
        marginBottom: 12,
        fontSize: 13,
        lineHeight: '20px',
        color: 'var(--dsw-alias-label-primary)',
        background: 'color-mix(in srgb, var(--dsw-alias-state-warn-primary) 8%, transparent)',
      }}
    >
      <span style={{ display: 'inline-flex', color: 'var(--dsw-alias-state-warn-primary)' }} aria-hidden="true">
        <IconWarningTriangleOutlineRegular size={15} />
      </span>
      <span>
        该会话创建于分支{' '}
        <b style={{ fontFamily: 'var(--ds-font-family-code, monospace)' }}>{bindBranch}</b>
        ，当前工作区已切换至{' '}
        <b style={{ fontFamily: 'var(--ds-font-family-code, monospace)' }}>{branch}</b>
        ——如非预期请切回（仅提示，不影响使用）。
      </span>
    </div>
  )
}

export interface StaleSelectionNoticeProps {
  /** 被删 worktree 名（banner 引述） */
  readonly worktreeName: string
  /** 一次性关闭（dismiss 后装配层不再渲染——一次性语义） */
  readonly onClose: () => void
}

/**
 * hero 选中树失效 notice banner（bug 4a30b193 UI 面——SealNotice 同款警告形态；
 * 选中自愈的呈现通道：选中态已被装配层切回主树，本 banner 只负责告知）。data 锚：
 * data-dswt-stale-selection-notice。
 */
export function StaleSelectionNotice({ worktreeName, onClose }: StaleSelectionNoticeProps): ReactNode {
  return (
    <div
      data-dswt-stale-selection-notice=""
      role="status"
      style={{
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start',
        border: '0.5px solid var(--dsw-alias-state-warn-primary)',
        borderRadius: 12,
        padding: '10px 14px',
        marginBottom: 12,
        fontSize: 13,
        lineHeight: '20px',
        color: 'var(--dsw-alias-label-primary)',
        background: 'color-mix(in srgb, var(--dsw-alias-state-warn-primary) 8%, transparent)',
      }}
    >
      <span style={{ display: 'inline-flex', color: 'var(--dsw-alias-state-warn-primary)' }} aria-hidden="true">
        <IconWarningTriangleOutlineRegular size={15} />
      </span>
      <span>
        选中的 worktree{' '}
        <b style={{ fontFamily: 'var(--ds-font-family-code, monospace)' }}>{worktreeName}</b>{' '}
        已不存在（可能已被删除），已切回主树。
      </span>
      <span
        role="button"
        aria-label="关闭提示"
        data-dswt-stale-selection-notice-close=""
        onClick={onClose}
        style={{
          marginLeft: 'auto',
          color: 'var(--dsw-alias-label-tertiary)',
          cursor: 'pointer',
          fontSize: 12,
          lineHeight: '20px',
        }}
      >
        ✕
      </span>
    </div>
  )
}

// ───────────── WorktreeFaces 尾段拆出（1.15 UI 迁入第二批）─────────────

/** 封存判定快照拉取相位（chip / overlay 两通道共享单源形状） */
export interface WorktreeSealPhase {
  readonly state: 'loading' | 'ready' | 'error'
  readonly isGit: boolean
  readonly sealed: boolean
  readonly branch: string | null
  readonly worktreeName: string | null
  /** branch 漂移（binding-derivation §2.2——实时 ≠ 留痕；null = 无漂移/不警示） */
  readonly branchDrift: { readonly bindBranch: string; readonly branch: string } | null
}

const sealEmpty: WorktreeSealPhase = {
  state: 'loading',
  isGit: false,
  sealed: false,
  branch: null,
  worktreeName: null,
  branchDrift: null,
}

/** 封存快照拉取（seal 通道单源——chip 失效态与 notice/占位两提示通道共读） */
export function useWorktreeSeal(sessionId: string | undefined, makeRpc: () => WorktreeFacesRpc): WorktreeSealPhase {
  const [phase, setPhase] = useState<WorktreeSealPhase>(sealEmpty)
  useEffect(() => {
    if (sessionId === undefined || sessionId === '') return
    let alive = true
    // 传输构造 throw-safe（fix-13——官方 web 无 preload 桥：makeRpc 构造即抛[fail-loud
    // 设计]；effect 同步抛 = 渲染树崩溃。构造失败降 error 相位——chip/notice 呈现缺省态，
    // 不炸宿主渲染树）。
    let client: WorktreeFacesRpc
    try {
      client = makeRpc()
    } catch {
      if (alive) setPhase({ state: 'error', isGit: false, sealed: false, branch: null, worktreeName: null, branchDrift: null })
      return
    }
    client
      .worktree.seal({ sessionId })
      .then((result) => {
        if (!alive) return
        setPhase({
          state: 'ready',
          isGit: result.isGit,
          sealed: result.sealed,
          branch: result.binding?.branch ?? null,
          worktreeName: result.worktreeName ?? null,
          branchDrift: result.branchDrift ?? null,
        })
      })
      .catch(() => {
        if (alive) setPhase({ state: 'error', isGit: false, sealed: false, branch: null, worktreeName: null, branchDrift: null })
      })
    return () => {
      alive = false
    }
  }, [sessionId, makeRpc])
  return phase
}

/** 一次性关闭记忆（会话粒度模块级集合——刷新即重置，官方一次性 notice 同刻度） */
const dismissedSealSessions = new Set<string>()

/** 官方 chat 列顶部锚（dsh-client-ui-chat 消息列容器——banner 置顶判定锚） */
const CHAT_FLOW_ANCHOR = '[data-chat-flow]'

/**
 * chat 列顶部 portal（bug ed28400a——官方缝核销：conversation/chat 两官方包全 renderSlot
 * 面无「会话头之下、chat-view 之上」槽位，取官方列容器 `data-chat-flow`（flex column）
 * 锚 + order:-1 置顶）。锚在场 = portal 呈现于消息列表之上（worktree chip 之下）；
 * 锚缺席（官方改版/非 chat 相位）= 回落调用方原位渲染（fail-soft 不丢失）。
 */
function ChatFlowTop({ children }: { readonly children: ReactNode }): ReactNode {
  const [target, setTarget] = useState<HTMLElement | null>(null)
  useEffect(() => {
    const find = (): void => setTarget(document.querySelector<HTMLElement>(CHAT_FLOW_ANCHOR))
    find()
    const observer = new MutationObserver(find)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => {
      observer.disconnect()
    }
  }, [])
  if (target === null) return <>{children}</>
  return createPortal(
    <div data-dswt-chat-flow-top="" style={{ order: -1, width: '100%' }}>
      {children}
    </div>,
    target,
    'dswf-chat-flow-top',
  )
}

/**
 * 封存提示 overlay（conversation.input.overlay 槽——composer 区官方缝，双通道并列）：
 * ① SealNotice（一次性——关闭后本会话不再呈现）；② SealedComposerPlaceholder（占位文案）。
 * 均提示性视觉；「不可发送」硬保证 = host 发送拦截面（interceptSessionSends）。
 * branch 漂移 warning banner 语义属会话绑定态——经 ChatFlowTop 呈现在 chat-view 顶部
 * （bug ed28400a），不再落 composer 区。
 */
export function ForgeWorktreeSealOverlay({
  sessionId,
  makeRpc = preloadRpcClientFactory,
}: {
  readonly sessionId?: string | undefined
  readonly makeRpc?: () => WorktreeFacesRpc
}): ReactNode {
  const phase = useWorktreeSeal(sessionId, makeRpc)
  const [dismissed, setDismissed] = useState(false)
  if (sessionId === undefined || !phase.isGit) return null
  const worktreeName = phase.worktreeName ?? ''
  return (
    <div style={{ display: 'flex', flexDirection: 'column', rowGap: 'var(--dsw-radius-sm)' }}>
      {/* branch 漂移 warning banner（binding-derivation §2.2——非阻断，切回即消失：判定随
          seal 渲染现算；与封存通道并列但语义独立；挂载位 = chat-view 顶部 portal） */}
      {phase.branchDrift !== null && (
        <ChatFlowTop>
          <BranchDriftNotice bindBranch={phase.branchDrift.bindBranch} branch={phase.branchDrift.branch} />
        </ChatFlowTop>
      )}
      {phase.sealed && (
        <>
          {!dismissed && !dismissedSealSessions.has(sessionId) && (
            <SealNotice
              worktreeName={worktreeName}
              onClose={() => {
                dismissedSealSessions.add(sessionId)
                setDismissed(true)
              }}
            />
          )}
          <SealedComposerPlaceholder />
        </>
      )}
    </div>
  )
}
