// @dsh-forge/project —— host 装配入口（plugin-project 1.17 五缝合拢）。
// 定位（AC「host/index.ts 只装配零域逻辑」）：本文件只做五缝 provider 注册
// （forge.projects / forge.worktrees / forge.projectResolution / forge.bugs / forge.dirFacts
// ——常驻 + 兜底 + 覆写位装配期择优，code-design §6）；域逻辑零内联——全部归属
// host/{projects,worktrees,bugs,dirs} 域本体与 assembly/ 组装面。
//   ① loader 装载面：default 导出 Plugin.Function（cordis loader 只认 default 导出函数，
//     组合层 cordis.patch.yml 单行 insert 挂载）；
//   ② bundle 管线验证锚：消费 @dsh-forge/lib-* devDependencies（scripts/bundle-host.mjs
//     构建期内联进 dist——产物自含），self-containment 测试据此外置/内联两侧断言。
import { errMessage } from "@dsh-forge/lib-util";
import type {
  BugsServicePort,
  DirFactsPort,
  ProjectResolutionPort,
  ProjectsServicePort,
  WorktreeServicePort,
} from "@dsh-forge/lib-api";
import type { OfficialRegistryFace } from "./projects/registry-adapter.js";
import {
  registerProjectSeams,
  type ProjectSeamDeps,
  type ProjectSeamRegistration,
  type SeamCtxFace,
  type SeamDiag,
} from "./assembly/seams.js";
import { createProjectsServicePort, openProjectsDomainDb } from "./assembly/projects-port.js";
import { createWorktreeIdentity } from "./assembly/worktree-identity.js";
import { createBugsService } from "./bugs/service.js";
import { minimalDirFactsPort } from "./dirs/dir-facts.js";
// 1.17 批二「卸旧装新」：本包单行装载 = 五缝注册 + worktree 域插件（gitWorktree 能力
// 服务 provide）——旧 @dsh-forge/git-worktree 行退役后，overlay 注行门只挂本包，
// 能力面在此组合保持外部行为不变（git 缺席 fail-soft 不生效语义归插件启动检测）。
import worktreePlugin, {
  createWorktreeRpcService,
  GIT_WORKTREE_IDENTITY_SERVICE,
  GIT_WORKTREE_SERVICE,
  type GitWorktreeServiceFace,
  type WorkspaceRegistryFace,
} from "./worktrees/index.js";
import {
  assembleProjectHostSide,
  type KnowledgeBindingsRefresher,
  type ProjectHostSideAssembly,
  type ProjectHostSideDeps,
} from "./assembly/host-side.js";
import {
  registerWorktreeChannels,
  type WorktreeChannelRegistrar,
  type WorktreeRpcEnvelope,
} from "./assembly/channels.js";
import { WORKTREE_RPC_METHODS, invalidateResolveCaches, type WorktreeRpcService } from "./worktrees/rpc-service.js";
// 1.38 UI 数据通路正典化：八族 forge:* 收编 Typert namespace（官方 UI 数据第一等通道）——
// 控制器注册进根 ctx（gateway SRC 发现面 = 根 ctx reflect.props）；1.33 connection.rpc/
// fetch 过渡缝（official-rpc.ts）随本批退役，forge:settings 族归 configForms 自有 namespace。
import {
  registerForgeTypertRemotes,
  type ForgeTypertDeps,
  type TypertAssemblyCtxFace,
} from "./assembly/typert-remotes.js";
import { DIAG_EVENT, emitDiagOrFallback, type DiagEventPayload } from "@dsh-forge/lib-diag";

/** cordis 插件装载形态（loader 只认 default 导出函数）。 */
interface ProjectPlugin {
  (ctx: unknown, config?: ProjectHostConfig): () => void;
  inject: readonly string[];
}

/** 插件 ctx 窄面：workspaceRegistry 具名服务（inject 声明后 cordis 门内可达——type-safe）。
 * face = 官方 workspaceRegistry 的双投影交集（projects 域 OfficialRegistryFace +
 * worktrees 域 WorkspaceRegistryFace——同一官方实体，结构化窄面各自成立）。 */
type RegistryFace = OfficialRegistryFace & WorkspaceRegistryFace;
type ProjectPluginCtx = SeamCtxFace & TypertAssemblyCtxFace & { readonly workspaceRegistry?: RegistryFace };

