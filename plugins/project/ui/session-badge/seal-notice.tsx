// session-badge —— 封存三通道提示（均提示性视觉，「不可发送」硬保证在 host 发送拦截
// 面，UI 不做硬禁用——官方 composer 无禁用 API）：
// ① SealNotice——一次性 notice banner，紧贴会话头分界线置顶（官方 notice 形态）；
// ② SealedComposerPlaceholder——composer 占位文案（提示性）；
// ③ chip 失效态见 ./chip.tsx（sealed 变体）。
// WorktreeFaces 尾段拆出件亦在本文件：seal 快照单源（WorktreeSealPhase + useWorktreeSeal
// ——chip 失效态与 notice/占位两提示通道共读）+ chat 列顶部 portal（ChatFlowTop）+
// 封存 overlay 挂载面 ForgeWorktreeSealOverlay + branch 漂移 banner。
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { WorktreeSealResult } from '@dsh-forge/lib-api/dto/worktree'
import { IconWarningTriangleOutlineRegular } from '../icons.js'
import {
  createForgeRpcClient,
  forgeRemoteMountSettled,
  waitForRemoteMountSettled,
  type WorktreeFacesRpc,
} from '../rpc.js'

export interface SealNoticeProps {
  /** 被删 worktree 名（banner 引述） */
  readonly worktreeName: string
  /** 一次性关闭（dismiss 后装配层不再渲染——一次性语义） */
  readonly onClose: () => void
}

/** 警告 banner 共享样式（三通道同款形态——borderTop/radius 差异各件覆写） */
const noticeBannerBase: CSSProperties = {
  display: 'flex',
  gap: 10,
  alignItems: 'flex-start',
  border: '0.5px solid var(--dsw-alias-state-warn-primary)',
  padding: '10px 14px',
  marginBottom: 12,
  fontSize: 13,
  lineHeight: '20px',
  color: 'var(--dsw-alias-label-primary)',
  background: 'color-mix(in srgb, var(--dsw-alias-state-warn-primary) 8%, transparent)',
}
const noticeIconStyle: CSSProperties = { display: 'inline-flex', color: 'var(--dsw-alias-state-warn-primary)' }
const noticeCloseStyle: CSSProperties = {
  marginLeft: 'auto',
  color: 'var(--dsw-alias-label-tertiary)',
  cursor: 'pointer',
  fontSize: 12,
  lineHeight: '20px',
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
      style={{ ...noticeBannerBase, borderTop: 'none', borderRadius: '0 0 12px 12px' }}
    >
      <span style={noticeIconStyle} aria-hidden="true">
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
        style={noticeCloseStyle}
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
      style={{ ...noticeBannerBase, borderRadius: 12 }}
    >
      <span style={noticeIconStyle} aria-hidden="true">
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
      style={{ ...noticeBannerBase, borderRadius: 12 }}
    >
      <span style={noticeIconStyle} aria-hidden="true">
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
        style={noticeCloseStyle}
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
  /** follow 流活性（1.38——false = 流中断保投影；首帧前 loading 不区分） */
  readonly live: boolean
}

const sealEmpty: WorktreeSealPhase = {
  state: 'loading',
  isGit: false,
  sealed: false,
  branch: null,
  worktreeName: null,
  branchDrift: null,
  live: true,
}

const sealError: WorktreeSealPhase = {
  state: 'error',
  isGit: false,
  sealed: false,
  branch: null,
  worktreeName: null,
  branchDrift: null,
  live: false,
}

/**
 * 贡献卸载 abort 分类（bug 99951e7b R3 定谳——rootcause-typert-cluster §三）：官方
 * mountContribution/installNamespace 撤销链对在途流逐方法 `token.abort.abort()`
 * （无 reason）→ 在途消费面收 `AbortError` / `signal is aborted without reason`。
 * 该族失败 = 贡献卸载静默终态（非通道故障），不进失败路径告警。
 */
export function isContributionUnloadAbort(cause: unknown): boolean {
  const name = (cause as { name?: unknown } | null | undefined)?.name
  if (name === 'AbortError') return true
  const message = cause instanceof Error ? cause.message : String(cause)
  return message.includes('signal is aborted without reason')
}

