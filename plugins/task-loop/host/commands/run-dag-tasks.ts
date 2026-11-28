// commands · /run-dag-tasks 指令 handler（plugin-forge src/commands/run-dag-tasks.ts 直迁
// ——proposal plugin-task-loop 任务 1.11；slug 化：nonTerminalSourcesOf 按 TaskCard.
// containerSlug 分组（无 kind），kind/双轨措辞全改 slug 单轨；forgeCommandLineMessage 不
// 迁移——单行提交载荷改本插件最小实现 dispatchLineMessage（鸭子面同形，循环哨兵
// state='dispatch'、task=slug 保留））。UI command plane 执行、零模型消息：
// 无参 → tasks.listTasks 单查询派生「尚有非终态任务的任务源」清单 → userQuestions.ask 弹
// 选项；带参 <slug> 直通；跑动中再触发 → 查看/停止/替换问询。启动 = loopDriver.start——
// 派发/继续判定与启动模板叙述归循环驱动器（实装随循环驱动器迁移落位）；本 handler 只做
// 枚举/问询/启动编排，外加启动链前段的派发指令单行提交（先落实会话，再启动循环——提交
// 成功 = 会话物化后才 driver.start；提交失败 = 会话未创建成功，循环不启动）。
//
// 作用域纪律：停止与替换恒经 driver.stop({ownerSessionId: 敲指令会话})——驱动器按归属拒绝
// 他会话循环（跨会话隔离）；本会话无活循环的停止 = no-op 文本，不附归属。
import { askOption } from "../loop/escalation-ask.js";
import type { EscalationAskFace } from "../loop/escalation-ask.js";
import type { LoopDriver } from "../loop/driver-face.js";
import type { LoopRecord } from "../loop/registry.js";
import type { ContainerRef, TaskCard } from "../domain/tasks/types.js";
import { emitForgeDiag } from "../faces.js";
import type { ForgeCommandInvocation, ForgeCommandResult, ForgeDiagEmitFace, ForgeDiagPayload } from "./faces.js";
import { NO_ACTIVE_LOOP_TEXT } from "./stop-dag-tasks.js";
import { TASK_STATUS_LABELS, type TaskStatus } from "@dsh-forge/lib-api/labels";

/** 指令名（GUI 派发按钮换值锚——'/run-dag-tasks '） */
export const RUN_DAG_TASKS_NAME = "run-dag-tasks";

/** 任务源选择问询 id（userQuestions answers 回读键） */
const SOURCE_QUESTION_ID = "forge-run-dag-tasks-source";
/** 跑动中再触发的操作问询 id */
const RUNNING_QUESTION_ID = "forge-run-dag-tasks-running";

/** 终态集（completed/skipped/rejected——本地镜像纪律：值漂移由契约 pin 承接） */
const TERMINAL_TASK_STATUSES: ReadonlySet<TaskStatus> = new Set<TaskStatus>(["completed", "skipped", "rejected"]);

/** 非终态呈现序（用户视角：正在执行 → 受阻 → 已中断 → 待处理 → 已挂起） */
const NON_TERMINAL_ORDER: readonly TaskStatus[] = ["in_progress", "blocked", "interrupted", "pending", "suspended"];

/** 指令单行 user 消息（本插件最小实现——旧 forgeCommandLineMessage 鸭子面同形；
 *  source.kind='forge-loop' 循环哨兵：loopKind='dispatch'、task=容器 slug、state='dispatch'） */
function dispatchLineMessage(text: string, loop: { readonly task: string; readonly state: string }): unknown {
  return {
    id: crypto.randomUUID(),
    role: "user",
    content: [{ type: "text", text }],
    source: { kind: "forge-loop", loopKind: "dispatch", runId: crypto.randomUUID(), task: loop.task, state: loop.state, form: "notice", summary: text },
  };
}

