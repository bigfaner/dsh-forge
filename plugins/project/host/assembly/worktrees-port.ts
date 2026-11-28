// host/assembly · worktrees 缝常驻组装面（与 projects-port.ts 同构——host/index.ts
// 零域装配逻辑，本面持有 worktrees 域 Port 投影与惰性单例）。
import type { WorktreeServicePort } from "@dsh-forge/lib-api/ports";
import type { OfficialRegistryFace } from "../projects/registry-adapter.js";
import {
  createWorktreeRpcService,
  type GitWorktreeServiceFace,
  type WorkspaceRegistryFace,
} from "../worktrees/index.js";
import type { WorktreeRpcService } from "../worktrees/rpc-service.js";
import { WORKTREE_DIR_RELATIVE } from "../worktrees/service.js";
import type { SeamDiag } from "./seams.js";

/** 官方 workspaceRegistry face（projects 域 + worktrees 域双投影交集——同一官方实体） */
export type WorktreesRegistryFace = OfficialRegistryFace & WorkspaceRegistryFace;

/** worktrees 常驻组装依赖（host/index.ts 装配期注入——face 侧取法留插件工厂） */
export interface WorktreesPortDeps {
  /** gitWorktree 能力服务惰性取法（异步 provide 面——reflect 防御读取） */
  readonly gitWorktree: () => GitWorktreeServiceFace | undefined;
  /** 官方 workspaceRegistry face（宿主注入 config.registry 优先，缺省具名服务取法） */
  readonly workspaceRegistry: WorktreesRegistryFace | undefined;
  /** sessionPersistence root 锚定取法（逐调用现查不缓存——AGENTS 1.6；缺席 = undefined） */
  readonly rootService: (name: string) => unknown;
  readonly onDiag: SeamDiag;
}

/**
 * sessionPersistence root 锚定惰性取法（官方 web 宿主形态——seal 判定 header.cwd 读取
 * 依赖官方 persistence；provide 于根 ctx，插件 ctx 属性访问可能拒绝/缺席。逐调用现查
 * Proxy 转发——检测永不缓存；缺席 = open 抛错 → seal fail-soft 退独立模式，不炸判定链）。
 */
function lazySessionPersistenceOf(
  rootService: (name: string) => unknown,
): Parameters<typeof createWorktreeRpcService>[0]["sessionPersistence"] {
  return new Proxy(
    {},
    {
      get: (_target, prop) => {
        const svc = rootService("sessionPersistence") as Record<string | symbol, unknown> | undefined;
        if (svc === undefined) return undefined;
        const value = svc[prop];
        return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(svc) : value;
      },
    },
  ) as Parameters<typeof createWorktreeRpcService>[0]["sessionPersistence"];
}

/**
 * worktrees 常驻工厂（域本体 = createWorktreeRpcService：惰性取 gitWorktree 能力 +
 * registry，RPC 面 remove → 契约 delete 动词投影响合 WorktreeServicePort 全量签名
 * ——getWorktreeDir/resolveProject 快照投影同缝语义）。域本体实例惰性单例（官方缝
 * 注册与 Typert 遥控器共用同实例——resolve 缓存失效单点语义不分裂）。
 */
export function createWorktreesResident(deps: WorktreesPortDeps): () => WorktreeServicePort {
  const sessionPersistence = lazySessionPersistenceOf(deps.rootService);
  let singleton: WorktreeRpcService | undefined;
  const svcOnce = (): WorktreeRpcService =>
    (singleton ??= createWorktreeRpcService({
      gitWorktree: deps.gitWorktree,
      workspaceRegistry: deps.workspaceRegistry,
      sessionPersistence,
      warn: deps.onDiag,
    }));
  return (): WorktreeServicePort => {
    const svc = svcOnce();
    const port: WorktreeServicePort = {
      ...svc,
      delete: (request) => svc.remove(request),
      getWorktreeDir: (projectRoot: string) => `${projectRoot}/${WORKTREE_DIR_RELATIVE}`,
      resolveProject: async (cwd: string) => {
        const { resolved } = await svc.resolve({ paths: [cwd] });
        const entry = resolved[0];
        return entry ? { projectId: entry.projectId, projectRoot: entry.projectRoot, isGit: true } : null;
      },
    };
    return port;
  };
}

/** gitWorktree 能力服务防御读取（注册值形状校验——非函数面 = undefined fail-soft） */
export function isGitWorktreeServiceFace(raw: unknown): raw is GitWorktreeServiceFace {
  return (
    raw !== null &&
    typeof raw === "object" &&
    typeof (raw as GitWorktreeServiceFace).getExtensionPoints === "function"
  );
}
