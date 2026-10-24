// panel/list-source 单测：四态数据源状态机（tech-design §6 D2——fetch 即时 + 5s 轻轮询
// 兜底）+ DESIGN.md 状态切换稳定性裁决（重拉失败不落错误态、加载期不闪既有数据）。

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExpertListController, type ListFetcher } from "../src-client/panel/list-source.js";
import type { ExpertView } from "../src-client/panel/filter.js";

function entry(name: string): ExpertView {
  return {
    name,
    title: name,
    description: "",
    personaMd: "",
    tools: ["read"],
    skills: [],
    origin: "project",
    enabled: true,
    updatedAt: "2026-10-18T00:00:00.000Z",
  };
}

function fetcherOf(
  impl: () => Promise<ExpertView[]>,
): ListFetcher & { calls: number } {
  const box = { calls: 0 };
  return {
    get calls() {
      return box.calls;
    },
    fetchList: () => {
      box.calls += 1;
      return impl();
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ExpertListController（四态源）", () => {
  it("start：先落 loading，成功后转 ready + entries；订阅者收到通知", async () => {
    const fetcher = fetcherOf(async () => [entry("a")]);
    const controller = new ExpertListController(fetcher);
    const seen: string[] = [];
    controller.subscribe(() => seen.push(controller.getSnapshot().phase.kind));
    controller.start();
    expect(controller.getSnapshot().phase.kind).toBe("loading");
    await vi.advanceTimersByTimeAsync(0);
    expect(controller.getSnapshot().phase.kind).toBe("ready");
    expect(controller.getSnapshot().entries.map((e) => e.name)).toEqual(["a"]);
    expect(seen).toEqual(["loading", "ready"]);
    controller.stop();
  });

  it("D2：start 即拉一次，此后按 5s 周期轻轮询", async () => {
    const fetcher = fetcherOf(async () => []);
    const controller = new ExpertListController(fetcher);
    controller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetcher.calls).toBe(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetcher.calls).toBe(2);
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetcher.calls).toBe(3);
    controller.stop();
  });

  it("首次加载失败 → error 态（message 透传），retry 复位重拉成功转 ready", async () => {
    let failing = true;
    const fetcher = fetcherOf(async () => {
      if (failing) throw new Error("boom");
      return [entry("ok")];
    });
    const controller = new ExpertListController(fetcher);
    controller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(controller.getSnapshot().phase.kind).toBe("error");
    expect(controller.getSnapshot().phase).toMatchObject({ kind: "error", message: "boom" });

    failing = false;
    controller.retry();
    await vi.advanceTimersByTimeAsync(0);
    expect(controller.getSnapshot().phase.kind).toBe("ready");
    expect(controller.getSnapshot().entries.map((e) => e.name)).toEqual(["ok"]);
    controller.stop();
  });

  it("稳定性裁决：已有数据后轮询失败保持 ready 与既有 entries（不闪错误/不闪空）", async () => {
    let failing = false;
    const fetcher = fetcherOf(async () => {
      if (failing) throw new Error("poll-down");
      return [entry("stable")];
    });
    const controller = new ExpertListController(fetcher);
    controller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(controller.getSnapshot().phase.kind).toBe("ready");

    failing = true;
    await vi.advanceTimersByTimeAsync(5000);
    expect(controller.getSnapshot().phase.kind).toBe("ready");
    expect(controller.getSnapshot().entries.map((e) => e.name)).toEqual(["stable"]);
    controller.stop();
  });

  it("stop 停轮询；停止后在途响应不回写（代际失效）", async () => {
    let release: ((rows: ExpertView[]) => void) | undefined;
    const fetcher = fetcherOf(
      () =>
        new Promise<ExpertView[]>((resolve) => {
          release = resolve;
        }),
    );
    const controller = new ExpertListController(fetcher);
    controller.start();
    expect(controller.getSnapshot().phase.kind).toBe("loading");
    controller.stop();
    release?.([entry("late")]);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetcher.calls).toBe(1);
    expect(controller.getSnapshot().phase.kind).toBe("loading");
  });
});