declare module "@deepseek-ai/cordis" {
  interface Context {
    /** 官方 workspaceRegistry（dsh-workspace provide——本插件 inject 声明消费） */
    workspaceRegistry: RegistryFace;
  }
}

/** bugs 常驻 provider 依赖缝（归属键派生 + git cwd——装配期由宿主/组合器注入） */
export interface BugsResidentDeps {
  readonly resolveProjectKey: (projectId: string) => string | null;
  readonly resolveMainPath: (projectId: string) => string;
}

/** host 装配 config（全部可选——缺席面 = 对应缝退兜底，fail-soft 不阻载） */
export interface ProjectHostConfig {
  /** DSH home（project.db 落点 = {home}/forge/db/project/project.db；缺席 = projects/bugs 退兜底） */
  readonly home?: string;
  /** tasksHome（注册三态分类器消费目录） */
  readonly tasksHome?: string;
  /** 官方 workspaceRegistry face（registry-adapter 适配缝） */
  readonly registry?: OfficialRegistryFace;
  /** bugs 常驻依赖（缺席 = bugs 退兜底空实现） */
  readonly bugsDeps?: BugsResidentDeps;
  /** dirFacts 常驻工厂（缺省 = host/dirs minimalDirFactsPort 仅内置键集——设计 §6 兜底即常驻缺省） */
  readonly dirFacts?: () => DirFactsPort;
  /** 覆写位（宿主/组合器注入——在场即覆写常驻） */
  readonly overrides?: {
    readonly projects?: ProjectsServicePort;
    readonly worktrees?: WorktreeServicePort;
    readonly projectResolution?: ProjectResolutionPort;
    readonly bugs?: BugsServicePort;
    readonly dirFacts?: DirFactsPort;
  };
  /** 诊断缝（缺省 console 兜底——diag-emit 纪律 console 豁免面同插件先例） */
  readonly diag?: SeamDiag;
}

