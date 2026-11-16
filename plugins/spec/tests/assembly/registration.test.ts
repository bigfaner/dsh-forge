// 单装装配 + cordis 注册三态可观测单测（plugin-spec 1.4）——
// default plugin：forgeSpecs provide + 六动词 ctx.tools.register + 诊断留痕
//（完成/缺席降级/注销三径）+ unmount 全撤回 + tools 缝缺席零注册降级。
import { mkdtempSync, existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import specPlugin, { registerSpecToolFamily } from "../../host/index.js";
import { assembleSpecServices, createSpecDocWriter } from "../../host/assembly/default-assembly.js";
import { FORGE_SPEC_TOOL_NAMES } from "../../host/tools/index.js";
import { deriveProjectKey } from "../../host/domain/specs/service.js";
import { FORGE_SPECS_SERVICE_KEY, FORGE_TASKS_SERVICE_KEY } from "../../shared/contract-constants.js";

/** cordis ctx 桩（provide/register 记录面 + reflect.get 投影缝消费面） */
function ctxStub(opts: { tools?: boolean; taskLoop?: boolean } = {}) {
  const provided: Array<{ name: string; value: unknown }> = [];
  const registered: string[] = [];
  const disposeFns: Array<() => void> = [];
  const ctx: Record<string, unknown> = {
    reflect: {
      provide: (name: string, value: unknown) => provided.push({ name, value }),
      get: (name: string) => (opts.taskLoop !== false && name === FORGE_TASKS_SERVICE_KEY ? { matchAcSettlements: () => Promise.resolve([]) } : undefined),
    },
    emit: (event: string, payload: Record<string, unknown>) => {
      void event;
      void payload;
    },
  };
  if (opts.tools !== false) {
    ctx["tools"] = {
      register: (definition: { name: string }) => {
        registered.push(definition.name);
        const dispose = () => {
          const at = registered.indexOf(definition.name);
          if (at >= 0) registered.splice(at, 1);
        };
        disposeFns.push(dispose);
        return dispose;
      },
    };
  }
  return { ctx, provided, registered };
}

function config(tempRoot: string) {
  return {
    home: join(tempRoot, "home"),
    dbFile: ":memory:",
    resolveWsPath: (projectKey: string) => join(tempRoot, "ws", projectKey),
    diag: () => {},
  };
}

describe("default plugin（cordis 装配入口——三态可观测）", () => {
  it("注册态：forgeSpecs provide + 六动词注册（unmount 全撤回）+ 提示段零缝降级不阻载", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "spec-asm-"));
    try {
      const t = ctxStub();
      const c = config(tempRoot);
      const dispose = specPlugin(t.ctx, c);
      expect(t.provided.map((p) => p.name)).toEqual([FORGE_SPECS_SERVICE_KEY]);
      expect(t.registered).toEqual([...FORGE_SPEC_TOOL_NAMES]);
      dispose();
      expect(t.registered).toEqual([]);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("缺席降级态：tools 缝缺席 = 六动词零注册（诊断留痕不阻载）", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "spec-asm-"));
    try {
      const t = ctxStub({ tools: false });
      const lines: string[] = [];
      const dispose = specPlugin(t.ctx, { ...config(tempRoot), diag: (l: string) => lines.push(l) });
      expect(t.registered).toEqual([]);
      expect(lines.some((l) => l.includes("ctx.tools.register 缺席"))).toBe(true);
      dispose();
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("inject 名单显式含 tools + systemPrompt（cordis inject 门判据——bug fefd5149 缝①）", () => {
    const inject = (specPlugin as unknown as { inject: readonly string[] }).inject;
    expect(inject).toContain("tools");
    expect(inject).toContain("systemPrompt");
  });
});

describe("装配件（default-assembly / tool-family）", () => {
  it("createSpecDocWriter：真写 tmp+rename 落 resolveWsPath 检出根", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "spec-writer-"));
    try {
      const write = createSpecDocWriter((projectKey) => join(tempRoot, projectKey));
      write(".forge/specs/demo/spec.md", "# 演示\n", "demo");
      const file = join(tempRoot, "demo", ".forge", "specs", "demo", "spec.md");
      expect(existsSync(file)).toBe(true);
      expect(readFileSync(file, "utf8")).toBe("# 演示\n");
      expect(existsSync(`${file}.tmp`)).toBe(false);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("写缝缺席检出根解析 = 拒绝落盘（fail-loud）", async () => {
    const { createSpecDocWriter } = await import("../../host/assembly/default-assembly.js");
    const write = createSpecDocWriter(undefined);
    expect(() => write(".forge/specs/x/spec.md", "c", "proj")).toThrow(/resolveWsPath/);
  });

  it("assembleSpecServices：config.resolveWsPath 缺席 = 缺省缝按调用 cwd 直写（bug fefd5149 缝②——同键守卫）", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "spec-wsfallback-"));
    const prevHome = process.env.DSH_HOME;
    process.env.DSH_HOME = join(tempRoot, "home");
    try {
      const services = assembleSpecServices({ dbFile: ":memory:" })!;
      try {
        // 命中：cwd 即检出根（deriveProjectKey(cwd) === projectKey）
        const ws = join(tempRoot, "ws-demo");
        const row = services.specs.createSpec({
          cwd: ws,
          slug: "demo",
          title: "演示",
          goals: [{ title: "G1", acs: ["AC-1"] }],
          docRelPath: ".forge/specs/demo/spec.md",
        });
        expect(row.projectKey).toBe(deriveProjectKey(ws));
        const file = join(ws, ".forge", "specs", "demo", "spec.md");
        expect(existsSync(file)).toBe(true);
        // 键恒同源（projectKey 即由调用 cwd 派生）——缺省缝直写语义：文档恒落会话检出根；
        // 显式 config.resolveWsPath 注入时仍优先走 config 缝（上方 createSpecDocWriter 用例已锁）。
      } finally {
        services.dispose();
      }
    } finally {
      if (prevHome !== undefined) process.env.DSH_HOME = prevHome; else delete process.env.DSH_HOME;
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("assembleSpecServices：home 双缺 = undefined 降级（零 provide 前提）", () => {
    const prevHome = process.env.DSH_HOME;
    delete process.env.DSH_HOME;
    try {
      expect(assembleSpecServices({})).toBeUndefined();
    } finally {
      if (prevHome !== undefined) process.env.DSH_HOME = prevHome;
    }
  });

  it("registerSpecToolFamily：六动词逐枚注册 + dispose 全撤回", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "spec-family-"));
    try {
      const services = assembleSpecServices(config(tempRoot))!;
      try {
        const t = ctxStub();
        const family = registerSpecToolFamily(t.ctx, services, () => {});
        expect(t.registered).toEqual([...FORGE_SPEC_TOOL_NAMES]);
        family.dispose();
        expect(t.registered).toEqual([]);
      } finally {
        services.dispose();
      }
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