/** handler 依赖（装配方注入——driver 单例 + 域读面 + cwd→projectKey 解析 + 问询面可缺席） */
export interface RunDagTasksDeps {
  readonly driver: LoopDriver;
  /** 任务域读面（最小面——本 handler 只消费 listTasks 全量卡；结构兼容域层 listTasks） */
  readonly tasks: { listTasks(q: { readonly projectKey: string }): Promise<readonly TaskCard[]> };
  /** cwd → projectKey 解析（敲指令会话 cwd 绑定表；未命中 = 未注册错误回执，零状态触达） */
  readonly resolveProjectKey: (cwd: string) => string | undefined;
  /** userQuestions.ask 最小面（可选——缺席 = 无参枚举/跑动中问询降级为指引文本，fail-soft 同源） */
  readonly ask?: EscalationAskFace;
  /** 会话 id → agentsRegistry 活根解析（可选——指令单行 followup 目标解析；缺席 = 退回
   *  invocation agent fallback） */
  readonly resolveAgent?: (ownerSessionId: string) => unknown;
  /** 未进入会话激活面（可选——缺席 = 激活不可达，保持回执指引语义） */
  readonly enterAgent?: (ownerSessionId: string) => Promise<unknown>;
  /** 诊断发射缝（激活/提交 fail-soft 告警走 diag 面；缺席 = console 按级兜底） */
  readonly diag?: ForgeDiagEmitFace;
}

// ─────────────────────────── 单查询枚举（「尚有非终态任务的任务源」） ───────────────────────────

/** 候选行（label = slug——问询回读键；description = 用户视角余量摘要） */
export interface SourceCandidate {
  readonly source: ContainerRef;
  readonly label: string;
  readonly description: string;
}

/**
 * 单查询派生候选（listTasks 全量卡 → 按 TaskCard.containerSlug 分组（slug 单轨——无 kind
 * 判别词）→ 过滤全终态源）。排序：未完成多者在前，同量按 slug 稳定决胜。
 */
export function nonTerminalSourcesOf(cards: readonly TaskCard[]): readonly SourceCandidate[] {
  const groups = new Map<string, { source: ContainerRef; counts: Map<TaskStatus, number> }>();
  for (const card of cards) {
    if (TERMINAL_TASK_STATUSES.has(card.taskStatus)) continue; // 终态行不入候选计数（守卫显式化）
    const key = card.containerSlug;
    let group = groups.get(key);
    if (group === undefined) {
      group = { source: { slug: key }, counts: new Map<TaskStatus, number>() };
      groups.set(key, group);
    }
    group.counts.set(card.taskStatus, (group.counts.get(card.taskStatus) ?? 0) + 1);
  }
  const candidates: (SourceCandidate & { open: number })[] = [];
  for (const group of groups.values()) {
    let open = 0;
    const parts: string[] = [];
    for (const status of NON_TERMINAL_ORDER) {
      const n = group.counts.get(status) ?? 0;
      if (n > 0) {
        open += n;
        parts.push(`${TASK_STATUS_LABELS[status].zh} ${n}`);
      }
    }
    if (open > 0) {
      candidates.push({
        source: group.source,
        label: group.source.slug,
        description: `未完成 ${open}（${parts.join("，")}）`,
        open,
      });
    }
  }
  return candidates
    .sort((a, b) => (a.open !== b.open ? b.open - a.open : a.label < b.label ? -1 : 1))
    .map(({ source, label, description }) => ({ source, label, description }));
}

/** slug → 任务源解析（同一单查询读面——slug 容器：任一卡命中即直通） */
async function resolveSourceBySlug(tasks: RunDagTasksDeps["tasks"], projectKey: string, slug: string): Promise<ContainerRef | undefined> {
  const cards = await tasks.listTasks({ projectKey });
  const found = cards.find((card) => card.containerSlug === slug);
  return found !== undefined ? { slug: found.containerSlug } : undefined;
}

