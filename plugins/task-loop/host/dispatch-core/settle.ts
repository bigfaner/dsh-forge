// dispatch-core · 结算核（S1a 可拆卸壳分层；async-dispatch §4.2 ②③——前台阻塞径与后台
// done continuation 同源消费的共用体，保证「结算块 = spawned 分支原样投影」）：
// await handle.result（传递性含 worker submitTask + 落账——F10 无竞态）→ disposeQuietly →
// queryTask 只读结算读 → 三_case 判定（settled：spawned 分支字段面全量构建；failed：
// run 拒绝/无结算同归防线径，kill 由调用方 taxonomy 判定）。
// 改进7（e2e 取证债）：success 结算携带 evidenceDebt = 实现态部分结算——本核自动生成独立
// test-run 欠账任务（dependsOn 实现卡），实现卡不再因取证欠账 blocked。
// 模块④路由不变量：结算核不感知路由档位（同结算门异路由——本文件零 experts 消费）。
// v1 列面适配：submit 全语义载荷归 task_settlements 行（records 行 = 纯轨迹）——commitHash/
// summary/reason/files/evidenceDebt 经 deps.settlements 结算行读缝消费（缺席 = 载荷面降级，
// 终态判定不受影响）。
import { execFile } from "node:child_process";
import { copyFile, mkdir, readdir } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { noteHostOwnedChild } from "../spawn/job-tree.js";
import { emitForgeDiag } from "../faces.js";
import type { ForgeDiagEmitFace, ProjectDirServiceFace } from "../faces.js";
import type { TasksService } from "../domain/tasks/service.js";
import type { ContainerRef, TaskRef, TaskSnapshot } from "../domain/tasks/types.js";
import type { AppendCheckpointInput } from "../domain/checkpoints/service.js";
import type { SettlementEvidence } from "../db/repositories/settlement-repo.js";
import { forgetWorkerSourceTask } from "./assemble.js";
import { exclusiveLoopSourceOf } from "./exclusivity.js";
import type { SpawnWorkerHandle } from "./spawn.js";
import { poolOf, type PoolSnapshot } from "./pool.js";
import type { DispatchSpawnedResult } from "./result.js";

// ─────────────────────────── review-wave-N 修正波标记（机械④） ───────────────────────────
// 提案 forge-verification-hardening M5「标记体系」：每轮 review/走查修正波结算落
// review-wave-N 检查点（Blocker 返工批 / fix 链收口），附标记时刻四列累计计数快照
// （tasks_total / commits_total / fixes_total / evidence_debts_total——提案统计口径）。
// 按波聚合（bug fe8d5cb5 用户裁定）：一波 = 一轮评审/走查返出的全部修正任务。波的边界锚 =
// 派发循环实例 id（LoopInstanceId，经 exclusivity 独占源登记现查——消费点现查不缓存，
// AGENTS §1.6）：同一循环运行内的全部波点（blocked 结算 + 循环内 fix 链收口）计 1 波；
// 循环收口后主 agent 交叉评审返单重派 = 新循环实例 = 新波；循环外零散 dispatch_task 无
// 循环上下文 = 单任务单波（落行条件不变）。同一波内的后续波点命中已落 wave 行则不新增
// （写入时去重，不事后清洗）；波与循环实例同生命周期（循环不跨进程）——去重登记为进程内
// map，宿主重启后 resume 的同 id 循环视为延续波之外的新波（可接受边界，注释即契约）。
// fail-soft：标记失败 diag 告警留痕，不回滚已定结算；依赖缺席（checkpoints 面）= 机制惰性不判，行为零变化。

/** 按波去重登记（进程内——键 = projectKey \0 slug \0 loopId；wave 与循环实例同生命周期） */
const WAVE_DEDUP_KEYS = new Set<string>();

/** 测试缝：清空按波去重登记（生产零消费——登记随进程生命周期） */
export function resetReviewWaveDedup(): void {
  WAVE_DEDUP_KEYS.clear();
}

/** checkpoints 域服务的结算侧消费面（AppendCheckpointInput 同形单源——插件内结构兼容注入） */
export interface SettleCheckpointsFace {
  appendCheckpoint(input: AppendCheckpointInput): Promise<unknown>;
}

/** 容器分支 HEAD 解析器（标记时点 base_commit_hash 来源——单测注入桩） */
export type HeadCommitResolver = (worktreeDir: string) => Promise<string | undefined>;

/** git 真解析：容器检出当前 HEAD（rev-parse HEAD；故障 = undefined——fail-soft 跳过标记） */
export const gitHeadCommit: HeadCommitResolver = async (worktreeDir) => {
  try {
    const stdout = await new Promise<string>((resolve, reject) => {
      const git = execFile("git", ["-C", worktreeDir, "rev-parse", "HEAD"], { encoding: "utf8" }, (error, out) =>
        error == null ? resolve(out) : reject(error),
      );
      noteHostOwnedChild(git); // 结算期 git 子进程 = 宿主自有（job-tree 防误收编——1.14 同口径）
    });
    const hash = stdout.trim();
    return hash === "" ? undefined : hash;
  } catch {
    return undefined;
  }
};

