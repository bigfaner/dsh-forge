// host/types.ts —— typert 边界类型公共面（wire DTO 单一出口）：官方 typert 生成器
// 边界门要求 Remote 方法签名内的 workspace 类型自「public 非 root 子路径」导出
// （exports['./types']；根出口 '.' 不在 PUBLIC_REMOTE_TYPE_ROOTS 白名单）。
// 本文件仅类型再导出零实现（生成器 staging 以 ./src/types.ts 为取材面，tsc 门
// emitDeclarationOnly 产 dist/host/types.d.ts）。
export type { Result, Envelope, RemoteMethodError } from "../shared/result.js";
export type {
  AcProgress,
  TaskBoardDto,
  TaskCardDto,
  TaskDetailDto,
  TaskGraphDto,
  TasksFollowQuery,
  TasksQueryRequest,
  TasksRemoteAcSettlementsRequest,
  TasksRemoteDetailQuery,
  TasksRemoteFollowQuery,
  TasksRemoteGraphQuery,
  TasksRemoteListQuery,
  TasksRemoteQueryRequest,
  TasksRemoteSessionLinksQuery,
  TasksRemoteStatsQuery,
  TasksRemoteTransitionInput,
  TasksRemoteValidateInput,
} from "./assembly/typert-remotes.js";
export type { AcSettlementsAggregate } from "./domain/tasks/ac-match.js";
export type {
  ListTasksQuery,
  TaskGraph,
  TaskGraphEdge,
  TaskGraphQuery,
  TaskSettlementRow,
  TaskSettlementsQuery,
  TaskStats,
  TaskStatsQuery,
} from "./domain/tasks/list.js";
export type { TaskDetail, TaskDetailQuery, TaskDocRef } from "./domain/tasks/detail.js";
export type { QueryTaskResult } from "./domain/tasks/query.js";
export type { SessionLinksQuery } from "./domain/tasks/session-links.js";
export type { TransitionTaskInput } from "./domain/tasks/transition.js";
export type { ValidateContainerTasksInput, ValidateReport } from "./domain/tasks/validate.js";
export type {
  ContainerRef,
  SessionTaskLinkCard,
  TaskActor,
  TaskCard,
  TaskComplexity,
  TaskEdgeOrigin,
  TaskGateReport,
  TaskPrerequisiteSummary,
  TaskPriority,
  TaskRecordEntry,
  TaskRecordJsonValue,
  TaskRef,
  TaskScope,
  TaskSnapshot,
  TaskStatus,
  TaskType,
} from "./domain/tasks/types.js";