const projectPlugin: ProjectPlugin = (ctx: unknown, config: ProjectHostConfig = {}): (() => void) => {
  const face = ctx as ProjectPluginCtx;
  const diag: SeamDiag =
    config.diag ??
    ((line: string) => {
      console.warn(line);
    });

  // project.db 打开（装配期一次；I4 拒开/文件异常 = fail-soft 退兜底——设计 §6 劣形②同径）。
  // fix-7 单装缺省装配：显式 config > 缺省值两级解析——home 缺省 = env DSH_HOME
  // （官方宿主注行无 config 时插件自装配，不再恒退 ErrUnavailable 兜底）。
  const home = config.home ?? process.env.DSH_HOME;
  let domainDb: ReturnType<typeof openProjectsDomainDb> | undefined;
  if (home !== undefined) {
    try {
      domainDb = openProjectsDomainDb(home);
      diag(
        `[project-seams] project.db 已打开：${home === config.home ? "config.home" : "缺省 DSH_HOME"} → ${home}`,
      );
    } catch (cause) {
      diag(`[project-seams] project.db 打开失败——projects/bugs 退兜底：${String(cause)}`);
    }
  }

  // fix-8 单装装配补全：registry 缺省 = ctx.workspaceRegistry 具名服务取法——具名服务
  // 消费以 inject 声明承担（fix-7 残余：inject=[] 被 cordis inject 门守卫拒恒 undefined
  // ——009 实证）；声明后门内可达，运行期存在性检查仍承担 fail-soft（服务缺席 = undefined
  // → projects 退兜底拒）。
  const defaultRegistry = (): RegistryFace | undefined => {
    try {
      return face.workspaceRegistry ?? undefined;
    } catch {
      return undefined;
    }
  };

  // fix-8 单装装配补全：gitWorktree 能力服务惰性取法（git 在场性异步探测后由
  // worktreePlugin provide——注入缝 reflect 防御读取，worktrees/index.ts 同配方）。
  const readGitWorktreeCapability = (): GitWorktreeServiceFace | undefined => {
    try {
      const raw: unknown = face.reflect?.get?.(GIT_WORKTREE_SERVICE);
      return raw !== null &&
        typeof raw === "object" &&
        typeof (raw as GitWorktreeServiceFace).getExtensionPoints === "function"
        ? (raw as GitWorktreeServiceFace)
        : undefined;
    } catch {
      return undefined;
    }
  };

  // fix-8 单装装配补全：identity 扩展点自注入（proposal「单装形态」——「宿主注入 provider」
  // 的注入者即包自身装配，读自身 project.db 关系表）。worktrees 域扩展点解析链
  // （resolveExtensionPoints）消费 forgeWorktreeIdentity 服务缝——单装无 boot/child.ts 注入
  // 装配时恒退默认 provider（resolveProject 恒 null → list isGit:false，009 铁证径）。
  // forge 宿主侧（assembly/host-side.ts runProfile 后 provide 同键）后注入即覆写——两侧同源
  // project.db 行集语义等价。db 缺席 = 零 provide（worktrees 退独立模式默认扩展点）。
  if (domainDb !== undefined) {
    try {
      const provide = (face as { provide?: (name: string, value?: unknown) => unknown }).provide;
      if (typeof provide === "function") {
        const identityProjects = createProjectsServicePort({
          domainDb: domainDb,
          registry: config.registry ?? defaultRegistry(),
          tasksHome: config.tasksHome,
          onDiag: undefined,
        });
        provide.call(
          face,
          GIT_WORKTREE_IDENTITY_SERVICE,
          createWorktreeIdentity(identityProjects, undefined, diag),
        );
      }
    } catch (cause) {
      diag(`[project-seams] forgeWorktreeIdentity 自注入失败（fail-soft 退独立模式）：${String(cause)}`);
    }
  }

  // fix-8 单装装配补全：worktrees 常驻工厂（fix-7 残余——deps 无 worktrees 常驻工厂恒
  // 独立兜底，真 git 仓 isGit:false 即铁证）。域本体 = createWorktreeRpcService（惰性取
  // gitWorktree 能力 + registry），RPC 面 remove → 契约 delete 动词投影响合
  // WorktreeServicePort 全量签名（getWorktreeDir/resolveProject 快照投影同缝语义）。
  // 1.33：域本体实例惰性单例（官方缝注册与 channels face 缝共用同实例——resolve 缓存
  // 失效单点语义不分裂）， narrowed port 仍按 WorktreeServicePort 投影。
  let worktreeSvcSingleton: WorktreeRpcService | undefined;
  const worktreeSvcOnce = (): WorktreeRpcService =>
    (worktreeSvcSingleton ??= createWorktreeRpcService({
      gitWorktree: readGitWorktreeCapability,
      // config.registry = 宿主注入的官方 workspaceRegistry face（官方实体同满足 worktrees 域
      // WorkspaceRegistryFace 投影——单点显式收窄，非盲转）。
      workspaceRegistry: (config.registry as RegistryFace | undefined) ?? defaultRegistry(),
      warn: diag,
    }));
  const worktreesResident = (): WorktreeServicePort => {
    const svc = worktreeSvcOnce();
    const port: WorktreeServicePort = {
      ...svc,
      delete: (request) => svc.remove(request),
      getWorktreeDir: (projectRoot: string) => `${projectRoot}/.forge/worktrees`,
      resolveProject: async (cwd: string) => {
        const { resolved } = await svc.resolve({ paths: [cwd] });
        const entry = resolved[0];
        return entry
          ? { projectId: entry.projectId, projectRoot: entry.projectRoot, isGit: true }
          : null;
      },
    };
    return port;
  };

  // 五缝注册（常驻 + 兜底 + 覆写位择优——零域逻辑，全部委托域本体/组装面）
  const deps: ProjectSeamDeps = (() => {
    const db = domainDb;
    type DirFactsDeps = Parameters<typeof minimalDirFactsPort>[0];
    const absentAnchorsOf: DirFactsDeps["anchorsOf"] = async () =>
      ({ projectHome: "", taskHome: undefined, forgeDir: undefined, docsRoot: undefined }) as Awaited<
        ReturnType<DirFactsDeps["anchorsOf"]>
      >;
    const base = {
      ...(config.dirFacts !== undefined
        ? { dirFacts: config.dirFacts }
        : { dirFacts: () => minimalDirFactsPort({ anchorsOf: absentAnchorsOf }) }),
      worktrees: worktreesResident,
      ...(config.overrides !== undefined ? { overrides: config.overrides } : {}),
      onDiag: diag,
    };
    if (db === undefined) return base;
    // fix-7 单装缺省装配：bugs 依赖兜底接真实现——config.bugsDeps 缺席时自 project.db 派生
    //（归属键 = projects 行 project_key；主路径 = workspaces main 行 ws_path），不再退空实现。
    const bugsDeps = config.bugsDeps ?? {
      resolveProjectKey: (projectId: string): string | null =>
        db.repos.projects.get(projectId)?.projectKey ?? null,
      resolveMainPath: (projectId: string): string =>
        db.repos.workspaces.getMain(projectId)?.wsPath ?? "",
    };
    return {
      ...base,
      projects: () =>
        createProjectsServicePort({
          domainDb: db,
          registry: config.registry ?? defaultRegistry(),
          tasksHome: config.tasksHome,
          onDiag: undefined,
        }),
      bugs: (() => {
        const deps = bugsDeps;
        return () =>
          createBugsService({
            bugs: db.repos.bugs,
            resolveProjectKey: deps.resolveProjectKey,
            resolveMainPath: deps.resolveMainPath,
          }) as BugsServicePort;
      })(),
    };
  })();
  const registration: ProjectSeamRegistration = registerProjectSeams(face, deps);
  diag(
    `[project-seams] 五缝注册完成：registered=[${registration.registered.join(", ")}] degraded=[${registration.degraded.join(", ")}]`,
  );
  // 1.38 Typert 遥控器注册（官方 UI 数据第一等通道——控制器注册进根 ctx；诊断 emit 面
  // 装配桥接：ctx.emit 在场即 typed emit，缺席 emitDiagOrFallback console 兜底。插件域
  // 进程位恒 main——errors.ts 既有先例同径）。forge:settings 族退役归 configForms（AC③）。
  try {
    const faceEmit = (face as { emit?: unknown }).emit;
    const diagEmit =
      typeof faceEmit === "function"
        ? (payload: Omit<DiagEventPayload, "process">): void =>
            emitDiagOrFallback((p) => (faceEmit as (e: string, p: unknown) => unknown).call(face, DIAG_EVENT, { ...p, process: "main" }), payload)
        : undefined;
    const typertDeps: ForgeTypertDeps = {
      projects: deps.projects,
      bugs: deps.bugs,
      worktrees: worktreeSvcOnce,
      proposals: () => face.reflect?.get?.("forgeProposals"),
      features: () => face.reflect?.get?.("forgeFeatures"),
      diag: (line) => {
        diag(line);
        diagEmit?.({ event: "typert-remote-register", level: "warn", message: line });
      },
    };
    registerForgeTypertRemotes(face, typertDeps);
  } catch (cause) {
    diag(`[project-typert] Typert 遥控器装配异常（fail-soft 不阻载）：${String(cause)}`);
  }
  // worktree 域插件组合装载（诊断缝透传——装配失败/能力缺席语义归插件自身 fail-soft 面）
  const disposeWorktrees = worktreePlugin(ctx, { diag: (line) => diag(line) });
  return () => {
    disposeWorktrees();
    // provider 生命周期归 scope（cordis provide 注销面由宿主管辖——本插件零自持资源）
  };
};