/** 四列计数快照（标记时刻累计值——提案「计数基准与起点」节口径） */
export interface WaveSnapshot {
  readonly tasksTotal: number
  readonly commitsTotal: number
  readonly fixesTotal: number
  readonly evidenceDebtsTotal: number;
}

/**
 * 标记时刻计数快照（容器任务域全集 = slug 容器限定）：
 * - tasks_total：completed 任务数（taskStats 八态分布直读）
 * - fixes_total：completed 且 fix 类（coding-fix 类型 ∨ fix 链派生 fixDerived）数
 * - commits_total：completed 任务结算 commit_hash 去重集合大小
 * - evidence_debts_total：结算 evidenceDebt 声明次数
 * 数据面 = taskSettlements 单批聚合读（1.16——替代逐 completed 任务 queryTask 的
 * O(N) 域调用；查询次数 O(N·completed) → 常数）。口径单源：跨任务 commit 去重/fix 判别/
 * evidenceDebt 计数全在本函数。
 */
export async function computeWaveSnapshot(tasks: TasksService, projectId: string, source: ContainerRef): Promise<WaveSnapshot> {
  const [stats, settlements] = await Promise.all([
    tasks.taskStats({ projectKey: projectId, slug: source.slug }),
    tasks.taskSettlements({ projectKey: projectId, slug: source.slug }),
  ]);
  let commitsTotal = 0;
  let evidenceDebtsTotal = 0;
  let fixesTotal = 0;
  const seenCommits = new Set<string>();
  for (const s of settlements) {
    for (const hash of s.commitHashes) {
      if (!seenCommits.has(hash)) {
        seenCommits.add(hash);
        commitsTotal += 1;
      }
    }
    evidenceDebtsTotal += s.evidenceDebtCount;
    if (s.taskType === "coding-fix" || s.fixDerived) fixesTotal += 1;
  }
  return {
    tasksTotal: stats.byStatus.completed,
    commitsTotal,
    fixesTotal,
    evidenceDebtsTotal,
  };
}

/** 修正波落点判定：blocked 结算 = Blocker 返工批；success 结算的 fix 类任务 = fix 链收口（用户裁决批不经结算核——循环/走查侧另记） */
function isReviewWavePoint(task: TaskSnapshot, outcome: "success" | "blocked"): boolean {
  if (outcome === "blocked") return true;
  return task.taskType === "coding-fix" || task.fixOfTaskId !== undefined;
}

/** review-wave-N 标记落行（fail-soft——任何失败 diag 告警留痕，不回滚已定结算） */
async function recordWaveCheckpoint(
  deps: {
    readonly tasks: TasksService
    readonly checkpoints?: SettleCheckpointsFace
    readonly resolveHeadCommit?: HeadCommitResolver
    readonly diag?: ForgeDiagEmitFace
  },
  ctx: {
    readonly projectId: string
    readonly task: TaskSnapshot
    readonly worktreeCwd?: string
    readonly submitCommitHash?: string
    readonly outcome: "success" | "blocked"
  },
): Promise<void> {
  try {
    // proposalId 门已退役（bug a31b96a2——proposal 域下线，检查点服务已改 containerSlug 归属）
    if (deps.checkpoints === undefined) return;
    if (!isReviewWavePoint(ctx.task, ctx.outcome)) return;
    const headCommit =
      (ctx.worktreeCwd !== undefined ? await (deps.resolveHeadCommit ?? gitHeadCommit)(ctx.worktreeCwd) : undefined) ??
      ctx.submitCommitHash;
    if (headCommit === undefined) {
      // 常态降级（无检出路径且无提交 = 无波锚可用）——info 级留痕即可，不刷 warn（bug fe8d5cb5）
      emitForgeDiag(deps.diag, {
        level: "info",
        event: "forge-settle",
        message: `forge settle: review-wave mark skipped (no base commit) for ${ctx.task.slug}/${ctx.task.localId}`,
        projectId: ctx.projectId,
      });
      return;
    }
    // 按波去重（写入时）：同 loop 实例（= 同一轮评审/走查）内后续波点命中已落 wave 行则不新增
    const loopSource = exclusiveLoopSourceOf({ slug: ctx.task.slug });
    if (loopSource !== undefined) {
      const dedupKey = `${ctx.projectId}\u0000${ctx.task.slug}\u0000${loopSource.loopId}`;
      if (WAVE_DEDUP_KEYS.has(dedupKey)) return;
      WAVE_DEDUP_KEYS.add(dedupKey);
    }
    const snapshots = await computeWaveSnapshot(deps.tasks, ctx.projectId, { slug: ctx.task.slug });
    await deps.checkpoints.appendCheckpoint({
      projectKey: ctx.projectId,
      containerSlug: ctx.task.slug, // 容器 slug 弱引用锚（proposalId → containerSlug 改锚终态）
      mark: "review-wave-N", // 一波一行（按波聚合去重后每次 append = 新波）；wave_seq 缺省域侧自动递增（免记序数）
      baseCommitHash: headCommit,
      snapshots,
    });
  } catch (cause) {
    emitForgeDiag(deps.diag, {
      level: "warn",
      event: "forge-settle",
      message: `forge settle: review-wave checkpoint failed for ${ctx.task.slug}/${ctx.task.localId}: ${cause instanceof Error ? cause.message : String(cause)}`,
      projectId: ctx.projectId,
    });
  }
}

