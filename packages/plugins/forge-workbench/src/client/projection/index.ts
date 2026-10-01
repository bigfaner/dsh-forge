// client/projection — M4 任务 3.3 barrel:Interface 2 投影通道的 client relay
// (workspace-channel 声明 + snapshot-report 对账输入腿 + relay 执行/回填/重放)。
// 消费 3.2 落地的四动词面(retryProjection/getProjectionStatus/
// submitWorkspaceSnapshot/reportProjectionOutcome)与 projection_push_required
// 事件 —— 本模块不重声明内核侧类型(ipc-types 为 client 单源)。

export {
  WORKSPACE_REMOTE_KEY, workspaceChannelOf,
} from './workspace-channel'
export type {
  WorkspaceChannel, WorkspaceOpFailure, WorkspaceOpResult, WorkspaceRow,
} from './workspace-channel'

export {
  createSnapshotReporter, defaultProjectionRelayLog, PROJECTION_LOG_PREFIX,
  SNAPSHOT_REPORT_DEBOUNCE_MS, SNAPSHOT_SOURCE_POLL_MAX_TRIES, SNAPSHOT_SOURCE_POLL_MS,
  snapshotEntriesOf, WORKSPACES_SERVICE_KEY, workspacesSourceOf,
} from './snapshot-report'
export type {
  ProjectionRelayLog, SnapshotReporter, SnapshotReporterDeps, WorkspaceSnapshotSource,
} from './snapshot-report'

export {
  applyRegistryOrder, applyWorkspaceRow, canonicalOpsOf, createProjectionRelay,
  dropWorkspaceId, executeProjectionPlan, insertBeforeLinksOf, installProjectionRelay,
  PROJECTION_CHANNEL_UNAVAILABLE, RELAY_ARM_MAX_TRIES, RELAY_ARM_POLL_MS, WORKSPACE_NOT_FOUND,
} from './relay'
export type { PlanExecutionResult, ProjectionRelayDeps } from './relay'
