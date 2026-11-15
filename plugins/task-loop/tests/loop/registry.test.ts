// 循环登记表测试（slug 判活 / bySlug / byOwner——plugin-task-loop 1.11 registry 直迁面）。
import { describe, expect, it } from "vitest";
import { createLoopRegistry, type LoopRecord } from "../../host/loop/registry.js";

let seq = 0;

/** 活循环行工厂（最小必填面——takeoverSessions 空集） */
function recordOf(o: { readonly id?: string; readonly slug?: string; readonly ownerSessionId: string }): LoopRecord {
  seq += 1;
  return {
    id: o.id ?? `loop-${seq}`,
    source: { slug: o.slug ?? "alpha" },
    ownerSessionId: o.ownerSessionId,
    projectId: "pk",
    takeoverSessions: new Set<string>(),
  };
}

describe("createLoopRegistry", () => {
  it("register/get/remove：注册可取、remove 幂等（不存在零效应）", () => {
    const registry = createLoopRegistry();
    const record = recordOf({ id: "loop-1", ownerSessionId: "s1" });
    registry.register(record);
    expect(registry.get("loop-1")).toBe(record);
    registry.remove("loop-1");
    expect(registry.get("loop-1")).toBeUndefined();
    expect(() => registry.remove("loop-1")).not.toThrow();
  });

  it("bySlug：slug 判活（容器 = slug 本身——kind 面退役）", () => {
    const registry = createLoopRegistry();
    const a = recordOf({ id: "loop-a", slug: "alpha", ownerSessionId: "s1" });
    const b = recordOf({ id: "loop-b", slug: "beta", ownerSessionId: "s2" });
    registry.register(a);
    registry.register(b);
    expect(registry.bySlug("alpha")).toBe(a);
    expect(registry.bySlug("beta")).toBe(b);
    expect(registry.bySlug("gamma")).toBeUndefined();
  });

  it("byOwner：stop 作用域读数（仅停本会话循环）", () => {
    const registry = createLoopRegistry();
    const a = recordOf({ ownerSessionId: "s1" });
    registry.register(a);
    expect(registry.byOwner("s1")).toBe(a);
    expect(registry.byOwner("s9")).toBeUndefined();
  });

  it("all：全量活循环读数（同源占用判定观察径）", () => {
    const registry = createLoopRegistry();
    expect(registry.all()).toHaveLength(0);
    registry.register(recordOf({ ownerSessionId: "s1" }));
    registry.register(recordOf({ ownerSessionId: "s2" }));
    expect(registry.all()).toHaveLength(2);
  });
});
