// 随包内置专家档案注册行（experts.registerRoot 装配面——builtin-redistribution）：
// 在场注册（真实随包 experts/ 目录 + 本包包名）/ 服务缺席 fail-soft / 反射抛错 fail-soft。
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { FORGE_BUNDLE_PACKAGE_NAME, registerBuiltinExpertsRoot } from "../host/index.js";

const expertsDir = fileURLToPath(new URL("../experts/", import.meta.url));

interface Registration {
  dir: string;
  pluginName: string | undefined;
}

interface DiagCall {
  event: string;
  level: string;
  message: string;
}

function makeDiag(diag: DiagCall[]): { emit: (event: string, payload: unknown) => void } {
  return {
    emit(event, payload) {
      diag.push(payload as DiagCall);
    },
  };
}

function makeCtx(calls: Registration[], opts?: { brokenReflect?: boolean }): Parameters<typeof registerBuiltinExpertsRoot>[0] {
  return {
    emit: () => {},
    reflect: {
      get(name: string): unknown {
        if (opts?.brokenReflect) throw new Error("boom");
        if (name !== "experts") return undefined;
        return {
          registerRoot(_ctx: unknown, dir: string, pluginName?: string): void {
            calls.push({ dir, pluginName });
          },
        };
      },
    },
  };
}

describe("registerBuiltinExpertsRoot（experts.registerRoot 装配行）", () => {
  it("experts 在场：以真实随包 experts/ 目录 + 本包包名注册一次", () => {
    const calls: Registration[] = [];
    registerBuiltinExpertsRoot(makeCtx(calls));
    expect(calls).toHaveLength(1);
    expect(calls[0]!.pluginName).toBe(FORGE_BUNDLE_PACKAGE_NAME);
    expect(existsSync(calls[0]!.dir)).toBe(true);
    expect(calls[0]!.dir).toBe(expertsDir);
  });

  it("experts 服务缺席（reflect.get 返回 undefined）：fail-soft 不抛 + emitDiag「专家池静置」warn 不静默", () => {
    const diag: DiagCall[] = [];
    expect(() =>
      registerBuiltinExpertsRoot({ ...makeDiag(diag), reflect: { get: () => undefined } }),
    ).not.toThrow();
    expect(diag).toHaveLength(1);
    expect(diag[0]!.level).toBe("warn");
    expect(diag[0]!.event).toBe("forge-experts-register");
    expect(diag[0]!.message).toContain("专家池静置");
    expect(diag[0]!.message).toContain("fail-soft 不阻载");
  });

  it("reflect.get 抛错：fail-soft 不抛、零注册 + 专家池静置 warn", () => {
    const calls: Registration[] = [];
    const diag: DiagCall[] = [];
    expect(() =>
      registerBuiltinExpertsRoot({ ...makeCtx(calls, { brokenReflect: true }), ...makeDiag(diag) }),
    ).not.toThrow();
    expect(calls).toHaveLength(0);
    expect(diag).toHaveLength(1);
    expect(diag[0]!.level).toBe("warn");
    expect(diag[0]!.message).toContain("专家池静置");
  });

  it("registerRoot 调用抛错：fail-soft 不抛", () => {
    expect(() =>
      registerBuiltinExpertsRoot({
        emit: () => {},
        reflect: { get: () => ({ registerRoot: () => { throw new Error("boom"); } }) },
      }),
    ).not.toThrow();
  });

  it("reflect 面整体缺席：fail-soft 不抛", () => {
    expect(() => registerBuiltinExpertsRoot({ emit: () => {} })).not.toThrow();
  });

  it("承重假设显式声明锚定（裁决②）：注册面注释写明 expert-squad 装载序先于本插件 + 无迟到补偿", () => {
    const source = readFileSync(fileURLToPath(new URL("../host/index.ts", import.meta.url)), "utf8");
    expect(source).toContain("承重假设：expert-squad 装载序先于本插件");
    expect(source).toContain("无迟到补偿");
  });
});
