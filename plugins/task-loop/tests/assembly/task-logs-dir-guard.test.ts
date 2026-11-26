// 任务日志目录三口径同源把守（bug 26dff330——两套口径收口 RED 锚）：
//   ① worker 简报锚点（renderWorkerContext → taskLogsDirOf）
//   ② 回收钩子注入（tool-family taskLogsDir → taskLogsDirOf；与 forgeResolvePath(taskLogs)
//      的注册侧 taskLogsDirOf(join(taskHome,'logs',slug,localId)) 形状逐字节等价——
//      plugins/project 侧自有 anchors.test.ts 把守，本件把守 task-loop 三处一致）
//   ③ 事故台账缺省目录（incident-log → taskLogsDirOf）
// 任一处改用别的派生（例如回退 <ws>/.forge/task-logs/ 或 <slug>-<localId> 拼接）即红。
import { existsSync, mkdtempSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { FORGE_BASE_DIR_ENTRIES, resolveForgeDirs } from "@dsh-forge/lib-path";
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

describe("worker 规格目录经注册表 forge.spec_dir 解析（forge-dirs-unification §2.3 AC）", () => {
  const ws = mkdtempSync(join(tmpdir(), "task-loop-spec-ws-"));

  it("renderWorkerContext 消费 specDir 入参（注册表解析产物）；缺席 = 锚点规格段省略，零自拼", () => {
    const specDir = join(ws, ".forge", "docs", "specs", "feat-x");
    mkdirSync(specDir, { recursive: true }); // 锚点段为在盘 fail-soft 探测——先落盘再断言
    const withSpec = renderWorkerContext({ forgeDir: join(ws, ".forge", "docs"), containerDir: "T:\\c", localId: "1", source: { slug: "feat-x" }, specDir });
    expect(withSpec).toContain("forge.specs_dir");
    expect(withSpec).toContain(`${specDir}\\`);
    const withoutSpec = renderWorkerContext({ forgeDir: join(ws, ".forge", "docs"), containerDir: "T:\\c", localId: "1", source: { slug: "feat-x" } });
    expect(withoutSpec).not.toContain("forge.specs_dir");
    expect(withoutSpec).toContain("forge.task_logs_dir");
  });

  it("createDefaultResolveWorkerContext 经反射 dirKeys.* 拉缝 + 注册表解析规格目录（与本体重组合并同源）", async () => {
    const container = mkdtempSync(join(tmpdir(), "task-loop-spec-reg-"));
    mkdirSync(join(ws, ".forge", "docs", "specs", "feat-x"), { recursive: true }); // 在盘探测前置
    const reflect = {
      props: { "dirKeys.knowledge": {} },
      get: (name: string) => reflect.props[name],
    };
    const resolve = createDefaultResolveWorkerContext({
      containerDirOf: () => container,
      resolveWsPath: () => ws,
      reflectOf: () => reflect,
      dshHome: "T:\\dsh-home",
    });
    const text = await resolve("proj-key", { slug: "feat-x" }, "3.0");
    // 注册表 forge.spec_dir = join(workspaceRoot/.forge/docs, 'specs', slug)——非 task-loop 自拼
    expect(text).toContain(`${join(ws, ".forge", "docs", "specs", "feat-x")}\\`);
  });

  it("resolveWorkerContext 期间经 reflect 拉 dirKeys.* 声明（spy 现查），规格目录 = 注册表解析值（非自拼——§2.3）", async () => {
    const container = mkdtempSync(join(tmpdir(), "task-loop-spec-spy-"));
    mkdirSync(join(ws, ".forge", "docs", "specs", "feat-x"), { recursive: true }); // 在盘探测前置
    const reflect = {
      props: { "dirKeys.knowledge": {} } as Record<string, unknown>,
      get: (name: string) => reflect.props[name],
    };
    const getSpy = vi.fn((name: string) => reflect.props[name]);
    reflect.get = getSpy;
    const resolve = createDefaultResolveWorkerContext({
      containerDirOf: () => container,
      resolveWsPath: () => ws,
      reflectOf: () => reflect,
      dshHome: "T:\\dsh-home",
    });
    const text = await resolve("proj-key", { slug: "feat-x" }, "3.0");
    // 拉缝行为锚：resolveWorkerContext 期间对 dirKeys.* 声明名现查 reflect.get——
    // 自行拼接实现不触反射（删 index.ts reflectOf 注入 / 改回自拼 = 本断言红）
    expect(getSpy).toHaveBeenCalledWith("dirKeys.knowledge");
    // 值锚：规格目录 = 注册表 resolveForgeDirs 解析值（同一合并事实在测试侧独立复算）
    const registry = resolveForgeDirs(
      [
        { source: "forge.base", entries: FORGE_BASE_DIR_ENTRIES },
        { source: "dirKeys.declared", entries: reflect.props["dirKeys.knowledge"] as Record<string, never> },
      ],
      { dshHome: "T:\\dsh-home", projectRoot: ws, workspaceRoot: ws },
      { slug: "feat-x" },
    );
    expect(text).toContain(`${registry["forge.spec_dir"]}\\`);
  });

  it("reflect 缺席 = 本体 forge.spec_dir 仍解析（在盘即出锚；规格段省略的真因 = 目录不在盘的在盘探测，非 reflect 缺席）", async () => {
    const container = mkdtempSync(join(tmpdir(), "task-loop-spec-absent-"));
    const wsOnDisk = mkdtempSync(join(tmpdir(), "task-loop-spec-ws-ondisk-"));
    mkdirSync(join(wsOnDisk, ".forge", "docs", "specs", "feat-x"), { recursive: true });
    const resolve = createDefaultResolveWorkerContext({ containerDirOf: () => container, resolveWsPath: () => wsOnDisk });
    const text = await resolve("proj-key", { slug: "feat-x" }, "3.0");
    // 反映射缺席仍走本体基座解析——规格目录在盘即出锚（可失败：注册表缝断裂 = 此红）
    expect(text).toContain("forge.specs_dir");
    expect(text).toContain(`${join(wsOnDisk, ".forge", "docs", "specs", "feat-x")}\\`);
    // 对照径：规格目录不在盘 → 锚点规格段省略（renderDirBlock 在盘探测承担，logs 双锚恒出）
    const wsMissing = mkdtempSync(join(tmpdir(), "task-loop-spec-ws-miss-"));
    const resolveMissing = createDefaultResolveWorkerContext({ containerDirOf: () => container, resolveWsPath: () => wsMissing });
    const textMissing = await resolveMissing("proj-key", { slug: "feat-x" }, "3.0");
    expect(textMissing).not.toContain("forge.specs_dir");
    expect(textMissing).toContain("forge.task_logs_dir");
  });

  it("dirKeys 声明逐条形状校验（lib/path 单源——bug 32532117）：坏形状跳过 + warn 诊断；forge.* 保留名拒绝", async () => {
    const container = mkdtempSync(join(tmpdir(), "task-loop-spec-shape-"));
    mkdirSync(join(ws, ".forge", "docs", "specs", "feat-x"), { recursive: true });
    const diag: Array<{ line: string; level?: string }> = [];
    const reflect = {
      props: {
        "dirKeys.knowledge": {
          "forge.custom": { description: "x", deps: ["workspaceRoot"], resolve: () => "x" }, // 保留名拒绝
          "bad.resolve": { description: "x", deps: ["workspaceRoot"], resolve: 42 }, // 坏形状跳过
        },
      },
      get: (name: string) => reflect.props[name],
    };
    const resolve = createDefaultResolveWorkerContext({
      containerDirOf: () => container,
      resolveWsPath: () => ws,
      reflectOf: () => reflect,
      dshHome: "T:\\dsh-home",
      diag: (line, level) => diag.push({ line, level }),
    });
    const text = await resolve("proj-key", { slug: "feat-x" }, "3.0");
    // 两条声明全坏 → 第三方零贡献，规格段仍由本体 forge.spec_dir 解析（锚在盘，不缺席）
    expect(text).toContain(`${join(ws, ".forge", "docs", "specs", "feat-x")}\\`);
    // 诊断留痕：保留名与坏形状各自 warn（不静默——AGENTS §7）
    expect(diag.some((d) => d.level === "warn" && d.line.includes("forge.custom") && d.line.includes("保留命名空间"))).toBe(true);
    expect(diag.some((d) => d.level === "warn" && d.line.includes("bad.resolve"))).toBe(true);
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

  it("worker 规格目录不再自行拼接（join(...'specs'...) 自拼退役——经 specDir 入参）", () => {
    expect(readHost(join("domain", "tasks", "worker-context.ts"))).not.toContain(`"specs"`);
  });

  it("事故台账缺省目录消费 taskLogsDirOf（incident-log.ts）", () => {
    expect(readHost(join("notify", "incident-log.ts"))).toContain("taskLogsDirOf(taskHome, slug, taskKey)");
  });

  it("worker 规格目录经注册表解析缝（default-assembly.ts 消费 resolveSpecDirViaRegistry——自拼退役，改回 join 自拼即红）", () => {
    const assembly = readHost(join("assembly", "default-assembly.ts"));
    expect(assembly).toContain("resolveSpecDirViaRegistry");
    expect(assembly).not.toContain('"specs", source.slug');
  });

  it("worker 规格目录反射拉缝生产接线（index.ts reflectOf 缺省注入宿主 reflect 面——删注入行即红）", () => {
    expect(readHost("index.ts")).toContain("reflectOf: config.reflectOf ??");
  });
});
