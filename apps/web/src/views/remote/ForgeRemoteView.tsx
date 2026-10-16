// 手机受限视图（定位：装配——mobile-remote-approval 1.3 独立单页，main.ts 受限入口分支
// 直挂 #root——不进官方壳：无侧栏/dock/对话）。两相位：未配对/数据面不可达 = 配对引导页
// （官方配对流承载——产品不自建配对协议，官方机械拦截未配对设备，本页只呈现引导）；配对
// 后 = 进度列表（数据 = forge:remote/progress 只读通道[1.1]，服务端直读 forgeTasks——
// 与桌面工作台同一状态层，零本地副本）。待审批项（blocked 带高亮置顶）排序/分组派生归
// remote-view-model 单源。1.4 审批面板：待审批行内嵌批准/拒绝动作，决策经 1.1 官方转发
// 通道 forge:remote/approval 上行（产品不自持审批状态），成功后触发进度重 poll——手机侧
// 与桌面工作台同读同一状态层（结果一致性单源）。暴露面边界（提案验收 6）：本页零会话对
// 话/知识库/文档入口——渲染面仅进度列表 + 审批动作，ForgeRemoteView.test 边界断言钉死。
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  PROJECTS_CHANNELS,
  REMOTE_CHANNELS,
  REMOTE_APPROVAL_DECISIONS,
  TASK_STATUS_LABELS,
  type ProjectSummary,
  type RemoteApprovalDecision,
  type RemoteProgressSnapshot,
  type RpcResult,
  type TaskStats,
} from '@dsh-forge/contracts'
import { StateChip } from '../../components/index.js'
import type { ForgeTransport } from '../../rpc/transport.js'
import {
  initialApprovalState,
  resetApproval,
  runApprovalDecision,
  type RemoteApprovalState,
} from './remote-approval-model.js'
import { remoteListRowsOf, mergeRemoteSnapshots, type RemoteListRow } from './remote-view-model.js'
import {
  initialRemoteFaceState,
  remoteFacePhaseOf,
  resolveRemoteTransport,
  type RemoteFaceState,
} from './remote-transport.js'
import './remote.css'

/**
 * fix-30 ④：受限视图进度快照装载（全项目聚合）——非 archived 项目逐个查 progress 后
 * mergeRemoteSnapshots 合并（数据层同一只读通道，零本地副本：只拼接不判读）。
 * Root cause: 原实现锚定 projects/list 首项为唯一 projectId——多项目场景查错库恒空。
 * projects/list 失败 = undefined（数据面不可达语义不变）；空项目集 = 零快照（空态呈现）。
 */
export async function loadRemoteSnapshot(transport: ForgeTransport): Promise<RemoteProgressSnapshot | undefined> {
  const raw = (await transport(PROJECTS_CHANNELS.list)) as RpcResult<ProjectSummary[]>
  if (raw === null || typeof raw !== 'object' || raw.ok !== true) return undefined
  const projects = (Array.isArray(raw.data) ? raw.data : []).filter((p) => p.archived !== true)
  const snapshots = await Promise.all(
    projects.map((p) => progressSnapshotOf(transport, p.id).catch(() => undefined)),
  )
  return mergeRemoteSnapshots(snapshots)
}

/** forge:remote/progress → 进度快照（通道/信封失败 = undefined——配对引导相位回退） */
async function progressSnapshotOf(
  transport: ForgeTransport,
  projectId: string,
): Promise<RemoteProgressSnapshot | undefined> {
  const raw = (await transport(REMOTE_CHANNELS.progress, { projectId })) as RpcResult<RemoteProgressSnapshot>
  if (raw === null || typeof raw !== 'object' || raw.ok !== true) return undefined
  return raw.data
}

/** 取受限视图传输面：传输选择单源 = remote-transport（注入 > preload[桌面] > fetch[手机]） */
function resolveTransport(injected?: ForgeTransport): ForgeTransport | undefined {
  return resolveRemoteTransport(injected)
}