// ─────────────────────────── 问询（与 ask_user_question 同渲染面） ───────────────────────────
// 单选收束协议（三路：选中/取消/故障）单源在 loop/escalation-ask.ts askOption——本面消费。
// 故障回执附「带 slug 直通」指引，取消回执归静默不做；非活根（assertLiveRoot 抛）落在
// 故障路：回执带原因码，不静默、不降级无 agent 重问。

// ─────────────────────────── handler ───────────────────────────

/** 启动编排上下文（会话身份 + 项目解析产物） */
interface InvokeContext {
  readonly projectKey: string;
  readonly sessionId: string;
  readonly parent: unknown;
  /** 发起会话 cwd（LoopRecord.worktree 归属：worker cwd 钉定 + 提交落点核验锚） */
  readonly worktree?: string;
  readonly signal?: AbortSignal;
}

/** handler（ForgeCommandDefinition.handler 形状——UI command plane 直执行，零模型消息） */
export function createRunDagTasksHandler(
  deps: RunDagTasksDeps,
): (invocation: ForgeCommandInvocation) => Promise<ForgeCommandResult> {
  return async ({ agent, rawInput, signal }: ForgeCommandInvocation): Promise<ForgeCommandResult> => {
    // agent 结构化鸭子读（官方 Agent 子面：session.id / session.cwd / header.cwd）
    const duck = agent as
      | { readonly session?: { readonly id?: string; readonly cwd?: string; readonly header?: { readonly cwd?: string } } }
      | undefined;
    const sessionId = duck?.session?.id ?? "";
    if (sessionId === "") {
      return { kind: "error", text: "指令调用缺少会话身份，无法派发任务" };
    }
    // 会话身份与工作区解析（cwd 绑定表未命中 = 未注册——指令面错误回执，零状态触达）
    const cwd = duck?.session?.header?.cwd ?? duck?.session?.cwd;
    const projectKey = cwd !== undefined ? deps.resolveProjectKey(cwd) : undefined;
    if (projectKey === undefined) {
      return { kind: "error", text: "当前工作区未注册项目，无法派发任务" };
    }
    const ctx: InvokeContext = {
      projectKey,
      sessionId,
      parent: agent,
      ...(cwd !== undefined ? { worktree: cwd } : {}),
      ...(signal !== undefined ? { signal } : {}),
    };
    const slug = rawInput.trim();
    try {
      // 跑动中再触发（本会话活循环 → 查看/停止/替换问询）。多会话并行：不同会话可各跑
      // 不同任务源；仅「同一任务源已被其它会话派发」时按需拦截（带参径在 startWithSlug
      // 判定，无参径在 pickAndStart 候选过滤）。
      const own = deps.driver.activeOf(ctx.sessionId);
      if (own !== undefined) {
        return await handleRunning(deps, ctx, own, slug);
      }
      if (slug !== "") {
        return await startWithSlug(deps, ctx, slug); // 带参直通（含同源占用判定）
      }
      return await pickAndStart(deps, ctx); // 无参枚举 + 问询（在跑源已过滤）
    } catch (cause) {
      return { kind: "error", text: `派发启动失败：${cause instanceof Error ? cause.message : String(cause)}` };
    }
  };
}

/** 同源占用判定（多会话并行——同 slug 已被其它会话派发 = 占用行） */
function sameSourceBusy(deps: RunDagTasksDeps, source: ContainerRef): LoopRecord | undefined {
  return deps.driver.activeAll().find((record) => record.source.slug === source.slug);
}

