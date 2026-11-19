// host/types.ts —— typert 边界类型公共面（wire DTO 单一出口）：官方 typert 生成器边界
// 门要求 @Remote 方法签名内的 workspace 类型自「public 非 root 子路径」导出
//（exports['./types']；根出口 '.' 不在 PUBLIC_REMOTE_TYPE_ROOTS 白名单）。
// 本文件仅类型再导出零实现（生成器 staging 以 ./src/types.ts 为取材面，tsc 门
// emitDeclarationOnly 产 dist/host/types.d.ts——task-loop 同型正本）。
export type { Result, Envelope, RemoteMethodError } from "../shared/result.js";
export type { SpecStatus, TransitionActor, SpecRow } from "./db/row-types.js";
export type {
  GoalRow,
  EntityTransitionRow,
  MilestoneRow,
  RoadmapRow,
} from "./db/row-types.js";
export type { GoalStatus } from "./domain/status-machines.js";
export type { MoveMilestoneResult } from "./domain/specs/milestone-service.js";
export type {
  AcProjectionDto,
  SpecBoardDto,
  SpecBoardStats,
  SpecCardDto,
  SpecDetailDto,
  SpecQueryInclude,
  SpecQueryResultDto,
  SpecSnapshot,
  SpecTransitionDto,
} from "./assembly/typert-remotes.js";
export type {
  GoalBadgeDto,
  GoalBoardDto,
  GoalBoardEntryDto,
  GoalReviewMutateAction,
  GoalSnapshot,
  RoadmapDetailDto,
  RoadmapMutateAction,
  RoadmapMutateSnapshot,
  RoadmapSnapshot,
} from "./assembly/typert-remotes.js";
export type { AcProjectionRow, AcProjectionState } from "./tools/projection.js";
