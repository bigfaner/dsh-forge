// store/scan —— 三层 root 扫描与同名遮蔽索引（tech-design §5 / AD3 / D3 已核销）。
// 三层 root（同构 skill-filesystem）：project = <projectRoot>/.dsh/experts/（cwd 向上
// 解析至 git 根）；user = $DSH_HOME/experts/（缺省 ~/.dsh/experts/）；plugin 内置 =
// 随包 experts/。遮蔽定序 project > user > plugin（同键低层不可见，非合并），origin
// 标记在取用结果上。快照语义：单次同步扫描产出完整一代冻结索引——热刷新中（watch
// 层换代进行时）取用方持有的仍是上代完整快照，无半代索引（§9 FMEA）。
// 降级：root 不可读（存在但读失败）→ warn + 跳过该 root；坏档案 → 单文件跳过，
// 其余不受影响；root 不存在属正常形态 → 静默视为空。

import { statSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseExpertFile, type ExpertRecord } from "./frontmatter.js";

/** 三层来源（优先级 project > user > plugin，AD3）。 */
export type ExpertOrigin = "project" | "user" | "plugin";

/** 取用结果：档案半 + 扫描层附加的 origin、来源文件路径与更新时间。 */
export type ScannedExpert = ExpertRecord & {
  origin: ExpertOrigin;
  filePath: string;
  /** 来源文件 mtime（ISO-8601；面板卡片更新时间页脚数据源）。 */
  updatedAt: string;
};

/** 一代完整索引快照：冻结对象，整体换代，无半代形态。 */
export interface ExpertSnapshot {
  experts: ReadonlyMap<string, ScannedExpert>;
  /** root 级/文件级降级 warning（含路径与原因），供面板 ErrorBar。 */
  warnings: readonly string[];
}

/** 一个待扫描 root：来源层 + 目录。 */
export interface ExpertRoot {
  origin: ExpertOrigin;
  dir: string;
}

const EXPERTS_DIR = join(".dsh", "experts");

/**
 * project root 解析（D3）：从 cwd 逐级向上找含 `.git`（目录或 worktree 文件）的
 * 祖先目录；到达文件系统根仍无 → null（无 project 层）。
 */
export function findProjectRoot(cwd: string): string | null {
  let current = cwd;
  for (;;) {
    if (existsAnyKind(join(current, ".git"))) return current;
    const parent = join(current, "..");
    if (parent === current) return null;
    current = parent;
  }
}

function existsAnyKind(p: string): boolean {
  // 存在性检查只需 stat 成功；类型（目录/文件）不区分——worktree 中 .git 是文件
  try {
    statSync(p);
    return true;
  } catch {
    return false;
  }
}

/** project 层 experts 目录：`<projectRoot>/.dsh/experts/`；无 project root → null。 */
export function resolveProjectExpertsRoot(cwd: string): string | null {
  const root = findProjectRoot(cwd);
  return root === null ? null : join(root, EXPERTS_DIR);
}

/**
 * cwd 兜底锚合理性（bug a7bdf03f）：打包/无会话环境下 process.cwd() 可能解析到
 * 应用安装目录（如 D:\software\dsh-forge）——以它直挂 project 层会让 watcher 锚定
 * 应用目录并爬升监听 Chromium data（EBUSY 风暴）。判据（留档）：
 * 1. cwd 向上须能解析到含 `.git` 的项目根（非项目根形态 → null）；
 * 2. 项目根路径不得命中应用安装/数据特征段（node_modules——vendor git 仓不是用户项目）。
 * 非法 → null（不产生 project 层 root，user/plugin 层照常）。
 */
export function resolveCwdProjectExpertsRoot(cwd: string): string | null {
  const root = findProjectRoot(cwd);
  if (root === null) return null;
  const isAppFeature = root
    .split(/[\\/]+/)
    .some((segment) => segment.toLowerCase() === "node_modules");
  return isAppFeature ? null : join(root, EXPERTS_DIR);
}