// ─────────────────────────── submit 载荷读缝（v1 列面——settlements 行单源） ───────────────────────────

/** 最新结算行视图（submit 全语义载荷承载行——append 序末条） */
export interface LastSettlementView {
  readonly result: "success" | "blocked";
  readonly commitHash?: string;
  readonly evidence: SettlementEvidence;
}

/** 结算行读缝（结构兼容 settlement-repo listByTask 末条投影——装配侧注入） */
export interface SettleSettlementsFace {
  /** taskId → 最新结算行（append 序末条；无结算 = undefined） */
  lastByTask(taskId: string): Promise<LastSettlementView | undefined> | LastSettlementView | undefined;
}

/** 结算行 → submit 载荷字段投影（success summary / blocked reason / files / evidenceDebt） */
function submitFieldsOf(row: LastSettlementView | undefined): {
  commitHash?: string;
  files?: readonly string[];
  summary?: string;
  reason?: string;
  evidenceDebt?: { readonly suite: string; readonly specs: readonly string[]; readonly note?: string };
} {
  if (row === undefined) return {};
  const evidence = row.evidence;
  const files = "files" in evidence && evidence.files !== undefined ? evidence.files : undefined;
  const summary = "summary" in evidence ? evidence.summary : undefined;
  const reason = "reason" in evidence ? evidence.reason : undefined;
  const debt = "gates" in evidence ? evidence.gates?.evidenceDebt : undefined;
  return {
    ...(row.commitHash !== undefined && row.commitHash !== "" ? { commitHash: row.commitHash } : {}),
    ...(files !== undefined && files.length > 0 ? { files } : {}),
    ...(summary !== undefined ? { summary } : {}),
    ...(reason !== undefined ? { reason } : {}),
    ...(debt !== undefined ? { evidenceDebt: debt } : {}),
  };
}

/** blocked 任务的新建修复任务（listTasks created 降序——首个 sourceTask 命中 = 最新 fix） */
async function findFixTaskRef(tasks: TasksService, projectId: string, task: TaskSnapshot): Promise<TaskRef | undefined> {
  const cards = await tasks.listTasks({ projectKey: projectId, slug: task.slug, sort: "created" });
  for (const card of cards) {
    if (card.sourceTask !== undefined && card.sourceTask.slug === task.slug && card.sourceTask.localId === task.localId) {
      return { slug: card.slug, localId: card.localId };
    }
  }
  return undefined;
}

/** dispose 静默收尾（result 已定后的资源释放——异常不并进失败面） */
export async function disposeQuietly(handle: SpawnWorkerHandle): Promise<void> {
  try {
    await handle.dispose();
  } catch {
    // 收尾异常吞没：结算/失败面已定
  }
}

// ─────────────────────────── AC7 · 结算旁挂回收钩子（loop-recurrence-hardening 提案 §2.4） ───────────────────────────
// 结算返回前同步后置钩子（结算事务外 fail-soft）：settleWorkerRun 内 await 同步执行，探测运行时任务目录 <slug>/<localId>/ 顶层 .md 报告文件（非
// 递归——incident 等子目录不扫，零清单配置）复制进 specs 卷宗 <ws>/.forge/specs/<slug>/
// issues/<localId>/（与 Spec 文档 .forge/specs/{slug}/spec.md 同根——proposals 旧轨已随
// proposal 域退役，specs 替代 proposals，用户裁定 2026-11-25；不碰 <slug>/ 下既有文件）。
// 硬规则：不进结算事务（纯文件 IO 旁挂，先例 recordWaveCheckpoint
// / stampEvidenceValidity 后置模式）、不新建状态机态、零清单配置；目录空/复制失败 fail-soft
// + emitDiag 诊断日志（AGENTS §7），不影响任务结算态。

/**
 * 回收钩子路径解析缝（resolveDir 闭包注入——先例 sink.ts deriveTaskStoreDir(workspaceDir)）：
 * 运行时目录与卷宗路径根均经闭包注入派生，换注入即换落点；结算入参不携带路径。
 */
export interface SettleReportRecoveryDeps {
  /** projectId/slug/localId → 运行时任务目录绝对路径（缺席 = 该次回收惰性跳过） */
  resolveRuntimeTaskDir(input: {
    readonly projectId: string
    readonly slug: string
    readonly localId: string
  }): Promise<string | undefined>;
  /** projectId/slug/localId → specs 卷宗 issues 目录绝对路径（缺席 = 惰性跳过） */
  resolveSpecsIssuesDir(input: {
    readonly projectId: string
    readonly slug: string
    readonly localId: string
  }): Promise<string | undefined>;
}

