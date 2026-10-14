// 手机受限视图（定位：装配——mobile-remote-approval 1.3 独立单页，main.ts 受限入口分支
// 直挂 #root——不进官方壳：无侧栏/dock/对话）。两相位：未配对/数据面不可达 = 配对引导页
// （官方配对流承载——产品不自建配对协议，官方机械拦截未配对设备，本页只呈现引导）；配对
// 后 = 进度列表（数据 = forge:remote/progress 只读通道[1.1]，服务端直读 forgeTasks——
// 与桌面工作台同一状态层，零本地副本）。待审批项（blocked 带高亮置顶）排序/分组派生归
// remote-view-model 单源。暴露面边界（提案验收 6）：本页零会话对话/知识库/文档入口——
// 渲染面仅进度列表，ForgeRemoteView.test 边界断言钉死。
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  PROJECTS_CHANNELS,
  REMOTE_CHANNELS,
  TASK_STATUS_LABELS,
  type ProjectSummary,
  type RemoteProgressSnapshot,
  type RpcResult,
  type TaskStats,
} from '@dsh-forge/contracts'
import { StateChip } from '../../components/index.js'
import type { ForgeTransport } from '../../rpc/transport.js'
import { remoteListRowsOf, type RemoteListRow } from './remote-view-model.js'
import './remote.css'

/** forge:projects/list → 首个项目（受限视图上下文项目——单工作区产品形态；无项目 = undefined） */
async function firstProjectOf(transport: ForgeTransport): Promise<ProjectSummary | undefined> {
  const raw = (await transport(PROJECTS_CHANNELS.list)) as RpcResult<ProjectSummary[]>
  if (raw === null || typeof raw !== 'object' || raw.ok !== true) return undefined
  return raw.data[0]
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

/** 取受限视图传输面：注入优先；缺省 preload 真身（缺席 = undefined → 引导相位，不炸单页） */
function resolveTransport(injected?: ForgeTransport): ForgeTransport | undefined {
  if (injected !== undefined) return injected
  try {
    // 惰性引入面（bundle 已同包——直接 import 会在非 Electron 载体构造期抛，此处延迟到调用期）
    return preloadTransportSafe()
  } catch {
    return undefined
  }
}

function preloadTransportSafe(): ForgeTransport {
  const bridge = (globalThis as { dshForge?: { invoke(channel: string, payload?: unknown): Promise<unknown> } })
    .dshForge
  if (bridge === undefined || typeof bridge.invoke !== 'function') {
    throw new Error('dsh-forge web: window.dshForge.invoke 缺席——受限页传输面不可达（官方配对流未放行）')
  }
  return (channel, payload) => bridge.invoke(channel, payload)
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

/** 进度列表（待审批高亮置顶 + 进行中派发 + 其余；空态呈现） */
export function RemoteProgressList({
  rows,
  stats,
}: {
  readonly rows: readonly RemoteListRow[]
  readonly stats: TaskStats
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
 * 测试面注入 transport/lanAddress 直驱静态渲染）。
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
  useEffect(() => {
    if (resolved === undefined) return undefined
    let alive = true
    const load = (): void => {
      void firstProjectOf(resolved)
        .then((project) => (project === undefined ? undefined : progressSnapshotOf(resolved, project.id)))
        .then(
          (data) => {
            if (alive) setSnapshot(data)
          },
          () => {
            if (alive) setSnapshot(undefined)
          },
        )
    }
    load()
    const timer = window.setInterval(load, 15_000)
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [resolved])
  if (snapshot === undefined) return <RemotePairingGuide lanAddress={lanAddress} />
  return (
    <main className="dswf-rview" role="main" aria-label="任务进度">
      <h1 className="dswf-rview-title">任务进度</h1>
      <RemoteProgressList rows={remoteListRowsOf(snapshot)} stats={snapshot.stats} />
    </main>
  )
}
