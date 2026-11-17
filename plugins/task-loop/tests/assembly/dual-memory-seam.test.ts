// 双记忆缝交叉单测锚（M-1——评审 findings 清理批）：prepare 缝（exec 会话 cwd →
// sink.resolveDir → core deriveTaskStoreDir 单源派生容器目录记忆）与 containerDirOf 缝
// （projectKey 直拼 {tasksHome}/{projectKey}——projectKey = deriveProjectKey(cwd) 同名制）
// 必须对同一 cwd 产出同目录：projectKey 派生漂移（flatten/hash8 任意一段分叉）即红。
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { deriveDirName, deriveTaskStoreDir } from "@dsh-forge/lib-path";
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
      expect(services.containerDirOf).toBeDefined();
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
    // 只消费 prepare 缝：空参数走域拒绝路径，执行成败不论（catch 吞）
    await addTask.execute({}, { agent: { session: { id: "s-seam", header: { cwd: ws } } } }).catch(() => {});
    const key = services.db.projectKeyOf(ws);
    expect(services.forgeEvents!.dirOf("s-seam")).toBe(services.containerDirOf!(key));
    services.dispose();
  });
});
