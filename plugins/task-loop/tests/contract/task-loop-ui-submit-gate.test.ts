// task-loop UI 拖拽/转移 completed 必经 submitTask 结算门契约锚（1.13 概览 tab 改造③）：
// grep 断言（tests/contract 既有形态）——task-loop ui 概览面零「直调 transition 到
// completed」路径；写动词唯一正门 = task-loop host 半 submit_task 工具面（AC 结算单源
// ——host/domain/tasks/submit.ts + AC_RESULTS_KEY 契约快照），ui 读面（tasks-rpc）不开放
// transition 通道即为本批的结算门形态（completed 转移 affordance 整体不呈现——概览 tab
// 只读看板化；人类纠偏转移留待批次后续按 host transitionTargets 白名单接缝）。
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../../../..", import.meta.url));
const UI = join(ROOT, "plugins/task-loop/ui");

function read(rel: string): string {
  const p = join(UI, rel);
  expect(existsSync(p), `${rel} 缺席（迁移面漂移未同步机检清单）`).toBe(true);
  return readFileSync(p, "utf8");
}

describe("completed 转移必经 submitTask 结算门（1.13 契约锚——ui 读面零写动词）", () => {
  it("tasks-rpc client 面零 transition 通道（forge:tasks/transition 不随迁——写动词归 host submit/transition 工具面）", () => {
    const src = read("tasks-rpc.ts");
    expect(src, "tasks-rpc 含 transition 方法（写动词上 ui 面——结算门旁路风险）").not.toMatch(/\btransition\b/);
    expect(src, "tasks-rpc 含 submitTask 旁路面（结算唯一正门 = host 半 submit_task 工具，ui 不持写面）").not.toMatch(/\bsubmitTask\b/);
  });

  it("概览 tab 本体零 completed 转移 affordance（零拖拽/按钮直completed——read-only 看板形态）", () => {
    const srcLines = read("overview/overview-tab.tsx")
      .split(/\r?\n/)
      .filter((l) => !l.trimStart().startsWith("//"))
      .join("\n");
    expect(srcLines, "概览 tab 含 completed 转移调用（transition…completed 直调）").not.toMatch(/transition[^;]*completed|completed[^;]*transition/i);
    expect(srcLines, "概览 tab 含 onTransition 通道（转移 affordance 面）").not.toMatch(/onTransition/);
  });

  it("tasks-hub 订阅面零写动词（50ms 合并语义保留 + follow 单源——快照消费面）", () => {
    const src = read("tasks-hub.ts");
    expect(src).toMatch(/TASKS_HUB_MERGE_MS = 50/);
    expect(src, "tasks-hub 含 transition/submit 写调用").not.toMatch(/\b(transition|submitTask)\b/);
  });
});
