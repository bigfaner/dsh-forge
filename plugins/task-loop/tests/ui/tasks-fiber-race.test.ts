// forgeTasks 解析缝竞态复现（RED 钉——任务 overview-dockkit-alignment/2.9）：
// 真机四轮 Console 探针定谳——任务子 tab 恒空 = forgeTasks namespace 在 task-loop
// 自己的解析缝上永不可达。两层根因：
//   A) ui/rpc.ts forgeFaceOf 是 project 包五族归一的逐字复本——归一产物不含 forgeTasks
//      （页内锚 resolver() 返回五族 face 无 forgeTasks），tasks-rpc fallback 永不可达；
//   B) inject 子纤维先于 $mount 落座激活、激活回调一次性装缝——本地缝装到空 ctx 后
//      只能靠锚回退，而锚归一面又把 forgeTasks 剥掉 → 竞态性永久空。
// 本文件钉三组时序：
//   ① 子纤维先激活（空 ctx）、forgeTasks 后物化进页内锚持有的 live ctx → forgeTasksFaceOf
//      现查可达（修前：forgeFaceOf 五族门控 + 归一剥 forgeTasks → 恒 undefined = RED）；
//   ② 仅 forgeTasks 在场、其余族全缺（含必选族 forgeWorktree 与死族 forgeFeatures）
//      → forgeTasksFaceOf 不被任何外族门控（AC②）；
//   ③ forgeFeatures 缺席不得门控（用户裁决 2026-11-25：feature/proposal 已退役，
//      forgeFeatures 是零消费死 namespace）——ctx 持有 forgeTasks + forgeWorktree、
//      不含 forgeFeatures → forgeTasksFaceOf 仍可达（变异验收：forgeFeatures 加回
//      FORGE_REMOTE_NAMESPACES 必选族并门控时本用例必红）。
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { installForgeTasksFace, forgeTasksFaceOf } from "../../ui/tasks-rpc.js";
import { forgeFaceOf, installForgeRemoteFace, FORGE_REMOTE_FACE_ANCHOR_KEY } from "../../ui/rpc.js";
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

function fakeRemote(): { remote: { $mount: () => Promise<unknown> } } {
  return { remote: { $mount: () => Promise.resolve() } };
}

/** forgeTasks namespace face 桩（list/stats 读面——任务 tab 数据单门消费切片） */
function tasksNsFace(): { list: () => unknown; stats: () => unknown } {
  return {
    list: () => ({ ok: true, value: [] }),
    stats: () => ({ ok: true, value: { total: 0 } }),
  };
}

/** 页内锚 + 本地缝清场（用例间互不渗漏） */
function resetSeams(): void {
  delete (globalThis as Record<string, unknown>)[FORGE_REMOTE_FACE_ANCHOR_KEY];
  installForgeTasksFace(() => undefined);
}

/** 断言 forgeTasksFaceOf 可达且 list/stats 读面为 function */
function expectTasksFaceReachable(): void {
  const face = forgeTasksFaceOf();
  expect(face).toBeDefined();
  expect(face?.list).toBeTypeOf("function");
  expect(face?.stats).toBeTypeOf("function");
}

describe("forgeTasks 解析缝竞态（子纤维先激活、remote.forgeTasks 后物化）", () => {
  beforeEach(resetSeams);
  afterEach(resetSeams);

  it("①子纤维先激活（ctx 空）→ 后物化进锚 live ctx：forgeTasksFaceOf 现查可达（修前 RED）", () => {
    // 子纤维先激活——此刻 remote 面未物化 forgeTasks（一次性装缝装到空 ctx）
    const staleCtx = { remote: { namespaces: new Map() } };
    const { remote } = fakeRemote();
    taskLoopClient.apply({
      slots: fakeSlots(),
      locale: fakeLocale(),
      remote,
      inject: (_deps: readonly string[], mixin: (c: unknown) => unknown) => {
        mixin(staleCtx);
        return () => {};
      },
    });
    expect(forgeTasksFaceOf()).toBeUndefined(); // 物化前诚实缺席

    // 后物化：live ctx 持有 forgeWorktree + forgeTasks（真机锚 face 在场的同型持有位）
    const tasksFace = tasksNsFace();
    const liveCtx = {
      remote: {
        namespaces: new Map([
          ["forgeWorktree", { service: { list: () => undefined } }],
          ["forgeTasks", { service: tasksFace }],
        ]),
      },
    };
    installForgeRemoteFace(() => forgeFaceOf(liveCtx));
    expectTasksFaceReachable();
  });

  it("②仅 forgeTasks 在场、其余族全缺（必选族 forgeWorktree 亦缺）：不被任何外族门控（AC②）", () => {
    const tasksFace = tasksNsFace();
    installForgeRemoteFace(() =>
      forgeFaceOf({ remote: { namespaces: new Map([["forgeTasks", { service: tasksFace }]]) } }),
    );
    expectTasksFaceReachable();
  });

  it("③forgeFeatures 缺席不得门控：含 forgeTasks + forgeWorktree、不含 forgeFeatures → 可达", () => {
    // 用户裁决 2026-11-25：feature/proposal 已退役，forgeFeatures 零消费死 namespace
    // 不得成为任何 task-loop 读路径的门控条件（变异实验捕获的守护缺口）。
    const tasksFace = tasksNsFace();
    installForgeRemoteFace(() =>
      forgeFaceOf({
        remote: {
          namespaces: new Map([
            ["forgeWorktree", { service: { list: () => undefined } }],
            ["forgeTasks", { service: tasksFace }],
          ]),
        },
      }),
    );
    expectTasksFaceReachable();
  });
});
