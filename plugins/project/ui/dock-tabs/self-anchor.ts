// 概览锚定链插件自解析缝（fix-11 缺陷 A——工作台桥缺席/桥锚 null 时的自给退路）：
// 官方 workspace 上下文（sessions 主视图会话 retainedBy.mainView → workspaces 归属快照
// 行 path）→ forgeWorktree.resolve 批量通道（host 身份裁决单点 = project.db 归属行匹配）
// → 项目锚定。forgeProjects.list 消费点归零——数据通路只消费 worktree.resolve 一法
//（dsh-forge 集成态壳侧 knowledge-anchor 裁决仍为正门，本缝仅在桥锚缺席时补位，
// 回归零变化）。形状漂移/通道故障 = null fail-soft 不炸壳（AGENTS 1.6 现查不缓存）。
import { useEffect, useState } from "react";
import { normalizeFsPath } from "@dsh-forge/lib-path/path-key";
import { activeSessionIdOf, type ForgeSessionsService, type ForgeWorkspacesService } from "../session-actions.js";
import {
  isWorkspacesSnapshot,
  resolveWorkspaceProjectMap,
  type WorktreeResolveClientFactory,
} from "../knowledge/anchored-projects.js";
import type { LedgerWorkspacesSnapshot } from "../knowledge/kit-types.js";

/** 自解析服务缝（dock-tabs-face inject 递达——ctx.get 现查产物，缺席 = 缝不装） */
export interface SelfAnchorServices {
  readonly sessions: ForgeSessionsService;
  readonly workspaces: ForgeWorkspacesService;
}

/** 自解析锚上下文（ForgeOverviewContext 同形——桥锚 null 时整束补位） */
export interface SelfAnchorContext {
  readonly projectId: string;
  readonly workspaceId: string | null;
  readonly sessionCount?: number;
}

/** workspaces.list → 归属快照（getSnapshot store 形态优先，直挂 items 快照形态回退；漂移 = null） */
function workspacesSnapshotOf(list: unknown): LedgerWorkspacesSnapshot | null {
  if (typeof list !== "object" || list === null) return null;
  const store = list as { getSnapshot?: unknown };
  let snapshot: unknown = list;
  if (typeof store.getSnapshot === "function") {
    try {
      snapshot = (store.getSnapshot as () => unknown).call(list);
    } catch {
      return null;
    }
  }
  return isWorkspacesSnapshot(snapshot) ? snapshot : null;
}

/**
 * 概览锚自解析（纯异步——hook 径与单测共面）：主视图会话 → 归属 workspace 行 path →
 * resolve 归属裁决 → 项目锚定。任一环缺席/漂移/抛错 = null（消费方维持桥锚现状语义）。
 */
export async function resolveSelfAnchor(
  services: SelfAnchorServices | undefined,
  makeClient: WorktreeResolveClientFactory,
): Promise<SelfAnchorContext | null> {
  if (services === undefined) return null;
  const sessionId = activeSessionIdOf(services.sessions.list);
  if (sessionId === undefined) return null;
  const snapshot = workspacesSnapshotOf(services.workspaces.list);
  if (snapshot === null) return null;
  const home = snapshot.items.find((row) => Array.isArray(row.sessionIds) && row.sessionIds.includes(sessionId));
  const path = home?.path;
  if (typeof path !== "string" || path === "") return null;
  let projectId: string | undefined;
  try {
    const map = await resolveWorkspaceProjectMap([path], () => makeClient());
    projectId = map.get(normalizeFsPath(path));
  } catch {
    return null;
  }
  if (projectId === undefined) return null;
  return {
    projectId,
    workspaceId: typeof home?.workspaceId === "string" ? home.workspaceId : null,
    sessionCount: Array.isArray(home?.sessionIds) ? home.sessionIds.length : undefined,
  };
}

/** store 订阅缝（缺席/抛错 = undefined——快照源漂移期退挂载期单次解析） */
function subscribeStore(store: unknown, listener: () => void): (() => void) | undefined {
  const subscribe = (store as { subscribe?: unknown } | null)?.subscribe;
  if (typeof subscribe !== "function") return undefined;
  try {
    return (subscribe as (l: () => void) => () => void).call(store, listener) as (() => void) | undefined;
  } catch {
    return undefined;
  }
}

/**
 * 概览锚自解析 hook（桥锚 null 补位消费面）：sessions/workspaces 快照源订阅驱动重解析
 * （订阅缺席 = 挂载期单次解析——效应断言归 e2e，仓规 anchored-projects 同注）。解析失败
 * 维持 null，不覆盖桥锚（桥锚优先语义归消费方）。
 */
export function useSelfAnchor(
  services: SelfAnchorServices | undefined,
  makeClient: WorktreeResolveClientFactory,
): SelfAnchorContext | null {
  const [anchor, setAnchor] = useState<SelfAnchorContext | null>(null);
  useEffect(() => {
    if (services === undefined) return;
    let alive = true;
    const compute = (): void => {
      void resolveSelfAnchor(services, makeClient)
        .then((next) => {
          if (alive) setAnchor(next);
        })
        .catch(() => {
          if (alive) setAnchor(null);
        });
    };
    compute();
    const unsubscribes = [
      subscribeStore(services.sessions.list, compute),
      subscribeStore(services.workspaces.list, compute),
    ];
    return () => {
      alive = false;
      for (const unsubscribe of unsubscribes) unsubscribe?.();
    };
  }, [services, makeClient]);
  return anchor;
}
