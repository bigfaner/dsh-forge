// 概览锚定链插件自解析（fix-11 缺陷 A 建立，bug 41a19182 斩传输收口）：桥缺席/桥锚 null
// 时概览自解析退路。解析链 = 官方 workspace 上下文（sessions 主视图会话 → workspaces 归属
// 快照行 path）→ 注入式归属解析缝 resolveProjectId（host 半 project.db 归属行 +
// workspaceRegistry 进程内直查——fix-11 已建路径）→ 项目锚定。
// 防复发硬门（同族三犯断根）：
//   门① 结构机检——解析链全文件零 makeClient/forgeProjects/forge 传输引用（本文件内 grep 断言）；
//   门② 无传输环境（window.dshForge 缺席 + makeClient 抛错替身）下解析成立——路径与传输完全解耦。
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolveSelfAnchor, type SelfAnchorServices } from "./self-anchor.js";

/** sessions.list 夹具（官方账本快照源——getSnapshot 形态；activeSessionIdOf 消费面） */
function sessionsStoreOf(byId: Record<string, unknown>): unknown {
  return { getSnapshot: () => ({ byId }) };
}

/** workspaces.list 夹具（官方归属快照源——items 行集形态） */
function workspacesStoreOf(items: readonly unknown[]): unknown {
  return { getSnapshot: () => ({ items }) };
}

/** 归属解析缝夹具（纯本地映射——进程内归属行替身；记录调用路径） */
function resolverOf(
  rows: readonly { path: string; projectId: string }[],
  onCall?: (path: string) => void,
  fail?: boolean,
): (path: string) => Promise<string | undefined> {
  return async (path: string) => {
    onCall?.(path);
    if (fail === true) throw new Error("resolve channel broken");
    return rows.find((row) => row.path === path)?.projectId;
  };
}

/** 无传输环境（window.dshForge 缺席 + makeClient 抛错替身——门② 环境断言锚） */
function withoutTransport(): void {
  delete (globalThis as { dshForge?: unknown }).dshForge;
}

function servicesOf(sessions: unknown, workspaces: unknown): SelfAnchorServices {
  return {
    sessions: { list: sessions } as SelfAnchorServices["sessions"],
    workspaces: { list: workspaces } as SelfAnchorServices["workspaces"],
  };
}

const MAIN_SESSION = { s1: { id: "s1", retainedBy: { mainView: 1 } } };

describe("resolveSelfAnchor（归属解析缝注入式——bug 41a19182 斩传输）", () => {
  it("主视图会话 → 归属 workspace path → 解析缝命中 = 项目锚定（projectId/workspaceId/sessionCount）", async () => {
    const calls: string[] = [];
    const out = await resolveSelfAnchor(
      servicesOf(sessionsStoreOf(MAIN_SESSION), workspacesStoreOf([{ workspaceId: "w-1", sessionIds: ["s1"], path: "Z:\\proj\\demo" }])),
      resolverOf([{ path: "Z:\\proj\\demo", projectId: "p-1" }], (path) => calls.push(path)),
    );
    expect(out).toEqual({ projectId: "p-1", workspaceId: "w-1", sessionCount: 1 });
    expect(calls).toEqual(["Z:\\proj\\demo"]); // 归一前原路径直送——归一键归解析缝宿主半
  });

  it("无主视图会话（retainedBy 全零）= null 且零解析调用", async () => {
    const onCall = vi.fn();
    const out = await resolveSelfAnchor(
      servicesOf(sessionsStoreOf({ s2: { id: "s2", retainedBy: { mainView: 0 } } }), workspacesStoreOf([{ workspaceId: "w-1", sessionIds: ["s2"], path: "Z:\\p" }])),
      resolverOf([], onCall),
    );
    expect(out).toBeNull();
    expect(onCall).not.toHaveBeenCalled();
  });

  it("归属 workspace 无 path（worktree 工作区行）/ 快照形状漂移 = null", async () => {
    const onCall = vi.fn();
    expect(
      await resolveSelfAnchor(servicesOf(sessionsStoreOf(MAIN_SESSION), workspacesStoreOf([{ workspaceId: "w-1", sessionIds: ["s1"] }])), resolverOf([], onCall)),
    ).toBeNull();
    expect(
      await resolveSelfAnchor(servicesOf(sessionsStoreOf(MAIN_SESSION), workspacesStoreOf("drifted")), resolverOf([], onCall)),
    ).toBeNull();
    expect(onCall).not.toHaveBeenCalled();
  });

  it("解析缝未命中（未注册工作区）= null", async () => {
    const out = await resolveSelfAnchor(
      servicesOf(sessionsStoreOf(MAIN_SESSION), workspacesStoreOf([{ workspaceId: "w-9", sessionIds: ["s1"], path: "Z:\\ghost" }])),
      resolverOf([]),
    );
    expect(out).toBeNull();
  });

  it("解析缝抛错 = fail-soft null（不 reject 不炸壳）", async () => {
    const out = await resolveSelfAnchor(
      servicesOf(sessionsStoreOf(MAIN_SESSION), workspacesStoreOf([{ workspaceId: "w-1", sessionIds: ["s1"], path: "Z:\\p" }])),
      resolverOf([], undefined, true),
    );
    expect(out).toBeNull();
  });

  it("服务面缺席（sessions/workspaces undefined）= null（官方宿主服务缺席形态）", async () => {
    expect(await resolveSelfAnchor(undefined, resolverOf([]))).toBeNull();
  });

  it("门②：无传输环境（dshForge 缺席 + makeClient 抛错替身）解析成立——路径与传输完全解耦", async () => {
    withoutTransport();
    const makeClient = (): never => {
      throw new Error("preload transport absent（Desktop harness 形态）");
    };
    const out = await resolveSelfAnchor(
      servicesOf(sessionsStoreOf(MAIN_SESSION), workspacesStoreOf([{ workspaceId: "w-1", sessionIds: ["s1"], path: "Z:\\proj\\demo" }])),
      resolverOf([{ path: "Z:\\proj\\demo", projectId: "p-local" }]),
    );
    expect(out).toEqual({ projectId: "p-local", workspaceId: "w-1", sessionCount: 1 });
    expect(() => makeClient()).toThrow();
  });
});

describe("门①：锚定解析链结构机检（grep 零传输引用——同族三犯断根）", () => {
  const CHAIN_FILES = ["self-anchor.ts"] as const;
  const FORBIDDEN = [
    /\bmakeClient\b/,
    /\bforgeProjects\b/,
    /\bforgeWorktree\b/,
    /\bforge remote\b/,
    /\bpreloadRpcClientFactory\b/,
    /\bpreloadTransport\b/,
    /\bdshForge\b/,
    /\bRpcClientFactory\b/,
    /\bWorktreeResolveClientFactory\b/,
    /\bresolveWorkspaceProjectMap\b/,
  ];

  for (const file of CHAIN_FILES) {
    it(`${file} 零 makeClient/forgeProjects/forge 传输引用`, () => {
      const source = readFileSync(fileURLToPath(new URL(`./${file}`, import.meta.url)), "utf8");
      for (const pattern of FORBIDDEN) {
        expect(source, `${file} 命中禁用引用 ${String(pattern)}`).not.toMatch(pattern);
      }
    });
  }

  it("dock-tabs.tsx 不再把 preload 传输工厂递入 useSelfAnchor", () => {
    const source = readFileSync(fileURLToPath(new URL("./dock-tabs.tsx", import.meta.url)), "utf8");
    expect(source).not.toMatch(/useSelfAnchor\([^)]*makeClient/);
  });
});
