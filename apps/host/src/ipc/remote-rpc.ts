// forge:remote/* 通道注册（mobile-remote-approval 1.1——bugs-rpc.ts 同径：通道常量/注册/
// 装配三处一体：contracts → web/rpc → host ipc）。通道名仅出自 @dsh-forge/contracts
// REMOTE_CHANNELS。面分治：progress = 远程只读进度读面（复用既有 forge 只读 rpc 口径——
// 直读 forgeTasks listTasks/taskStats，零本地副本零新查询机械）；approval = 审批动作转发
// （产品不自持审批状态，官方 user-approval 面经桥转发——转发器缺席 = fail-soft
// unavailable，remote.session 先例同型；通道层零认证逻辑，暴露策略归官方配对）。
import {
  REMOTE_CHANNELS,
  type ForgeTasksService,
  type RemoteApprovalDecisionInput,
  type RemoteApprovalForwardResult,
  type RemoteDisconnectResult,
  type RemoteProgressQuery,
  type RemoteProgressSnapshot,
} from '@dsh-forge/contracts'
import type { ForgeIpc } from './forge-channels.js'
import { rpcEnvelope } from './rpc-envelope.js'

/** 注入服务面 = RPC 读法二（listTasks/taskStats——progress 复用的既有只读口径） */
export type RemoteChannelService = Pick<ForgeTasksService, 'listTasks' | 'taskStats'>

/** 审批转发器注入缝（官方 user-approval 桥接面——缺席 = fail-soft unavailable；后续任务接线） */
export type RemoteApprovalForwarder = (
  input: RemoteApprovalDecisionInput,
) => Promise<RemoteApprovalForwardResult>

/** 会话撤销缝（fix-10 断开连接——boot handle clearRemoteDeviceConnected；缺席 = fail-soft revoked:false） */
export type RemoteSessionRevoker = () => Promise<void>

/** 通道注册（负载映射 = contracts RemoteChannelRequests/Responses，键键对应） */
export function registerRemoteChannels(
  ipc: ForgeIpc,
  service: RemoteChannelService,
  forwardApproval?: RemoteApprovalForwarder,
  revokeSession?: RemoteSessionRevoker,
): void {
  ipc.register(
    REMOTE_CHANNELS.progress,
    rpcEnvelope(async (q: RemoteProgressQuery): Promise<RemoteProgressSnapshot> => {
      const [tasks, stats] = await Promise.all([
        service.listTasks({ projectId: q.projectId, statusFilter: q.statusFilter, sort: 'active' }),
        service.taskStats({ projectId: q.projectId }),
      ])
      return { tasks, stats }
    }),
  )
  ipc.register(
    REMOTE_CHANNELS.approval,
    rpcEnvelope((input: RemoteApprovalDecisionInput): Promise<RemoteApprovalForwardResult> =>
      forwardApproval !== undefined
        ? forwardApproval(input)
        : Promise.resolve({ forwarded: false, reason: 'unavailable' }),
    ),
  )
  // fix-10 断开连接（官方锚 :1176 outline 钮——connected 粘性位收回；缝缺席 fail-soft）
  ipc.register(
    REMOTE_CHANNELS.disconnect,
    rpcEnvelope(async (): Promise<RemoteDisconnectResult> => {
      if (revokeSession === undefined) return { revoked: false }
      await revokeSession()
      return { revoked: true }
    }),
  )
}
