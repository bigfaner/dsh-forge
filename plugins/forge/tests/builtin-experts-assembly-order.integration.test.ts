// 装配序集成形态断言（builtin-redistribution AC1）：两形态装载序下，四件消费插件
// （spec/task-loop/forge/knowledge）注册后面板可见键集 =
// task-loop 22 + spec 6 + knowledge 1 + forge 6。
//   形态A（裁决②序修正后当前 patch 序）：expert-squad（provide）→ forge → spec → task-loop → knowledge
//   形态B（t-1.2 证伪的旧序）：forge → spec → task-loop → knowledge → expert-squad（provide）
//     ——裁决①迟到补偿（官方 cordis internal/service 同语义机械，见各注册面注释核销落款）
//     在 provide 广播时幂等补注册，键集与形态A 等价。
// 机械：fake reflect store + fake internal/service 事件总线；task-loop = inject 'experts'
// 消费件（cordis 依赖序强制——服务缺席 fiber PENDING，provide 后才 apply，t-1.2 真机
// 幸免成因），fake 同语义；注册真值断言 = 各包真实随包 experts/ 目录的 .md 档案键集。
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { registerBuiltinExpertsRoot as registerForge } from "../host/index.js";
import { registerBuiltinExpertsRoot as registerKnowledge } from "../../knowledge/host/index.js";
import { registerBuiltinExpertsRoot as registerSpec } from "../../spec/host/index.js";
import { registerBuiltinExpertsRoot as registerTaskLoop } from "../../task-loop/host/index.js";

const expertsDirOf = (pkg: string): string =>
  fileURLToPath(new URL(`../../${pkg}/experts/`, import.meta.url));

const keysOf = (dir: string): string[] =>
  readdirSync(dir).filter((f) => f.endsWith(".md")).map((f) => f.replace(/\.md$/, "")).sort();

interface Registration {
  pluginName: string | undefined;
  dir: string;
}

/** fake 宿主：共享 reflect store + internal/service 广播（experts 服务晚 provide 形态）。 */
function makeSharedHost(): {
  makeCtx(): Parameters<typeof registerForge>[0];
  provideExperts(register: Registration[]): void;
} {
  const listeners: Array<(name: unknown) => void> = [];
  let experts: unknown;
  return {
    makeCtx() {
      return {
        emit: () => {},
        reflect: { get: (name: string) => (name === "experts" ? experts : undefined) },
        on: (_event: string, listener: (...args: unknown[]) => unknown) => {
          listeners.push(listener as (name: unknown) => void);
          return () => {
            const at = listeners.indexOf(listener as (name: unknown) => void);
            if (at >= 0) listeners.splice(at, 1);
          };
        },
        effect: () => {},
      } as Parameters<typeof registerForge>[0];
    },
    provideExperts(register: Registration[]): void {
      experts = {
        registerRoot(_ctx: unknown, dir: string, pluginName?: string): void {
          register.push({ pluginName, dir });
        },
      };
      for (const listener of listeners.slice()) listener("experts"); // internal/service 广播（快照——补偿侧自摘不改遍历）
    },
  };
}

/** 按给定 apply 序跑四件注册（expert-squad 的 provide 在指定位置发生），回收注册记录。 */
function runAssembly(provideAt: number): Registration[] {
  const host = makeSharedHost();
  const registrations: Registration[] = [];
  const diag = () => {};
  const order: Array<"forge" | "spec" | "task-loop" | "knowledge"> = ["forge", "spec", "task-loop", "knowledge"];
  const deferred: Array<"forge" | "spec" | "task-loop" | "knowledge"> = [];
  const run = (who: (typeof order)[number]): void => {
    const ctx = host.makeCtx();
    if (who === "spec") registerSpec(ctx, diag);
    else if (who === "task-loop") registerTaskLoop(ctx, diag);
    else if (who === "knowledge") registerKnowledge(ctx as never);
    else registerForge(ctx);
  };
  for (let i = 0; i < order.length + 1; i++) {
    if (i === provideAt) {
      host.provideExperts(registrations); // expert-squad apply 尾段 provide + 事件广播
      for (const who of deferred.splice(0)) run(who); // inject 依赖序解冻（cordis PENDING→ACTIVE）
      continue;
    }
    const who = order[i < provideAt ? i : i - 1]!;
    if (who === "task-loop" && i < provideAt) deferred.push(who); // 服务缺席 PENDING
    else run(who);
  }
  return registrations;
}

const expectedByPlugin = (registrations: Registration[], pkg: string): string[] => {
  const hits = registrations.filter((r) => r.dir.replace(/\\/g, "/").includes(`/${pkg}/experts/`));
  expect(hits, `${pkg} 恰注册一次`).toHaveLength(1);
  return keysOf(hits[0]!.dir);
};

describe.each([
  ["形态A——裁决②序修正后（expert-squad 先行 provide）", 0],
  ["形态B——旧序（expert-squad 最后 provide，迟到补偿兜底）", 4],
])("装配序集成形态（builtin-redistribution AC1）——%s", (_label, provideAt) => {
  it("四包注册后面板可见键集 = task-loop 22 + spec 6 + knowledge 1 + forge 6", () => {
    const registrations = runAssembly(provideAt);
    expect(registrations, "四包各注册一次").toHaveLength(4);
    expect(expectedByPlugin(registrations, "task-loop")).toHaveLength(22);
    expect(expectedByPlugin(registrations, "spec")).toHaveLength(6);
    expect(expectedByPlugin(registrations, "knowledge")).toHaveLength(1);
    expect(expectedByPlugin(registrations, "forge")).toHaveLength(6);
    // 全集 = 四包随包档案并集（面板可见键集真值）
    const union = [
      ...keysOf(expertsDirOf("task-loop")),
      ...keysOf(expertsDirOf("spec")),
      ...keysOf(expertsDirOf("knowledge")),
      ...keysOf(expertsDirOf("forge")),
    ].sort();
    expect(union).toHaveLength(35);
  });
});
