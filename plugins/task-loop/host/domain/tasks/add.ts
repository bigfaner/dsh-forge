// addTask / batchAddTasks——任务域写动词（core forge/tasks/add.ts 直迁——plugin-task-loop
// 1.7 内联 + 容器语义 slug 化改造，code-design §1）。
//
// 容器语义 slug 化改造面（source_kind/source_id/mode 退役）：
//   · 容器 = slug 本身（通用执行容器，project_key 内唯一——uq_task_tasks_project_slug_local）；
//     无容器主表 → 容器在场校验退役（弱引用）。
//   · fix 判别单源化（圆桌处方 5）：fix_of_task_id 列 + isFixTask 单源谓词；addTask 拒裸
//     `fix-%` 前缀容器 slug（ERR_CONTAINER_SLUG_INVALID）。
//   · 任务级去重判据（判例 fix-11 硬约束——禁回退旧判据）：同源同型（fix_of_task_id + task_type）
//     且未终态 + brief 相等 + context 键序无关规范化相等——四判据合取，异内容第二单正常建行。
//   · batchAddTasks（修订裁决 10）：dry-run 收集制全量校验器零 db 写点 → 全过后整批单事务
//     两遍式落库（①全量 INSERT → ②同事务连 task_edges + fix 链派生）；批内 dependsOn/before
//     互引解析为批内 localId；校验失败零落库、落库中途失败全批回滚零残留。
//   · 相位域随 features 表退役：相位守卫/重算整体摘除。
//
// 单事务全成全败（Hard Rule）：task_tasks 行 → task_edges 行 → task_records 行，任一步拒绝
// 整体回滚零残留；闭包尾部（提交后）emitTasksChanged。一律 prepared statements。
// actor 由通道推断：addTask/batchAddTasks = tool 专属动词，add 记录 actor 恒 'plugin-tool'；
// auto-block = 写路径内聚的系统效果，actor 'core'。
import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { TaskStatus } from "@dsh-forge/contracts";
import { BEFORE_SUCCESSOR_ALLOWED_STATUSES, FIX_CHAIN_DEPTH_LIMIT } from "@dsh-forge/contracts";
import { withTransaction } from "@dsh-forge/lib-db";
import {
  BeforeSuccessorInvalidError,
  BlockSourceInProgressError,
  BlockSourceRequiredError,
  BlockSourceTerminalError,
  BatchInvalidError,
  ChainDepthExceededError,
  ContainerSlugInvalidError,
  CycleDetectedError,
  TaskExistsError,
  TaskNotFoundError,
  isUniqueViolation,
  type BatchItemError,
} from "./errors.js";
export type { BatchItemError, BatchInvalidData } from "./errors.js";
import type { TaskScope, TaskType, TasksVerbDeps } from "./types.js";

export { isUniqueViolation };

/** 容器 slug 形制守卫：裸 `fix-%` 前缀拒收（fix 判别单源化——slug 前缀冒用即身份歧义） */
export function assertContainerSlugAllowed(slug: string): void {
  if (slug.startsWith("fix-")) {
    throw new ContainerSlugInvalidError({ projectKey: "", slug });
  }
}

/** 任务行最小定位形状（解析/去重/链计数消费；全列读面归 query/读动词） */
export interface TaskKeyRow {
  id: string;
  slug: string;
  local_id: string;
  task_status: TaskStatus;
  task_type: TaskType;
  fix_of_task_id: string | null;
}

const TASK_KEY_COLUMNS = `id, slug, local_id, task_status, task_type, fix_of_task_id`;

/** 语义等价判据（slug 化终态）：同容器 = slug 相等（project_key 谓词由查询承载） */
export function sameContainer(row: Pick<TaskKeyRow, "slug">, slug: string): boolean {
  return row.slug === slug;
}

