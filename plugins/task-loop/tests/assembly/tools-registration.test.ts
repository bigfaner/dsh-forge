// 单装形态 host 半工具族注册缝（bug a033636f——fix-8）：host apply 期经官方 ctx.tools.register
// 全工具面注册（14 员：10 任务动词 + batch_add_tasks + impl_checkpoint 三员 + dispatch/stop），
// unmount 撤回；官方 tools 缝缺席 = 零注册 + 诊断留痕（不抛、不阻载——降级诚实）。
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import taskLoopPlugin from "../../host/index.js";

/** 期望注册名面（snake_case 单源——与既有 tool 定义 TOOL 常量一致） */
const EXPECTED_TOOL_NAMES = [
  "add_task",
  "batch_add_tasks",
  "submit_task",
  "query_task",
  "update_task",
  "list_tasks",
  "task_stats",
  "pause_task",
  "unblock_task",
  "dispatch_task",
  "stop_task_loop",
  "record_impl_checkpoint",
  "query_impl_checkpoint",
  "list_impl_checkpoints",
] as const;

type RegisteredTool = { readonly name: string };
type Registered = { readonly tools: RegisteredTool[]; readonly disposed: boolean[] };

function fakeCtxWithTools(): { ctx: Record<string, unknown>; registered: Registered } {
  const tools: RegisteredTool[] = [];
  const disposed: boolean[] = [];
  const provided: string[] = [];
  const ctx: Record<string, unknown> = {
    reflect: {
      provide: (name: string) => {
        provided.push(name);
      },
      get: () => undefined,
    },
    emit: () => {},
    tools: {
      register: (definition: RegisteredTool) => {
        tools.push(definition);
        disposed.push(false);
        return () => {
          disposed[tools.indexOf(definition)] = true;
        };
      },
    },
  };
  return { ctx, registered: { get tools() { return tools; }, get disposed() { return disposed; } } as unknown as Registered };
}

function config(home: string): { home: string; dbFile: string } {
  return { home, dbFile: ":memory:" };
}

let home: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "task-loop-tools-"));
});

describe("host apply 期官方 tools 缝工具族注册（bug a033636f）", () => {
  it("ctx.tools.register 在场：恰注册 14 员（名单逐一对账）且 unmount 全撤回", () => {
    const { ctx, registered } = fakeCtxWithTools();
    const dispose = taskLoopPlugin(ctx, config(home));
    expect(registered.tools.map((t) => t.name)).toEqual([...EXPECTED_TOOL_NAMES]);
    dispose();
    expect(registered.disposed.every((d) => d)).toBe(true);
  });

  it("域服务照常 provide（注册缝与 namespace 注册共存互不干扰）", () => {
    const { ctx } = fakeCtxWithTools();
    const provided: string[] = [];
    (ctx.reflect as { provide: (n: string) => void }).provide = (n: string) => provided.push(n);
    taskLoopPlugin(ctx, config(home));
    expect(provided).toContain("forgeTasks");
    expect(provided).toContain("forgeCheckpoints");
  });
});

describe("官方 tools 缝缺席（RED 锚——单装工具面零注册根因钉住）", () => {
  it("ctx.tools 缺席：零注册 + 诊断 warn 留痕（含 tools.register 指认）", () => {
    const diagLines: string[] = [];
    const ctx: Record<string, unknown> = {
      reflect: { provide: () => {}, get: () => undefined },
      emit: () => {},
    };
    taskLoopPlugin(ctx, { ...config(home), diag: (line: string) => diagLines.push(line) });
    expect(diagLines.some((l) => l.includes("tools.register"))).toBe(true);
  });

  it("ctx.tools.register 非函数（劣形）：同零注册降级径", () => {
    const diagLines: string[] = [];
    const ctx: Record<string, unknown> = {
      reflect: { provide: () => {}, get: () => undefined },
      emit: () => {},
      tools: {},
    };
    taskLoopPlugin(ctx, { ...config(home), diag: (line: string) => diagLines.push(line) });
    expect(diagLines.some((l) => l.includes("tools.register"))).toBe(true);
  });
});