/** 带参直通：精确 slug → 模糊子串过滤（唯一命中直通；多命中弹选项；零命中 = 错误回执 + 指引） */
async function startWithSlug(deps: RunDagTasksDeps, ctx: InvokeContext, slug: string): Promise<ForgeCommandResult> {
  const source = await resolveSourceBySlug(deps.tasks, ctx.projectKey, slug);
  if (source !== undefined) {
    return startResolved(deps, ctx, source, slug);
  }
  // 模糊过滤（子串包含）：候选 = 尚有非终态任务的任务源（在跑源已排除——同 pickAndStart 口径）
  const all = nonTerminalSourcesOf(await deps.tasks.listTasks({ projectKey: ctx.projectKey }));
  const busyKeys = new Set(deps.driver.activeAll().map((record) => record.source.slug));
  const matches = all.filter((candidate) => candidate.source.slug.includes(slug) && !busyKeys.has(candidate.source.slug));
  if (matches.length === 0) {
    return { kind: "error", text: `没有找到任务源 ${slug}——可执行无参 /run-dag-tasks 查看可派发的任务源` };
  }
  if (matches.length === 1) {
    const [only] = matches;
    if (only !== undefined) {
      return startResolved(deps, ctx, only.source, slug);
    }
  }
  if (deps.ask === undefined) {
    const labels = matches.map((candidate) => candidate.label).join("、");
    return { kind: "error", text: `「${slug}」模糊命中多个任务源（${labels}）——问询通道不可用，请带完整 slug 直通：/run-dag-tasks <slug>` };
  }
  const outcome = await askOption(
    deps.ask,
    {
      id: SOURCE_QUESTION_ID,
      header: "派发任务",
      question: `「${slug}」模糊命中 ${matches.length} 个任务源，选择要派发的`,
      detail: "选中后自动开始派发循环，任务逐一执行直到该任务源全部完成。",
      options: matches.map((candidate) => ({ label: candidate.label, description: candidate.description })),
    },
    ctx.signal,
    ctx.parent,
  );
  if (outcome.kind === "selected") {
    const selected = matches.find((candidate) => candidate.label === outcome.label);
    if (selected !== undefined) {
      return startResolved(deps, ctx, selected.source, slug);
    }
  }
  if (outcome.kind === "failed") {
    return { kind: "error", text: `任务源问询通道故障（${outcome.reason}）——可带完整任务源 slug 直通：/run-dag-tasks <slug>` };
  }
  return { kind: "success", text: "未选择任务源，未启动派发循环——可带完整 slug 直通：/run-dag-tasks <slug>" };
}

/** 已解析源收口：同源占用判定 → 启动 */
async function startResolved(deps: RunDagTasksDeps, ctx: InvokeContext, source: ContainerRef, slug: string): Promise<ForgeCommandResult> {
  const busy = sameSourceBusy(deps, source);
  if (busy !== undefined) {
    return foreignLoopNotice(busy, slug);
  }
  return startSource(deps, ctx, source);
}

/** 无参：单查询枚举 → 在跑源过滤 → 问询选择 → 启动（零候选/未选/问询缺席 = 不启动 fail-soft 收口） */
async function pickAndStart(deps: RunDagTasksDeps, ctx: InvokeContext): Promise<ForgeCommandResult> {
  const all = nonTerminalSourcesOf(await deps.tasks.listTasks({ projectKey: ctx.projectKey })); // 单查询
  // 多会话并行：已在跑的源（无论哪个会话持有）不入候选——同一任务源不能双派发
  const busyKeys = new Set(deps.driver.activeAll().map((record) => record.source.slug));
  const candidates = all.filter((candidate) => !busyKeys.has(candidate.source.slug));
  if (candidates.length === 0) {
    if (all.length > 0) {
      const running = deps.driver
        .activeAll()
        .map((record) => record.source.slug)
        .join("、");
      return { kind: "success", text: `其余任务源均已派发中（${running}），没有可新派发的任务源——不同任务源可在其它会话并行派发，或等待在跑循环完成` };
    }
    return { kind: "success", text: "没有未完成的任务，无需派发" };
  }
  if (deps.ask === undefined) {
    return { kind: "success", text: "当前没有可用的问询通道——请带任务源 slug 执行 /run-dag-tasks <slug>" };
  }
  const outcome = await askOption(
    deps.ask,
    {
      id: SOURCE_QUESTION_ID,
      header: "派发任务",
      question: "选择要派发的任务源",
      detail: "选中后自动开始派发循环，任务逐一执行直到该任务源全部完成。",
      options: candidates.map((candidate) => ({ label: candidate.label, description: candidate.description })),
    },
    ctx.signal,
    ctx.parent, // ask 活根定向（无 agent 无应答器接受——NO_PROVIDER 面板不弹）
  );
  if (outcome.kind === "selected") {
    const selected = candidates.find((candidate) => candidate.label === outcome.label);
    if (selected !== undefined) {
      return startSource(deps, ctx, selected.source);
    }
  }
  if (outcome.kind === "failed") {
    // 问询通道故障（NO_PROVIDER/异常/非活根）≠ 用户取消——error 回执 + slug 直通指引，不静默
    return { kind: "error", text: `任务源问询通道故障（${outcome.reason}）——可带任务源 slug 直通：/run-dag-tasks <slug>` };
  }
  return { kind: "success", text: "未选择任务源，未启动派发循环——可带 slug 直通：/run-dag-tasks <slug>" };
}