/** context_json 规范形（键序无关——存储串/输入串两侧统一按键序排序后比较；null/非法串 → 原样区分） */
export function canonicalContext(contextJson: string | null): string | null {
  if (contextJson === null) return null;
  try {
    return JSON.stringify(sortKeys(JSON.parse(contextJson) as unknown));
  } catch {
    return contextJson;
  }
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((k) => [k, sortKeys((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
}

/** 自然键复合呈现（'slug/localId'——dispatchPrompt TASK_ID / 环路径节点同口径） */
export function naturalKey(slug: string, localId: string): string {
  return `${slug}/${localId}`;
}

/**
 * localId 混合分配：常规任务数值顺延（max(major, minor) 的 minor + 1，如 2.7 → 2.8；
 * 空库起点 1.1）+ 动态追加语义前缀 fix-N / disc-N（max(existing prefix-N) + 1）。
 * 计数作用域 = project_key + slug（uq_task_tasks_project_slug_local 同容器键空间）。
 */
export function allocateLocalId(
  db: Database.Database,
  projectKey: string,
  slug: string,
  prefix: "numeric" | "fix" | "disc",
): string {
  const rows = db
    .prepare<unknown[], { local_id: string }>(
      `SELECT local_id FROM task_tasks WHERE project_key = ? AND slug = ?`,
    )
    .all(projectKey, slug);
  if (prefix === "numeric") {
    let maxMajor = 0;
    let maxMinor = 0;
    let seen = false;
    for (const { local_id } of rows) {
      const m = /^(\d+)(?:\.(\d+))?$/.exec(local_id);
      if (m === null) continue;
      const major = Number(m[1]);
      const minor = m[2] === undefined ? 0 : Number(m[2]);
      if (!seen || major > maxMajor || (major === maxMajor && minor > maxMinor)) {
        seen = true;
        maxMajor = major;
        maxMinor = minor;
      }
    }
    return seen ? `${maxMajor}.${maxMinor + 1}` : "1.1";
  }
  const head = `${prefix}-`;
  let maxN = 0;
  for (const { local_id } of rows) {
    if (!local_id.startsWith(head)) continue;
    const rest = local_id.slice(head.length);
    if (/^\d+$/.test(rest)) maxN = Math.max(maxN, Number(rest));
  }
  return `${head}${maxN + 1}`;
}

/**
 * 可达性 DFS（新边 (S←T)+(T←D) 成环 ⟺ D 经既有出边可达 S）。出边方向 =
 * (task_id=等待方 → prerequisite_id=前置方)。命中返回路径 [from, …, target]。
 */
export function findPathThroughOutEdges(db: Database.Database, fromId: string, targetId: string): string[] | null {
  const next = db.prepare<unknown[], { prerequisite_id: string }>(
    `SELECT prerequisite_id FROM task_edges WHERE task_id = ?`,
  );
  const parent = new Map<string, string>();
  const visited = new Set<string>([fromId]);
  const stack: string[] = [fromId];
  while (stack.length > 0) {
    const cur = stack.pop() as string;
    if (cur === targetId) {
      const path: string[] = [];
      let node: string | undefined = cur;
      while (node !== undefined) {
        path.unshift(node);
        if (node === fromId) break;
        node = parent.get(node);
      }
      return path;
    }
    for (const row of next.all(cur)) {
      const n = row.prerequisite_id;
      if (visited.has(n)) continue;
      visited.add(n);
      parent.set(n, cur);
      stack.push(n);
    }
  }
  return null;
}

/** 批量自然键水化（环路径/链诊断的节点呈现——'slug/localId' 复合） */
export function naturalKeysByIds(db: Database.Database, ids: readonly string[]): Map<string, string> {
  const keys = new Map<string, string>();
  if (ids.length === 0) return keys;
  const placeholders = ids.map(() => "?").join(", ");
  const rows = db
    .prepare<unknown[], { id: string; slug: string; local_id: string }>(
      `SELECT id, slug, local_id FROM task_tasks WHERE id IN (${placeholders})`,
    )
    .all(...ids);
  for (const r of rows) keys.set(r.id, naturalKey(r.slug, r.local_id));
  return keys;
}

/** 源链计数（沿 task_edges origin='fix-chain' 边上溯——链深只计 fix-chain 边，disc 继任不耗深） */
function sourceAncestry(db: Database.Database, sourceId: string): TaskKeyRow[] {
  const byId = db.prepare<unknown[], TaskKeyRow>(
    `SELECT ${TASK_KEY_COLUMNS} FROM task_tasks WHERE id = ?`,
  );
  const fixSources = db.prepare<unknown[], { task_id: string }>(
    `SELECT task_id FROM task_edges WHERE prerequisite_id = ? AND origin = 'fix-chain'`,
  );
  let best: string[] = [];
  const path: string[] = [sourceId];
  const onPath = new Set<string>([sourceId]);
  const walk = (cur: string): void => {
    const nexts = fixSources.all(cur).map((r) => r.task_id);
    if (nexts.length === 0) {
      if (path.length - 1 > best.length) best = [...path];
      return;
    }
    for (const n of nexts) {
      if (onPath.has(n)) {
        throw new Error(`fix-chain 边成环（数据漂移）：${cur} → ${n}`);
      }
      onPath.add(n);
      path.push(n);
      walk(n);
      path.pop();
      onPath.delete(n);
    }
  };
  walk(sourceId);
  const ancestry: TaskKeyRow[] = [];
  for (let i = best.length - 1; i >= 1; i--) {
    const row = byId.get(best[i] as string);
    if (row !== undefined) ancestry.push(row);
  }
  return ancestry;
}

/** block_source 状态守卫：blockSource=true 对 in_progress / 终态源 fail-loud（事务内先于一切写） */
function assertBlockSourceAllowed(projectKey: string, source: TaskKeyRow, blockSource: boolean | undefined): void {
  if (blockSource !== true) return;
  if (source.task_status === "in_progress") {
    throw new BlockSourceInProgressError({
      projectKey,
      taskRef: { slug: source.slug, localId: source.local_id },
      taskStatus: "in_progress",
    });
  }
  if ((["completed", "skipped", "rejected"] as readonly string[]).includes(source.task_status)) {
    throw new BlockSourceTerminalError({
      projectKey,
      taskRef: { slug: source.slug, localId: source.local_id },
      taskStatus: source.task_status as "completed" | "skipped" | "rejected",
    });
  }
}

// ───────────── 单条 addTask 入参/出参（容器 slug 化终态——零 goal/spec 感知） ─────────────

export interface AddTaskInput {
  readonly projectKey: string;
  /** 容器键（容器 = slug 本身） */
  readonly slug: string;
  readonly title: string;
  readonly type: TaskType;
  /** 任务简报正文内容源（brief 列） */
  readonly brief?: string;
  /** AC 承担面（任务定义侧清单——task 唯一验收承接面） */
  readonly acceptanceCriteria?: readonly string[];
  readonly priority?: "P0" | "P1" | "P2";
  readonly estimatedTime?: string;
  /** 受影响文件范围（结构化对象三键） */
  readonly scope?: TaskScope;
  /** 附加上下文注入（KEY=VALUE） */
  readonly context?: Readonly<Record<string, string>>;
  /** 依赖前置（同容器 localId） */
  readonly dependsOn?: readonly string[];
  /** before 后继（单事务建任务 + 给后继补 dependsOn 新边） */
  readonly before?: readonly string[];
  /** fix 链源对（与 blockSource 配对使用） */
  readonly sourceTask?: { readonly slug: string; readonly localId: string };
  /** true = fix 链（挂等待边 + 源 auto-block）；false/缺席 = disc 径 */
  readonly blockSource?: boolean;
  readonly breaking?: boolean;
  /** 验收阈值期望值（0–1；coverage_threshold 列名实直对） */
  readonly coverageThreshold?: number;
  readonly complexity?: "low" | "medium" | "high";
}

export interface AddTaskResult {
  readonly taskId: string;
  readonly slug: string;
  readonly localId: string;
  readonly reused: boolean;
  readonly beforeSuccessors?: readonly string[];
}

/** 同容器行解析（project_key + slug + local_id 三键） */
function resolveContainerTask(
  db: Database.Database,
  projectKey: string,
  slug: string,
  localId: string,
): TaskKeyRow | undefined {
  return db
    .prepare<unknown[], TaskKeyRow>(
      `SELECT ${TASK_KEY_COLUMNS} FROM task_tasks
       WHERE project_key = ? AND slug = ? AND local_id = ?`,
    )
    .get(projectKey, slug, localId);
}

/**
 * Interface 1 addTask：task_tasks 行 → task_edges 行 → task_records 行单事务全成全败。
 * 顺序：sourceTask 解析 → 任务级去重（四判据合取）→ dependsOn 解析 → before 解析 + 状态守卫
 * → blocked 源建链守卫 → block_source 状态守卫 → localId 分配 → 链深 ≤6 → 增量环校验 →
 * 写入 → 边 → 记录 → auto-block。
 */
export async function addTask(deps: TasksVerbDeps, input: AddTaskInput): Promise<AddTaskResult> {
  assertContainerSlugAllowed(input.slug);
  if (input.projectKey === "") {
    throw new Error("projectKey 派生失败（空归属键）——容器写点拒写");
  }
  const db = deps.db;
  const now = new Date().toISOString();

  const result = withTransaction(db, (): AddTaskResult => {
    // ② sourceTask 解析（uq_task_tasks_project_slug_local 三键查捞）
    let source: TaskKeyRow | undefined;
    if (input.sourceTask !== undefined) {
      source = resolveContainerTask(db, input.projectKey, input.sourceTask.slug, input.sourceTask.localId);
      if (source === undefined) {
        throw new TaskNotFoundError({
          projectKey: input.projectKey,
          taskRef: input.sourceTask,
          containerSlug: input.slug,
        });
      }
    }

    // ③ 任务级去重（两级去重之一——纯读零变更）：同源同型且未终态 + brief 相等 +
    //    context 键序无关规范化相等 → 复用既有行（reused=true；判例 fix-11 硬约束——
    //    判据四支合取，异内容第二单正常建行，禁回退「同源同型即吞并」旧判据）
    if (source !== undefined) {
      const active = db
        .prepare<unknown[], { id: string; slug: string; local_id: string; brief: string | null; context_json: string | null }>(
          `SELECT id, slug, local_id, brief, context_json FROM task_tasks
           WHERE fix_of_task_id = ? AND task_type = ?
             AND task_status NOT IN ('completed', 'skipped', 'rejected')
           ORDER BY created_at, id LIMIT 1`,
        )
        .get(source.id, input.type);
      if (
        active !== undefined &&
        active.brief === (input.brief ?? null) &&
        canonicalContext(active.context_json) ===
          canonicalContext(input.context === undefined ? null : JSON.stringify(input.context))
      ) {
        return { taskId: active.id, slug: active.slug, localId: active.local_id, reused: true };
      }
    }

    // ④ dependsOn 解析（同容器前置声明——uq 三键查捞）
    const depends: TaskKeyRow[] = [];
    for (const localId of input.dependsOn ?? []) {
      const dep = resolveContainerTask(db, input.projectKey, input.slug, localId);
      if (dep === undefined) {
        throw new TaskNotFoundError({
          projectKey: input.projectKey,
          taskRef: { slug: input.slug, localId },
          containerSlug: input.slug,
        });
      }
      depends.push(dep);
    }

    // ④b before 后继解析 + 状态守卫（BEFORE_SUCCESSOR_ALLOWED_STATUSES 单源）
    const successors: TaskKeyRow[] = [];
    for (const localId of input.before ?? []) {
      const succ = resolveContainerTask(db, input.projectKey, input.slug, localId);
      if (succ === undefined) {
        throw new TaskNotFoundError({
          projectKey: input.projectKey,
          taskRef: { slug: input.slug, localId },
          containerSlug: input.slug,
        });
      }
      if (!(BEFORE_SUCCESSOR_ALLOWED_STATUSES as readonly string[]).includes(succ.task_status)) {
        const action =
          succ.task_status === "in_progress"
            ? ("pauseTask" as const)
            : succ.task_status === "interrupted"
              ? ("human" as const)
              : ("terminal" as const);
        throw new BeforeSuccessorInvalidError({
          projectKey: input.projectKey,
          taskRef: { slug: succ.slug, localId: succ.local_id },
          taskStatus: succ.task_status,
          action,
        });
      }
      successors.push(succ);
    }

    // ④c blocked 源建链守卫：源已 blocked ∧ blockSource 缺省 → ERR_BLOCK_SOURCE_REQUIRED
    if (source !== undefined && source.task_status === "blocked" && input.blockSource !== true) {
      throw new BlockSourceRequiredError({
        projectKey: input.projectKey,
        taskRef: { slug: source.slug, localId: source.local_id },
        taskStatus: "blocked",
      });
    }

    // ④d block_source 状态守卫（对 in_progress / 终态源 fail-loud）
    if (source !== undefined) {
      assertBlockSourceAllowed(input.projectKey, source, input.blockSource);
    }

    // ⑤ localId 分配（blockSource → fix-N / 携源未阻 → disc-N / 常规 → 数值顺延）
    const localId = allocateLocalId(
      db,
      input.projectKey,
      input.slug,
      input.sourceTask !== undefined ? (input.blockSource === true ? "fix" : "disc") : "numeric",
    );

    // ⑥ fix 链深 ≤6（仅约束 blockSource 的 fix 任务——disc 继任不耗深）
    if (source !== undefined && input.blockSource === true) {
      const ancestry = sourceAncestry(db, source.id);
      const depth = ancestry.length + 1;
      if (depth > FIX_CHAIN_DEPTH_LIMIT) {
        const keys = naturalKeysByIds(db, ancestry.map((t) => t.id));
        const chain = [...ancestry.map((t) => keys.get(t.id) ?? t.id), naturalKey(source.slug, source.local_id)];
        throw new ChainDepthExceededError({
          projectKey: input.projectKey,
          containerSlug: input.slug,
          chain,
          depth,
          limit: FIX_CHAIN_DEPTH_LIMIT,
        });
      }
    }

    // ⑦ 增量环校验（dependsOn × blockSource 组合）：自各 D 沿既有出边可达性 DFS 找 S
    if (input.blockSource === true) {
      if (source === undefined) {
        throw new Error("blockSource 需要 sourceTask（fix 链协议数据面——输入契约违例）");
      }
      for (const d of depends) {
        const hopPath = d.id === source.id ? [d.id] : findPathThroughOutEdges(db, d.id, source.id);
        if (hopPath !== null) {
          const keys = naturalKeysByIds(db, [source.id, ...hopPath]);
          const tKey = naturalKey(input.slug, localId);
          const cycle = [keys.get(source.id) ?? source.id, tKey, ...hopPath.map((id) => keys.get(id) ?? id)];
          throw new CycleDetectedError({ cycle });
        }
      }
    }

    // ⑦b before 增量环校验扩展（before 后继纳入检测）
    for (const s of successors) {
      for (const d of depends) {
        const hopPath = d.id === s.id ? [d.id] : findPathThroughOutEdges(db, d.id, s.id);
        if (hopPath !== null) {
          const keys = naturalKeysByIds(db, [s.id, ...hopPath]);
          const tKey = naturalKey(input.slug, localId);
          throw new CycleDetectedError({
            cycle: [keys.get(s.id) ?? s.id, tKey, ...hopPath.map((id) => keys.get(id) ?? id)],
          });
        }
      }
    }

    // ⑨ task_tasks 行（id = 纯 UUID 写入点生成 + 缺省 pending/medium/false 族；v1 列面）
    const taskId = randomUUID();
    try {
      db.prepare(
        `INSERT INTO task_tasks (id, slug, local_id, title, task_type, task_status, brief, ac_json, priority,
           estimated_time, scope_json, context_json, fix_of_task_id, breaking,
           coverage_threshold, complexity, project_key, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        taskId,
        input.slug,
        localId,
        input.title,
        input.type,
        input.brief ?? null,
        input.acceptanceCriteria === undefined ? null : JSON.stringify(input.acceptanceCriteria),
        input.priority ?? null,
        input.estimatedTime ?? null,
        input.scope === undefined ? null : JSON.stringify(input.scope),
        input.context === undefined ? null : JSON.stringify(input.context),
        source?.id ?? null,
        input.breaking === true ? 1 : 0,
        input.coverageThreshold ?? null,
        input.complexity ?? "medium",
        input.projectKey,
        now,
        now,
      );
    } catch (cause) {
      if (isUniqueViolation(cause, "uq_task_tasks_project_slug_local")) {
        throw new TaskExistsError({ projectKey: input.projectKey, slug: input.slug, localId });
      }
      throw cause;
    }

    // ⑩ edges 行：dependsOn = manual（重复报错）；block-source = fix-chain（INSERT OR IGNORE 幂等）
    const insertEdge = db.prepare(
      `INSERT INTO task_edges (task_id, prerequisite_id, origin, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    );
    const insertEdgeIgnore = db.prepare(
      `INSERT OR IGNORE INTO task_edges (task_id, prerequisite_id, origin, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    );
    for (const dep of depends) {
      try {
        insertEdge.run(taskId, dep.id, "manual", now, now);
      } catch (cause) {
        if (isUniqueViolation(cause, "task_edges")) {
          throw new TaskExistsError({ projectKey: input.projectKey, edge: { taskId, prerequisiteId: dep.id } });
        }
        throw cause;
      }
    }

    // ⑩b before 后继挂边（manual 边 后继 ← 新任务）
    for (const succ of successors) {
      try {
        insertEdge.run(succ.id, taskId, "manual", now, now);
      } catch (cause) {
        if (isUniqueViolation(cause, "task_edges")) {
          throw new TaskExistsError({
            projectKey: input.projectKey,
            edge: { taskId: succ.id, prerequisiteId: taskId },
          });
        }
        throw cause;
      }
    }

    // ⑪ records 行：add（actor='plugin-tool'）
    db.prepare(
      `INSERT INTO task_records (task_id, verb, actor, created_at, updated_at)
       VALUES (?, 'add', 'plugin-tool', ?, ?)`,
    ).run(taskId, now, now);

    // ⑫ block-source 写路径内聚效果：源同事务置 blocked + auto-block 记录（不经转移校验面）
    if (input.blockSource === true && source !== undefined) {
      insertEdgeIgnore.run(source.id, taskId, "fix-chain", now, now);
      db.prepare(`UPDATE task_tasks SET task_status = 'blocked', updated_at = ? WHERE id = ?`).run(now, source.id);
      db.prepare(
        `INSERT INTO task_records (task_id, verb, from_status, to_status, actor, created_at, updated_at)
         VALUES (?, 'auto-block', ?, 'blocked', 'core', ?, ?)`,
      ).run(source.id, source.task_status, now, now);
    }

    return {
      taskId,
      slug: input.slug,
      localId,
      reused: false,
      ...(successors.length > 0
        ? { beforeSuccessors: successors.map((s) => naturalKey(s.slug, s.local_id)) }
        : {}),
    };
  });

  // 复用命中（纯读零变更）不发射；写路径事务提交后 emitTasksChanged
  if (!result.reused) deps.events.emitTasksChanged(input.projectKey);
  return result;
}

// ───────── batchAddTasks（修订裁决 10：dry-run 收集制校验 + 整批单事务两遍式落库） ─────────

/** 批量单项入参（批内互引锚 = localId；fix 链参数逐条生效） */
export interface BatchAddTaskItem {
  readonly localId: string;
  readonly title: string;
  readonly type: TaskType;
  readonly brief?: string;
  readonly acceptanceCriteria?: readonly string[];
  readonly priority?: "P0" | "P1" | "P2";
  readonly estimatedTime?: string;
  readonly scope?: TaskScope;
  readonly context?: Readonly<Record<string, string>>;
  readonly dependsOn?: readonly string[];
  readonly before?: readonly string[];
  readonly sourceTask?: { readonly slug: string; readonly localId: string };
  readonly blockSource?: boolean;
  readonly breaking?: boolean;
  readonly coverageThreshold?: number;
  readonly complexity?: "low" | "medium" | "high";
}

export interface BatchAddTasksInput {
  readonly projectKey: string;
  readonly slug: string;
  readonly tasks: readonly BatchAddTaskItem[];
}

export interface BatchAddItemResult {
  readonly localId: string;
  readonly status: "added" | "reused";
  readonly taskId: string;
  readonly slug: string;
}

export interface BatchAddTasksResult {
  readonly ok: boolean;
  readonly results?: readonly BatchAddItemResult[];
  readonly summary?: { readonly added: number; readonly reused: number };
  readonly errors?: readonly BatchItemError[];
}

const SCOPE_KEYS = ["created", "modified", "removed"] as const;

const RELATIVE_PATH_RE = /^[A-Za-z0-9_.\-/\\@[\](){} ]+$/;

/** dry-run 单项字段校验（收集制——错误逐项累积，零 fail-fast；零 db 写点） */
function collectItemErrors(db: Database.Database, projectKey: string, slug: string, tasks: readonly BatchAddTaskItem[]): BatchItemError[] {
  const errors: BatchItemError[] = [];
  const seenLocalIds = new Map<string, number>();

  tasks.forEach((item, index) => {
    const fail = (field: string, code: string, message: string, fixHint: string): void => {
      errors.push({ index, field, code, message, fixHint });
    };
    // 1. localId（批内重复拒全批）
    if (typeof item.localId !== "string" || item.localId.trim() === "") {
      fail("localId", "ERR_DUP_LOCAL_ID", "localId 缺席", "每条任务必带批内唯一 localId（如 '2.1'）");
    } else if (seenLocalIds.has(item.localId)) {
      fail(
        "localId",
        "ERR_DUP_LOCAL_ID",
        `localId '${item.localId}' 批内重复（首现 #${seenLocalIds.get(item.localId)}）`,
        "批内 localId 唯一——批内互引用 localId 表达，重复即全批拒绝",
      );
    } else {
      seenLocalIds.set(item.localId, index);
    }
    // 2. title / type
    if (typeof item.title !== "string" || item.title.trim() === "") {
      fail("title", "ERR_FIELD_REQUIRED", "title 缺席或空白", "title 为必填非空字符串");
    }
    if (typeof item.type !== "string" || item.type.trim() === "") {
      fail("type", "ERR_FIELD_REQUIRED", "type 缺席", "type 为必填任务类型（见 queryTask help 词表）");
    }
    // 3. context KEY=VALUE 形制（重复键拒绝规则归装配方解析层——此处校验对象形值全字符串）
    if (item.context !== undefined) {
      for (const [k, v] of Object.entries(item.context)) {
        if (k.trim() === "") fail("context", "ERR_CONTEXT_INVALID", "context 键空白", "context 键非空");
        if (typeof v !== "string") {
          fail("context", "ERR_CONTEXT_INVALID", `context['${k}'] 值非字符串`, "context 值 = KEY=VALUE 字符串（如 SKIP_EVAL_GATE=1）");
        }
      }
    }
    // 4. scope 形制（键封闭枚举 / 相对路径字符串 / 同路径跨数组重复）
    if (item.scope !== undefined) {
      const seen = new Map<string, string>();
      for (const key of SCOPE_KEYS) {
        const arr = item.scope[key];
        if (arr === undefined) continue;
        for (const p of arr) {
          if (typeof p !== "string") {
            fail("scope", "ERR_SCOPE_INVALID", `scope.${key} 含非字符串元素`, "scope 元素 = 相对项目根路径字符串（如 'plugins/task-loop/host/index.ts'）");
            continue;
          }
          if (/^([A-Za-z]:)?[\\/]/.test(p) || p.includes("..")) {
            fail("scope", "ERR_SCOPE_ABSOLUTE_PATH", `scope.${key} 路径非相对项目根：'${p}'`, "scope 元素 = 相对项目根路径，禁绝对路径与 .. 上跳");
            continue;
          }
          if (!RELATIVE_PATH_RE.test(p)) {
            fail("scope", "ERR_SCOPE_INVALID", `scope.${key} 路径形制非法：'${p}'`, "scope 元素 = 相对项目根路径字符串");
          }
          const owner = seen.get(p);
          if (owner !== undefined) {
            fail("scope", "ERR_SCOPE_CROSS_ARRAY_DUP", `路径 '${p}' 跨数组重复（已见 scope.${owner}）`, "同一路径只能出现在一个数组中");
          } else {
            seen.set(p, key);
          }
        }
      }
      for (const key of Object.keys(item.scope)) {
        if (!(SCOPE_KEYS as readonly string[]).includes(key)) {
          fail("scope", "ERR_SCOPE_UNKNOWN_KEY", `未知 scope 键 '${key}'`, "scope 键 ∈ 封闭枚举 {created, modified, removed}");
        }
      }
    }
    // 5. fix 链参数合法性（source_task 对 + block_source 规则）
    if (item.sourceTask !== undefined) {
      if (item.sourceTask.slug !== slug) {
        fail("sourceTask", "ERR_TASK_NOT_FOUND", `fix 链源容器 '${item.sourceTask.slug}' ≢ 本批容器 '${slug}'`, "fix 链源须与本批同容器（sourceTask.slug = slug）");
      }
      const hit = resolveContainerTask(db, projectKey, slug, item.sourceTask.localId);
      const inBatch = tasks.some((t) => t.localId === item.sourceTask?.localId);
      if (hit === undefined && !inBatch) {
        fail("sourceTask", "ERR_TASK_NOT_FOUND", `fix 链源未命中：${slug}/${item.sourceTask.localId}`, "sourceTask.slug + sourceTask.localId 必须成对且命中库内既有任务");
      }
      if (hit !== undefined && item.blockSource === undefined) {
        if (hit.task_status === "blocked") {
          fail("blockSource", "ERR_BLOCK_SOURCE_REQUIRED", `源任务 ${slug}/${item.sourceTask.localId} 已 blocked——blockSource 缺省`, "源已 blocked 必带 blockSource=true（建 fix 链等待边，fix 完成即恢复源）");
        }
        if (hit.task_status === "in_progress") {
          fail("blockSource", "ERR_BLOCK_SOURCE_IN_PROGRESS", `源任务 ${slug}/${item.sourceTask.localId} 在飞——不可挂等待边`, "先 pauseTask 源任务 → addTask(blockSource=true) → resume");
        }
        if ((["completed", "skipped", "rejected"] as readonly string[]).includes(hit.task_status)) {
          fail("blockSource", "ERR_BLOCK_SOURCE_TERMINAL", `源任务 ${slug}/${item.sourceTask.localId} 已终态`, "源已终态——改用 disc 径（不携 blockSource）或改选未终态源");
        }
      }
    } else if (item.blockSource === true) {
      fail("blockSource", "ERR_INPUT_CONTRACT", "blockSource=true 需要 sourceTask 成对出现", "fix 链参数 sourceTask.slug + sourceTask.localId 必须成对");
    }
  });

  // 6. 依赖关系（批内互引解析为批内 localId / 库内既有任务；悬空收集 + 环检测）
  const batchIds = new Set(tasks.map((t) => t.localId));
  tasks.forEach((item, index) => {
    for (const refField of ["dependsOn", "before"] as const) {
      for (const localId of item[refField] ?? []) {
        if (!batchIds.has(localId)) {
          const hit = resolveContainerTask(db, projectKey, slug, localId);
          if (hit === undefined) {
            errors.push({
              index,
              field: refField,
              code: "ERR_DEPENDENCY_DANGLING",
              message: `${refField} 引用悬空：'${localId}'（批内/库内均无）`,
              fixHint: "dependsOn/before 引批内 localId 或同容器库内既有任务 localId",
            });
          }
        }
      }
    }
  });
  const cycleErr = findBatchCycle(tasks);
  if (cycleErr !== undefined) errors.push(cycleErr);
  return errors;
}

/** 批内环检测（A↔B 即环；批内互引全在批内集合上判——库内既有拓扑已无环，写点增量校验承担） */
function findBatchCycle(tasks: readonly BatchAddTaskItem[]): BatchItemError | undefined {
  const adjacency = new Map<string, string[]>();
  const batchIds = new Set(tasks.map((t) => t.localId));
  for (const item of tasks) {
    const deps = new Set<string>();
    for (const d of item.dependsOn ?? []) deps.add(d);
    adjacency.set(item.localId, [...deps]);
  }
  // before 反转：item.before=[x] 意为 x 依赖 item——边 x→item
  for (const item of tasks) {
    for (const x of item.before ?? []) {
      const list = adjacency.get(x) ?? [];
      if (!list.includes(item.localId)) list.push(item.localId);
      adjacency.set(x, list);
    }
  }
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  const stack: string[] = [];
  let cycle: string[] | undefined;
  const dfs = (id: string): void => {
    color.set(id, GRAY);
    stack.push(id);
    for (const next of adjacency.get(id) ?? []) {
      const c = color.get(next) ?? WHITE;
      if (c === GRAY) {
        const start = stack.indexOf(next);
        cycle = [...stack.slice(start), next];
        return;
      }
      if (c === WHITE && batchIds.has(next)) {
        dfs(next);
        if (cycle !== undefined) return;
      }
    }
    stack.pop();
    color.set(id, BLACK);
  };
  for (const id of batchIds) {
    if ((color.get(id) ?? WHITE) === WHITE) {
      dfs(id);
      if (cycle !== undefined) break;
    }
  }
  if (cycle === undefined) return undefined;
  return {
    index: tasks.findIndex((t) => t.localId === cycle?.[0]),
    field: "dependsOn",
    code: "ERR_DEPENDENCY_CYCLE",
    message: `批内依赖环：${cycle.join(" → ")}`,
    fixHint: "批内 A↔B 即环——调整 dependsOn/before 方向消除环后整批重提",
  };
}

/** dry-run 校验器单点导出（tool 层收集制合并面——解析层错与域层错一次报全且保证零写点） */
export function validateBatchAddTasks(
  deps: Pick<TasksVerbDeps, "db">,
  input: Pick<BatchAddTasksInput, "projectKey" | "slug" | "tasks">,
): BatchItemError[] {
  return collectItemErrors(deps.db, input.projectKey, input.slug, input.tasks);
}

/**
 * Interface 1 batchAddTasks：dry-run 收集制全量校验（零 db 写点）→ 全过后整批单事务两遍式
 * 落库（①全量 INSERT task_tasks → ②同事务连 task_edges（批内互引解析为批内 localId）+
 * fix 链派生（blockSource 逐条锁源置 blocked））。校验失败零落库；落库中途失败全批回滚零残留。
 */
export async function batchAddTasks(deps: TasksVerbDeps, input: BatchAddTasksInput): Promise<BatchAddTasksResult> {  assertContainerSlugAllowed(input.slug);
  const db = deps.db;
  const now = new Date().toISOString();

  // dry-run 收集制校验（零写点）
  const errors = collectItemErrors(db, input.projectKey, input.slug, input.tasks);
  if (errors.length > 0) {
    throw new BatchInvalidError({ projectKey: input.projectKey, slug: input.slug, errors });
  }

  const results = withTransaction(db, (): BatchAddItemResult[] => {
    const out: BatchAddItemResult[] = [];
    // ① 全量 INSERT（批内 localId 唯一已校验；任务级去重按条命中 reused 不阻断他条）
    const inserted = new Map<string, { id: string; status: "added" | "reused" }>();
    for (const item of input.tasks) {
      // 批内去重判据同 addTask 单条（fix 链源 + type + brief + context 规范化）
      const source = item.sourceTask
        ? resolveContainerTask(db, input.projectKey, item.sourceTask.slug, item.sourceTask.localId)
        : undefined;
      if (source !== undefined) {
        const active = db
          .prepare<unknown[], { id: string; slug: string; local_id: string; brief: string | null; context_json: string | null }>(
            `SELECT id, slug, local_id, brief, context_json FROM task_tasks
             WHERE fix_of_task_id = ? AND task_type = ?
               AND task_status NOT IN ('completed', 'skipped', 'rejected')
             ORDER BY created_at, id LIMIT 1`,
          )
          .get(source.id, item.type);
        if (
          active !== undefined &&
          active.brief === (item.brief ?? null) &&
          canonicalContext(active.context_json) ===
            canonicalContext(item.context === undefined ? null : JSON.stringify(item.context))
        ) {
          inserted.set(item.localId, { id: active.id, status: "reused" });
          out.push({ localId: item.localId, status: "reused", taskId: active.id, slug: active.slug });
          continue;
        }
      }
      const localId = item.localId;
      const taskId = randomUUID();
      db.prepare(
        `INSERT INTO task_tasks (id, slug, local_id, title, task_type, task_status, brief, ac_json, priority,
           estimated_time, scope_json, context_json, fix_of_task_id, breaking,
           coverage_threshold, complexity, project_key, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        taskId,
        input.slug,
        localId,
        item.title,
        item.type,
        item.brief ?? null,
        item.acceptanceCriteria === undefined ? null : JSON.stringify(item.acceptanceCriteria),
        item.priority ?? null,
        item.estimatedTime ?? null,
        item.scope === undefined ? null : JSON.stringify(item.scope),
        item.context === undefined ? null : JSON.stringify(item.context),
        source?.id ?? null,
        item.breaking === true ? 1 : 0,
        item.coverageThreshold ?? null,
        item.complexity ?? "medium",
        input.projectKey,
        now,
        now,
      );
      inserted.set(localId, { id: taskId, status: "added" });
      db.prepare(
        `INSERT INTO task_records (task_id, verb, actor, created_at, updated_at)
         VALUES (?, 'add', 'plugin-tool', ?, ?)`,
      ).run(taskId, now, now);
      out.push({ localId, status: "added", taskId, slug: input.slug });
    }

    // ② 同事务连 task_edges（批内互引解析为批内 localId）+ fix 链派生（blockSource 逐条）
    const insertEdge = db.prepare(
      `INSERT OR IGNORE INTO task_edges (task_id, prerequisite_id, origin, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    );
    const resolveId = (localId: string): string | undefined =>
      inserted.get(localId)?.id ?? resolveContainerTask(db, input.projectKey, input.slug, localId)?.id;
    for (const item of input.tasks) {
      const selfId = resolveId(item.localId) as string;
      for (const d of item.dependsOn ?? []) {
        const depId = resolveId(d);
        if (depId !== undefined) insertEdge.run(selfId, depId, "manual", now, now);
      }
      // before：item 是 x 的前置 → 边 (x ← item)
      for (const x of item.before ?? []) {
        const succId = resolveId(x);
        if (succId !== undefined) insertEdge.run(succId, selfId, "manual", now, now);
      }
      // fix 链派生（blockSource 逐条同事务锁源任务置 blocked + auto-block 记录）
      if (item.blockSource === true && item.sourceTask !== undefined) {
        const source = resolveContainerTask(db, input.projectKey, item.sourceTask.slug, item.sourceTask.localId);
        if (source !== undefined) {
          insertEdge.run(source.id, selfId, "fix-chain", now, now);
          db.prepare(`UPDATE task_tasks SET task_status = 'blocked', updated_at = ? WHERE id = ?`).run(now, source.id);
          db.prepare(
            `INSERT INTO task_records (task_id, verb, from_status, to_status, actor, created_at, updated_at)
             VALUES (?, 'auto-block', ?, 'blocked', 'core', ?, ?)`,
          ).run(source.id, source.task_status, now, now);
        }
      }
    }
    return out;
  });

  const added = results.filter((r) => r.status === "added").length;
  const reused = results.length - added;
  deps.events.emitTasksChanged(input.projectKey);
  return { ok: true, results, summary: { added, reused } };
}
