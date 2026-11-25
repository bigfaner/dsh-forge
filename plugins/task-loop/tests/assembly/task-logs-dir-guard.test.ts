// 任务日志目录三口径同源把守（bug 26dff330——两套口径收口 RED 锚）：
//   ① worker 简报锚点（renderWorkerContext → taskLogsDirOf）
//   ② 回收钩子注入（tool-family taskLogsDir → taskLogsDirOf；与 forgeResolvePath(taskLogs)
//      的注册侧 taskLogsDirOf(join(taskHome,'logs',slug,localId)) 形状逐字节等价——
//      plugins/project 侧自有 anchors.test.ts 把守，本件把守 task-loop 三处一致）
//   ③ 事故台账缺省目录（incident-log → taskLogsDirOf）
// 任一处改用别的派生（例如回退 <ws>/.forge/task-logs/ 或 <slug>-<localId> 拼接）即红。
import { existsSync, mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { assembleTaskLoopServices, createDefaultResolveWorkerContext } from "../../host/assembly/default-assembly.js";
import { taskLogsDirOf } from "../../host/domain/tasks/task-logs-dir.js";
import { renderWorkerContext } from "../../host/domain/tasks/worker-context.js";

const HERE = dirname(fileURLToPath(import.meta.url));

function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

describe("taskLogsDirOf（任务日志目录派生单点）", () => {
  it("= join(containerDir, 'logs', slug, localId)（注册侧 forgeResolvePath(taskLogs) 同形）", () => {
    expect(taskLogsDirOf("T:\\home\\c@deadbeef", "feat-x", "2.1")).toBe(join("T:\\home\\c@deadbeef", "logs", "feat-x", "2.1"));
    expect(taskLogsDirOf("T:\\home\\c", "s", "1")).toBe("T:\\home\\c\\logs\\s\\1");
  });
});

describe("worker 简报锚点与钩子运行时目录同径（bug 26dff330 AC）", () => {
  const containerDir = join("T:", "home", "c@deadbeef");
  const expected = taskLogsDirOf(containerDir, "feat-x", "2.1");

  it("renderWorkerContext 锚点段携带的 forge.task_logs_dir 绝对路径 = taskLogsDirOf 产物", () => {
    const block = renderWorkerContext({ forgeDir: "", containerDir, localId: "2.1", source: { slug: "feat-x" } });
    // 取 forge.task_logs_dir 段的首个绝对路径行
    const seg = block.slice(block.indexOf("forge.task_logs_dir——"));
    const pathLine = /`([^`]+)`/.exec(seg.slice(seg.indexOf("`")))?.[1] ?? "";
    expect(pathLine).toBe(`${expected}\\`);
  });

  it("装配产物 containerDirOf = {tasksHome}/{projectKey}（worker 锚点与钩子共消费同一派生）", () => {
    const tasksHome = mkdtempSync(join(tmpdir(), "task-loop-logs-guard-"));
    const services = assembleTaskLoopServices({ home: join(tmpdir(), "task-loop-logs-guard-db"), dbFile: ":memory:", tasksHome })!;
    expect(services.containerDirOf).not.toBeUndefined();
    expect(services.containerDirOf!("proj-key")).toBe(join(tasksHome, "proj-key"));
    services.dispose();
  });

  it("createDefaultResolveWorkerContext：调用即建目录（mkdirRecursive 在盘）+ 锚点含同径绝对路径", async () => {
    const container = mkdtempSync(join(tmpdir(), "task-loop-logs-guard-ctx"));
    const resolve = createDefaultResolveWorkerContext({ containerDirOf: () => container, resolveWsPath: () => "" });
    const text = await resolve("proj-key", { slug: "feat-x" }, "3.0");
    const dir = taskLogsDirOf(container, "feat-x", "3.0");
    expect(existsSync(dir) && isDir(dir)).toBe(true);
    expect(text).toContain(`${dir}\\`);
  });
});

describe("消费位源码钉（改用别的派生即红）", () => {
  const readHost = (rel: string): string => readFileSync(join(HERE, "..", "..", "host", rel), "utf-8");

  it("回收钩子 taskLogsDir 注入消费 taskLogsDirOf（tool-family.ts）", () => {
    expect(readHost(join("assembly", "tool-family.ts"))).toContain(
      "taskLogsDir: (containerDir, slug, localId) => taskLogsDirOf(containerDir, slug, localId)",
    );
  });

  it("worker 锚点节消费 taskLogsDirOf（worker-context.ts）", () => {
    expect(readHost(join("domain", "tasks", "worker-context.ts"))).toContain("taskLogsDirOf(containerDir");
  });

  it("事故台账缺省目录消费 taskLogsDirOf（incident-log.ts）", () => {
    expect(readHost(join("notify", "incident-log.ts"))).toContain("taskLogsDirOf(taskHome, slug, taskKey)");
  });
});