/** seal 快照帧 → 相位投影（followSeal 流与 unary 首帧共用单源映射） */
function phaseOf(result: WorktreeSealResult): WorktreeSealPhase {
  return {
    state: 'ready',
    isGit: result.isGit,
    sealed: result.sealed,
    branch: result.binding?.branch ?? null,
    worktreeName: result.worktreeName ?? null,
    branchDrift: result.branchDrift ?? null,
    live: true,
  }
}

/**
 * 封存快照 follow（1.38 AC②——mode:'stream' 推流化，替代一次性拉取）：首帧 = baseline，
 * 后随 host 快照变化逐帧增量（快照钩）；流中断 = 保留最后完整投影（live:false，不回
 * loading——官方 RemoteSnapshotStream 断线保投影同刻度）。chip 失效态与 notice/占位两
 * 提示通道共读本单源。
 */
export function useWorktreeSeal(sessionId: string | undefined, makeRpc: () => WorktreeFacesRpc): WorktreeSealPhase {
  const [phase, setPhase] = useState<WorktreeSealPhase>(sealEmpty)
  useEffect(() => {
    if (sessionId === undefined || sessionId === '') return
    let alive = true
    let seen = false
    // 传输构造 throw-safe（fix-13 同径——makeRpc 构造即抛[fail-loud 设计]；effect 同步抛
    // = 渲染树崩溃。构造失败降 error 相位——chip/notice 呈现缺省态，不炸宿主渲染树）。
    let client: WorktreeFacesRpc
    try {
      client = makeRpc()
    } catch {
      if (alive) setPhase(sealError)
      return
    }
    void (async (): Promise<void> => {
      // 单次消费（首帧 baseline + 增量帧；返回 true = 已投影或已到终态，false = 首帧前失败）
      const consume = async (): Promise<boolean> => {
        const follow = client.worktree.followSeal
        if (follow === undefined) {
          // 壳侧 legacy transport 面（followSeal 缺席）——退 unary seal 快照单帧（现状语义）
          try {
            const frame = await client.worktree.seal({ sessionId })
            if (alive) setPhase(phaseOf(frame))
            return true
          } catch {
            if (alive) setPhase(sealError)
            return false
          }
        }
        try {
          for await (const frame of follow.call(client.worktree, { sessionId })) {
            if (!alive) return true
            seen = true
            setPhase(phaseOf(frame))
          }
          // 流自然终止（host 侧撤销/停机）——保投影标 live:false，不静默
          if (alive && seen) setPhase((prev) => (prev.state === 'ready' ? { ...prev, live: false } : prev))
          return true
        } catch (cause) {
          // 贡献卸载 abort 分类（isContributionUnloadAbort——非通道故障）：静默终态不告警。
          // 已投影 = 保投影标 live:false（同流自然终止刻度）；首帧前 = 挂起不消（卸载竞速
          // 不落 error 相位不落 warn/error）。
          if (isContributionUnloadAbort(cause)) {
            if (alive && seen) setPhase((prev) => (prev.state === 'ready' ? { ...prev, live: false } : prev))
            return true
          }
          // 首帧前失败 = 通道不可用（error 相位）；已投影 = 保投影（fail-soft 不丢态）
          console.warn('[dsh-forge/project] followSeal stream failed', cause)
          if (alive && !seen) setPhase(sealError)
          if (alive && seen) setPhase((prev) => (prev.state === 'ready' ? { ...prev, live: false } : prev))
          return seen
        }
      }
      const projected = await consume()
      // 首帧前失败且 mount 未落座（评审 L 粘滞降级缝——installForgeRemoteFace 子纤维激活前
      // 的首拉必失败且 effect 依赖不含 mount 状态）＝装配时序竞速窗口，非真缺席：等 mount
      // 落座后重取一次（waitForRemoteMountSettled——订阅页内 mount 终态锚，禁自造轮询）。
      // 落座后的失败保持原降级语义（error 相位），不无限重试。
      if (alive && !projected && !forgeRemoteMountSettled()) {
        await waitForRemoteMountSettled()
        if (alive) await consume()
      }
    })()
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
  makeRpc = createForgeRpcClient,
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