/** 跑动中再触发：查看/停止/替换问询（停止/替换恒经本会话作用域） */
async function handleRunning(deps: RunDagTasksDeps, ctx: InvokeContext, running: LoopRecord, slug: string): Promise<ForgeCommandResult> {
  if (deps.ask === undefined) {
    return runningView(running); // 问询面缺席 = 降级为查看文本（fail-soft 同源）
  }
  const outcome = await askOption(
    deps.ask,
    {
      id: RUNNING_QUESTION_ID,
      header: "派发循环进行中",
      question: `任务源 ${running.source.slug} 已有派发循环在运行，要做什么？`,
      detail:
        running.inFlight !== undefined
          ? `正在执行：${running.inFlight.taskKey} ${running.inFlight.title}`
          : "当前没有正在执行的任务",
      options: [
        { label: "查看", description: "看看当前进行到哪了" },
        { label: "停止", description: "停止本会话启动的派发循环" },
        { label: "替换", description: "停止本会话的循环，改为派发其它任务源" },
      ],
    },
    ctx.signal,
    ctx.parent, // ask 活根定向（无 agent 无应答器接受——NO_PROVIDER 面板不弹）
  );
  if (outcome.kind === "selected") {
    if (outcome.label === "查看") return runningView(running);
    if (outcome.label === "停止") return stopOwn(deps, ctx);
    if (outcome.label === "替换") {
      await deps.driver.stop({ ownerSessionId: ctx.sessionId }); // 本会话作用域；他会话循环原样（隔离）
      return slug !== "" ? startWithSlug(deps, ctx, slug) : pickAndStart(deps, ctx);
    }
  }
  if (outcome.kind === "failed") {
    // 问询通道故障 ≠ 用户取消——error 回执不静默（循环保持原状），附替代指引
    return {
      kind: "error",
      text: `派发问询通道故障（${outcome.reason}）——停止可执行 /stop-dag-tasks，或带任务源 slug 直通：/run-dag-tasks <slug>`,
    };
  }
  return { kind: "success", text: "未选择操作，派发循环保持不变" };
}

/** 查看回执（任务源 + 在飞事实；零归属 id 泄露——会话 id 不进指令面文本） */
function runningView(running: LoopRecord): ForgeCommandResult {
  const fact =
    running.inFlight !== undefined
      ? `正在执行 ${running.inFlight.taskKey} ${running.inFlight.title}`
      : "当前没有正在执行的任务";
  return { kind: "success", text: `任务源 ${running.source.slug} 的派发循环进行中，${fact}。停止请执行 /stop-dag-tasks。` };
}

/**
 * 同源占用回执（多会话并行裁决）：请求的任务源已被其它会话派发——同一任务源不能同时被
 * 两个会话派发；不同任务源可在其它会话并行派发。零归属 id 泄露；接管路径明示。
 */
