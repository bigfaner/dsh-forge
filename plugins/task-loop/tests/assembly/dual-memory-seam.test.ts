// 双记忆缝交叉单测锚（M-1——评审 findings 清理批）：prepare 缝（exec 会话 cwd →
// sink.resolveDir → core deriveTaskStoreDir 单源派生容器目录记忆）与 containerDirOf 缝
// （projectKey 直拼 {tasksHome}/{projectKey}——projectKey = deriveProjectKey(cwd) 同名制）
// 必须对同一 cwd 产出同目录：projectKey 派生漂移（flatten/hash8 任意一段分叉）即红。
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  deriveDirName,
  deriveTaskStoreDir,
  FORGE_BASE_DIR_ENTRIES,
  resolveForgeDirs,
  resolveProjectKey,
} from "@dsh-forge/lib-path";
import { assembleTaskLoopServices } from "../../host/assembly/default-assembly.js";
import { assembleTaskLoopToolFamily } from "../../host/assembly/tool-family.js";

function config(tasksHome: string): { home: string; dbFile: string; tasksHome: string } {
  return { home: mkdtempSync(join(tmpdir(), "task-loop-seam-")), dbFile: ":memory:", tasksHome };
}

/** 路径形状覆盖：反斜杠 / 正斜杠 / 尾分隔符 / 嵌套深径（deriveDirName 归一口径的输入域）。 */
const WS_CASES = [
  "Z:\\project\\demo",
  "Z:/project/slash",
  "Z:\\project\\trail\\",
  "Z:\\deep\\nested\\ws\\tree",
];

describe("双记忆缝同目录性（prepare deriveTaskStoreDir × containerDirOf projectKey）", () => {
  it("containerDirOf(projectKeyOf(ws)) ≡ deriveTaskStoreDir(tasksHome, ws)——同名制逐字对齐（漂移分叉即红）", () => {
    for (const ws of WS_CASES) {
      const tasksHome = mkdtempSync(join(tmpdir(), "task-loop-seam-th-"));
      const services = assembleTaskLoopServices(config(tasksHome))!;
      expect(services.containerDirOf).not.toBeUndefined();
      const key = services.db.projectKeyOf(ws);
      expect(key).toBe(deriveDirName(ws)); // projectKey 单源 = lib-path deriveDirName
      expect(services.containerDirOf!(key)).toBe(deriveTaskStoreDir(tasksHome, ws));
      services.dispose();
    }
  });

  it("projectKey 漂移分叉即红：丢 @hash8 段的漂移键 ≠ 真键目录（锚灵敏度自证）", () => {
    const tasksHome = mkdtempSync(join(tmpdir(), "task-loop-seam-drift-"));
    const services = assembleTaskLoopServices(config(tasksHome))!;
    const ws = "Z:\\project\\demo";
    const key = services.db.projectKeyOf(ws);
    const drifted = key.replace(/@[^@\\]+$/, ""); // 丢 hash8 段 = 派生漂移形态
    expect(drifted).not.toBe(key);
    expect(services.containerDirOf!(drifted)).not.toBe(services.containerDirOf!(key));
    services.dispose();
  });

  it("prepare 缝与 containerDirOf 缝落同一容器目录（exec cwd 记忆 ≡ projectKey 直拼）", async () => {
    const tasksHome = mkdtempSync(join(tmpdir(), "task-loop-seam-prep-"));
    const services = assembleTaskLoopServices(config(tasksHome))!;
    const ctx = { reflect: { provide: () => {}, get: () => undefined }, emit: () => {} };
    const family = assembleTaskLoopToolFamily({ services, ctx, diag: () => {} });
    const addTask = family.tools.find((t) => t.name === "add_task")!;
    const ws = "Z:\\project\\prepface";
    // 只消费 prepare 缝：空参数走域拒绝路径（执行成败不论）；拒绝不吞错——捕获结局参与分叉断言，
    // 失败可定位「记忆未落」（dirOf 缺席，携执行结局）vs「目录不等」（路径漂移）两种成因。
    const outcome = await addTask
      .execute({}, { agent: { session: { id: "s-seam", header: { cwd: ws } } } })
      .then(
        () => "resolved",
        (err: unknown) => `rejected: ${err instanceof Error ? err.message : String(err)}`,
      );
    const key = services.db.projectKeyOf(ws);
    const expected = services.containerDirOf!(key);
    const recorded = services.forgeEvents!.dirOf("s-seam");
    expect(recorded, `记忆未落：dirOf("s-seam") 缺席（执行结局=${outcome}）`).not.toBeUndefined();
    expect(recorded, `目录不等：dirOf=${recorded} ≠ containerDirOf=${expected}`).toBe(expected);
    services.dispose();
  });

  it("forge-dirs-unification §2.6 AC：task-loop 落盘目录 ≡ 注册表 forge.task_runtime_dir（同一注入事实）", async () => {
    const dshHome = mkdtempSync(join(tmpdir(), "task-loop-seam-dsh-"));
    const tasksHome = join(dshHome, "forge", "projects");
    const mainRoot = "Z:\\project\\main-checkout";
    // 同一注入事实：cwd 经 resolveProjectKey 归拢主检出（registryQuery 命中即采信）
    const resolution = resolveProjectKey(mainRoot, { registryQuery: () => mainRoot });
    expect(resolution.rolledUp).toBe(true);
    expect(resolution.mainRoot).toBe(mainRoot);
    expect(resolution.key).toBe(deriveDirName(mainRoot));
    const registryDirs = resolveForgeDirs(
      [{ source: "forge.base", entries: FORGE_BASE_DIR_ENTRIES }],
      { dshHome, projectRoot: resolution.mainRoot!, workspaceRoot: mainRoot },
    );
    const services = assembleTaskLoopServices({
      home: mkdtempSync(join(tmpdir(), "task-loop-seam-reg-")),
      dbFile: ":memory:",
      tasksHome,
      registryQuery: () => mainRoot,
    })!;
    expect(services.forgeEvents).not.toBeUndefined();
    // 落盘径 ①：sink prepare 记忆（会话 cwd → 主检出归拢键 → 容器目录）
    await services.forgeEvents!.prepare({ sessionId: "s-reg", cwd: mainRoot, agentPreset: undefined });
    // 落盘径 ②：containerDirOf（projectKey 直拼）
    const expected = services.containerDirOf!(resolution.key);
    expect(services.forgeEvents!.dirOf("s-reg")).toBe(expected);
    // 同一注入事实下与注册表解析结果同一路径
    expect(expected).toBe(registryDirs["forge.task_runtime_dir"]);
    services.dispose();
  });
});