/** 配对引导页（官方配对流承载——产品只呈现引导，不渲染任何受限内容） */
export function RemotePairingGuide({ lanAddress }: { readonly lanAddress?: string }): ReactNode {
  return (
    <main className="dswf-rview" role="main" aria-label="手机配对引导">
      <h1 className="dswf-rview-title">手机配对</h1>
      <ol className="dswf-rview-steps">
        <li>在桌面工作台左下角打开「手机远程」开关</li>
        <li>点击面板中的局域网地址完成复制</li>
        <li>用本机浏览器打开该地址，按官方配对流程完成认证</li>
      </ol>
      {lanAddress !== undefined && (
        <p className="dswf-rview-address">{lanAddress}</p>
      )}
      <p className="dswf-rview-note">未配对设备不可见任何内容；认证由官方远程接入承载。</p>
    </main>
  )
}

/**
 * 审批动作区（纯呈现面——三态反馈：idle 双动作 / submitting 冻结 / success·error 回显；
 * 态单源 = RemoteApprovalState，交互径归 RemoteApprovalActions）。
 */
export function RemoteApprovalActionsView({
  requestId,
  state,
  onDecide,
}: {
  readonly requestId: string
  readonly state: RemoteApprovalState
  readonly onDecide: (decision: RemoteApprovalDecision) => void
}): ReactNode {
  const frozen = state.phase === 'submitting'
  return (
    <div className="dswf-rview-appr" data-dswf-rv-approval={state.phase} data-dswf-rv-request={requestId}>
      {REMOTE_APPROVAL_DECISIONS.map((decision) => (
        <button
          key={decision}
          type="button"
          className={`dswf-rview-appr-btn dswf-rview-appr-btn--${decision}`}
          data-dswf-rv-decision={decision}
          disabled={frozen}
          onClick={() => onDecide(decision)}
        >
          {decision === 'allow' ? '批准' : '拒绝'}
        </button>
      ))}
      {state.phase === 'submitting' && (
        <span className="dswf-rview-appr-note" role="status">
          审批中…
        </span>
      )}
      {state.phase === 'success' && (
        <span className="dswf-rview-appr-note dswf-rview-appr-note--success" role="status">
          已提交
        </span>
      )}
      {state.phase === 'error' && (
        <span className="dswf-rview-appr-note dswf-rview-appr-note--error" role="alert">
          {state.message}
        </span>
      )}
    </div>
  )
}

/** 成功回显自动复位（settings savedFlash 同型——闪示后归 idle，不残留终态） */
const APPROVAL_SUCCESS_FLASH_MS = 1_500

/**
 * 审批动作区（交互装配面——决策经 1.1 官方转发通道 forge:remote/approval 上行，产品不
 * 自持审批状态；成功后回调 onDecided 触发进度重 poll——桌面工作台同一审批项状态同步）。
 * requestId = 审批转发载荷原样透传槽（本层取 blocked 任务 taskId——官方 ApprovalRequestId
 * 的映射归 host 转发器注入缝单点承接，1.1 缝口径不变）。
 */
export function RemoteApprovalActions({
  transport,
  requestId,
  onDecided,
}: {
  readonly transport: ForgeTransport
  readonly requestId: string
  readonly onDecided: () => void
}): ReactNode {
  const [state, setState] = useState<RemoteApprovalState>(initialApprovalState)
  useEffect(() => {
    if (state.phase !== 'success') return undefined
    const timer = window.setTimeout(() => setState(resetApproval), APPROVAL_SUCCESS_FLASH_MS)
    return () => window.clearTimeout(timer)
  }, [state.phase])
  const decide = (decision: RemoteApprovalDecision): void => {
    if (state.phase === 'submitting') return // 提交冻结：在途决策禁重复提交
    void runApprovalDecision(transport, requestId, decision, { onState: setState, onDecided })
  }
  return <RemoteApprovalActionsView requestId={requestId} state={state} onDecide={decide} />
}

