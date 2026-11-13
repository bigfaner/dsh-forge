// 概览锚定链插件自解析（fix-11 缺陷 A——RED 面）：桥缺席/桥锚 null 时概览自解析退路。
// 解析链 = 官方 workspace 上下文（sessions 主视图会话 → workspaces 归属快照行 path）→
// forgeWorktree.resolve 批量通道（host 身份裁决 = project.db 归属行匹配）→ 项目锚定。
// 铁律：forgeProjects.list 消费点归零——makeClient 只消费 worktree.resolve 一法，
// 无 forgeProjects face 解析恒成立（单测夹具只给 resolve）。
import { describe, expect, it, vi } from "vitest";
import { resolveSelfAnchor, type SelfAnchorServices } from "./self-anchor.js";

/** sessions.list 夹具（官方账本快照源——getSnapshot 形态；activeSessionIdOf 消费面） */
function sessionsStoreOf(byId: Record<string, unknown>): unknown {
  return { getSnapshot: () => ({ byId }) };
}

/** workspaces.list 夹具（官方归属快照源——items 行集形态） */
function workspacesStoreOf(items: readonly unknown[]): unknown {
  return { getSnapshot: () => ({ items }) };
}

/** resolve 单法 client 夹具工厂（无 forgeProjects face——解析不得触达其它面） */
function resolveClientOf(
  resolved: readonly { path: string; projectId: string }[],
  onCall?: (paths: readonly string[]) => void,
  fail?: boolean,
): () => unknown {
  const client = {
    worktree: {
      resolve: async (q: { paths: readonly string[] }) => {
        onCall?.(q.paths);
        if (fail === true) throw new Error("resolve channel broken");
        return { resolved };
      },
    },
  };
  return () => client;
}

function servicesOf(sessions: unknown, workspaces: unknown): SelfAnchorServices {
  return {
    sessions: { list: sessions } as SelfAnchorServices["sessions"],
    workspaces: { list: workspaces } as SelfAnchorServices["workspaces"],
  };
}

const MAIN_SESSION = { s1: { id: "s1", retainedBy: { mainView: 1 } } };

describe("resolveSelfAnchor（无 forgeProjects face 解析成立——fix-11 缺陷 A RED→GREEN）", () => {
  it("主视图会话 → 归属 workspace path → resolve 命中 = 项目锚定（projectId/workspaceId/sessionCount）", async () => {
    const calls: readonly string[][] = [];
    const client = resolveClientOf([{ path: "Z:\\proj\\demo", projectId: "p-1" }], (paths) => calls.push([...paths]));
    const out = await resolveSelfAnchor(
      servicesOf(sessionsStoreOf(MAIN_SESSION), workspacesStoreOf([{ workspaceId: "w-1", sessionIds: ["s1"], path: "Z:\\proj\\demo" }])),
      client,
    );
    expect(out).toEqual({ projectId: "p-1", workspaceId: "w-1", sessionCount: 1 });
    expect(calls).toEqual([["Z:\\proj\\demo"]]); // 归一前原路径直送——归一键归 resolveWorkspaceProjectMap
  });

  it("无主视图会话（retainedBy 全零）= null 且零 RPC（resolve 未调用）", async () => {
    const onCall = vi.fn();
    const client = resolveClientOf([], onCall);
    const out = await resolveSelfAnchor(
      servicesOf(sessionsStoreOf({ s2: { id: "s2", retainedBy: { mainView: 0 } } }), workspacesStoreOf([{ workspaceId: "w-1", sessionIds: ["s2"], path: "Z:\\p" }])),
      client,
    );
    expect(out).toBeNull();
    expect(onCall).not.toHaveBeenCalled();
  });

  it("归属 workspace 无 path（worktree 工作区行）/ 快照形状漂移 = null", async () => {
    const onCall = vi.fn();
    const client = resolveClientOf([], onCall);
    expect(
      await resolveSelfAnchor(servicesOf(sessionsStoreOf(MAIN_SESSION), workspacesStoreOf([{ workspaceId: "w-1", sessionIds: ["s1"] }])), client),
    ).toBeNull();
    expect(
      await resolveSelfAnchor(servicesOf(sessionsStoreOf(MAIN_SESSION), workspacesStoreOf("drifted")), client),
    ).toBeNull();
    expect(onCall).not.toHaveBeenCalled();
  });

  it("resolve 未命中（未注册工作区）= null", async () => {
    const out = await resolveSelfAnchor(
      servicesOf(sessionsStoreOf(MAIN_SESSION), workspacesStoreOf([{ workspaceId: "w-9", sessionIds: ["s1"], path: "Z:\\ghost" }])),
      resolveClientOf([]),
    );
    expect(out).toBeNull();
  });

  it("resolve 通道抛错 = fail-soft null（不 reject 不炸壳）", async () => {
    const out = await resolveSelfAnchor(
      servicesOf(sessionsStoreOf(MAIN_SESSION), workspacesStoreOf([{ workspaceId: "w-1", sessionIds: ["s1"], path: "Z:\\p" }])),
      resolveClientOf([], undefined, true),
    );
    expect(out).toBeNull();
  });

  it("服务面缺席（sessions/workspaces undefined）= null（官方宿主服务缺席形态）", async () => {
    expect(await resolveSelfAnchor(undefined, resolveClientOf([]))).toBeNull();
  });
});
