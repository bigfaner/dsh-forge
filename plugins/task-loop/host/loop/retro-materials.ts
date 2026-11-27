// 收口复盘的事实材料面（机械③指示段的「零、事实材料」数据源）：循环收口时点扫描本容器的
// 运行时目录，列出复盘与知识沉淀该读的文件绝对路径——指示段给真实路径，主会话与交叉核验
// 专家不必再自行定位目录。
// 扫描规则（纯读盘，零写；任一步读失败 = 该项缺席，不抛）：
//   · 事件流 = {任务循环运行时目录}/dispatch.jsonl；
//   · 任务目录 = 运行时目录下的直接子目录（名即 localId；'_' 前缀为非任务目录如 _pool）；
//   · 异常任务 = 有事故子文件夹（内含 settlement.json / triage.md / error.log）或顶层
//     resume.md，或事件流里被处置过（triage-decided）、末次结果非 success；
//   · 事件流逐行解析（残缺行跳过）：triage-decided 计处置轮次、task-worker-done 取末次结果；
//   · 卷宗/规格正本在盘才列（spec.dir 缺席或不在盘 = 不列）。
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** 事故子文件夹的判据文件（三者任一在场） */
const INCIDENT_MARKERS: readonly string[] = ["settlement.json", "triage.md", "error.log"];

/** 复盘进度文件名（顶层在场 = 该任务阻塞/续跑过） */
const RESUME_FILE = "resume.md";

/** 派发事件流文件名（contracts FORGE_DISPATCH_LOG_FILE 同值——本模块零 contracts 依赖，扫描面只读） */
const DISPATCH_LOG_FILE = "dispatch.jsonl";

/**
 * 探针 / spike 目录（工作区 .forge 下的正式分区——目录键 project.probes_dir / project.spikes_dir，
 * 与 project 条目同径；本模块零跨插件 import，按同形相对根定位，在盘才扫）。
 */
const PROBE_ROOTS: readonly (readonly string[])[] = [[".forge", "probes"]];
const SPIKE_ROOTS: readonly (readonly string[])[] = [[".forge", "spikes"]];

/** 探针/spike 子目录清单上限（超出截断——材料面是定位清单，不是全量转储） */
const EXPLORATION_ENTRY_CAP = 20;

/** 探针 / spike 的单条定位（绝对路径 + 修改时间） */
export interface ExplorationEntry {
  readonly dir: string;
  readonly mtimeMs: number;
}

/** 单个异常任务的材料定位 */
export interface RetroTaskMaterial {
  readonly localId: string;
  /** 任务目录绝对路径 */
  readonly dir: string;
  /** 事故子文件夹绝对路径 */
  readonly incidentDirs: readonly string[];
  readonly hasResume: boolean;
  /** 事件流里该任务被处置的轮次（triage-decided 行数） */
  readonly triageRounds: number;
  /** 事件流里该任务末次 task-worker-done 的 outcome（无记录 = 缺席） */
  readonly lastOutcome?: string;
}

/** 本容器的复盘材料面 */
export interface RetroMaterials {
  readonly slug: string;
  /** 任务循环运行时目录绝对路径 */
  readonly runtimeDir: string;
  /** 派发事件流绝对路径（不在盘 = 缺席） */
  readonly dispatchLog?: string;
  /** 任务目录总数（运行时目录下直接子目录数） */
  readonly totalTasks: number;
  /** 异常任务（localId 码序） */
  readonly tasks: readonly RetroTaskMaterial[];
  /** 卷宗目录绝对路径（spec.dir/issues 在盘才列） */
  readonly dossierDir?: string;
  /** 规格正本绝对路径（spec.md 在盘才列） */
  readonly specFile?: string;
  /** 本循环期间（事件流首行时间戳起）新增/改动的探针目录（码序，上限 20 条） */
  readonly probes: readonly ExplorationEntry[];
  /** 本循环期间新增/改动的 spike 目录（码序，上限 20 条） */
  readonly spikes: readonly ExplorationEntry[];
  /** 循环起点（事件流首行 ts；事件流缺席 = 缺席，探针/spike 不按时间筛） */
  readonly loopStartMs?: number;
}

