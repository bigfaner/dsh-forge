// workbench/projection/plan — 投影 plan 组装纯函数(任务 3.1)。
//
// 本域为纯函数内核(零 IPC/零 fs/零 relay):动词接线归 3.2,relay 执行归
// 3.3,生命周期 hook 归 3.4。类型基准 = tech-design §Interfaces·Interface 1
// v3 动词块(ProjectionOp/ProjectionPlan——本文件为其内核侧唯一权威声明,
// indexer/diff.ts 的事件面自此 re-export,不改双份漂移)与 Interface 2
// (执行序:ensure(sort_order 升序)→ rename → reorder(insertBefore 链)→
// delete;幂等全量重推)。
//
// 语义要点(ER §workspace_projection + PRD 必答④):
//   - ensure = 上游 create(path, title) 的 create-or-adopt 语义
//     (vendored workspace-controller:create = "Create or idempotently resolve
//     one Workspace over an existing directory"):无 workspace → 新建;同
//     path 已有 → 幂等收养。dsh 侧删除重建后按 path 复连 = 期望 id 与实况
//     id 不一致时出 ensure op,成功回写刷新 workspace_id(er-diagram:path
//     冗余 anchor 的存在理由)。
//   - reorder 仅 forge 所属子集相对序(orderedIds = 匹配实况的 active 项目
//     workspace,按 sort_order 期望序),insertBefore 链构造归 3.3 relay;
//     用户自有 workspace 永不出现在 orderedIds 中(单向纪律:不动用户数据)。
//   - plan 自包含:reorder op(子集序漂移时)随每个 plan 携带 —— 任一单
//     plan 的幂等全量重推即收敛全部期望状态(retryProjection 语义),重复
//     执行无副作用(幂等)。
//   - 归档(archived=1)零 op:期望不变(workspace 保留,必答⑤),不参与
//     ensure/rename/reorder 任何派生。

import { toComparableKey } from '../projects-identity/normalize.ts'

// ---------------------------------------------------------------------------
// 数据形态(Interface 1 v3 动词块 + snapshot 入参契约)
// ---------------------------------------------------------------------------

/** 投影四操作(Interface 1 ProjectionOp;仅 forge 所属子集相对序)。 */
export type ProjectionOp =
  | { readonly kind: 'ensure'; readonly canonicalPath: string; readonly title: string }
  | { readonly kind: 'rename'; readonly workspaceId: string; readonly title: string }
  | { readonly kind: 'delete'; readonly workspaceId: string }
  | { readonly kind: 'reorder'; readonly orderedIds: readonly string[] }

/** 一个项目的投影期望 plan(幂等全量重推;偏差 = diff 实况,明细不落表)。 */
export interface ProjectionPlan {
  readonly projectId: string
  readonly ops: readonly ProjectionOp[]
}

/** client 上报的 workspace 实况条目(Interface 1 submitWorkspaceSnapshot 入参元素)。 */
export interface WorkspaceSnapshotEntry {
  readonly workspaceId: string
  readonly path: string
  readonly title: string
  readonly orderIdx: number
}

/** workspace 实况快照(null = 实况未知:收数前/relay 未上报)。 */
export type WorkspaceSnapshotInput = readonly WorkspaceSnapshotEntry[] | null

/**
 * 投影期望(workspace_projection ∪ projects 的并集形态;expectation-repo
 * listProjectionExpectations 的产出,也是 diff/plan 的统一输入):
 * projects 侧为权威期望(path/expectedTitle/orderIdx/archived),
 * workspace_projection 侧为最近成功 push 审计(pushed*)。
 */
export interface ProjectionExpectation {
  readonly projectId: string
  /** 期望投影路径(= anchor canonical;ensure 定位/复连键)。 */
  readonly path: string
  /** 当前权威期望名(= projects.display_name;rename op 目标)。 */
  readonly expectedTitle: string
  /** 期望序(= projects.sort_order;forge 侧顺序权威,注册序)。 */
  readonly orderIdx: number
  /** 归档位(归档 ≠ 删除:期望不变,diff 零 op,必答⑤)。 */
  readonly archived: boolean
  /** 最近成功投影的 dsh WorkspaceId(占位/未推送 = null)。 */
  readonly pushedWorkspaceId: string | null
  /** 最近成功 title(改名偏差 diff 基线;无行回退 expectedTitle)。 */
  readonly pushedTitle: string | null
  /** 最近成功 push 时间(ISO 8601 审计位;未推送 = null)。 */
  readonly pushedAt: string | null
  /** degraded 原因(上游错误码映射;健康 = null)。 */
  readonly lastError: string | null
}

// ---------------------------------------------------------------------------
// 匹配(纯函数;path 折叠键与 projects-identity 应用层单源同口径)
// ---------------------------------------------------------------------------

/** path 匹配键(toComparableKey 单源复用:正斜杠归一 + win32 折叠)。 */
export function workspacePathKey(path: string): string {
  return toComparableKey(path)
}

