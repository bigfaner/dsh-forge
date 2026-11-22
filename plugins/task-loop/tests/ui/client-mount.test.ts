// taskLoopClient remote.$mount 装载契约门测（fix-6——bug b0569de6：client 入口只开
// inject 子 fiber、从不 $mount generator 产 forgeTasks 贡献 → gateway client 半
// namespace 永不物化，概览 tab 数据面失败终态）。
// 正典配方锚 = plugins/project/ui/remote.ts + project ui/index.ts:288-315：
// $mount 挂 contribution（注册先于首个探测）→ inject 子 fiber 激活消费 → mount settle
// 终态锚发布（成功/失败/缺席三分支各一次）→ unmount 撤回随包 fiber 生命周期级联。
import { describe, expect, it } from "vitest";
import { FORGE_TASKS_REMOTE_CONTRIBUTION, } from "../../ui/remote.js";
import { FORGE_REMOTE_MOUNT_SETTLED_ANCHOR_KEY } from "../../ui/rpc.js";
import { installForgeTasksFace, forgeTasksFaceOf } from "../../ui/tasks-rpc.js";
import { selfAnchorSourceOf } from "../../ui/self-anchor.js";
import { taskLoopClient } from "../../ui/index.js";
import type { SectionSlotsFace } from "../../ui/keyed-section.js";
import type { LocaleServiceFace } from "../../ui/locale.js";

/** 形状合法假 slots（inject 子缝直调） */
function fakeSlots(): SectionSlotsFace {
  return {
    inject: (_key, cb) => {
      cb();
      return () => {};
    },
    register: () => () => {},
  } as unknown as SectionSlotsFace;
}

function fakeLocale(): LocaleServiceFace {
  return {
    register: () => () => {},
    bind: () => (key: string) => key,
  } as unknown as LocaleServiceFace;
}

/** remote $mount 替身（记录 contribution + 可控 settle） */
function fakeRemote(mountImpl: (contribution: unknown) => Promise<unknown>) {
  const calls: unknown[] = [];
  return {
    remote: {
      $mount: (contribution: unknown) => {
        calls.push(contribution);
        return mountImpl(contribution);
      },
    },
    calls,
  };
}

/** 页内锚清场（模块级全局锚——用例间互不渗漏） */
function resetAnchor(): void {
  delete (globalThis as Record<string, unknown>)[FORGE_REMOTE_MOUNT_SETTLED_ANCHOR_KEY];
}

describe("taskLoopClient remote.$mount 装载契约（fix-6 bug b0569de6）", () => {
  it("$mount 贡献 = generator 产 forgeTasks 投影（package = @dsh-forge/task-loop + forgeTasks/* descriptor 族）", () => {
    expect(FORGE_TASKS_REMOTE_CONTRIBUTION).toBeTruthy();
    const info = FORGE_TASKS_REMOTE_CONTRIBUTION as { spec?: { package?: string; methods?: Record<string, unknown> } };
    expect(info.spec?.package).toBe("@dsh-forge/task-loop");
    expect(Object.keys(info.spec?.methods ?? {}).some((k) => k.startsWith("forgeTasks/"))).toBe(true);
  });

  it("apply：remote.$mount 在场 → 挂载 forgeTasks 贡献（注册先于首个探测——apply 同步段已发起）", () => {
    resetAnchor();
    const { remote, calls } = fakeRemote(() => Promise.resolve());
    taskLoopClient.apply({ slots: fakeSlots(), locale: fakeLocale(), remote });
    expect(calls.length).toBe(1);
    expect(calls[0]).toBe(FORGE_TASKS_REMOTE_CONTRIBUTION);
  });

  it("apply：mount settle → 页内 mount 终态锚发布（成功分支）；inject 子 fiber 依赖含 remote.forgeTasks", async () => {
    resetAnchor();
    const fiberDeps: string[] = [];
    const { remote } = fakeRemote(() => Promise.resolve());
    const ctx = {
      slots: fakeSlots(),
      locale: fakeLocale(),
      remote,
      inject: (deps: readonly string[], mixin: (c: unknown) => unknown) => {
        fiberDeps.push(...deps);
        mixin({ remote: undefined });
        return () => {};
      },
    };
    taskLoopClient.apply(ctx);
    await Promise.resolve();
    await Promise.resolve();
    expect(fiberDeps).toContain("remote.forgeTasks");
    expect((globalThis as Record<string, unknown>)[FORGE_REMOTE_MOUNT_SETTLED_ANCHOR_KEY]).toBe(true);
  });

  it("apply：mount 失败分支 → 终态锚仍发布（诚实降级不悬挂）", async () => {
    resetAnchor();
    const { remote } = fakeRemote(() => Promise.reject(new Error("mount boom")));
    taskLoopClient.apply({ slots: fakeSlots(), locale: fakeLocale(), remote });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect((globalThis as Record<string, unknown>)[FORGE_REMOTE_MOUNT_SETTLED_ANCHOR_KEY]).toBe(true);
  });

  it("apply：remote 缺席宿主 → 终态锚发布 + 注册链不中断（fail-soft 同 project 配方）", () => {
    resetAnchor();
    const slots = fakeSlots();
    expect(() => taskLoopClient.apply({ slots, locale: fakeLocale() })).not.toThrow();
    expect(slots.inject).toBeTypeOf("function");
    expect((globalThis as Record<string, unknown>)[FORGE_REMOTE_MOUNT_SETTLED_ANCHOR_KEY]).toBe(true);
  });

  it("inject 子 fiber 激活 → forgeTasks 解析缝消费 fiberCtx namespace（Map 形态归一）", () => {
    resetAnchor();
    const nsFace = { list: () => ({ ok: true, value: [] }) };
    const fiberCtx = {
      remote: { namespaces: new Map([["forgeTasks", { service: nsFace }]]) },
    };
    const { remote } = fakeRemote(() => Promise.resolve());
    const ctx = {
      slots: fakeSlots(),
      locale: fakeLocale(),
      remote,
      inject: (deps: readonly string[], mixin: (c: unknown) => unknown) => {
        mixin(fiberCtx);
        return () => {};
      },
    };
    taskLoopClient.apply(ctx);
    expect(forgeTasksFaceOf()).toBe(nsFace);
    installForgeTasksFace(() => undefined);
  });

  it("apply：另开 sessions/workspaces 子 fiber（self-anchor 正门——跨 realm reflect 拿不到顶层实现），激活即装持有位", () => {
    resetAnchor();
    const fiberCtxs: unknown[] = [];
    const depsSeen: string[] = [];
    const sessions = { list: { getSnapshot: () => ({ byId: {} }) } };
    const { remote } = fakeRemote(() => Promise.resolve());
    const ctx = {
      slots: fakeSlots(),
      locale: fakeLocale(),
      remote,
      inject: (deps: readonly string[], mixin: (c: unknown) => unknown) => {
        depsSeen.push(deps.join("+"));
        if (deps.includes("sessions")) {
          const fiber = { sessions, workspaces: undefined };
          fiberCtxs.push(fiber);
          mixin(fiber);
        } else {
          mixin({ remote: undefined });
        }
        return () => {};
      },
    };
    taskLoopClient.apply(ctx);
    expect(depsSeen).toContain("sessions+workspaces");
    expect(fiberCtxs).toHaveLength(1);
    // 持有位已装 → selfAnchorSourceOf 正门优先（self-anchor.test.ts 门测双通道语义）
    expect(selfAnchorSourceOf("sessions", "fallback")).toBe(sessions);
    expect(selfAnchorSourceOf("workspaces", "fallback")).toBe("fallback");
  });
});