/**
 * 生产装配工厂：运行时目录 = deriveTaskStoreDir 单源 + <slug>/<localId>；specs 卷宗
 * 路径根 = forgeDirOfWorkspace(wsPath)/specs/<slug>/issues/<localId>（@dsh-forge/lib-path
 * forgeDirOfWorkspace 单源派生 .forge 根——specs 替代 proposals）。路径派生经注入面消费
 * （运行期取值走 deps 注入，宿主迟到面）。两跳解析失败/项目未注册/派生缝缺席 = undefined
 * （fail-soft，该次回收惰性跳过）。
 */
export function createSettleReportRecovery(deps: {
  readonly projects: ProjectDirServiceFace
  readonly diag?: ForgeDiagEmitFace
  /** 运行时任务日志目录派生注入（taskLogsDirOf 同形——缺席 = 该径惰性跳过） */
  readonly taskLogsDir?: (workspaceDir: string, slug: string, localId: string) => string
  /** specs 卷宗 issues 目录派生注入（specsIssuesDirOf 同形——缺席 = 该径惰性跳过） */
  readonly specsIssuesDir?: (workspaceDir: string, slug: string, localId: string) => string
}): SettleReportRecoveryDeps {
  const workspaceOf = async (projectId: string): Promise<string | undefined> => {
    try {
      const project = await deps.projects.getProject(projectId);
      return project !== null && project.wsPath.trim() !== "" ? project.wsPath : undefined;
    } catch {
      return undefined;
    }
  };
  return {
    async resolveRuntimeTaskDir({ projectId, slug, localId }) {
      if (deps.taskLogsDir === undefined) return undefined;
      try {
        const ws = await workspaceOf(projectId);
        if (ws === undefined) return undefined;
        const derived = await deps.projects.deriveTaskStoreDir({ workspaceDir: ws });
        return derived.dir !== "" ? deps.taskLogsDir(derived.dir, slug, localId) : undefined;
      } catch {
        return undefined;
      }
    },
    async resolveSpecsIssuesDir({ projectId, slug, localId }) {
      if (deps.specsIssuesDir === undefined) return undefined;
      try {
        const ws = await workspaceOf(projectId);
        return ws !== undefined ? deps.specsIssuesDir(ws, slug, localId) : undefined;
      } catch {
        return undefined;
      }
    },
  };
}

/** 顶层 .md 报告回收（探测 → 复制正本；逐文件 fail-soft + 诊断日志——空目录/失败均留痕） */
export async function recoverSettleReports(
  deps: { readonly recovery: SettleReportRecoveryDeps; readonly diag?: ForgeDiagEmitFace },
  ctx: {
    readonly projectId: string
    readonly task: TaskSnapshot
  },
): Promise<readonly string[]> {
  const taskKey = `${ctx.task.slug}/${ctx.task.localId}`;
  try {
    const runtimeDir = await deps.recovery.resolveRuntimeTaskDir({
      projectId: ctx.projectId,
      slug: ctx.task.slug,
      localId: ctx.task.localId,
    });
    const issuesDir = await deps.recovery.resolveSpecsIssuesDir({
      projectId: ctx.projectId,
      slug: ctx.task.slug,
      localId: ctx.task.localId,
    });
    if (runtimeDir === undefined || issuesDir === undefined) {
      emitForgeDiag(deps.diag, {
        // warn（bug a31b96a2——装配漏接 = 生产回收恒不触发，不得静默 info）
        level: "warn",
        event: "forge-settle",
        message: `forge settle: report recovery skipped (path resolution unavailable) for ${taskKey}`,
        projectId: ctx.projectId,
      });
      return [];
    }
    let entries: import("node:fs").Dirent[];
    try {
      entries = await readdir(runtimeDir, { withFileTypes: true });
    } catch {
      emitForgeDiag(deps.diag, {
        // warn（bug 26dff330——供给端收口后目录应恒在：口径漏接/目录缺席不得静默 info）
        level: "warn",
        event: "forge-settle",
        message: `forge settle: report recovery skipped (runtime dir absent) for ${taskKey} at ${runtimeDir}`,
        projectId: ctx.projectId,
      });
      return [];
    }
    // 顶层 .md 非递归探测（零清单配置——目录内报告文件即清单）
    const reports = entries.filter((e) => e.isFile() && e.name.endsWith(".md")).map((e) => e.name);
    if (reports.length === 0) {
      emitForgeDiag(deps.diag, {
        level: "info",
        event: "forge-settle",
        message: `forge settle: report recovery found no top-level .md reports for ${taskKey}`,
        projectId: ctx.projectId,
      });
      return [];
    }
    await mkdir(issuesDir, { recursive: true });
    const copied: string[] = [];
    for (const name of reports) {
      try {
        await copyFile(join(runtimeDir, name), join(issuesDir, name));
        copied.push(name);
      } catch (cause) {
        emitForgeDiag(deps.diag, {
          level: "warn",
          event: "forge-settle",
          message: `forge settle: report recovery copy failed for ${taskKey}/${name}: ${cause instanceof Error ? cause.message : String(cause)}`,
          projectId: ctx.projectId,
        });
      }
    }
    emitForgeDiag(deps.diag, {
      level: "info",
      event: "forge-settle",
      message: `forge settle: report recovery archived ${copied.length}/${reports.length} report(s) for ${taskKey} → ${issuesDir}`,
      projectId: ctx.projectId,
    });
    return copied;
  } catch (cause) {
    // fail-soft 兜底：回收任何异常不影响已定结算态
    emitForgeDiag(deps.diag, {
      level: "warn",
      event: "forge-settle",
      message: `forge settle: report recovery failed for ${taskKey}: ${cause instanceof Error ? cause.message : String(cause)}`,
      projectId: ctx.projectId,
    });
    return [];
  }
}