// fix-8：workspaceRegistry 具名服务 inject 声明（cordis 门内取法前置——AGENTS 1.6
// 具名服务裁决）；五缝仍经 reflect 缝注册，gitWorktree 能力缝走防御读取（异步 provide 面）。
projectPlugin.inject = ["workspaceRegistry"] as const;

/**
 * 装配失败诊断投影（bundle 管线验证锚——lib-util errMessage 消费点）。
 */
export function describeSetupFailure(error: unknown): string {
  return errMessage(error);
}

// ── host 侧装配面出口（1.17 批二卸旧装新：apps/host 只留注册行，域装配符号自本包导入）──
export {
  assembleProjectHostSide,
  type KnowledgeBindingsRefresher,
  type ProjectHostSideAssembly,
  type ProjectHostSideDeps,
};
export {
  createWorktreeIdentity,
  type ForgeProjectsIdentityFace,
  type WorktreeIdentityAssembly,
  type WorktreeIdentityOverrides,
  type WorktreeProjectResolution,
} from "./assembly/worktree-identity.js";
export { registerWorktreeChannels, type WorktreeChannelRegistrar, type WorktreeRpcEnvelope };
export { WORKTREE_RPC_METHODS, invalidateResolveCaches, type WorktreeRpcService };

export default projectPlugin;