/** 实况快照内按期望 path 定位 workspace(ensure 定位键;首个命中即匹配)。 */
export function matchByPath(exp: ProjectionExpectation, snapshot: WorkspaceSnapshotInput): WorkspaceSnapshotEntry | null {
  if (snapshot === null) return null
  const key = workspacePathKey(exp.path)
  for (const entry of snapshot) {
    if (workspacePathKey(entry.path) === key) return entry
  }
  return null
}

// ---------------------------------------------------------------------------
// plan 组装(执行序:ensure → rename → reorder → delete)
// ---------------------------------------------------------------------------

/**
 * 单项目收敛 ops(ensure?→ rename?):dsh 侧删除重建(path 命中但 id ≠
 * 期望)出 ensure 复连,必要时补 rename(create 收养不改既有 title);未
 * 命中出 ensure 新建;title ≠ 权威期望名出 rename(forge 改名待推与 dsh
 * 侧手改都由同一 op 收敛 —— 方向恒为 期望 → 实况,永不反向)。
 */
export function planOpsForExpectation(exp: ProjectionExpectation, match: WorkspaceSnapshotEntry | null): ProjectionOp[] {
  const ops: ProjectionOp[] = []
  const needsEnsure = match === null
    || (exp.pushedWorkspaceId !== null && match.workspaceId !== exp.pushedWorkspaceId)
  if (needsEnsure) {
    ops.push({ kind: 'ensure', canonicalPath: exp.path, title: exp.expectedTitle })
  }
  if (match !== null && match.title !== exp.expectedTitle) {
    ops.push({ kind: 'rename', workspaceId: match.workspaceId, title: exp.expectedTitle })
  }
  return ops
}

/** active(未归档)期望按 forge 侧顺序权威排序(sort_order 升序,projectId 稳定并列)。 */
export function activeExpectationsInOrder(exps: readonly ProjectionExpectation[]): ProjectionExpectation[] {
  return exps
    .filter(exp => !exp.archived)
    .slice()
    .sort((a, b) => (a.orderIdx - b.orderIdx) || (a.projectId < b.projectId ? -1 : 1))
}

/**
 * reorder op(仅 forge 所属子集相对序):全部「实况已命中」的 active 项目
 * workspace 按期望序排列;实况相对序已一致(或命中数 < 2)→ null(零 op,
 * 不动用户自有 workspace)。orderedIds 不含未命中/归档项目的 workspace。
 */
export function buildReorderOp(exps: readonly ProjectionExpectation[], snapshot: WorkspaceSnapshotInput): ProjectionOp | null {
  if (snapshot === null) return null
  const matched = activeExpectationsInOrder(exps)
    .map(exp => ({ exp, match: matchByPath(exp, snapshot) }))
    .filter((entry): entry is { exp: ProjectionExpectation; match: WorkspaceSnapshotEntry } => entry.match !== null)
  if (matched.length < 2) return null
  const expectedOrder = matched.map(entry => entry.match.workspaceId)
  const actualOrder = matched
    .slice()
    .sort((a, b) => (a.match.orderIdx - b.match.orderIdx) || (a.match.workspaceId < b.match.workspaceId ? -1 : 1))
    .map(entry => entry.match.workspaceId)
  if (expectedOrder.join('\u0000') === actualOrder.join('\u0000')) return null
  return { kind: 'reorder', orderedIds: expectedOrder }
}

/**
 * 单项目幂等全量重推 plan(3.4 生命周期 hook / 3.2 retryProjection 消费):
 * [ensure?→ rename?] + 子集序漂移时的 reorder(自包含全量重推 —— 单 plan
 * 执行即收敛该项目的全部期望状态,含 forge 子集相对序)。归档项目 = 零 op
 * (必答⑤:workspace 保留,dsh 侧不动)。未知 projectId → Error。
 */
export function buildProjectionPlan(
  expectations: readonly ProjectionExpectation[],
  snapshot: WorkspaceSnapshotInput,
  projectId: string,
): ProjectionPlan {
  const exp = expectations.find(entry => entry.projectId === projectId)
  if (exp === undefined) {
    throw new Error(`projection plan: unknown project ${projectId} (expectation absent from inputs)`)
  }
  if (exp.archived) return { projectId, ops: [] }
  const ops = planOpsForExpectation(exp, matchByPath(exp, snapshot))
  const reorder = buildReorderOp(expectations, snapshot)
  if (reorder !== null) ops.push(reorder)
  return { projectId, ops }
}

/**
 * 移除 plan(单 delete op;3.4 removeProject 语义扩展的 hook 输入):
 * workspaceId 取「实况 path 命中(复连安全)→ 期望 pushedWorkspaceId」回退;
 * 两者皆无(从未成功投影且实况未命中/未知)→ 空 ops(dsh 侧本无物可删)。
 */
export function buildRemovalPlan(exp: ProjectionExpectation, snapshot: WorkspaceSnapshotInput): ProjectionPlan {
  const match = matchByPath(exp, snapshot)
  const workspaceId = match?.workspaceId ?? exp.pushedWorkspaceId
  if (workspaceId === null || workspaceId === undefined) return { projectId: exp.projectId, ops: [] }
  return { projectId: exp.projectId, ops: [{ kind: 'delete', workspaceId }] }
}