function foreignLoopNotice(running: LoopRecord, requestedSlug: string): ForgeCommandResult {
  const requested = requestedSlug !== "" ? `；本次请求的任务源 ${requestedSlug} 未启动` : "";
  return {
    kind: "success",
    text: `任务源 ${running.source.slug} 的派发循环已由其它会话运行——同一任务源不能同时被两个会话派发${requested}。不同任务源可在其它会话并行派发；如需接管本源，请到启动它的会话执行 /stop-dag-tasks，或等待其完成。`,
  };
}

/** 停止本会话循环（收口叙述由驱动器发向 owner 会话；此处仅回执） */
async function stopOwn(deps: RunDagTasksDeps, ctx: InvokeContext): Promise<ForgeCommandResult> {
  const record = deps.driver.activeOf(ctx.sessionId);
  const result = await deps.driver.stop({ ownerSessionId: ctx.sessionId });
  if (!result.ok) {
    return { kind: "success", text: NO_ACTIVE_LOOP_TEXT }; // 他会话循环被驱动器作用域拒绝——no-op 零归属
  }
  const slug = record?.source.slug;
  const inflight = result.hadInFlight ? "，正在执行的任务已暂停，下次派发会继续" : "";
  return { kind: "success", text: `已停止${slug !== undefined ? `任务源 ${slug} 的` : ""}派发循环${inflight}` };
}

/**
 * 启动（loopDriver.start——派发/继续判定与启动叙述归驱动器）；单活竞态兜底 = 「已在运行」。
 *
 * 修复序（「先创建会话，再启动循环」+「等创建会话成功后，才开始运行任务循环」）：
 * 派发指令单行提交成功 = 会话创建成功的判据（agent.followup 收件 = 完整消息开新回合，
 * turn 落地即会话物化）——**提交成功后才 driver.start**。提交失败（激活不可达/followup 面
 * 缺席/投递抛错）= 会话未创建成功：循环**不启动**，产出可见 error 回执指引激活/重试。
 */
async function startSource(deps: RunDagTasksDeps, ctx: InvokeContext, source: ContainerRef): Promise<ForgeCommandResult> {
  // 新会话门控（当且仅当新会话才 followup——既有会话已物化，followup 反而把指令单行当
  // user 消息投给活 agent——其自行 dispatchTask 跑单轮派发，与宿主循环同径冲突）。
  const materialized = !isNewSession(ctx.parent);
  // 「先进入再提交再启动」修复序：激活恒先行，sessionController.resolveAgent 返回的活根
  // **优先作为提交目标**——registry/fallback 把手仅在激活面缺席或激活失败时兜底。
  const activated = materialized ? undefined : await enterLiveRoot(deps, ctx.sessionId);
  // 先落实会话（转录承载 + 非 blank 化）——提交目标优先激活活根，registry 解析活根为次选，
  // ctx.parent 仅双缺时的 fallback（向后兼容）
  const commit = materialized
    ? { committed: true, registryMissed: false }
    : commitDispatchLine(deps.resolveAgent, ctx.sessionId, ctx.parent, source, activated, deps.diag);
  if (!commit.committed) {
    return commitFailedReceipt(source, commit); // 会话未创建成功 → 循环不启动
  }
  const result = await deps.driver.start({
    source,
    ownerSessionId: ctx.sessionId,
    parent: ctx.parent,
    projectId: ctx.projectKey,
    ...(ctx.worktree !== undefined ? { worktree: ctx.worktree } : {}),
  });
  if (!result.ok) {
    // 会话级单活门控：本会话已有活循环（含挂起中）——循环间串行
    if (result.code === "owner-active") {
      return {
        kind: "success",
        text: `本会话已有任务循环在运行（${result.activeSource.slug}${result.suspended ? "，挂起等待处置" : ""}）——一个会话同一时间段只允许一个任务循环。请先结束/停止（stop_task_loop 或 /stop-dag-tasks）或处置当前循环后再发起新循环；或换一个会话发起。`,
      };
    }
    // loop-active（active() 读数与 start 之间的竞态窗口；含他会话刚启动的循环）——不重复启动
    return { kind: "success", text: `任务源 ${result.activeSource.slug} 的派发循环已在运行，本次未重复启动` };
  }
  return { kind: "success", text: `任务源 ${source.slug} 的派发循环已启动` };
}

