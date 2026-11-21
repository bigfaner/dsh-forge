// forge apply 薄形态单测（forge-aggregate-bundle 1.6）：防双激活守卫（消费点现查 /
// 零 memoize / 任一件在场即让位）+ 两事件 emitDiag 留痕（forge-bundle-apply /
// forge-bundle-skip）+ 零诊断直落 console（AGENTS §7）。组合段/typert 缝已退役
// （bundle 六插行官方默认路径），行为单测面随薄形态收敛。
import { describe, expect, it } from "vitest";
import { apply, name } from "../host/index.js";
import { PRESENCE_SERVICE_KEYS } from "../host/assembly.js";

/** fake ctx：reflect.get / emit 记录面（真 Context 结构兼容子集）。 */
function fakeCtx(options: { present?: string[] } = {}) {
  const events: Array<{ event: string; payload: { event: string; level: string; message: string } }> = [];
  const ctx = {
    reflect: {
      get(serviceName: string): unknown {
        return options.present?.includes(serviceName) ? { marker: serviceName } : undefined;
      },
    },
    emit(event: string, payload: unknown): unknown {
      events.push({ event, payload: payload as { event: string; level: string; message: string } });
      return undefined;
    },
  };
  return { ctx, events };
}

describe("forge apply 薄形态", () => {
  it("包名导出 = loader ID 校验锚（产物契约）", () => {
    expect(name).toBe("@dsh-forge/forge");
  });

  it("bundle 通道正常形态：五件全缺席 → forge-bundle-apply info 留痕（单事件）", () => {
    const { ctx, events } = fakeCtx();
    apply(ctx, {});
    expect(events).toHaveLength(1);
    expect(events[0]!.payload.event).toBe("forge-bundle-apply");
    expect(events[0]!.payload.level).toBe("info");
  });

  it("全量 solo 并存：五件全在场 → forge-bundle-skip warn 留痕零 apply（防双激活让位）", () => {
    const { ctx, events } = fakeCtx({
      present: Object.values(PRESENCE_SERVICE_KEYS),
    });
    apply(ctx, {});
    expect(events).toHaveLength(1);
    expect(events[0]!.payload.event).toBe("forge-bundle-skip");
    expect(events[0]!.payload.level).toBe("warn");
    for (const key of Object.keys(PRESENCE_SERVICE_KEYS)) {
      expect(events[0]!.payload.message).toContain(key);
    }
  });

  it("部分并存：任一件在场即让位（skip 分支，消息点名在场件）", () => {
    const { ctx, events } = fakeCtx({ present: [PRESENCE_SERVICE_KEYS.project, PRESENCE_SERVICE_KEYS.spec] });
    apply(ctx, {});
    expect(events.map((e) => e.payload.event)).toEqual(["forge-bundle-skip"]);
    expect(events[0]!.payload.message).toContain("project");
    expect(events[0]!.payload.message).toContain("spec");
  });

  it("在场检测消费点现查零 memoize：同一 ctx 状态变化逐次 apply 结果随动", () => {
    const present = new Set<string>();
    const events: Array<{ payload: { event: string } }> = [];
    const ctx = {
      reflect: { get: (name: string) => (present.has(name) ? { marker: name } : undefined) },
      emit(event: string, payload: unknown): unknown {
        events.push({ event, payload: payload as { event: string } });
        return undefined;
      },
    };
    apply(ctx, {});
    expect(events.at(-1)!.payload.event).toBe("forge-bundle-apply");
    present.add(PRESENCE_SERVICE_KEYS.knowledge);
    apply(ctx, {});
    expect(events.at(-1)!.payload.event).toBe("forge-bundle-skip");
    present.clear();
    apply(ctx, {});
    expect(events.at(-1)!.payload.event).toBe("forge-bundle-apply");
  });

  it("反射异常视同缺席（fail-soft——守卫不阻载 forge 自身激活留痕）", () => {
    const events: Array<{ payload: { event: string } }> = [];
    apply(
      {
        reflect: {
          get(): never {
            throw new Error("reflect unavailable");
          },
        },
        emit(event: string, payload: unknown): unknown {
          events.push({ event, payload: payload as { event: string } });
          return undefined;
        },
      },
      {},
    );
    expect(events.map((e) => e.payload.event)).toEqual(["forge-bundle-apply"]);
  });

  it("零诊断直落 console：诊断全部经 ctx.emit（AGENTS §7——ctx.emit 缺席时 emitDiag 抛错即测试红）", () => {
    expect(() => apply({ reflect: undefined } as never, {})).toThrow();
  });
});
