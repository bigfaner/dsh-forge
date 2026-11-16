// tasks-changed 订阅中枢（1.13——ui-slots.md §②：tasks-changed 订阅随迁改型）：
// dsh web / desktop = forgeTasks follow 流（@Remote mode:'stream'——先 baseline 后增量帧，
// workspace-controller feed 同型）+ 快照镜像；流不可达（face 缺席/流抛错）= 降级终态
// （投影快照单源 + 定时静默重取——体验优化降级，正确性 host 单点保证）。
// 合并语义沿用壳侧 TasksChangedHub 判例：50ms 合并窗、latest-wins（零抖动零堆积）。
import type { ForgeTasksRpc, TaskBoardDtoView, TasksFollowQuery } from "./tasks-rpc.js";

/** 合并窗 ms（壳侧 hub 判例同值——50ms 内多帧合一，latest-wins） */
export const TASKS_HUB_MERGE_MS = 50;

/** 降级静默重取间隔 ms（流不可达终态——轮询重取非推送） */
export const TASKS_HUB_FALLBACK_POLL_MS = 5_000;

export interface TasksBoardHubOptions {
  readonly client: ForgeTasksRpc;
  readonly query: TasksFollowQuery;
  /** 快照消费缝（合并窗后逐帧递达——latest-wins） */
  readonly onSnapshot: (board: TaskBoardDtoView) => void;
  /** 降级诊断注入（缺席 console 兜底——client 束豁免面） */
  readonly onDiag?: (line: string) => void;
  /** 测试注入：定时器节拍（缺省 setTimeout/setInterval 真身） */
  readonly schedule?: (fn: () => void, ms: number) => () => void;
}

export interface TasksBoardHub {
  /** 启动订阅（follow 流；不可达自动落降级轮询——单次启动语义） */
  start(): void;
  /** 停止（流 abort + 合并窗 + 轮询全量回收） */
  dispose(): void;
}

/**
 * 任务板快照镜像 hub：follow 流帧 → 50ms 合并窗 latest-wins → onSnapshot。
 * 流启动/迭代抛错 = 一次性落降级轮询（静默重取，diag 留痕一行不刷屏）。
 */
export function createTasksBoardHub(options: TasksBoardHubOptions): TasksBoardHub {
  const schedule =
    options.schedule ??
    ((fn: () => void, ms: number) => {
      const timer = setTimeout(fn, ms);
      return () => clearTimeout(timer);
    });
  const diag = options.onDiag ?? ((line: string) => console.warn(`[tasks-hub] ${line}`));
  let disposed = false;
  let controller: AbortController | undefined;
  let cancelMerge: (() => void) | undefined;
  let cancelPoll: (() => void) | undefined;
  let pending: TaskBoardDtoView | undefined;
  let lastPollError: string | undefined;

  const flush = (): void => {
    cancelMerge = undefined;
    if (pending === undefined || disposed) return;
    const board = pending;
    pending = undefined;
    options.onSnapshot(board);
  };

  const enqueue = (board: TaskBoardDtoView): void => {
    if (disposed) return;
    pending = board; // latest-wins：窗内后帧覆盖前帧
    if (cancelMerge === undefined) cancelMerge = schedule(flush, TASKS_HUB_MERGE_MS);
  };

  const startFallbackPolling = (reason: string): void => {
    if (disposed || cancelPoll !== undefined) return;
    diag(`follow 流不可达（${reason}）——降级终态：静默定时重取（${TASKS_HUB_FALLBACK_POLL_MS}ms）`);
    const tick = (): void => {
      if (disposed) return;
      void options.client
        .list(options.query)
        .then((cards) => {
          enqueue({
            projectKey: options.query.projectId,
            cards,
            stats: { total: cards.length, byStatus: countByStatus(cards) },
          });
          lastPollError = undefined; // 恢复后重置——同因复发再留痕
        })
        .catch((cause: unknown) => {
          // 降级轮询失败留痕（AGENTS §7——fail-soft 不得静默）；同因去重不刷屏：
          // 仅首轮与 error 变化时各 warn 一行，恢复后同因复发再留痕。
          const reason = cause instanceof Error ? cause.message : String(cause);
          if (reason !== lastPollError) {
            lastPollError = reason;
            diag(`降级轮询 list 不可达（${reason}）——保持「无任务数据」终态继续重取`);
          }
        });
      if (!disposed) cancelPoll = schedule(tick, TASKS_HUB_FALLBACK_POLL_MS);
    };
    cancelPoll = schedule(tick, 0);
  };

  return {
    start(): void {
      if (disposed) return;
      controller = new AbortController();
      void (async (): Promise<void> => {
        try {
          for await (const frame of options.client.follow(options.query)) {
            if (disposed) return;
            enqueue(frame.snapshot);
          }
        } catch (cause) {
          if (disposed) return;
          startFallbackPolling(cause instanceof Error ? cause.message : String(cause));
        }
      })();
    },
    dispose(): void {
      disposed = true;
      controller?.abort();
      cancelMerge?.();
      cancelPoll?.();
      cancelMerge = undefined;
      cancelPoll = undefined;
      pending = undefined;
    },
  };
}

/** 降级轮询 stats 投影（host stats 面不经轮询复调——cards 本地计数单源，零 N+1） */
function countByStatus(cards: readonly { readonly taskStatus: string }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const card of cards) out[card.taskStatus] = (out[card.taskStatus] ?? 0) + 1;
  return out;
}