/** 事件流逐行统计（残缺行跳过——追加写半行属运营残渣）；同时取首行 ts 作循环起点 */
function dispatchStatsOf(
  runtimeDir: string,
  slug: string,
): { stats: Map<string, { triageRounds: number; lastOutcome?: string }>; loopStartMs?: number } {
  const stats = new Map<string, { triageRounds: number; lastOutcome?: string }>();
  let loopStartMs: number | undefined;
  let text: string;
  try {
    text = readFileSync(join(runtimeDir, DISPATCH_LOG_FILE), "utf8");
  } catch {
    return { stats };
  }
  for (const line of text.split("\n")) {
    if (line === "") continue;
    let row: { ts?: unknown; slug?: unknown; type?: unknown; payload?: { taskKey?: unknown; outcome?: unknown } };
    try {
      row = JSON.parse(line) as typeof row;
    } catch {
      continue;
    }
    if (typeof row.ts === "number" && (loopStartMs === undefined || row.ts < loopStartMs)) loopStartMs = row.ts;
    if (row.slug !== slug || typeof row.payload?.taskKey !== "string") continue;
    const localId = row.payload.taskKey.slice(row.payload.taskKey.indexOf("/") + 1);
    const stat = stats.get(localId) ?? { triageRounds: 0 };
    if (row.type === "triage-decided") stat.triageRounds += 1;
    if (row.type === "task-worker-done" && typeof row.payload.outcome === "string") stat.lastOutcome = row.payload.outcome;
    stats.set(localId, stat);
  }
  return { stats, ...(loopStartMs !== undefined ? { loopStartMs } : {}) };
}

function subdirsOf(dir: string): readonly string[] {
  let entries: readonly string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries.filter((name) => !name.startsWith("_")).filter((name) => isDir(join(dir, name)));
}

function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/** 目录及其直接子文件的最新修改时间（目录 mtime 只随直接增删变化——子文件改写要并入） */
function latestMtimeMsOf(dir: string): number {
  let latest = 0;
  try {
    latest = statSync(dir).mtimeMs;
    for (const name of readdirSync(dir)) {
      try {
        latest = Math.max(latest, statSync(join(dir, name)).mtimeMs);
      } catch {
        // 单项读失败跳过
      }
    }
  } catch {
    return 0;
  }
  return latest;
}

/**
 * 探针/spike 子目录按循环起点筛选（workspaceRoot 缺席或根目录不在盘 = 空；
 * 无时间锚（事件流缺席）= 空——无法界定「本循环产出」）。
 */
function explorationsSince(
  workspaceRoot: string | undefined,
  roots: readonly (readonly string[])[],
  loopStartMs: number | undefined,
): readonly ExplorationEntry[] {
  if (workspaceRoot === undefined || loopStartMs === undefined) return [];
  const entries: ExplorationEntry[] = [];
  for (const root of roots) {
    const rootDir = join(workspaceRoot, ...root);
    for (const name of subdirsOf(rootDir)) {
      const dir = join(rootDir, name);
      const mtimeMs = latestMtimeMsOf(dir);
      if (mtimeMs >= loopStartMs) entries.push({ dir, mtimeMs });
    }
  }
  return entries.sort((a, b) => a.dir.localeCompare(b.dir)).slice(0, EXPLORATION_ENTRY_CAP);
}

/**
 * 扫描本容器的复盘材料面。
 * @param input.runtimeDir - 任务循环运行时目录（task_loop.runtime_dir 解析产物）
 * @param input.specDir - 规格目录（spec.dir 解析产物；缺席 = 卷宗与规格正本不列）
 * @param input.workspaceRoot - 工作区根（缺席 = 探针与 spike 不列）
 */
