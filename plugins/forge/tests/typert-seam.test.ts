// forge typert 手工缝单测（forge-deep-pack 1.6——P0 #3 定谳形态）：
// 装载期三件工件 import 在场 + apply 期 ctx.typert.register(manifest) 逐件注册 +
// manifest 所有权不变（注册对象 = 工件原导出同一实例——禁再导出/禁改造）+
// 卸载 disposer 聚合 + 失败路径 fail-soft 诊断留痕。
import { describe, expect, it } from "vitest";
import { TYPERT as projectTypert } from "@dsh-forge/project/typert";
import { TYPERT as specTypert } from "@dsh-forge/spec/typert";
import { TYPERT as taskLoopTypert } from "@dsh-forge/task-loop/typert";
import { TYPERT_SEAM_MEMBERS, registerTypertManifests } from "../host/typert-seam.js";

/** fake ctx：typert registry 记录面 + diag emit 记录面（真 Context 结构兼容子集）。 */
function fakeCtx(options: { throwFor?: unknown; register?: unknown } = {}) {
  const registered: unknown[] = [];
  const disposed: unknown[] = [];
  const events: Array<{ event: string; payload: { event: string; level: string; message: string } }> = [];
  const register =
    typeof options.register !== "undefined"
      ? (options.register as (manifest: unknown) => unknown)
      : (manifest: unknown): unknown => {
          if (options.throwFor !== undefined && manifest === options.throwFor) {
            throw new Error("duplicate registration");
          }
          registered.push(manifest);
          return () => disposed.push(manifest);
        };
  const ctx = {
    typert: { register },
    emit(event: string, payload: unknown): unknown {
      events.push({ event, payload: payload as { event: string; level: string; message: string } });
      return undefined;
    },
  };
  return { ctx, registered, disposed, events };
}

describe("typert 手工缝（P0 #3——loader 扫不到嵌套包，唯一正门）", () => {
  it("成员面恰三件（project/spec/task-loop——knowledge/expert-squad 无 typert exports，P0 #3 事实修正）", () => {
    expect(TYPERT_SEAM_MEMBERS).toEqual(["project", "spec", "task-loop"]);
  });

  it("注册三件 manifest 逐件到达 registry（顺序 = 装载期 import 序——project → spec → task-loop）", () => {
    const { ctx, registered } = fakeCtx();
    const withdraw = registerTypertManifests(ctx);
    expect(typeof withdraw).toBe("function");
    expect(registered).toEqual([projectTypert, specTypert, taskLoopTypert]);
  });

  it("manifest 所有权不变：注册对象 = 三件工件原导出同一实例（禁再导出/禁改造——P0 #3 所有权门）", () => {
    const { ctx, registered } = fakeCtx();
    registerTypertManifests(ctx);
    expect(registered[0]).toBe(projectTypert);
    expect(registered[1]).toBe(specTypert);
    expect(registered[2]).toBe(taskLoopTypert);
  });

  it("卸载 disposer 聚合：返回面调用 → 三件注册全部撤销（宿主生命周期交还）", () => {
    const { ctx, disposed } = fakeCtx();
    const withdraw = registerTypertManifests(ctx)!;
    withdraw();
    expect(disposed).toEqual([projectTypert, specTypert, taskLoopTypert]);
  });

  it("单件注册 throw：fail-soft 不阻载其余件 + error 级 emitDiag 留痕（诊断不静默——AGENTS §7）", () => {
    const { ctx, registered, events } = fakeCtx({ throwFor: specTypert });
    const withdraw = registerTypertManifests(ctx);
    expect(registered).toEqual([projectTypert, taskLoopTypert]);
    expect(events).toHaveLength(1);
    expect(events[0]!.payload.event).toBe("forge-typert-register");
    expect(events[0]!.payload.level).toBe("error");
    expect(events[0]!.payload.message).toContain("duplicate registration");
    expect(typeof withdraw).toBe("function");
  });

  it("非 typert 宿主（服务键缺席）：零注册零固定税、零诊断（非介入面——官方 loader inject 语义同径）", () => {
    const events: unknown[] = [];
    const withdraw = registerTypertManifests({
      emit(event: string, payload: unknown): unknown {
        events.push({ event, payload });
        return undefined;
      },
    });
    expect(withdraw).toBeUndefined();
    expect(events).toHaveLength(0);
  });

  it("typert 在场而 register 不可用：零注册（fail-soft 形态守卫）", () => {
    const { ctx } = fakeCtx({ register: undefined });
    expect(registerTypertManifests({ ...ctx, typert: {} })).toBeUndefined();
  });
});