// ─────────────────────────── 提交落点核验（1.14 判例修复——cwd 钉定收口） ───────────────────────────

/** 提交落点核验结论（判据：commit 所属分支集 ⊇ 容器检出分支） */
export type CommitLandingVerdict =
  | { readonly ok: true; readonly branch: string }
  | { readonly ok: false; readonly branch: string; readonly commitBranches: readonly string[] };

/** 提交落点核验器（容器检出目录 + commit hash → 落点结论；单测注入桩） */
export type CommitLandingVerifier = (
  worktreeDir: string,
  commitHash: string,
) => Promise<CommitLandingVerdict>;

/**
 * git 真核验：容器检出当前分支 vs 提交可达分支集（git branch --show-current /
 * branch --contains）。detached HEAD（无检出分支）= 故障抛出——落点判据不成立。
 */
export const gitCommitLanding: CommitLandingVerifier = async (worktreeDir, commitHash) => {
  const run = (args: readonly string[]): Promise<string> =>
    new Promise((resolve, reject) => {
      const git = execFile("git", ["-C", worktreeDir, ...args], { encoding: "utf8" }, (error, stdout) =>
        error == null ? resolve(stdout) : reject(error),
      );
      // 结算期 git 核验 = 宿主自有子进程（worker 守卫已 reclaim）——显式登记防并发循环 keeper 误收编误杀
      noteHostOwnedChild(git);
    });
  const branch = (await run(["branch", "--show-current"])).trim();
  if (branch === "") throw new Error(`容器检出不在分支上（detached HEAD）：${worktreeDir}`);
  const commitBranches = (await run(["branch", "--contains", commitHash, "--format=%(refname:short)"]))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");
  return commitBranches.includes(branch) ? { ok: true, branch } : { ok: false, branch, commitBranches };
};

/**
 * e2e 取证债欠账任务（改进7）：success 结算携带 evidenceDebt = 实现态部分结算——同容器
 * 自动生成独立 test-run 欠账任务（dependsOn 实现卡 localId，不阻塞源卡——实现卡已
 * completed）。落库失败 fail-soft（diag 告警留痕，不回滚已定结算）。
 */
async function createE2eDebtTask(
  deps: { readonly tasks: TasksService; readonly diag?: ForgeDiagEmitFace },
  ctx: { readonly projectId: string; readonly task: TaskSnapshot },
  debt: { readonly suite: string; readonly specs: readonly string[]; readonly note?: string },
  e2eBaselineRedCases?: readonly string[],
): Promise<DispatchSpawnedResult["evidenceDebt"]> {
  try {
    const specsLine = debt.specs.join(", ");
    const added = await deps.tasks.addTask({
      projectKey: ctx.projectId,
      slug: ctx.task.slug,
      title: `e2e 补充验证：${ctx.task.title}`,
      type: "test-run",
      brief: [
        `任务 ${ctx.task.slug}/${ctx.task.localId} 已完成实现与单元测试；本任务补做它还未完成的真机 e2e 验证。`,
        `e2e 套件：${debt.suite}；待验证 spec：${specsLine}。`,
        ...(debt.note !== undefined ? [`补充说明：${debt.note}`] : []),
        // 文案与简报行真实存在性一致（bug ca061ef6）：简报红灯清单在场才指示比对——
        // 无红灯/基线门未接线时兜底文案，不指示真机不存在的简报行
        e2eBaselineRedCases !== undefined && e2eBaselineRedCases.length > 0
          ? "执行 e2e 并断言上述 spec；如遇失败，先比对任务说明中的 E2E_BASELINE_RED 行——其中列出的失败在本任务开始前就已存在，不是本任务造成的回归；上报结论时注明这一背景。双轨基线并存时以 E2E_BASELINE_RED 用例级清单优先，TEST_BASELINE 文档基线作补充归因参考。"
          : "执行 e2e 并断言上述 spec；本任务创建时说明中没有 E2E_BASELINE_RED 行（基线未启用，或当时没有已知的既有失败）——遇失败不要默认当作本任务的回归，先区分三类原因（环境问题 / 断言过时 / 真实回归）再上报。双轨基线并存时以 E2E_BASELINE_RED 用例级清单优先，TEST_BASELINE 文档基线作补充归因参考。",
      ].join("\n"),
      dependsOn: [ctx.task.localId],
      priority: "P1",
      context: { E2E_DEBT_SOURCE: `${ctx.task.slug}/${ctx.task.localId}`, E2E_DEBT_SPECS: specsLine },
    });
    return { taskRef: { slug: added.slug, localId: added.localId }, suite: debt.suite, specs: debt.specs };
  } catch (cause) {
    emitForgeDiag(deps.diag, {
      level: "warn",
      event: "forge-settle",
      message: `forge settle: e2e debt test-run task failed for ${ctx.task.slug}/${ctx.task.localId}: ${cause instanceof Error ? cause.message : String(cause)}`,
      projectId: ctx.projectId,
    });
    return undefined;
  }
}