export function scanRetroMaterials(input: {
  readonly runtimeDir: string;
  readonly slug: string;
  readonly specDir?: string;
  readonly workspaceRoot?: string;
}): RetroMaterials {
  const { runtimeDir, slug } = input;
  const { stats, loopStartMs } = dispatchStatsOf(runtimeDir, slug);
  const tasks: RetroTaskMaterial[] = [];
  for (const localId of [...subdirsOf(runtimeDir)].sort()) {
    const dir = join(runtimeDir, localId);
    const incidentDirs = subdirsOf(dir).filter((name) =>
      INCIDENT_MARKERS.some((marker) => existsSync(join(dir, name, marker))),
    ).map((name) => join(dir, name));
    const stat = stats.get(localId);
    const hasResume = existsSync(join(dir, RESUME_FILE));
    const abnormal =
      incidentDirs.length > 0 || hasResume || (stat?.triageRounds ?? 0) > 0 || (stat?.lastOutcome !== undefined && stat.lastOutcome !== "success");
    if (!abnormal) continue;
    tasks.push({
      localId,
      dir,
      incidentDirs,
      hasResume,
      triageRounds: stat?.triageRounds ?? 0,
      ...(stat?.lastOutcome !== undefined ? { lastOutcome: stat.lastOutcome } : {}),
    });
  }
  const dispatchLog = join(runtimeDir, DISPATCH_LOG_FILE);
  const dossierDir = input.specDir !== undefined ? join(input.specDir, "issues") : undefined;
  const specFile = input.specDir !== undefined ? join(input.specDir, "spec.md") : undefined;
  return {
    slug,
    runtimeDir,
    ...(existsSync(dispatchLog) ? { dispatchLog } : {}),
    totalTasks: subdirsOf(runtimeDir).length,
    tasks,
    ...(dossierDir !== undefined && existsSync(dossierDir) ? { dossierDir } : {}),
    ...(specFile !== undefined && existsSync(specFile) ? { specFile } : {}),
    probes: explorationsSince(input.workspaceRoot, PROBE_ROOTS, loopStartMs),
    spikes: explorationsSince(input.workspaceRoot, SPIKE_ROOTS, loopStartMs),
    ...(loopStartMs !== undefined ? { loopStartMs } : {}),
  };
}

/** 指示段「零、事实材料」行集（真实绝对路径 + 读法；精确简洁——每行一事） */
export function renderRetroMaterials(m: RetroMaterials): readonly string[] {
  const sep = m.runtimeDir.includes("\\") ? "\\" : "/";
  const facts = (t: RetroTaskMaterial): string =>
    [
      t.triageRounds > 0 ? `处置 ${String(t.triageRounds)} 轮` : "",
      t.lastOutcome !== undefined ? `结果 ${t.lastOutcome}` : "",
      t.incidentDirs.length > 0 ? `事故文件夹 ${String(t.incidentDirs.length)} 个` : "",
      t.hasResume ? "有 resume.md" : "",
    ]
      .filter((s) => s !== "")
      .join(" · ");
  const explorations = m.probes.concat(m.spikes);
  return [
    "零、事实材料（先读后评，结论须能追溯到下列文件）：",
    ...(m.dispatchLog !== undefined ? [`- 事件流（整读，残缺行跳过）：${m.dispatchLog}`] : []),
    `- 异常任务目录 ${String(m.tasks.length)}/${String(m.totalTasks)}（每个读：事故文件夹内 error.log、settlement.json、triage.md；顶层 *.md 与 resume.md；证据文件夹内的 .md）：`,
    ...(m.tasks.length > 0 ? m.tasks.map((t) => `  - ${t.localId}：${t.dir}${sep}（${facts(t)}）`) : ["  - 无"]),
    ...(m.dossierDir !== undefined
      ? [`- 卷宗（回收报告、modeling-report / verification-report；忽略其中 resume.md）：${m.dossierDir}${sep}`]
      : []),
    ...(m.specFile !== undefined ? [`- 规格正本（对照 AC）：${m.specFile}`] : []),
    // 探针与 spike（本循环期间产出——探索结论与判别实验的载体）
    ...(explorations.length > 0
      ? [
          `- 探针与 spike（本循环期间产出；每个读其中的 .md 结论与判别实验，脚本和原始输出不读）：`,
          ...explorations.map((e) => `  - ${e.dir}${sep}`),
        ]
      : []),
    "- 另查：list_tasks / query_task（summary、key_decisions、notes）、list_bugs / get_bug、git log（带任务键的提交）",
    "- 不读：trace、截图、安装日志；未列为异常的任务只取 key_decisions",
  ];
}
