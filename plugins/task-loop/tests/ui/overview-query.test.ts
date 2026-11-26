// @vitest-environment happy-dom
// 概览面任务远程调用查询参契约测试（bug 553ec45a 复发 0cb51984——task-loop 自带概览面
// list 仍发 slug 被宿主边界校验剥离，容器筛选静默失效）：
// 该面发出的 list 入参带 source{kind,slug}（ContainerRef 契约形态）且不带 slug 键；
// follow 流宿主半仍持 slug 键——hub 发送侧归一（source → follow slug / list source）。
// JSX 免涉：task-loop 测试池仅收 *.test.ts——createElement 形态（project 侧
// task-tab-data.test.ts 替身写法同型：录制 client + 入参断言）。
import { act } from "react";
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { OverviewTab } from "../../ui/overview/overview-tab.js";
import { createTasksBoardHub } from "../../ui/tasks-hub.js";
import type { ForgeTasksRpc, TaskCardView, TasksFollowQuery, TasksListQuery } from "../../ui/tasks-rpc.js";

/** 录制 client（list/follow 录制入参，其余通道 fail-loud） */
function recordingClient(): { client: ForgeTasksRpc; listCalls: unknown[] } {
  const listCalls: unknown[] = [];
  const fail = (): Promise<never> => Promise.reject(new Error("不应调用"));
  return {
    listCalls,
    client: {
      list: (async (q: TasksListQuery) => {
        listCalls.push(q);
        return [] as TaskCardView[];
      }) as ForgeTasksRpc["list"],
      graph: fail as never,
      // eslint-disable-next-line require-yield -- 恒抛替身（tasks-hub.test.ts 同型豁免）
      follow: async function* (_q: TasksFollowQuery) {
        throw new Error("stream unreachable");
      },
    },
  };
}

async function mount(node: React.ReactNode): Promise<Root> {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(node);
  });
  await act(async () => {});
  return root;
}

describe("概览面 list 查询参契约（source 形态，零 slug 键）", () => {
  let root: Root | undefined;
  afterEach(() => {
    root?.unmount();
    root = undefined;
  });

  it("容器限定：list 入参 = {projectId, source:{kind,slug}}，零 slug 键", async () => {
    const { client, listCalls } = recordingClient();
    root = await mount(
      createElement(OverviewTab, { projectId: "p-1", makeClient: () => client, source: { kind: "feature", slug: "feat-x" } }),
    );
    expect(listCalls.length).toBeGreaterThanOrEqual(1); // follow 不可达降级轮询同 client 重取——逐条同形
    for (const q of listCalls) {
      expect(q).toEqual({ projectId: "p-1", source: { kind: "feature", slug: "feat-x" } });
      expect(q).not.toHaveProperty("slug");
    }
  });

  it("无容器限定：list 入参 = {projectId}（项目全域），零 slug 零 source", async () => {
    const { client, listCalls } = recordingClient();
    root = await mount(createElement(OverviewTab, { projectId: "p-1", makeClient: () => client }));
    expect(listCalls.length).toBeGreaterThanOrEqual(1); // follow 不可达降级轮询同 client 重取——逐条同形
    for (const q of listCalls) {
      expect(q).toEqual({ projectId: "p-1" });
    }
  });
});

describe("tasks-hub 降级轮询 list 查询参契约", () => {
  /** 手动节拍（tasks-hub.test.ts 同型） */
  function manualSchedule(): { schedule: (fn: () => void, ms: number) => () => void; flush: () => Promise<void> } {
    const pending: (() => void)[] = [];
    const schedule = (fn: () => void, _ms: number): (() => void) => {
      pending.push(fn);
      return () => {
        const i = pending.indexOf(fn);
        if (i >= 0) pending.splice(i, 1);
      };
    };
    const flush = async (): Promise<void> => {
      const batch = pending.splice(0, pending.length);
      for (const fn of batch) fn();
      await Promise.resolve();
      await Promise.resolve();
    };
    return { schedule, flush };
  }

  it("降级轮询 list 入参带 source 且不带 slug；follow 发送侧归一为宿主 slug 键", async () => {
    const { client, listCalls } = recordingClient();
    const followInputs: unknown[] = [];
    const wiring = client as unknown as { follow: (q: unknown) => AsyncGenerator<never> };
    // eslint-disable-next-line require-yield -- 恒抛替身（录制 follow 入参）
    wiring.follow = async function* (q: unknown) {
      followInputs.push(q);
      throw new Error("stream unreachable");
    };
    const { schedule, flush } = manualSchedule();
    const hub = createTasksBoardHub({
      client,
      query: { projectId: "p-1", source: { kind: "proposal", slug: "p-blitz" } },
      onSnapshot: () => {},
      onDiag: () => {},
      schedule,
    });
    hub.start();
    await flush(); // follow 迭代抛错 → 降级轮询首轮 tick
    await flush();
    expect(listCalls[0]).toEqual({ projectId: "p-1", source: { kind: "proposal", slug: "p-blitz" } });
    expect(listCalls[0]).not.toHaveProperty("slug");
    // follow 流宿主半 wire 契约仍持 slug 键（TasksRemoteFollowQuery）——发送侧归一
    expect(followInputs[0]).toEqual({ projectId: "p-1", slug: "p-blitz" });
    hub.dispose();
  });
});
