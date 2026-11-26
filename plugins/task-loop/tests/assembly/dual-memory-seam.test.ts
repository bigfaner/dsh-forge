// 双记忆缝交叉单测锚（M-1——评审 findings 清理批）：prepare 缝（exec 会话 cwd →
// sink.resolveDir → core deriveTaskStoreDir 单源派生容器目录记忆）与 containerDirOf 缝
// （projectKey 直拼 {tasksHome}/{projectKey}——projectKey = deriveProjectKey(cwd) 同名制）
// 必须对同一 cwd 产出同目录：projectKey 派生漂移（flatten/hash8 任意一段分叉）即红。
import { execSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  deriveDirName,
  deriveTaskStoreDir,
  FORGE_BASE_DIR_ENTRIES,
  resolveForgeDirs,
  resolveProjectKey,
} from "@dsh-forge/lib-path";
import { assembleTaskLoopServices } from "../../host/assembly/default-assembly.js";
import { assembleTaskLoopToolFamily } from "../../host/assembly/tool-family.js";
import { TASK_LOOP_DIR_ENTRIES } from "../../host/forge-dir-entries.js";
// 跨插件契约锚（仅测试面——host 代码零跨插件 import）：project 条目正本 + task-loop 条目
// 合并解析 ≡ 落盘派生（task-loop d.ts 镜像声明的 project.runtime_dir 漂移即红）
import { PROJECT_DIR_ENTRIES } from "../../../project/host/dirs/project-entries.js";

function config(tasksHome: string): { home: string; dbFile: string; tasksHome: string } {
  return { home: mkdtempSync(join(tmpdir(), "task-loop-seam-")), dbFile: ":memory:", tasksHome };
}

const gitDirs: string[] = [];
afterEach(() => {
  for (const dir of gitDirs.splice(0)) {
    // git 对象库文件带只读位——Windows rmSync 对只读文件 EPERM，先整树清只读再删
    try {
      execSync(`attrib -R "${dir}\\*" /S /D`, { stdio: "ignore" });
    } catch {
      // attrib 缺席/失败不阻清理——rmSync 重试兜底
    }
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

/** hermetic git worktree fixture：临时主检出（含提交）+ 独立路径工作树，返回工作树 cwd。 */
function gitWorktreeCwd(tag: string): { mainRoot: string; wtCwd: string } {
  const run = (args: string, cwd: string): void => {
    execSync(`git ${args}`, { cwd, stdio: "ignore" });
  };
  const mainRoot = mkdtempSync(join(tmpdir(), `task-loop-seam-git-${tag}-`));
  gitDirs.push(mainRoot);
  run("init -b main", mainRoot);
  run("config user.email t@t", mainRoot);
  run("config user.name t", mainRoot);
  writeFileSync(join(mainRoot, "README.md"), "seed\n", "utf8");
  run("add README.md", mainRoot);
  run("commit -m seed", mainRoot);
  // 工作树落主检出的 .forge/worktrees 段内——命中归拢标记预检（MARKER_PATTERN）才走 git 现查径
  const wtCwd = join(mainRoot, ".forge", "worktrees", `wt-${tag}`);
  run(`worktree add "${wtCwd}" -b wt-${tag}`, mainRoot);
  return { mainRoot, wtCwd };
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

  it("forge-dirs-unification §2.6 AC：task-loop 落盘目录 ≡ 注册表 project.runtime_dir（同一注入事实）；task_loop.task_dir ≡ {slug}/{localId} 落盘派生", async () => {
    const dshHome = mkdtempSync(join(tmpdir(), "task-loop-seam-dsh-"));
    const tasksHome = join(dshHome, "forge", "projects");
    const mainRoot = "Z:\\project\\main-checkout";
    // 同一注入事实：cwd 经 resolveProjectKey 归拢主检出（registryQuery 命中即采信）
    const resolution = resolveProjectKey(mainRoot, { registryQuery: () => mainRoot });
    expect(resolution.rolledUp).toBe(true);
    expect(resolution.mainRoot).toBe(mainRoot);
    expect(resolution.key).toBe(deriveDirName(mainRoot));
    const registryDirs = resolveForgeDirs(
      [
        { source: "forge.base", entries: FORGE_BASE_DIR_ENTRIES },
        { source: "dirKeys.project", entries: PROJECT_DIR_ENTRIES },
        { source: "dirKeys.task_loop", entries: TASK_LOOP_DIR_ENTRIES },
      ],
      { dshHome, projectRoot: resolution.mainRoot!, workspaceRoot: mainRoot },
      { slug: "feat-x", localId: "2.1" },
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
    expect(expected).toBe(registryDirs["project.runtime_dir"]);
    // 任务目录：注册表 task_loop.task_dir = 落盘派生 {containerDir}/{slug}/{localId}
    expect(registryDirs["task_loop.runtime_dir"]).toBe(join(expected, "feat-x"));
    expect(registryDirs["task_loop.task_dir"]).toBe(join(expected, "feat-x", "2.1"));
    services.dispose();
  });

  it("工作树 cwd：事件落盘目录 = 主检出归拢键的容器目录（git 现查归拢径——归拢去掉即红）", async () => {
    const tasksHome = mkdtempSync(join(tmpdir(), "task-loop-seam-wt-"));
    const { mainRoot, wtCwd } = gitWorktreeCwd("wtb");
    const services = assembleTaskLoopServices(config(tasksHome))!;
    try {
      expect(services.forgeEvents).not.toBeUndefined();
      // 独立复算归拢（同一 lib-path 单源）：注册表缺席 → git 现查归拢主检出
      const resolution = resolveProjectKey(wtCwd, { registryQuery: () => undefined });
      expect(resolution.rolledUp).toBe(true);
      expect([mainRoot, realpathSync.native(mainRoot)]).toContain(resolution.mainRoot);
      // 落盘记忆：会话 cwd = 工作树 → 容器目录必须取主检出键（非工作树键）
      await services.forgeEvents!.prepare({ sessionId: "s-wt", cwd: wtCwd, agentPreset: undefined });
      const mainDir = services.containerDirOf!(resolution.key);
      const wtKey = deriveDirName(wtCwd);
      expect(mainDir).not.toBe(services.containerDirOf!(wtKey)); // 归拢真分叉（防恒真）
      expect(services.forgeEvents!.dirOf("s-wt")).toBe(mainDir);
    } finally {
      services.dispose();
    }
  });
});