/**
 * 新会话判定（当且仅当新会话才 followup）：invocation agent 的 Session 自有事件鸭子读
 * （ownEvents / snapshotEvents——官方 Session 公有方法，双缺 = 判定面缺席）。判据 =
 * **零回合事件**（user/message / assistant/message 皆缺席）——非「自有事件为空」。UI 派发
 * 径经 slash 仲裁先落 command/run 事件再进 handler，自有事件恒非空；回合事件在场 = 既有
 * 会话（已物化——followup 免除，防活 agent 读令自跑）。ownEvents 已排除 fork 继承前缀。
 * 判定面缺席（旧装配/测试桩）= 恒新会话（followup 原路径保留——向后兼容）。抛错 =
 * fail-soft 按新会话（物化路径最保守）。
 */
const TURN_EVENT_TYPES: ReadonlySet<string> = new Set(["user/message", "assistant/message"]);

function hasTurnEvent(events: readonly unknown[]): boolean {
  return events.some((event) => {
    const type = (event as { type?: unknown } | undefined)?.type;
    return typeof type === "string" && TURN_EVENT_TYPES.has(type);
  });
}

export function isNewSession(parent: unknown): boolean {
  const session = (parent as { session?: { ownEvents?: () => unknown; snapshotEvents?: () => unknown } } | undefined)?.session;
  try {
    const own = typeof session?.ownEvents === "function" ? (session.ownEvents() as unknown) : undefined;
    if (Array.isArray(own)) return !hasTurnEvent(own);
    const snap = typeof session?.snapshotEvents === "function" ? (session.snapshotEvents() as unknown) : undefined;
    if (Array.isArray(snap)) return !hasTurnEvent(snap);
  } catch {
    return true; // 判定抛错 fail-soft——新会话路径（激活+followup）最保守
  }
  return true; // 判定面缺席（旧桩/旧装配）——followup 原路径向后兼容
}

/**
 * 提交失败回执（会话未创建成功，循环未启动）：registryMissed（激活不可达/会话运行时
 * 不存在）= 激活指引；其余 = 附原因的失败回执 + 同款重试指引。零归属 id 泄露，可见不静默。
 */
function commitFailedReceipt(source: ContainerRef, commit: CommitOutcome): ForgeCommandResult {
  const reasonLine = commit.reason !== undefined ? `（${commit.reason}）` : "";
  if (commit.registryMissed) {
    return {
      kind: "error",
      text: `任务源 ${source.slug} 未派发：会话未创建成功，指令单行提交失败${reasonLine}，派发循环未启动。请先在该会话中发送任意消息激活会话，或经任务面板派发按钮新建会话后重试 /run-dag-tasks ${source.slug}`,
    };
  }
  return {
    kind: "error",
    text: `任务源 ${source.slug} 未派发：指令单行提交失败${reasonLine}，会话未落实、派发循环未启动。请在该会话中发送任意消息后重试 /run-dag-tasks ${source.slug}`,
  };
}

/**
 * 未进入态激活（「先进入再提交」前置步；返回活根本体供提交定向）：激活面在场即恒激活：
 * 成功返回活根（提交目标首选）；失败/抛错 = fail-soft undefined（不外抛、diag 告警留痕），
 * 调用方落入 registry/fallback 兜底与 registryMissed 回执路。激活面缺席（旧装配形态）=
 * undefined——向后兼容语义原样（registry/ctx.parent fallback 承接）。
 */
async function enterLiveRoot(deps: RunDagTasksDeps, sessionId: string): Promise<unknown> {
  if (deps.enterAgent === undefined) return undefined;
  try {
    const entered = await deps.enterAgent(sessionId);
    if (entered !== undefined) return entered;
    emitForgeDiag(deps.diag, warnActivation(sessionId, "sessionController 返回非活根（error 路或会话不存在）"));
    return undefined;
  } catch (cause) {
    emitForgeDiag(deps.diag, warnActivation(sessionId, cause instanceof Error ? cause.message : String(cause)));
    return undefined;
  }
}

