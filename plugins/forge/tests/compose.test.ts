// forge 组合段单测（1.4）：COMPOSED 键序 pin（序即激活序）+ 在场守卫三铁律行为
// （消费点现查 / 零 memoize / 捕获 throw 静默让位）+ 守卫两分支 emitDiag 留痕 +
// ctx.plugin(module, config) 官方缝调用形态（P0 #1——config 派发单源注入断言）。
import * as project from "@dsh-forge/project";
import * as spec from "@dsh-forge/spec";
import * as taskLoop from "@dsh-forge/task-loop";
import * as expertSquad from "@dsh-forge/expert-squad";
import * as knowledge from "@dsh-forge/knowledge";
import { describe, expect, it } from "vitest";
import { apply, COMPOSED_KEYS, name } from "../host/index.js";
import { derivePluginConfigs, type ForgeConfig } from "../host/assembly.js";

/** 五件模块身份表（组合段 import * 同源——fake ctx 按 module 身份记录） */
const MEMBERS = { project, spec, "task-loop": taskLoop, "expert-squad": expertSquad, knowledge };
const MEMBER_LIST = [project, spec, taskLoop, expertSquad, knowledge];

/** fake ctx：plugin/reflect.get/emit 记录面（真 Context 结构兼容子集）。 */
function fakeCtx(options: { present?: string[]; throwFor?: unknown } = {}) {
  const plugins: Array<{ module: unknown; config: unknown }> = [];
  const events: Array<{ event: string; payload: { event: string; level: string; message: string } }> = [];
  const ctx = {
    reflect: {
      get(serviceName: string): unknown {
        return options.present?.includes(serviceName) ? { marker: serviceName } : undefined;
      },
    },
    plugin(module: unknown, config?: unknown): unknown {
      if (options.throwFor !== undefined && module === options.throwFor) {
        throw new Error("duplicate registration");
      }
      plugins.push({ module, config });
      return undefined;
    },
    emit(event: string, payload: unknown): unknown {
      events.push({ event, payload: payload as { event: string; level: string; message: string } });
      return undefined;
    },
  };
  return { ctx, plugins, events };
}

describe("forge 组合段", () => {
  it("包名导出 = loader ID 校验锚（产物契约）", () => {
    expect(name).toBe("@dsh-forge/forge");
  });

  it("COMPOSED 键序 pin：project → spec → task-loop → expert-squad → knowledge（序即激活序，漂移红）", () => {
    expect(COMPOSED_KEYS).toEqual(["project", "spec", "task-loop", "expert-squad", "knowledge"]);
  });

  it("常规组合：五件全经 ctx.plugin(module, config) 官方缝 + 派发单源 config 注入（P0 #1——禁直调 module.apply）", () => {
    const config: ForgeConfig = { home: "D:/data/forge" };
    const { ctx, plugins, events } = fakeCtx();
    apply(ctx, config);
    expect(plugins.map((p) => p.module)).toEqual(MEMBER_LIST);
    expect(plugins.map((p) => p.config)).toEqual(Object.values(derivePluginConfigs(config)));
    expect(events.map((e) => e.payload.event)).toEqual(["forge-compose-apply"]);
    expect(events[0]!.payload.message).toContain("project");
  });

  it("solo 在场守卫：已激活件消费点现查跳过（skip 分支 emitDiag forge-compose-skip），未在场件照常组合", () => {
    const { ctx, plugins, events } = fakeCtx({
      present: ["forge.projects", "forgeSpecs"], // project + spec 已独立激活
    });
    apply(ctx, {});
    expect(plugins.map((p) => p.module)).toEqual([taskLoop, expertSquad, knowledge]);
    const skip = events.filter((e) => e.payload.event === "forge-compose-skip");
    expect(skip.length).toBeGreaterThanOrEqual(1);
    expect(skip.some((e) => e.payload.message.includes("project") && e.payload.message.includes("spec"))).toBe(true);
    expect(events.some((e) => e.payload.event === "forge-compose-apply")).toBe(true);
  });

  it("提供侧让位：cordis 二次激活 throw 捕获静默让位（不阻载后续件 + warn 留痕）", () => {
    const { ctx, plugins, events } = fakeCtx({ throwFor: taskLoop });
    apply(ctx, {});
    expect(plugins.map((p) => p.module)).toEqual([project, spec, expertSquad, knowledge]); // task-loop 让位，其余照常
    const skip = events.filter((e) => e.payload.event === "forge-compose-skip" && e.payload.level === "warn");
    expect(skip.some((e) => e.payload.message.includes("task-loop") && e.payload.message.includes("duplicate"))).toBe(true);
  });

  it("全量 solo：五件全在场 → 零组合 + skip 留痕零 apply", () => {
    const { ctx, plugins, events } = fakeCtx({
      present: ["forge.projects", "forgeSpecs", "forgeTasks", "experts", "knowledge"],
    });
    apply(ctx, {});
    expect(plugins).toHaveLength(0);
    expect(events.some((e) => e.payload.event === "forge-compose-apply")).toBe(false);
    expect(events.some((e) => e.payload.event === "forge-compose-skip")).toBe(true);
  });

  it("组合缝缺席（非 cordis 宿主）：零组合 warn 留痕不阻载", () => {
    const events: Array<{ event: string; payload: { event: string; level: string } }> = [];
    apply(
      {
        reflect: undefined,
        emit(event: string, payload: unknown): unknown {
          events.push({ event, payload: payload as { event: string; level: string } });
          return undefined;
        },
      },
      {},
    );
    expect(events).toHaveLength(1);
    expect(events[0]!.payload.event).toBe("forge-compose-skip");
    expect(events[0]!.payload.level).toBe("warn");
  });

  it("零诊断直落 console：诊断全部经 ctx.emit（AGENTS §7——ctx.emit 缺席时 emitDiag 抛错即测试红）", () => {
    // emitDiag 直呼 ctx.emit——ctx.emit 缺席即抛（本用例 ctx 零 emit 面），
    // 证明 apply 内诊断点无一绕道 console。
    expect(() => apply({ reflect: undefined } as never, {})).toThrow();
  });

  it("MEMBERS 身份表覆盖恰五件（防测试替身与组合段 import 漂移）", () => {
    expect(Object.keys(MEMBERS).sort()).toEqual(["expert-squad", "knowledge", "project", "spec", "task-loop"].sort());
  });
});
