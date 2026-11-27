// 收口复盘事实材料面单测（loop/retro-materials——机械③指示段「零、事实材料」数据源）：
// 临时目录搭运行时目录最小形状，钉住扫描规则与指示行集（真实绝对路径 + 读法）：
//   ① 异常任务判定四路：事故子文件夹 / 顶层 resume.md / 事件流处置轮次 / 末次结果非 success；
//   ② 正常任务不列入；'_' 前缀目录（_pool）不计任务；事件流残缺行跳过；
//   ③ 卷宗与规格正本「在盘才列」；事件流不在盘 = 该行缺席；
//   ④ 指示行集只含绝对路径与读法，不含目录键名。
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { renderRetroMaterials, scanRetroMaterials } from "../../host/loop/retro-materials.js";

const tmpDirs: string[] = [];
afterEach(() => {
  for (const dir of tmpDirs.splice(0)) rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
});
const tmp = (prefix: string): string => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
};

const line = (type: string, localId: string, extra: Record<string, unknown> = {}): string =>
  `${JSON.stringify({ ts: 1, sessionId: "s", slug: "feat-x", type, payload: { taskKey: `feat-x/${localId}`, ...extra } })}\n`;

describe("scanRetroMaterials（运行时目录扫描）", () => {
  it("异常任务判定四路 + 正常任务不列 + _pool 不计任务 + 残缺行跳过", () => {
    const runtimeDir = tmp("retro-scan-");
    // 1.1：事故子文件夹（settlement.json 在场）+ resume.md
    mkdirSync(join(runtimeDir, "1.1", "001-blocked"), { recursive: true });
    writeFileSync(join(runtimeDir, "1.1", "001-blocked", "settlement.json"), "{}");
    writeFileSync(join(runtimeDir, "1.1", "resume.md"), "# 进度");
    // 1.2：事件流处置 2 轮、末次 failed（目录在盘、无事故文件夹）
    mkdirSync(join(runtimeDir, "1.2", "001-verify"), { recursive: true });
    // 2.1：事件流处置 1 轮后成功，但任务目录不在盘——不列（无目录即无可读材料；事实只在事件流）
    // 3.1：正常成功（不列）
    mkdirSync(join(runtimeDir, "3.1"));
    // _pool：非任务目录
    mkdirSync(join(runtimeDir, "_pool"));
    writeFileSync(
      join(runtimeDir, "dispatch.jsonl"),
      [
        line("task-claimed", "1.2"),
        line("task-worker-done", "1.2", { outcome: "failed" }),
        line("triage-decided", "1.2", { action: "retry" }),
        line("triage-decided", "1.2", { action: "add-fix" }),
        line("task-worker-done", "1.2", { outcome: "failed" }),
        line("triage-decided", "2.1", { action: "retry" }),
        line("task-worker-done", "2.1", { outcome: "success" }),
        line("task-worker-done", "3.1", { outcome: "success" }),
        '{"ts":2,"type":"task-worker-done","payload":{"taskKey":"feat-x/3.1"', // 残缺行
      ].join(""),
    );
    const m = scanRetroMaterials({ runtimeDir, slug: "feat-x" });
    expect(m.totalTasks).toBe(3); // 在盘任务目录：1.1 / 1.2 / 3.1（_pool 与事件流文件不计）
    expect(m.tasks.map((t) => t.localId)).toEqual(["1.1", "1.2"]);
    expect(m.tasks[0]).toMatchObject({ dir: join(runtimeDir, "1.1"), hasResume: true, incidentDirs: [join(runtimeDir, "1.1", "001-blocked")], triageRounds: 0 });
    expect(m.tasks[0]!.lastOutcome).toBeUndefined();
    expect(m.tasks[1]).toMatchObject({ triageRounds: 2, lastOutcome: "failed", incidentDirs: [], hasResume: false });
    expect(m.dispatchLog).toBe(join(runtimeDir, "dispatch.jsonl"));
    // 卷宗与规格正本：specDir 缺席 = 不列
    expect(m.dossierDir).toBeUndefined();
    expect(m.specFile).toBeUndefined();
  });

  it("卷宗与规格正本在盘才列；事件流不在盘 = 缺席；运行时目录不存在 = 空材料面", () => {
    const ws = tmp("retro-ws-");
    const runtimeDir = join(ws, "rt", "feat-x");
    mkdirSync(runtimeDir, { recursive: true });
    const specDir = join(ws, ".forge", "specs", "feat-x");
    mkdirSync(join(specDir, "issues"), { recursive: true });
    writeFileSync(join(specDir, "spec.md"), "# spec");
    const m = scanRetroMaterials({ runtimeDir, slug: "feat-x", specDir });
    expect(m.dossierDir).toBe(join(specDir, "issues"));
    expect(m.specFile).toBe(join(specDir, "spec.md"));
    expect(m.dispatchLog).toBeUndefined(); // 无事件流文件
    expect(m.tasks).toEqual([]);
    const none = scanRetroMaterials({ runtimeDir: join(ws, "absent"), slug: "feat-x" });
    expect(none.totalTasks).toBe(0);
    expect(none).not.toHaveProperty("dispatchLog");
  });

  it("探针与 spike：只列 .forge/probes、.forge/spikes 下本循环期间（事件流首行 ts 起）有改动的子目录；旧目录与根目录 spikes/ 不列", () => {
    const ws = tmp("retro-expl-");
    const runtimeDir = join(ws, "rt", "feat-x");
    mkdirSync(runtimeDir, { recursive: true });
    const old = Date.now() - 3 * 24 * 3600 * 1000;
    const fresh = Date.now();
    // 事件流首行 ts = 循环起点（此刻前一天）
    const loopStart = Date.now() - 24 * 3600 * 1000;
    writeFileSync(
      join(runtimeDir, "dispatch.jsonl"),
      `${JSON.stringify({ ts: loopStart, slug: "feat-x", type: "no-ready-task", payload: {} })}\n`,
    );
    const mk = (rel: string, mtime: number): void => {
      mkdirSync(join(ws, ...rel.split("/")), { recursive: true });
      const f = join(ws, ...rel.split("/"), "REPORT.md");
      writeFileSync(f, "x");
      utimesSync(f, mtime / 1000, mtime / 1000);
      utimesSync(join(ws, ...rel.split("/")), mtime / 1000, mtime / 1000);
    };
    mk(".forge/probes/ca28efec", fresh); // 本循环探针
    mk(".forge/probes/old-probe", old); // 循环前的探针——不列
    mk(".forge/spikes/m2-s10-path-stability", fresh); // 本循环 spike
    mk(".forge/docs/probes/legacy", fresh); // 旧落点——不再是探针目录
    mk("spikes/root-spike", fresh); // 工作区根 spikes/——不再是 spike 目录
    const m = scanRetroMaterials({ runtimeDir, slug: "feat-x", workspaceRoot: ws });
    expect(m.loopStartMs).toBe(loopStart);
    expect(m.probes.map((e) => e.dir)).toEqual([join(ws, ".forge", "probes", "ca28efec")]);
    expect(m.spikes.map((e) => e.dir)).toEqual([join(ws, ".forge", "spikes", "m2-s10-path-stability")]);
    const text = renderRetroMaterials(m).join("\n");
    expect(text).toContain(`- 探针与 spike（本循环期间产出；每个读其中的 .md 结论与判别实验，脚本和原始输出不读）：`);
    expect(text.split("\n")).toContain(`  - ${join(ws, ".forge", "spikes", "m2-s10-path-stability")}${runtimeDir.includes("\\") ? "\\" : "/"}`);
    expect(text).not.toContain(join(ws, "spikes", "root-spike"));
    // 子文件在循环内改写、目录本身更早——按子文件修改时间计入
    const late = join(ws, ".forge", "probes", "edited-in-loop");
    mkdirSync(late, { recursive: true });
    const g = join(late, "conclusion.md");
    writeFileSync(g, "y");
    utimesSync(g, fresh / 1000, fresh / 1000);
    utimesSync(late, old / 1000, old / 1000);
    expect(scanRetroMaterials({ runtimeDir, slug: "feat-x", workspaceRoot: ws }).probes.map((e) => e.dir)).toContain(late);
    // 无事件流 = 无时间锚 → 探针与 spike 不列
    rmSync(join(runtimeDir, "dispatch.jsonl"));
    expect(scanRetroMaterials({ runtimeDir, slug: "feat-x", workspaceRoot: ws }).probes).toEqual([]);
  });
});