function warnActivation(sessionId: string, reason: string): ForgeDiagPayload {
  return {
    level: "warn",
    event: "forge-dispatch-line",
    message: `forge dispatch line activation failed (${sessionId}): ${reason}`,
    sessionId,
  };
}

/**
 * 派发指令单行提交（producer 显式提交——known command 零转录的补位，兼会话物化步）：
 * agent.followup 收件 = 完整消息开新回合，转录承载与转录面切换同径兑现。
 *
 * fail-soft 纪律（防御读取 + diag 告警）：followup 面缺席/非函数/投递抛错 = 不外抛，返回
 * 失败态；调用方以此判据门控循环启动（提交失败 = 会话未创建成功 → 循环不启动 + 可见
 * error 回执）。
 *
 * 提交目标活根化（真机定罪：registry 命中 ≠ 已进入——陈旧把手 followup 抛错）：激活活根
 * 为提交目标首选；registry 解析活根为次选；fallback ctx.parent 仅双缺时兜底；三者俱无
 * followup 面 = registryMissed 败态（调用方 error 回执指引激活）。
 */
interface CommitOutcome {
  committed: boolean;
  /** resolveAgent 在场但未解析到活根（fallback 亦未能提交时 = 会话运行时未就绪信号） */
  registryMissed: boolean;
  reason?: string;
}

function commitDispatchLine(
  resolveAgent: ((ownerSessionId: string) => unknown) | undefined,
  sessionId: string,
  fallback: unknown,
  source: ContainerRef,
  activated?: unknown,
  diag?: ForgeDiagEmitFace,
): CommitOutcome {
  const registryAgent = resolveAgent?.(sessionId);
  const viaRegistry = registryAgent !== undefined;
  const target = activated !== undefined ? activated : viaRegistry ? registryAgent : fallback;
  const followup = (target as { followup?: (message: unknown) => void } | undefined)?.followup;
  if (typeof followup !== "function") {
    const reason = viaRegistry ? "registry 活根 followup 面缺席" : "followup 面缺席";
    emitForgeDiag(diag, {
      level: "warn",
      event: "forge-dispatch-line",
      message: `forge dispatch line commit failed (${source.slug}): ${reason}`,
      sessionId,
    });
    return { committed: false, registryMissed: !viaRegistry && resolveAgent !== undefined, reason };
  }
  try {
    // 绑定调用收口（真机定罪：「先取方法再裸调」把类方法从接收者上剥离，内件 `this` =
    // undefined 即抛 `undefined.send`）——调用面恒以接收者为其绑定 this。
    ;(target as { followup: (message: unknown) => void }).followup(
      // 循环哨兵：指令单行 source.kind='forge-loop'（task=容器 slug、state='dispatch'）
      dispatchLineMessage(`/${RUN_DAG_TASKS_NAME} ${source.slug}`, { task: source.slug, state: "dispatch" }),
    );
    // 成功里程碑 info 埋点（派发成功此前仅失败 warn，成功径不可见）
    const committedPayload: ForgeDiagPayload = {
      level: "info",
      event: "forge-dispatch-line",
      message: `forge dispatch line committed (${source.slug}) -> ${sessionId}`,
      sessionId,
      slug: source.slug,
    };
    emitForgeDiag(diag, committedPayload);
    return { committed: true, registryMissed: !viaRegistry && resolveAgent !== undefined };
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    emitForgeDiag(diag, {
      level: "warn",
      event: "forge-dispatch-line",
      message: `forge dispatch line commit failed (${source.slug}): ${reason}`,
      sessionId,
    });
    return { committed: false, registryMissed: !viaRegistry && resolveAgent !== undefined, reason };
  }
}
