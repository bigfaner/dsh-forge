// 事件日志链装配（bug a93c1277——派发运营日志零落盘收口）：tasksHome 注入（组合器
// patch config 下发 {DSH_HOME}/forge/projects）→ bus→sink→监听器三件装配 +
// logs/{slug}.jsonl 落盘；tasksHome 缺席（单装缺省形态）= 整链零装配零行为变化。
// 工具族 execute prepare 缝同批锁定：exec 会话 cwd → 容器目录记忆（worker 会话事件
// 同链落盘的前提——子会话继承父 cwd，prepare 命中同一容器目录）。
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { deriveDirName } from "@dsh-forge/lib-path";
import { assembleTaskLoopServices } from "../../host/assembly/default-assembly.js";
import { assembleTaskLoopToolFamily } from "../../host/assembly/tool-family.js";
import { forgeLogFileOf, readForgeEventLog } from "../../host/events/log-listener.js";
import type { ForgePluginEvent } from "@dsh-forge/contracts";

function tempRoot(): string {
  return mkdtempSync(join(tmpdir(), "task-loop-events-"));
}

function config(over: { tasksHome?: string } = {}): { home: string; dbFile: string; tasksHome?: string } {
  const home = tempRoot();
  return { home, dbFile: ":memory:", ...over };
}

function poolEvent(sessionId: string): ForgePluginEvent {
  return { ts: Date.now(), sessionId, slug: "_pool", type: "tool-error", payload: { verb: "dispatch_task", code: "X", message: "m" } };
}

describe("tasksHome 注入 → forge 事件日志链装配（bug a93c1277 RED 锚）", () => {
  it("assembly.forgeEvents 在场；sink.remember + emit → logs/_pool.jsonl 落 {tasksHome}/{projectKey}/logs", async () => {
    const tasksHome = tempRoot();
    const services = assembleTaskLoopServices(config({ tasksHome }));
    expect(services).toBeDefined();
    expect(services!.forgeEvents).toBeDefined();
    const ws = "Z:\\project\\demo";
    const containerDir = join(tasksHome, deriveDirName(ws));
    services!.forgeEvents!.remember("s-1", containerDir);
    expect(() => services!.forgeEvents!.emit(poolEvent("s-1"))).not.toThrow();
    const file = forgeLogFileOf(containerDir, "_pool");
    const rows = readForgeEventLog(file);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ sessionId: "s-1", slug: "_pool", type: "tool-error" });
    services!.dispose();
  });

  it("tasksHome 缺席（单装缺省形态）→ forgeEvents 零装配（行为零变化——AC4 回归锚）", () => {
    const services = assembleTaskLoopServices(config());
    expect(services).toBeDefined();
    expect(services!.forgeEvents).toBeUndefined();
    expect(services!.containerDirOf).toBeUndefined();
    services!.dispose();
  });
});

describe("工具族 execute prepare 缝（会话 cwd → 容器目录记忆）", () => {
  it("forgeEvents 在场：execute 前 prepare 记忆 exec 会话 cwd 派生目录；后续 emit 落同一容器 logs", async () => {
    const tasksHome = tempRoot();
    const services = assembleTaskLoopServices(config({ tasksHome }))!;
    const ctx = { reflect: { provide: () => {}, get: () => undefined }, emit: () => {} };
    const family = assembleTaskLoopToolFamily({ services, ctx, diag: () => {} });
    const addTask = family.tools.find((t) => t.name === "add_task")!;
    const ws = "Z:\\project\\toolface";
    // 只消费 prepare 缝：add_task 空参数走域拒绝路径，执行成败不论（catch 吞）
    await addTask.execute({}, { agent: { session: { id: "s-9", header: { cwd: ws } } } }).catch(() => {});
    expect(() => services.forgeEvents!.emit(poolEvent("s-9"))).not.toThrow();
    const file = forgeLogFileOf(join(tasksHome, deriveDirName(ws)), "_pool");
    expect(readForgeEventLog(file)).toHaveLength(1);
    services.dispose();
  });

  it("forgeEvents 缺席：工具族零 prepare 包装（行为零变化）", async () => {
    const services = assembleTaskLoopServices(config())!;
    const ctx = { reflect: { provide: () => {}, get: () => undefined }, emit: () => {} };
    const family = assembleTaskLoopToolFamily({ services, ctx, diag: () => {} });
    const addTask = family.tools.find((t) => t.name === "add_task")!;
    // 无 sink 时 add_task 空参数行为与既有形态一致（typed 拒绝，不因包装漂移）
    await expect(addTask.execute({}, { agent: { session: { id: "s-0", header: { cwd: "Z:\\x" } } } })).rejects.toThrow();
    services.dispose();
  });
});
