// 概览锚自解析缝（fix-10 bug 400b3952 第二层——宿主差异水化门）：workbench 桥缝
// （__DSH_FORGE_WORKBENCH__）是 dsh-forge 壳专属面，官方 web/desktop 宿主缺席 →
// OverviewSeat projectId 恒 undefined → AC 核销计数不水化。补位配方 = project 包
// self-anchor 正典同型镜像（bundle 自含零上游 import）：官方 sessions 账本快照
// （retainedBy.mainView 活跃判读）→ workspaces 归属快照行 path → forgeWorktree.resolve
// 归属裁决 → 项目 uuid 直投 forgeTasks（host 半解析归属键——9407ff29 修型契约）。
// 解析链纯异步函数，唯一数据源 = 注入缝；任一环缺席/漂移/抛错 = undefined
// （消费方维持「无任务数据」降级呈现不报错）；服务逐调用现查不缓存（AGENTS 1.6）。
import { useEffect, useState } from "react";
import { createForgeRpcClient } from "./rpc.js";

/** 缺省归属解析缝（project anchor-resolver 正典同型）：工作区原路径 → forgeWorktree.resolve
 *  批量通路（单路径调用，宿主半归一裁决）→ 归属项目 uuid；未注册 = undefined。 */
export function defaultSelfAnchorResolver(): SelfAnchorServices["resolveProjectId"] {
  return async (path) => {
    const result = await createForgeRpcClient().worktree.resolve({ paths: [path] });
    return result.resolved[0]?.projectId;
  };
}

/** 自解析服务缝（dock-tabs-face inject 递达——惰性现查闭包，apply 点不缓存实例） */
export interface SelfAnchorServices {
  /** 官方 sessions 账本快照源（store 本体：getSnapshot + 可选 subscribe） */
  readonly sessionsList: () => unknown;
  /** 官方 workspaces 归属快照源（store 本体——同上） */
  readonly workspacesList: () => unknown;
  /** 归属解析缝：工作区原路径 → 归属项目 id（未注册/未解析 = undefined） */
  readonly resolveProjectId: (path: string) => Promise<string | undefined>;
}

/** 快照源归一（服务面 {list: store} 优先，store 直挂形态回退——project 镜像同口径） */
function sourceOf(service: unknown): unknown {
  const list = (service as { list?: unknown } | null)?.list;
  return list !== undefined && list !== null ? list : service;
}

/** 快照读取（store getSnapshot——缺席/抛错 = undefined fail-soft） */
function snapshotOf(store: unknown): unknown {
  const getSnapshot = (store as { getSnapshot?: unknown } | null)?.getSnapshot;
  if (typeof getSnapshot !== "function") return undefined;
  try {
    return (getSnapshot as () => unknown).call(store);
  } catch {
    return undefined;
  }
}

/** 服务快照读取（归一 + getSnapshot 两段 fail-soft） */
function serviceSnapshotOf(service: unknown): unknown {
  return snapshotOf(sourceOf(service));
}

/** store 订阅缝（缺席/抛错 = undefined——快照源漂移期退挂载期单次解析） */
function subscribeRaw(store: unknown, listener: () => void): (() => void) | undefined {
  const subscribe = (store as { subscribe?: unknown } | null)?.subscribe;
  if (typeof subscribe !== "function") return undefined;
  try {
    return (subscribe as (l: () => void) => () => void).call(store, listener) as (() => void) | undefined;
  } catch {
    return undefined;
  }
}

/** 活跃会话解析（project activeSessionIdOf 同型镜像）：byId 行 retainedBy.mainView > 0 */
export function activeSessionIdOf(list: unknown): string | undefined {
  if (typeof list !== "object" || list === null) return undefined;
  const byId = (list as { byId?: unknown } | null)?.byId;
  if (typeof byId !== "object" || byId === null) return undefined;
  for (const row of Object.values(byId as Record<string, unknown>)) {
    const id = (row as { id?: unknown } | null)?.id;
    const mainView = (row as { retainedBy?: { mainView?: unknown } } | null)?.retainedBy?.mainView;
    if (typeof id === "string" && id !== "" && typeof mainView === "number" && mainView > 0) return id;
  }
  return undefined;
}

/** 会话归属 workspace 行 path 窄读（items 行 sessionIds 含活跃会话——漂移 = undefined） */
export function anchorWorkspacePathOf(list: unknown, sessionId: string): string | undefined {
  if (typeof list !== "object" || list === null) return undefined;
  const items = (list as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) return undefined;
  for (const row of items) {
    if (typeof row !== "object" || row === null) continue;
    const sessionIds = (row as { sessionIds?: unknown }).sessionIds;
    const path = (row as { path?: unknown }).path;
    if (Array.isArray(sessionIds) && sessionIds.includes(sessionId) && typeof path === "string" && path !== "") {
      return path;
    }
  }
  return undefined;
}

/** 自解析纯函数（hook 径与单测共面）：活跃会话 → workspace path → 归属项目 id */
export async function resolveSelfAnchor(services: SelfAnchorServices): Promise<string | undefined> {
  const sessionId = activeSessionIdOf(serviceSnapshotOf(services.sessionsList()));
  if (sessionId === undefined) return undefined;
  const path = anchorWorkspacePathOf(serviceSnapshotOf(services.workspacesList()), sessionId);
  if (path === undefined) return undefined;
  return (await services.resolveProjectId(path)) ?? undefined;
}

/** 概览锚自解析 hook：快照源订阅驱动重解析；任一环失败维持 undefined（不覆盖桥锚） */
export function useSelfAnchorProjectId(services: SelfAnchorServices | undefined): string | undefined {
  const [projectId, setProjectId] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (services === undefined) return;
    let alive = true;
    const compute = (): void => {
      void resolveSelfAnchor(services)
        .then((next) => {
          if (!alive) return;
          // 诊断留痕（client 束豁免面——AGENTS §7 失败路径可观测）：未解析 = 三环缺席
          // （活跃会话/归属行/归属裁决），不静默；解析成功 = info 里程碑。
          if (next === undefined) console.info("[dsh-forge/task-loop] overview self-anchor 未解析（活跃会话/归属行/归属裁决环缺席）");
          else console.info(`[dsh-forge/task-loop] overview self-anchor 已解析 projectId=${next}`);
          setProjectId(next);
        })
        .catch((cause: unknown) => {
          if (!alive) return;
          console.warn("[dsh-forge/task-loop] overview self-anchor 解析失败——降级无任务数据", cause);
          setProjectId(undefined);
        });
    };
    compute();
    const sessionsSource = sourceOf(services.sessionsList());
    const workspacesSource = sourceOf(services.workspacesList());
    const unsubscribes = [subscribeRaw(sessionsSource, compute), subscribeRaw(workspacesSource, compute)];
    return () => {
      alive = false;
      for (const unsubscribe of unsubscribes) unsubscribe?.();
    };
  }, [services]);
  return projectId;
}
