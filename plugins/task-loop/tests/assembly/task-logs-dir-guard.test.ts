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
import { FORGE_TASKS_SERVICE_KEY } from "../../shared/contract-constants.js";
import { assembleTaskLoopServices, createDefaultResolveWorkerContext } from "../../host/assembly/default-assembly.js";
import taskLoopPlugin from "../../host/index.js";
import { taskLogsDirOf } from "../../host/domain/tasks/task-logs-dir.js";
import { renderWorkerContext } from "../../host/domain/tasks/worker-context.js";
// 跨插件契约锚（仅测试面——host 代码零跨插件 import）：spec 声明正本充当宿主声明面替身
import { SPEC_DIR_ENTRIES } from "../../../spec/host/forge-dir-entries.js";

const HERE = dirname(fileURLToPath(import.meta.url));

function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/** 声明方集合 → 宿主 reflect 面替身（props 枚举 + get 取值——resolveSpecDirViaRegistry 消费形） */
function reflectOf(props: Record<string, unknown>): { props: Record<string, unknown>; get: (name: string) => unknown } {
  const reflect = {
    props,
    get: (name: string): unknown => reflect.props[name],
  };
  return reflect;
}

/** spec 插件声明替身（生产宿主经 reflect.provide('dirKeys.spec', SPEC_DIR_ENTRIES) 提供） */
const SPEC_DECLARER = { "dirKeys.spec": SPEC_DIR_ENTRIES };

describe("taskLogsDirOf（任务目录派生单点）", () => {
  it("= join(containerDir, slug, localId)（注册侧 forge_resolve_path(task_loop.task_dir) 同形）", () => {
    expect(taskLogsDirOf("T:\\home\\c@deadbeef", "feat-x", "2.1")).toBe(join("T:\\home\\c@deadbeef", "feat-x", "2.1"));
    expect(taskLogsDirOf("T:\\home\\c", "s", "1")).toBe("T:\\home\\c\\s\\1");
  });
});

