// panel/list-source —— 面板数据源状态机（tech-design §6 D2：fetch 即时 + 5s 轻轮询
// 兜底）+ DESIGN.md 状态切换稳定性裁决：已有数据后重拉失败保持 ready 与既有 entries
//（不闪错误、不闪空）；仅首拉失败落 error 态。框架无关（subscribe/getSnapshot 形状
// 与 React useSyncExternalStore 对接），轮询代际失效防在途响应回写。

import type { ExpertView } from "./filter.js";

/** 相位（四态之三：骨架 loading / 错误 error / 数据 ready；空与无匹配由视图按 entries 分流）。 */
export type ListPhase =
  | { readonly kind: "loading" }
  | { readonly kind: "error"; readonly message: string }
  | { readonly kind: "ready" };

/** 数据源快照（useSyncExternalStore 的不可变快照面）。 */
export interface ListState {
  readonly phase: ListPhase;
  readonly entries: readonly ExpertView[];
}

/** 列表取数缝（fetch 路由装配面；测试注入替身）。 */
export interface ListFetcher {
  fetchList(): Promise<ExpertView[]>;
}

/** 轻轮询周期（§6 D2 钉死 5s）。 */
export const PANEL_POLL_MS = 5000;

/**
 * 面板列表控制器：start（即时拉取 + 周期轮询）/ stop（停轮询 + 代际失效）/ retry
 * （错误态复位重拉）。语义：
 * - 首拉（entries 为空）成功 → ready；失败 → error（message 透传）；
 * - 已有数据后的拉取成功 → 原子换新 entries；失败 → 静默保持既有快照；
 * - stop 后在途响应不回写（generation 计数失效）。
 */
export class ExpertListController {
  private state: ListState = { phase: { kind: "loading" }, entries: [] };
  private readonly listeners = new Set<() => void>();
  private timer: ReturnType<typeof setInterval> | undefined;
  private running = false;
  private generation = 0;

  constructor(
    private readonly fetcher: ListFetcher,
    private readonly pollMs: number = PANEL_POLL_MS,
  ) {}

  getSnapshot(): ListState {
    return this.state;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** 即时拉取一次 + 启动轻轮询（幂等——重复 start 不叠加定时器）。 */
  start(): void {
    if (this.running) return;
    this.running = true;
    void this.load(true);
    this.timer = setInterval(() => {
      void this.load(false);
    }, this.pollMs);
  }

  /** 停轮询并失效在途响应（幂等）。 */
  stop(): void {
    this.running = false;
    this.generation += 1;
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  /** 错误态重试（复位 loading 重拉——错误条「重试」入口）。 */
  retry(): void {
    void this.load(true);
  }

  private emit(): void {
    // 快照迭代（订阅者在回调内退订不扰动遍历序）
    for (const listener of Array.from(this.listeners)) listener();
  }

  private async load(initial: boolean): Promise<void> {
    const generation = ++this.generation;
    if (initial && this.state.entries.length === 0) {
      this.state = { phase: { kind: "loading" }, entries: [] };
      this.emit();
    }
    try {
      const entries = await this.fetcher.fetchList();
      if (generation !== this.generation) return;
      this.state = { phase: { kind: "ready" }, entries };
      this.emit();
    } catch (error) {
      if (generation !== this.generation) return;
      if (this.state.entries.length === 0) {
        this.state = {
          phase: { kind: "error", message: error instanceof Error ? error.message : String(error) },
          entries: [],
        };
        this.emit();
      }
    }
  }
}