/**
 * 落点核验失败显式处置（bug d8029b20）：任务 completed → interrupted 真化（transitionTask
 * 人工转移合法边——可恢复态，非 completed 挂死）；真化失败 fail-loud 注记进判词（任务留
 * completed 需人工转移，绝不静默）。返回 landing-rejected——循环径据此挂起升级，不走
 * worker-abort 失败阶梯。
 */
async function rejectLanding(
  deps: { readonly tasks: TasksService },
  ctx: { readonly projectId: string; readonly task: TaskSnapshot },
  cause: Error,
): Promise<{ readonly case: "landing-rejected"; readonly cause: Error }> {
  try {
    await deps.tasks.transitionTask({
      projectKey: ctx.projectId,
      taskId: ctx.task.taskId,
      toStatus: "interrupted",
      reason: cause.message,
      actor: "core", // 循环自动化纠偏——审计归因不再误记人类通道 'ui'
    });
  } catch (transitionCause) {
    return {
      case: "landing-rejected",
      cause: new Error(
        `${cause.message}；interrupted 真化失败（任务留 completed 态需人工转移）：${transitionCause instanceof Error ? transitionCause.message : String(transitionCause)}`,
      ),
    };
  }
  return { case: "landing-rejected", cause };
}

/** worker 终态结算判定（settleWorkerRun 产物——失败支合并 run 拒绝与无结算，kill 由调用方 taxonomy 判定） */
export type WorkerSettlement =
  | { readonly case: "settled"; readonly result: Omit<DispatchSpawnedResult, "kind">; readonly durationMs: number }
  | {
      readonly case: "failed"
      readonly cause: unknown
      /** 分桶标记（spawn-false-alarm——run 正常结束但未 submitTask = 协议违约，非 spawn/进程故障） */
      readonly noSettlement?: boolean
    }
  | { readonly case: "landing-rejected"; readonly cause: Error };

/**
 * worker 终态结算核（async-dispatch §4.2 ②③——前台 execute 第 4~5 步原样搬迁的共用体，
 * 前台阻塞径与后台 done continuation 同源消费，保证「结算块 = spawned 分支原样投影」）：
 * await handle.result（传递性含 worker submitTask + 落账）→ disposeQuietly → queryTask
 * 只读结算读 → 三_case 判定（settled：spawned 分支字段面全量构建；failed：run 拒绝/
 * 无结算同归防线径）。
 */
