// 概览锚定链插件自解析缝（fix-11 缺陷 A 建立；bug 41a19182 斩传输收口——同族三犯断根）：
// 官方 workspace 上下文（sessions 主视图会话 retainedBy.mainView → workspaces 归属快照
// 行 path）→ 注入式归属解析缝 resolveProjectId（宿主半 project.db 归属行 +
// workspaceRegistry 进程内直查——fix-11 已建路径，缺省绑定归 anchor-resolver.ts 装配缝）
// → 项目锚定。解析链本体零传输引用、零项目列表 face 消费——解析编排是纯异步函数，唯一
// 数据源 = 注入缝（无传输环境解析成立由单测钉死：门①结构机检 + 门②解耦证明）。
// 集成态壳侧 knowledge-anchor 裁决仍为正门，本缝仅在桥锚缺席时补位（回归零变化）。
// 形状漂移/解析缝故障 = null fail-soft 不炸壳（AGENTS 1.6 现查不缓存）。
import { useEffect, useState } from "react";
import { activeSessionIdOf, type ForgeSessionsService, type ForgeWorkspacesService } from "../session-actions.js";
import { isWorkspacesSnapshot } from "../anchored-projects.js";
import type { LedgerWorkspacesSnapshot } from "../sidebar/sidebar-model.js";

/**
 * 归属解析缝（纯本地单路径裁决——宿主半 project.db 归属行 + workspaceRegistry 进程内
 * 直查的客户端投影）：工作区原路径（归一前直送，归一键归宿主半）→ 归属项目 id；
 * 未注册/未解析 = undefined。
 */
export type AnchorProjectResolver = (path: string) => Promise<string | undefined>;

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
 * 解析缝归属裁决 → 项目锚定。任一环缺席/漂移/抛错 = null（消费方维持桥锚现状语义）。
 * 诊断留痕（AGENTS §7 失败路径不静默——bug 84acf85c 真机取证面）：null 终态逐环 log
 * 原因（info 级——fail-soft 设计内形态，非错误）。
 */
export async function resolveSelfAnchor(
  services: SelfAnchorServices | undefined,
  resolveProjectId: AnchorProjectResolver,
): Promise<SelfAnchorContext | null> {
  const fail = (reason: string): null => {
    console.info(`[dsh-forge/project] overview self-anchor 未解析：${reason}`);
    return null;
  };
  if (services === undefined) return fail("services 缺席");
  const sessionId = activeSessionIdOf(services.sessions.list);
  if (sessionId === undefined) return fail("活跃会话缺席（retainedBy.mainView 零在留行）");
  const snapshot = workspacesSnapshotOf(services.workspaces.list);
  if (snapshot === null) return fail("workspaces 快照形状漂移");
  const home = snapshot.items.find((row) => Array.isArray(row.sessionIds) && row.sessionIds.includes(sessionId));
  const path = home?.path;
  if (typeof path !== "string" || path === "") return fail(`会话 ${sessionId} 不在归属行任一 sessionIds（零绑定）`);
  let projectId: string | undefined;
  try {
    projectId = await resolveProjectId(path);
  } catch (cause) {
    return fail(`归属裁决抛错：${path}：${String(cause)}`);
  }
  if (projectId === undefined) return fail(`归属裁决未命中：${path}（未注册/未解析）`);
  console.info(`[dsh-forge/project] overview self-anchor 解析落座：${sessionId} → ${path} → ${projectId}`);
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
  resolveProjectId: AnchorProjectResolver,
): SelfAnchorContext | null {
  const [anchor, setAnchor] = useState<SelfAnchorContext | null>(null);
  useEffect(() => {
    if (services === undefined) return;
    let alive = true;
    const compute = (): void => {
      void resolveSelfAnchor(services, resolveProjectId)
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
  }, [services, resolveProjectId]);
  return anchor;
}
