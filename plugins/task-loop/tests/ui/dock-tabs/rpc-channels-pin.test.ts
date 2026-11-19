// dock-tabs rpc-channels 迁移 pin（1.13 六组件迁批改型锚）：task-loop 副本 transport =
// Typert 形态——零 preload dshForge 面（self-containment 同族机检）；forge:tasks/* 八方法
// 键名沿用（TASKS_CHANNELS 键集合逐字）；ui-state 面与 project 正本同源（逐字镜像面收敛）。
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TASKS_CHANNELS } from "@dsh-forge/contracts";
import { createForgeRpcClient } from "../../../ui/dock-tabs/rpc-channels.js";

const ROOT = fileURLToPath(new URL("../../../../../", import.meta.url));

function read(rel: string): string {
  return readFileSync(ROOT + rel, "utf8");
}

describe("dock-tabs rpc-channels 迁移 pin（task-loop 改型形态）", () => {
  const source = read("plugins/task-loop/ui/dock-tabs/rpc-channels.ts")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith("//"))
    .join("\n");

  it("零 dshForge 引用（preload transport 不随迁——self-containment 源级锚）", () => {
    expect(source).not.toMatch(/dshForge/);
    expect(source).not.toMatch(/preloadTransport|preloadRpcClientFactory|preloadTasksChangedSubscribe/);
  });

  it("forge:tasks/* 八方法键名沿用（TASKS_CHANNELS 键集合逐字）", () => {
    const noopTransport = async (): Promise<unknown> => ({ ok: true, data: null });
    const client = createForgeRpcClient(noopTransport);
    expect(Object.keys(client.tasks).sort()).toEqual(Object.keys(TASKS_CHANNELS).sort());
  });

  it("TasksChangedHub 合并语义保留（50ms 合并窗常量在源）", () => {
    expect(source).toMatch(/TASKS_CHANGED_COALESCE_MS = 50/);
    expect(source).toMatch(/createTasksChangedHub/);
  });
});
