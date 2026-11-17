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
import { createWorktreeIdentity, type ForgeProjectsIdentityFace } from "./assembly/worktree-identity.js";
import { createBugsService } from "./bugs/service.js";
import { createProjectKeyResolver } from "./assembly/project-key.js";
import { minimalDirFactsPort } from "./dirs/dir-facts.js";
import { createSelfAnchorsOf } from "./dirs/self-anchors.js";
import { createSelfDeriveOf } from "./dirs/self-derive.js";
// 单行装载 = 五缝注册 + worktree 域插件（gitWorktree 能力服务 provide）——能力面在此
// 组合保持外部行为不变（git 缺席 fail-soft 不生效语义归插件启动检测）。
import worktreePlugin, {
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
// forge:* 六族收编 Typert namespace（官方 UI 数据第一等通道——控制器注册进根 ctx，
// gateway SRC 发现面 = 根 ctx reflect.props）；forge:settings 族归 configForms 自有 namespace。
import {
  registerForgeTypertRemotes,
  selfProbeOf,
  type ForgeTypertDeps,
  type TypertAssemblyCtxFace,
} from "./assembly/typert-remotes.js";
import { isGitWorktreeServiceFace, createWorktreesResident, type WorktreesRegistryFace } from "./assembly/worktrees-port.js";
import { consoleDiagFallback, DIAG_EVENT, emitDiagOrFallback, type DiagEventPayload } from "@dsh-forge/lib-diag";

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
  /** b5707fe4：支持异步派生——core 代 projectId 经 registry 官方锚兜底链（project-key.ts） */
  readonly resolveProjectKey: (projectId: string) => Promise<string | null> | string | null;
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
  // 诊断兜底按级分流（clean-code-review P1-5——对齐 worktrees/index.ts consoleDiagFallback 正典，
  // bug 7ba48c55 判例：error → console.error、其余 → console.warn；禁直落 console 单行兜底）
  const diag: SeamDiag = config.diag ?? consoleDiagFallback;

  // project.db 打开（装配期一次；I4 拒开/文件异常 = fail-soft 退兜底——设计 §6 劣形②同径）。
  // 显式 config > 缺省值两级解析——home 缺省 = env DSH_HOME（官方宿主注行无 config 时
  // 插件自装配，不再恒退 ErrUnavailable 兜底）。
  const home = config.home ?? process.env.DSH_HOME;
  let domainDb: ReturnType<typeof openProjectsDomainDb> | undefined;
  if (home !== undefined) {
    try {
      domainDb = openProjectsDomainDb(home);
      diag(
        `[project-seams] project.db 已打开：${home === config.home ? "config.home" : "缺省 DSH_HOME"} → ${home}`,
      );
    } catch (cause) {
      diag(`[project-seams] project.db 打开失败——projects/bugs 退兜底：${String(cause)}`, "error");
    }
  }

  // registry 缺省 = ctx.workspaceRegistry 具名服务取法——具名服务消费以 inject 声明承担
  // （inject=[] 会被 cordis inject 门守卫拒恒 undefined）；声明后门内可达，运行期存在性
  // 检查仍承担 fail-soft（服务缺席 = undefined → projects 退兜底拒）。
  const defaultRegistry = (): RegistryFace | undefined => {
    try {
      return face.workspaceRegistry ?? undefined;
    } catch {
      return undefined;
    }
  };

  // gitWorktree 能力服务惰性取法（git 在场性异步探测后由 worktreePlugin provide——
  // 注入缝 reflect 防御读取，worktrees/index.ts 同配方）。
  const readGitWorktreeCapability = (): GitWorktreeServiceFace | undefined => {
    try {
      const raw: unknown = face.reflect?.get?.(GIT_WORKTREE_SERVICE);
      return isGitWorktreeServiceFace(raw) ? raw : undefined;
    } catch {
      return undefined;
    }
  };

  // 宿主集成态 core forgeProjects 服务惰性取法（bug 33aec906——host 半常驻 provider 的
  // 运营真源单源化）：core 行（dsh-forge-core 单 SQLite 句柄）provide ctx.forgeProjects，
  // 项目注册通道（forge:projects/register）落 core 库——host 半自建 {DSH_HOME} project.db
  // 与之分裂时 identity/清单读空库恒兜底签名。形状校验防御读取（AGENTS 1.6 检测永不
  // 缓存：逐调用现查；缺席/劣形 = undefined → 自建库投影退路）。
  const coreProjectsOf = (): ProjectsServicePort | undefined => {
    try {
      const raw: unknown = face.reflect?.get?.("forgeProjects");
      if (raw === null || typeof raw !== "object") return undefined;
      const candidate = raw as ProjectsServicePort;
      return typeof candidate.listProjects === "function" && typeof candidate.registerProject === "function"
        ? candidate
        : undefined;
    } catch {
      return undefined;
    }
  };

  // identity 扩展点自注入（单装形态——「宿主注入 provider」的注入者即包自身装配，读
  // 自身 project.db 关系表）。worktrees 域扩展点解析链（resolveExtensionPoints）消费
  // forgeWorktreeIdentity 服务缝——单装无 boot/child.ts 注入装配时恒退默认 provider
  // （resolveProject 恒 null → list isGit:false）。forge 宿主侧（assembly/host-side.ts
  // runProfile 后 provide 同键）后注入即覆写——两侧同源 project.db 行集语义等价。
  // db 缺席 = 零 provide（worktrees 退独立模式默认扩展点）。
  provideWorktreeIdentity(face, domainDb, config, defaultRegistry(), diag, coreProjectsOf);

  // worktrees 常驻工厂（组装面 = assembly/worktrees-port.ts——惰性单例与 Port 投影归位）
  const worktreesResident = createWorktreesResident({
    gitWorktree: readGitWorktreeCapability,
    workspaceRegistry: (config.registry as WorktreesRegistryFace | undefined) ?? defaultRegistry(),
    rootService: rootServiceOf(face),
    onDiag: diag,
  });

  // 锚解析自装配（fix-1 用户裁定 2026-11-13①②③——概览基本信息数据面零 core 消费）：
  // workspaceRoot 经官方宿主工作区面（插件 project.db main 行 + workspaceRegistry 直探），
  // forgeDir/docsRoot/taskHome 插件内派生（self-anchors 单源，镜像 core 同链语义）。
  const wsPathOf = async (projectId: string): Promise<string | null> => {
    const main = domainDb?.repos.workspaces.getMain(projectId)?.wsPath;
    if (typeof main === "string" && main !== "") return main;
    try {
      const entry = await (config.registry ?? defaultRegistry())?.get(projectId);
      return typeof entry?.path === "string" && entry.path !== "" ? entry.path : null;
    } catch {
      return null;
    }
  };
  const anchorsOf = createSelfAnchorsOf({ wsPathOf, home, env: process.env });

  // 五缝注册（常驻 + 兜底 + 覆写位择优——零域逻辑，全部委托域本体/组装面）
  const deps: ProjectSeamDeps = (() => {
    const db = domainDb;
    const base = {
      ...(config.dirFacts !== undefined
        ? { dirFacts: config.dirFacts }
        : { dirFacts: () => minimalDirFactsPort({ anchorsOf }) }),
      worktrees: worktreesResident,
      // projects 常驻真源现查（bug 33aec906）：core 服务在场（宿主集成态）即委托——
      // registration 运营真源单源；自建库投影退路（单装态 db 在场）；双缺 = undefined
      // （resolveProvider 劣形②退兜底 stub——独立模式语义不变）。
      projects: (): ProjectsServicePort | undefined => {
        const core = coreProjectsOf();
        if (core !== undefined) return core;
        if (db === undefined) return undefined;
        return createProjectsServicePort({
          domainDb: db,
          registry: config.registry ?? defaultRegistry(),
          tasksHome: config.tasksHome,
          onDiag: undefined,
        });
      },
      ...(config.overrides !== undefined ? { overrides: config.overrides } : {}),
      onDiag: diag,
    };
    if (db === undefined) return base;
    // bugs 依赖兜底接真实现——config.bugsDeps 缺席时自 project.db 派生（归属键 = projects
    // 行 project_key；主路径 = workspaces main 行 ws_path），不退空实现。
    // b5707fe4：归属键真源解析链（bugs/project-key.ts）——本库行缺席（register 委托缝落
    // core 库）时经 registry 官方锚 get(projectId).path 派生 project_key 并惰性回写归属行；
    // registry try/catch fail-soft，派生失败 null（I5 拒写语义不变）。
    const bugsDeps = config.bugsDeps ?? {
      resolveProjectKey: createProjectKeyResolver({
        domainDb: db,
        coreProjects: coreProjectsOf,
        registry: (config.registry ?? defaultRegistry()) as OfficialRegistryFace | undefined,
        onDiag: (payload) => diag(`[project-bugs] ${payload.level}: ${payload.message}`),
      }),
      resolveMainPath: (projectId: string): string =>
        db.repos.workspaces.getMain(projectId)?.wsPath ?? "",
    };
    return {
      ...base,
      bugs: (() => {
        const deps = bugsDeps;
        return () =>
          createBugsService({
            bugs: db.repos.bugs,
            resolveProjectKey: deps.resolveProjectKey,
            resolveMainPath: deps.resolveMainPath,
            // P1-3：bugs 域失败路径诊断——diag 单源透传（level 随载荷分流）
            onDiag: (payload) => diag(`[project-bugs] ${payload.message}`, payload.level),
          }) as BugsServicePort;
      })(),
    };
  })();
  const registration: ProjectSeamRegistration = registerProjectSeams(face, deps);
  diag(
    `[project-seams] 五缝注册完成：registered=[${registration.registered.join(", ")}] degraded=[${registration.degraded.join(", ")}]`,
  );
  // Typert 遥控器注册（官方 UI 数据第一等通道——控制器注册进根 ctx；诊断 emit 面
  // 装配桥接：ctx.emit 在场即 typed emit，缺席 emitDiagOrFallback console 兜底。插件域
  // 进程位恒 main——errors.ts 既有先例同径）。
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
      worktrees: worktreesSvcOnceOf(worktreesResident),
      features: () => face.reflect?.get?.("forgeFeatures"),
      // bug 8de6b903：派生行第六法真实现委托缝——core forgeProjects 现查（缺席 = 单装态
      // selfDerive 兜底；检测永不缓存，调用期求值——AGENTS §1.6 同先例形制）
      deriveTaskStoreDir: () => face.reflect?.get?.("forgeProjects"),
      // 1.32②：单装态派生行兜底（dsh desktop 添加项目向导不再恒 unavailable）——
      // self-derive 缝：config.tasksHome > env > home 三级根 + lib-path 单源算法 + 碰撞
      // 三态同收口（行源 = 插件 project.db 在册 ws_path——core registeredStoreDirs 同语义）。
      selfDerive: () =>
        createSelfDeriveOf({
          tasksHome: config.tasksHome,
          home,
          env: process.env,
          registeredWsPaths: () => {
            const db = domainDb;
            if (db === undefined) return [];
            return db.repos.projects
              .list()
              .map((p) => db.repos.workspaces.getMain(p.id)?.wsPath)
              .filter((ws): ws is string => typeof ws === "string" && ws !== "");
          },
        }),
      // 基本信息区数据源（fix-1 插件自装配）：workspaceRoot 官方工作区面 + dirFacts 缝
      //（注册表三键解析——overrides.dirFacts 在场即覆写，与 forge.dirFacts 缝同源）。
      // 概览基本信息数据面零 core 服务消费（用户裁定 2026-11-13⑤）。
      dirsWorkspaceRoot: () => wsPathOf,
      dirFacts: () => config.overrides?.dirFacts ?? deps.dirFacts?.(),
      diag: (line) => {
        diag(line);
        diagEmit?.({ event: "typert-remote-register", level: "warn", message: line });
      },
      // 派生失败 typed 诊断发射面（AGENTS §7——event 前缀 project-derive-store-dir；
      // 与注册诊断同一 emitDiagOrFallback 桥接，缺席宿主零发射）
      diagEmit,
      // 注册后自探针缝（boot 竞速根治——1.2 复核欠账 R2-竞速支 host 半）：typertGateway
      // invoke 直探 = serve 层认领自证（注册完成行后时点即装配序判据——先于 client mount
      // 首探；gateway 缺席/调用失败 = 自探针失败诊断行，fail-soft 不阻载）。
      // bug a99a7293：官方 gateway 2.x invoke 必携 owner Peer（assertPeerLive 读 peer.signal
      // ——缺 peer 即 undefined 'signal' boot 期失败），实现归 selfProbeOf 单源。
      selfProbe: selfProbeOf(face),
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

// ── 装配段 helper（模块级纯函数——插件工厂内零内联） ──

/** sessionPersistence root 锚定取法（root ?? face 双探针；缺席/异常 = undefined fail-soft） */
function rootServiceOf(face: ProjectPluginCtx): (name: string) => unknown {
  const typertRootFace = ((face as { root?: unknown }).root ?? face) as { get?: (name: string) => unknown };
  return (name: string): unknown => {
    try {
      const value = typertRootFace.get?.(name);
      return value === undefined || value === null ? undefined : value;
    } catch {
      return undefined;
    }
  };
}

/** identity 扩展点自注入（bug 33aec906 双源现查：core 服务优先——宿主集成态真源；
 *  自建库投影退路（单装态）；双缺 = 零 provide——fail-soft 退独立模式，不炸装配） */
function provideWorktreeIdentity(
  face: ProjectPluginCtx,
  domainDb: ReturnType<typeof openProjectsDomainDb> | undefined,
  config: ProjectHostConfig,
  registry: RegistryFace | undefined,
  diag: SeamDiag,
  coreProjectsOf: () => ProjectsServicePort | undefined,
): void {
  const ownPort =
    domainDb === undefined
      ? undefined
      : createProjectsServicePort({
          domainDb,
          registry: config.registry ?? registry,
          tasksHome: config.tasksHome,
          onDiag: undefined,
        });
  if (ownPort === undefined && coreProjectsOf() === undefined) return;
  // 惰性双源 face（逐调用现查——core 服务装载晚于本装配段亦可达）：core 服务优先，
  // 自建库投影退路；双缺 = 空读 face（fail-soft——identity 归并恒 null 同独立模式）。
  const identityFace: ForgeProjectsIdentityFace = {
    listProjects: async () => (coreProjectsOf() ?? ownPort ?? emptyProjectsFace()).listProjects(),
    getProject: async (id: string) => (coreProjectsOf() ?? ownPort ?? emptyProjectsFace()).getProject(id),
  };
  const provide = (face as { provide?: (name: string, value?: unknown) => unknown }).provide;
  if (typeof provide !== "function") return;
  try {
    provide.call(face, GIT_WORKTREE_IDENTITY_SERVICE, createWorktreeIdentity(identityFace, undefined, diag));
  } catch (cause) {
    diag(`[project-seams] forgeWorktreeIdentity 自注入失败（fail-soft 退独立模式）：${String(cause)}`);
  }
}

/** 空读 projects face（双源全缺的 fail-soft 形态——identity 归并恒 null 同独立模式语义） */
function emptyProjectsFace(): ForgeProjectsIdentityFace {
  return {
    listProjects: async () => [],
    getProject: async () => null,
  };
}

/** Typert worktrees 遥控器数据源 = 常驻 Port 投影（与 forge.worktrees 缝同实例同语义） */
function worktreesSvcOnceOf(resident: () => WorktreeServicePort): () => WorktreeRpcService {
  let cached: WorktreeRpcService | undefined;
  return () => {
    if (cached !== undefined) return cached;
    const port = resident() as WorktreeRpcService & WorktreeServicePort;
    cached = port;
    return port;
  };
}

// fix-8：workspaceRegistry 具名服务 inject 声明（cordis 门内取法前置——AGENTS 1.6
// 具名服务裁决）；五缝仍经 reflect 缝注册，gitWorktree 能力缝走防御读取（异步 provide 面）。
projectPlugin.inject = ["workspaceRegistry"] as const;

/**
 * 装配失败诊断投影（bundle 管线验证锚——lib-util errMessage 消费点）。
 */
export function describeSetupFailure(error: unknown): string {
  return errMessage(error);
}

// ── host 侧装配面出口（apps/host 只留注册行，域装配符号自本包导入）──
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