/** 进度列表（待审批高亮置顶 + 进行中派发 + 其余；空态呈现；审批动作区经 render 缝注入） */
export function RemoteProgressList({
  rows,
  stats,
  renderApprovalActions,
}: {
  readonly rows: readonly RemoteListRow[]
  readonly stats: TaskStats
  /** 待审批行动作区注入缝（缺席 = 纯进度列表——1.3 形态不变） */
  readonly renderApprovalActions?: (row: RemoteListRow) => ReactNode
}): ReactNode {
  if (rows.length === 0) {
    return (
      <div className="dswf-rview-empty" role="status">
        暂无任务
      </div>
    )
  }
  return (
    <div className="dswf-rview-list" role="list" aria-label="任务进度">
      {rows.map((row) => (
        <div
          key={row.task.taskId}
          role="listitem"
          className={`dswf-rview-row dswf-rview-row--${row.band}`}
          data-band={row.band}
        >
          <div className="dswf-rview-row-head">
            <span className="dswf-rview-row-title">{row.task.title}</span>
            {row.band === 'approval' && <span className="dswf-rview-flag">待审批</span>}
          </div>
          <div className="dswf-rview-row-sub">
            <StateChip status={TASK_STATUS_LABELS[row.task.taskStatus].zh} className="dswf-rview-state" />
            <span className="dswf-rview-row-key">
              {row.task.slug}/{row.task.localId}
            </span>
          </div>
          {row.band === 'approval' && renderApprovalActions?.(row)}
        </div>
      ))}
      <p className="dswf-rview-count">
        共 {stats.total} 项
      </p>
    </div>
  )
}

/**
 * 受限单页本体（装配组件——数据自足：缺省 preload 传输面，15s 轮询 + 失败回引导相位；
 * 测试面注入 transport/lanAddress 直驱静态渲染。审批成功后 tick 自增即刻重 poll——
 * 桌面工作台同一状态层同读，结果一致反映）。
 */
export function ForgeRemoteView({
  transport,
  lanAddress,
}: {
  /** 传输面注入（测试/替身载体；生产 = preload 真身惰性解析） */
  readonly transport?: ForgeTransport
  /** 引导页地址行（缺省无地址行） */
  readonly lanAddress?: string
}): ReactNode {
  const resolved = useMemo(() => resolveTransport(transport), [transport])
  const [snapshot, setSnapshot] = useState<RemoteProgressSnapshot | undefined>(undefined)
  // fix-25 回退判定校准：数据面不可达的判据 = 传输失败重试后仍失败（remote-transport
  // 状态机单源）——connecting 相位不回退引导页（首请求竞态不闪引导），unreachable 才回退。
  const [face, setFace] = useState<RemoteFaceState>(initialRemoteFaceState)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (resolved === undefined) return undefined
    let alive = true
    const load = (): void => {
      void loadRemoteSnapshot(resolved)
        .then(
          (data) => {
            if (!alive) return
            setSnapshot(data)
            setFace((state) => remoteFacePhaseOf(state, data === undefined ? 'fail' : 'ok'))
          },
          () => {
            if (!alive) return
            setSnapshot(undefined)
            setFace((state) => remoteFacePhaseOf(state, 'fail'))
          },
        )
    }
    load()
    const timer = window.setInterval(load, 15_000)
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [resolved, tick])
  if (resolved === undefined || face.phase === 'unreachable') return <RemotePairingGuide lanAddress={lanAddress} />
  if (snapshot === undefined) {
    return (
      <main className="dswf-rview" role="status" aria-label="正在连接">
        <h1 className="dswf-rview-title">正在连接…</h1>
      </main>
    )
  }
  return (
    <main className="dswf-rview" role="main" aria-label="任务进度">
      <h1 className="dswf-rview-title">任务进度</h1>
      <RemoteProgressList
        rows={remoteListRowsOf(snapshot)}
        stats={snapshot.stats}
        renderApprovalActions={(row) =>
          resolved !== undefined ? (
            <RemoteApprovalActions
              transport={resolved}
              requestId={row.task.taskId}
              onDecided={() => setTick((value) => value + 1)}
            />
          ) : undefined
        }
      />
    </main>
  )
}