describe("renderRetroMaterials（指示段行集——真实绝对路径 + 读法）", () => {
  it("逐行给绝对路径与读法；无异常任务写「无」；不含目录键名", () => {
    const ws = tmp("retro-render-");
    const runtimeDir = join(ws, "rt", "feat-x");
    mkdirSync(join(runtimeDir, "1.1", "001-blocked"), { recursive: true });
    writeFileSync(join(runtimeDir, "1.1", "001-blocked", "error.log"), "boom");
    writeFileSync(join(runtimeDir, "1.1", "resume.md"), "");
    writeFileSync(join(runtimeDir, "dispatch.jsonl"), line("triage-decided", "1.1", { action: "retry" }));
    const specDir = join(ws, ".forge", "specs", "feat-x");
    mkdirSync(join(specDir, "issues"), { recursive: true });
    writeFileSync(join(specDir, "spec.md"), "# spec");
    const text = renderRetroMaterials(scanRetroMaterials({ runtimeDir, slug: "feat-x", specDir })).join("\n");
    const sep = runtimeDir.includes("\\") ? "\\" : "/";
    expect(text.split("\n")).toEqual([
      "零、事实材料（先读后评，结论须能追溯到下列文件）：",
      `- 事件流（整读，残缺行跳过）：${join(runtimeDir, "dispatch.jsonl")}`,
      `- 异常任务目录 1/1（每个读：事故文件夹内 error.log、settlement.json、triage.md；顶层 *.md 与 resume.md；证据文件夹内的 .md）：`,
      `  - 1.1：${join(runtimeDir, "1.1")}${sep}（处置 1 轮 · 事故文件夹 1 个 · 有 resume.md）`,
      `- 卷宗（回收报告、modeling-report / verification-report；忽略其中 resume.md）：${join(specDir, "issues")}${sep}`,
      `- 规格正本（对照 AC）：${join(specDir, "spec.md")}`,
      "- 另查：list_tasks / query_task（summary、key_decisions、notes）、list_bugs / get_bug、git log（带任务键的提交）",
      "- 不读：trace、截图、安装日志；未列为异常的任务只取 key_decisions",
    ]);
    for (const key of ["task_loop.", "spec.dir", "project.runtime_dir"]) expect(text).not.toContain(key);
    // 无异常任务
    const calm = renderRetroMaterials(scanRetroMaterials({ runtimeDir: join(ws, "empty"), slug: "feat-x" })).join("\n");
    expect(calm).toContain("- 异常任务目录 0/0");
    expect(calm.split("\n")[2]).toBe("  - 无");
  });
});