export async function settleWorkerRun(
  deps: {
    readonly tasks: TasksService
    /** 提交落点核验器（可选——缺席回落 gitCommitLanding 真核验；单测注入桩） */
    readonly commitLanding?: CommitLandingVerifier
    /** checkpoints 域服务消费面（可选——机械④ review-wave-N 修正波标记；缺席 = 机制惰性不判，行为零变化） */
    readonly checkpoints?: SettleCheckpointsFace
    /** 容器分支 HEAD 解析器（可选——缺席回落 gitHeadCommit 真解析；单测注入桩） */
    readonly resolveHeadCommit?: HeadCommitResolver
    /** 诊断发射缝（diag-face-consolidation——结算核 fail-soft 告警走 diag 面；缺席 = console 兜底） */
    readonly diag?: ForgeDiagEmitFace
    /**
     * AC7 结算旁挂回收缝（loop-recurrence-hardening §2.4——可选；缺席 = 机制惰性不判，
     * 行为零变化）。success 结算后置回收，fail-soft 不影响结算态。
     */
    readonly reportRecovery?: SettleReportRecoveryDeps
    /**
     * 结算行读缝（v1 列面——submit 全语义载荷归 task_settlements 行；缺席 = submit 载荷面
     * 降级：commitHash/summary/reason/files/evidenceDebt 全缺，终态判定不受影响）。
     */
    readonly settlements?: SettleSettlementsFace
  },
  ctx: {
    readonly projectId: string
    readonly task: TaskSnapshot
    /** claim 简报指纹（spawned 分支 digest 字段同源——task_records.claim 行双记同值） */
    readonly digest: string
    /** 池快照口径（1.10：scoped 派发 = 该容器 slug——结算 spawned 分支快照四计数同口径；
     *  缺席 = 全池，非 scoped 调用零变化。注意与 ctx.task.slug 相异：非 scoped 调用
     *  不得借任务容器收窄——全池口径保持） */
    readonly poolSource?: ContainerRef
    /**
     * 容器检出路径（1.14——LoopRecord.worktree 钉定归属）：success + commitHash 在场时
     * 核验提交落点（commit 所属分支 = 容器检出分支）；缺席 = 不核验（工具壳行为零变化）。
     */
    readonly worktreeCwd?: string
    /**
     * 本项目文档根绝对路径（<工作区根>/.forge/docs——跨分支特例归属判据锚）：在场时纯文档
     * 特例按绝对路径归属核验（resolve 后必须落在 docsRoot 内——他项目 .forge/docs 文档不命中）；
     * 缺席 = 回落 '.forge/docs/' 前缀判据（fail-soft——装配未接线时零变化）。
     */
    readonly docsRoot?: string
    /** 本轮 claim 简报红灯清单（改进7——欠账卡文案一致性判据；缺席/空 = 兜底文案） */
    readonly e2eBaselineRedCases?: readonly string[]
    readonly handle: SpawnWorkerHandle
    /** spawn 起点（durationMs 基准） */
    readonly spawnStartedAt: number
    /** worker 终态落定后、结算读前的回调（后台径 settled:reading 里程碑投影点；前台径缺席零发射） */
    readonly onReading?: () => void
  },
): Promise<WorkerSettlement> {
  let run: Awaited<SpawnWorkerHandle["result"]>;
  try {
    run = await ctx.handle.result;
  } catch (cause) {
    forgetWorkerSourceTask(ctx.handle.workerSessionId); // 来源任务登记注销（fix-bug 注入源——结算即清）
    await disposeQuietly(ctx.handle);
    return { case: "failed", cause };
  }
  const durationMs = Date.now() - ctx.spawnStartedAt;
  forgetWorkerSourceTask(ctx.handle.workerSessionId); // 结算即清（成功/失败同径）
  await disposeQuietly(ctx.handle);
  ctx.onReading?.();

  // 结算读：worker 自行 submitTask 落账（AC gate 在服务侧）；此处只读终态
  const settled = await deps.tasks.queryTask({
    projectKey: ctx.projectId,
    taskRef: { slug: ctx.task.slug, localId: ctx.task.localId },
  });
  const status = settled.task.taskStatus;
  if (status !== "completed" && status !== "blocked") {
    // worker 未产出（完成但无结算——refusal/max-tokens/漏提交同径）：执行受阻语义，
    // 任务留 in_progress 走幂等重入径（不走 submit-blocked）；
    // 输出原文随判词携带（bug 63112ab2——循环侧流控分类的载体；截断防长文进防线面）
    const detail = run.output.trim().slice(0, 500);
    return {
      case: "failed",
      cause: new Error(`worker run ended without a settlement (stopReason: ${run.stopReason})${detail !== "" ? `: ${detail}` : ""}`),
      noSettlement: true, // 分桶：跑完未结算（协议违约）——报文类别不得冠 spawn-failed（判例 014 误报）
    };
  }

  const outcome: "success" | "blocked" = status === "completed" ? "success" : "blocked";
  // submit 载荷投影（v1 列面——settlements 行单源；缝缺席 = 载荷面降级）
  const submit = submitFieldsOf(await deps.settlements?.lastByTask(ctx.task.taskId));
  // 提交落点核验（1.14——cwd 钉定收口）：success + commitHash + 容器检出现在场时核验
  // 「commit 所属分支 = 容器检出分支」；不一致/核验故障 = landing-rejected 显式处置
  // （bug d8029b20——submitTask 已落 completed 后再走 worker-abort 阶梯 = 任务终态不可再领、
  // 错分支提交被静默接受。显式处置：任务 completed → interrupted 真化（人工转移合法边，
  // 可恢复态）+ 专案判词交循环挂起升级——提交落错分支（判例 366bec6a 落 main）不得静默通过。
  // Root cause: 核验时点晚于终态落定，失败面必须自带状态纠偏，不能依赖触不到该任务的阶梯。）
  if (outcome === "success" && submit.commitHash !== undefined && ctx.worktreeCwd !== undefined) {
    const verify = deps.commitLanding ?? gitCommitLanding;
    try {
      const verdict = await verify(ctx.worktreeCwd, submit.commitHash);
      // 跨分支结算特例（用户裁决 2026-10-24）：纯本项目 .forge/docs/ 文档提交允许落容器分支
      // 之外（文档属工作区留盘产物，不入容器分支交付面）。判据 = files 全量归属于文档根——
      // docsRoot 在场时 resolve 到绝对路径核验包含关系（他项目 .forge/docs 不命中）；缺席
      // 回落 '.forge/docs/' 前缀判据。fail-closed：files 缺席或含任一文档外路径仍拒绝。
      const fileInsideDocsRoot = (f: string): boolean => {
        if (ctx.docsRoot === undefined) return f.replaceAll("\\", "/").startsWith(".forge/docs/");
        const abs = isAbsolute(f) ? f : resolve(resolve(ctx.docsRoot, "..", ".."), f);
        const rel = relative(ctx.docsRoot, abs);
        return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
      };
      const docsOnly =
        submit.files !== undefined && submit.files.length > 0 && submit.files.every(fileInsideDocsRoot);
      if (!verdict.ok && !docsOnly) {
        // 特例未命中原因（申报缺漏 vs 范围越界，一一对应纠正路径①②的前提差异）
        const docsBasis = ctx.docsRoot !== undefined ? `本项目文档根 ${ctx.docsRoot}` : "'.forge/docs/' 前缀";
        const causeHint =
          submit.files === undefined || submit.files.length === 0
            ? `submitTask 未申报 files（特例判据 = files 全量归属于 ${docsBasis}）`
            : `files 含文档外路径：${submit.files.filter((f) => !fileInsideDocsRoot(f)).join("、")}`;
        return await rejectLanding(deps, ctx, new Error(
          [
            `[settle-cwd-pin] 提交分支核验未通过：提交 ${submit.commitHash} 不在容器检出分支 ${verdict.branch} 上（所在分支：${verdict.commitBranches.join(", ") || "任一本地分支均不可达"}），结算拒绝`,
            `原因：${causeHint}，不适用纯文档跨分支特例`,
            `纠正（按改动性质二选一）：① 含代码/测试 → git checkout ${verdict.branch} 后按任务范围重新提交，重新 submitTask 附新 commitHash；② 纯文档 → 重新 submitTask，files 逐文件如实列出且全部归属于 .forge/docs/`,
          ].join("\n"),
        ));
      }
    } catch (cause) {
      return await rejectLanding(deps, ctx, new Error(
        `[settle-cwd-pin] 提交落点核验故障（容器检出 ${ctx.worktreeCwd}，提交 ${submit.commitHash}）：${cause instanceof Error ? cause.message : String(cause)}`,
      ));
    }
  }
  // 机械④：修正波结算点落 review-wave-N 检查点（blocked = Blocker 返工批；fix 类任务收口
  // = fix 链收口）——fail-soft，落点核验拒绝径（landing-rejected 提前返回）不落标记
  await recordWaveCheckpoint(
    { tasks: deps.tasks, checkpoints: deps.checkpoints, resolveHeadCommit: deps.resolveHeadCommit, diag: deps.diag },
    {
      projectId: ctx.projectId,
      task: ctx.task,
      worktreeCwd: ctx.worktreeCwd,
      submitCommitHash: submit.commitHash,
      outcome,
    },
  );
  // AC7 旁挂回收（结算成功后置——不进结算事务）：success 结算回收运行时目录顶层 .md 报告
  // 进 specs 卷宗 issues；fail-soft（内部全路径诊断留痕），结算态零影响。
  // proposalId 门已退役（bug a31b96a2——proposal 域下线，装配层从未注入 resolveProposalId
  // 导致生产恒不触发）；现 success + reportRecovery 在场即执行。
  if (outcome === "success" && deps.reportRecovery !== undefined) {
    await recoverSettleReports(
      { recovery: deps.reportRecovery, diag: deps.diag },
      { projectId: ctx.projectId, task: ctx.task },
    );
  }
  const followUp = outcome === "blocked" ? await findFixTaskRef(deps.tasks, ctx.projectId, ctx.task) : undefined;
  // 改进7：实现态部分结算（evidenceDebt 在场）→ 自动生成欠账 test-run 任务（fail-soft）
  const evidenceDebt =
    outcome === "success" && submit.evidenceDebt !== undefined
      ? await createE2eDebtTask({ tasks: deps.tasks, diag: deps.diag }, ctx, submit.evidenceDebt, ctx.e2eBaselineRedCases)
      : undefined;
  const pool: PoolSnapshot = poolOf(
    await deps.tasks.taskStats({
      projectKey: ctx.projectId,
      ...(ctx.poolSource !== undefined ? { slug: ctx.poolSource.slug } : {}),
    }),
  );
  return {
    case: "settled",
    durationMs,
    result: {
      outcome,
      taskRef: { slug: ctx.task.slug, localId: ctx.task.localId },
      title: ctx.task.title,
      type: ctx.task.taskType,
      digest: ctx.digest,
      ...(outcome === "success" && submit.summary !== undefined ? { summary: submit.summary } : {}),
      ...(outcome === "blocked"
        ? { reason: submit.reason ?? "blocking reason not recorded" }
        : {}),
      ...(submit.commitHash !== undefined ? { commitHash: submit.commitHash } : {}),
      ...(submit.files !== undefined ? { files: submit.files } : {}),
      ...(followUp !== undefined ? { followUp } : {}),
      ...(evidenceDebt !== undefined ? { evidenceDebt } : {}),
      pool,
    },
  };
}
