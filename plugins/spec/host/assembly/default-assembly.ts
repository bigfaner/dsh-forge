// host/assembly · default-assembly.ts —— spec 单装缺省装配（plugin-spec 1.4）：
//   ① db 缺省路径：{home}/forge/db/spec/spec.db（openSpecDb/specDbFileName 单源——1.3）；
//   ② forgeSpecs 域服务常驻构建：writeSpecDoc 文件写缝注真实现（tmp+rename 原子写，
//      落 resolveWsPath(projectKey) 检出根——失败上抛 → 服务层事务回滚零半态）；
//   ③ home 缺省约定：env DSH_HOME（project/task-loop 实况同径；显式 config.home 覆写）。
// home 缺席 / db 打开失败 = 整体降级缺席（返回 undefined——零 provide，诊断留痕不阻载）。
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { openSpecDb, specDbFileName, type SpecDomainDb } from "../db/connection.js";
import { SpecError } from "../domain/specs/errors.js";
import { createForgeSpecsService, type ForgeSpecsService } from "../domain/specs/service.js";

export { specDbFileName };

/** 单装装配 config（全可选——缺省面 = DSH_HOME + 缺省 db 落点）。 */
export interface SpecAssemblyConfig {
  /** DSH home（db 缺省落点根；缺席 = env DSH_HOME，双缺 = 降级缺席） */
  readonly home?: string;
  /** 库文件覆盖（':memory:' 供测试；缺省 = {home}/forge/db/spec/spec.db） */
  readonly dbFile?: string;
  /** projectKey → 项目检出根（Spec 文档落盘根锚；缺席 = 诊断留痕 + 写缝拒绝不落半态） */
  readonly resolveWsPath?: (projectKey: string) => string;
}

type AssemblyDiag = (line: string, level?: "info" | "warn" | "error") => void;

/** 单装装配产物（服务常驻 + 库句柄生命周期）。 */
export interface SpecAssembly {
  readonly db: SpecDomainDb;
  readonly specs: ForgeSpecsService;
  /** 库句柄关闭（插件 disposer 透传）。 */
  readonly dispose: () => void;
}

/**
 * Spec 文档文件写缝真实现（tmp+rename 原子写，同步形态——服务层同事务内调用，
 * 写失败同步上抛 → 事务回滚零半态）：relPath 相对项目检出根解析
 *（resolveWsPath(projectKey)），目录逐级创建；任一步失败上抛 → 服务层事务回滚零半态。
 * 检出根解析缺席 = 抛错拒绝（fail-loud——不静默吞写）。
 */
export function createSpecDocWriter(resolveWsPath: ((projectKey: string) => string) | undefined): (
  relPath: string,
  content: string,
  projectKey: string,
) => void {
  return (relPath, content, projectKey) => {
    try {
      const root = resolveWsPath?.(projectKey);
      if (root === undefined || root === "") {
        throw new Error(`[spec] Spec 文档写缝缺席检出根解析（resolveWsPath）——拒绝落盘：${relPath}`);
      }
      const absPath = join(root, relPath);
      mkdirSync(dirname(absPath), { recursive: true });
      const tmpPath = `${absPath}.tmp`;
      writeFileSync(tmpPath, content, "utf8");
      renameSync(tmpPath, absPath);
    } catch (cause) {
      // 文件写失败 → typed 上抛（服务层同事务回滚零半态；tool 面 → 失败 DTO 双友好回面）
      const message = cause instanceof Error ? cause.message : String(cause);
      throw new SpecError("ERR_SPEC_DOC_WRITE", `Spec 文档写盘失败：${message}`, { relPath, projectKey });
    }
  };
}

/**
 * 单装缺省装配（index.ts 装配本体单点）：db 打开 + forgeSpecs 服务常驻构建。
 * home 缺席（DSH_HOME 未设且无 config.home）或 db 打开失败 → undefined（零 provide 降级）。
 */
export function assembleSpecServices(config: SpecAssemblyConfig = {}, diag?: AssemblyDiag): SpecAssembly | undefined {
  const home = config.home ?? process.env.DSH_HOME;
  if (home === undefined) {
    diag?.("[spec] 缺省装配缺席：home 未注入（config.home / env DSH_HOME 双缺）——域服务零 provide（降级不阻载）", "warn");
    return undefined;
  }
  let db: SpecDomainDb;
  try {
    db = openSpecDb(home, config.dbFile !== undefined ? { file: config.dbFile } : {});
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    diag?.(`[spec] spec.db 打开失败——域服务降级缺席（fail-soft 不阻载）：${message}`, "error");
    return undefined;
  }
  const specs = createForgeSpecsService({
    db: db.db,
    repos: db.repos,
    writeSpecDoc: (relPath, content, projectKey) => {
      const write = createSpecDocWriter(config.resolveWsPath);
      return write(relPath, content, projectKey);
    },
  });
  return {
    db,
    specs,
    dispose(): void {
      db.db.close();
    },
  };
}

/** home 目录缺省约定单源：显式 config.home > env DSH_HOME（双缺 = undefined）。 */
export function resolveSpecHome(config: Pick<SpecAssemblyConfig, "home">): string | undefined {
  return config.home ?? process.env.DSH_HOME;
}