/**
 * user 层 experts 目录：`$DSH_HOME/experts/`，缺省 `~/.dsh/experts/`（D3，同构
 * skill-filesystem 用户根）。env 参数注入以便测试。
 */
export function resolveUserExpertsRoot(
  env: Record<string, string | undefined> = process.env,
): string {
  return join(env.DSH_HOME ?? join(homedir(), ".dsh"), "experts");
}

/** plugin 内置层 experts 目录：随包（package.json files 已含 experts/）根下 experts/。 */
export function resolvePluginExpertsRoot(moduleUrl: string = import.meta.url): string {
  // src/store/scan.ts → 包根两级上
  return fileURLToPath(new URL("../../experts/", moduleUrl));
}

/** 扫描一个 root 目录：坏文件/不可读单点降级，返回该层键 → 档案映射与 warnings。 */
async function scanRoot(
  root: ExpertRoot,
  warnings: string[],
): Promise<Map<string, ScannedExpert>> {
  const found = new Map<string, ScannedExpert>();
  let entries: string[];
  try {
    entries = (await readdir(root.dir)).filter((e) => e.endsWith(".md")).sort();
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return found;
    warnings.push(`专家 root 不可读，跳过该层（${root.origin}）：${root.dir}——${errorMessage(cause)}`);
    return found;
  }

  for (const entry of entries) {
    const filePath = join(root.dir, entry);
    let content: string;
    try {
      content = await readFile(filePath, "utf8");
    } catch (cause) {
      warnings.push(`专家档案读取失败，跳过该文件：${filePath}——${errorMessage(cause)}`);
      continue;
    }
    const parsed = parseExpertFile(filePath, content);
    if (!parsed.ok) {
      warnings.push(`专家档案不合法，跳过该文件：${parsed.reason}`);
      continue;
    }
    const prior = found.get(parsed.record.name);
    if (prior !== undefined) {
      warnings.push(`同层撞名，后者跳过：键 ${parsed.record.name} 同时由 ${prior.filePath} 与 ${filePath} 提供（同层同键拒绝写入）`);
      continue;
    }
    found.set(parsed.record.name, {
      ...parsed.record,
      origin: root.origin,
      filePath,
      updatedAt: updatedIsoOf(filePath),
    });
  }
  return found;
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/** 来源文件 mtime → ISO 串（stat 失败 = 纪元兜底——页脚降级不阻断取用）。 */
function updatedIsoOf(filePath: string): string {
  try {
    return statSync(filePath).mtime.toISOString();
  } catch {
    return new Date(0).toISOString();
  }
}

/**
 * 三层扫描 + 遮蔽合并：按 plugin → user → project 顺序覆盖（高层胜出，同键低层
 * 不可见）。产出一代完整冻结快照——同步完成，无半代索引形态。
 */
export async function scanExpertRoots(roots: readonly ExpertRoot[]): Promise<ExpertSnapshot> {
  const warnings: string[] = [];
  const experts = new Map<string, ScannedExpert>();
  // 低优先级先扫、高优先级后覆盖：plugin → user → project
  for (const root of [...roots].sort(
    (a, b) => PRIORITY.indexOf(a.origin) - PRIORITY.indexOf(b.origin),
  )) {
    const layer = await scanRoot(root, warnings);
    for (const [name, record] of layer) experts.set(name, record);
  }
  // 冻结即快照语义：取用方拿到的是不可变完整一代索引，换代后仍可安全持有上代。
  // Object.freeze 不拦截 Map 内部槽，先覆写三个 mutator 再冻结。
  const mutators = ["set", "delete", "clear"] as const;
  for (const m of mutators) {
    (experts as unknown as Record<string, () => never>)[m] = () => {
      throw new Error("专家索引快照不可变——换代请重新 scanExpertRoots");
    };
  }
  Object.freeze(experts);
  return Object.freeze({ experts, warnings: Object.freeze(warnings) });
}

const PRIORITY: readonly ExpertOrigin[] = ["plugin", "user", "project"];