describe("worker 简报锚点与钩子运行时目录同径（bug 26dff330 AC）", () => {
  const containerDir = join("T:", "home", "c@deadbeef");
  const expected = taskLogsDirOf(containerDir, "feat-x", "2.1");

  it("renderWorkerContext 锚点段携带的 task_loop.task_dir 绝对路径 = taskLogsDirOf 产物", () => {
    const block = renderWorkerContext({ forgeDir: "", containerDir, localId: "2.1", source: { slug: "feat-x" } });
    // 取 task_loop.task_dir 段的首个绝对路径行
    const seg = block.slice(block.indexOf("task_loop.task_dir——"));
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

describe("worker 规格目录经注册表 spec.dir 解析（forge-dirs-unification §2.3 AC——键归 plugins/spec 声明）", () => {
  const ws = mkdtempSync(join(tmpdir(), "task-loop-spec-ws-"));

  it("renderWorkerContext 消费 specDir 入参（注册表解析产物）；缺席 = 锚点规格段省略，零自拼", () => {
    const specDir = join(ws, ".forge", "specs", "feat-x");
    mkdirSync(specDir, { recursive: true }); // 锚点段为在盘 fail-soft 探测——先落盘再断言
    const withSpec = renderWorkerContext({ forgeDir: join(ws, ".forge", "docs"), containerDir: "T:\\c", localId: "1", source: { slug: "feat-x" }, specDir });
    expect(withSpec).toContain("spec.dir——");
    expect(withSpec).toContain(`${specDir}\\`);
    const withoutSpec = renderWorkerContext({ forgeDir: join(ws, ".forge", "docs"), containerDir: "T:\\c", localId: "1", source: { slug: "feat-x" } });
    expect(withoutSpec).not.toContain("spec.dir——");
    expect(withoutSpec).toContain("task_loop.task_dir——");
  });

  it("createDefaultResolveWorkerContext 经反射 dirKeys.* 拉缝 + 注册表解析规格目录（spec 声明 + 基座合并同源）", async () => {
    const container = mkdtempSync(join(tmpdir(), "task-loop-spec-reg-"));
    mkdirSync(join(ws, ".forge", "specs", "feat-x"), { recursive: true }); // 在盘探测前置
    const reflect = reflectOf({ "dirKeys.knowledge": {}, ...SPEC_DECLARER });
    const resolve = createDefaultResolveWorkerContext({
      containerDirOf: () => container,
      resolveWsPath: () => ws,
      reflectOf: () => reflect,
      dshHome: "T:\\dsh-home",
    });
    const text = await resolve("proj-key", { slug: "feat-x" }, "3.0");
    // 注册表 spec.dir = join(workspaceRoot/.forge, 'specs', slug)——非 task-loop 自拼
    expect(text).toContain(`${join(ws, ".forge", "specs", "feat-x")}\\`);
  });

  it("spec 插件未声明 spec.dir = 规格段省略（未装载即缺席——不自拼、不回落基座）+ warn 留痕", async () => {
    const container = mkdtempSync(join(tmpdir(), "task-loop-spec-undeclared-"));
    mkdirSync(join(ws, ".forge", "specs", "feat-x"), { recursive: true }); // 规格目录在盘也不出锚（键缺席即省略）
    const diag: Array<{ line: string; level?: string }> = [];
    const resolve = createDefaultResolveWorkerContext({
      containerDirOf: () => container,
      resolveWsPath: () => ws,
      reflectOf: () => reflectOf({ "dirKeys.knowledge": {} }),
      dshHome: "T:\\dsh-home",
      diag: (line, level) => diag.push({ line, level }),
    });
    const text = await resolve("proj-key", { slug: "feat-x" }, "3.0");
    expect(text).not.toContain("spec.dir——");
    expect(text).toContain("task_loop.task_dir——"); // 其余锚不变
    expect(diag.some((d) => d.level === "warn" && d.line.includes("spec.dir") && d.line.includes("未被任何声明方提供"))).toBe(true);
  });

  it("其它插件的键依赖闭包外目录键时不牵连（task_loop.* 依赖 project.runtime_dir——project 条目不在拉取集内，规格目录仍解析）", async () => {
    const container = mkdtempSync(join(tmpdir(), "task-loop-spec-closure-"));
    mkdirSync(join(ws, ".forge", "specs", "feat-x"), { recursive: true });
    const resolve = createDefaultResolveWorkerContext({
      containerDirOf: () => container,
      resolveWsPath: () => ws,
      reflectOf: () =>
        reflectOf({
          ...SPEC_DECLARER,
          "dirKeys.task_loop": {
            "task_loop.runtime_dir": { description: "x", deps: ["project.runtime_dir"], params: ["slug"], resolve: () => "x" },
          },
        }),
      dshHome: "T:\\dsh-home",
    });
    const text = await resolve("proj-key", { slug: "feat-x" }, "3.0");
    expect(text).toContain(`${join(ws, ".forge", "specs", "feat-x")}\\`);
  });

  it("正式装配入口行为级接线（host/index.ts）：claim 期间经反射拉 dirKeys.*（不手工注入被测缝——删 index.ts reflectOf 缺省注入即红）", async () => {
    const wsEntry = mkdtempSync(join(tmpdir(), "task-loop-spec-entry-"));
    mkdirSync(join(wsEntry, ".forge", "specs", "feat-x"), { recursive: true });
    const tasksHome = mkdtempSync(join(tmpdir(), "task-loop-spec-entry-home-"));
    const provided = new Map<string, unknown>();
    // forge.projects 身份缝（生产 resolveWsPathAsync 消费面——getProject().wsPath 供 ws 根）
    provided.set("forge.projects", () => ({ getProject: async () => ({ wsPath: wsEntry }) }));
    // spec 插件声明（生产宿主经 reflect.provide('dirKeys.spec') 提供——get 取值面同源）
    provided.set("dirKeys.spec", SPEC_DIR_ENTRIES);
    const getSpy = vi.fn((name: string) => provided.get(name));
    const ctx = {
      reflect: {
        provide: (name: string, service: unknown) => {
          provided.set(name, service);
          return () => provided.delete(name);
        },
      get: getSpy,
      // 宿主 reflect.props 形（cordis 声明枚举面——resolveSpecDirViaRegistry 经 props 枚举
      // dirKeys.* 声明方再逐个 get；声明方集合 = 生产宿主 knowledge / spec 两插件 provide 的同键）
      get props() {
        return { "dirKeys.knowledge": {}, ...SPEC_DECLARER };
      },
    },
    emit: () => {},
      tools: { register: () => () => {} },
    };
    const dispose = taskLoopPlugin(ctx as never, {
      home: join(tmpdir(), "task-loop-spec-entry-db"),
      dbFile: ":memory:",
      tasksHome,
      resolveWsPath: () => wsEntry,
      diag: () => {},
    });
    const tasks = provided.get(FORGE_TASKS_SERVICE_KEY) as {
      addTask(input: { projectKey: string; slug: string; title: string; type: string }): Promise<{ localId: string }>;
      claimTask(input: { projectKey: string; sessionId: string; taskRef: { slug: string; localId: string } }): Promise<{ persona: string }>;
    };
    const added = await tasks.addTask({ projectKey: "proj-key", slug: "feat-x", title: "t", type: "coding-feature" });
    const claimed = await tasks.claimTask({ projectKey: "proj-key", sessionId: "s-1", taskRef: { slug: "feat-x", localId: added.localId } });
    // 拉缝行为锚：生产装配（index.ts reflectOf 缺省注入宿主 reflect 面）下 claim 现查反射 dirKeys.*——
    // 删 index.ts 注入行（reflectOf 落 undefined）或改回自拼 = 本断言红
    expect(getSpy).toHaveBeenCalledWith("dirKeys.knowledge");
    // 值锚：worker persona 规格段 = 注册表 spec.dir 解析值
    expect(claimed.persona).toContain(`${join(wsEntry, ".forge", "specs", "feat-x")}\\`);
    dispose();
  });

  it("resolveWorkerContext 期间经 reflect 拉 dirKeys.* 声明（spy 现查），规格目录 = 注册表解析值（非自拼——§2.3）", async () => {
    const container = mkdtempSync(join(tmpdir(), "task-loop-spec-spy-"));
    mkdirSync(join(ws, ".forge", "specs", "feat-x"), { recursive: true }); // 在盘探测前置
    const reflect = reflectOf({ "dirKeys.knowledge": {}, ...SPEC_DECLARER });
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
    expect(getSpy).toHaveBeenCalledWith("dirKeys.spec");
    // 值锚：规格目录 = 注册表 resolveForgeDirs 解析值（同一合并事实在测试侧独立复算）
    const registry = resolveForgeDirs(
      [
        { source: "forge.base", entries: FORGE_BASE_DIR_ENTRIES },
        { source: "dirKeys.spec", entries: SPEC_DIR_ENTRIES },
      ],
      { dshHome: "T:\\dsh-home", projectRoot: ws, workspaceRoot: ws },
      { slug: "feat-x" },
    );
    expect(text).toContain(`${registry["spec.dir"]}\\`);
  });

  it("reflect 缺席 = spec.dir 未声明，规格段省略（规格目录在盘亦不出锚——未装载即缺席；运行时目录双锚恒出）", async () => {
    const container = mkdtempSync(join(tmpdir(), "task-loop-spec-absent-"));
    const wsOnDisk = mkdtempSync(join(tmpdir(), "task-loop-spec-ws-ondisk-"));
    mkdirSync(join(wsOnDisk, ".forge", "specs", "feat-x"), { recursive: true });
    const resolve = createDefaultResolveWorkerContext({ containerDirOf: () => container, resolveWsPath: () => wsOnDisk });
    const text = await resolve("proj-key", { slug: "feat-x" }, "3.0");
    // 无反射面即无 spec 声明——不自拼回落（可失败：改回基座自拼 = 此红）
    expect(text).not.toContain("spec.dir——");
    expect(text).toContain("task_loop.runtime_dir——");
    expect(text).toContain("task_loop.task_dir——");
  });

  it("两个声明方同名键 spec.dir → warn 诊断点名两个声明方（bug fb3777a4——拉取缝不静默后到者胜）", async () => {
    const container = mkdtempSync(join(tmpdir(), "task-loop-spec-collide-"));
    const okEntry = { description: "x", deps: ["workspaceRoot"], params: ["slug"], resolve: () => "x" };
    const diag: Array<{ line: string; level?: string }> = [];
    const reflect = reflectOf({
      "dirKeys.alpha": { "spec.dir": okEntry },
      "dirKeys.beta": { "spec.dir": okEntry },
    });
    const resolve = createDefaultResolveWorkerContext({
      containerDirOf: () => container,
      resolveWsPath: () => ws,
      reflectOf: () => reflect,
      dshHome: "T:\\dsh-home",
      diag: (line, level) => diag.push({ line, level }),
    });
    await resolve("proj-key", { slug: "feat-x" }, "3.0");
    // Spec §2.2 同口径（project 侧 anchors.ts）：撞名报错并点名两个声明方，不取先到/后到者
    expect(diag.filter((d) => d.level === "warn" && d.line.includes("dirKeys.alpha") && d.line.includes("dirKeys.beta")), "撞名 warn 点名两个声明方").toHaveLength(1);
  });

  it("dirKeys 声明逐条形状校验（lib/path 单源——bug 32532117）：坏形状跳过 + warn 诊断；forge.* 保留名拒绝", async () => {
    const container = mkdtempSync(join(tmpdir(), "task-loop-spec-shape-"));
    mkdirSync(join(ws, ".forge", "specs", "feat-x"), { recursive: true });
    const diag: Array<{ line: string; level?: string }> = [];
    const reflect = reflectOf({
      ...SPEC_DECLARER,
      "dirKeys.knowledge": {
        "forge.custom": { description: "x", deps: ["workspaceRoot"], resolve: () => "x" }, // 保留名拒绝
        "bad.resolve": { description: "x", deps: ["workspaceRoot"], resolve: 42 }, // 坏形状跳过
      },
    });
    const resolve = createDefaultResolveWorkerContext({
      containerDirOf: () => container,
      resolveWsPath: () => ws,
      reflectOf: () => reflect,
      dshHome: "T:\\dsh-home",
      diag: (line, level) => diag.push({ line, level }),
    });
    const text = await resolve("proj-key", { slug: "feat-x" }, "3.0");
    // 坏形状声明方零贡献不牵连——规格段由 spec 声明经注册表解析（锚在盘，不缺席）
    expect(text).toContain(`${join(ws, ".forge", "specs", "feat-x")}\\`);
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
