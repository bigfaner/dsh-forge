// worker 任务目录锚点节（core forge/workspace/worker-context.ts 直迁——plugin-task-loop
// 1.7 内联 + slug 容器化改造）。经 TasksVerbDeps 注入 claim（核心动词零 IO 纪律），claim
// 合成 persona 后追加——persona 通道 worker 独享。fail-soft：容器目录缺席/读失败 → 省该锚点段
// （logs 双锚恒出）。slug 化改造面：source_kind 判别词退役——容器文档锚点 = features 目录在盘
// 优先，否则 proposals 目录（fail-soft 探测序）；检出根唯一权威 = worker 会话 cwd。
import { readdirSync, type Dirent } from "node:fs";
import { join, sep } from "node:path";
import { docsRootOfForgeDir } from "@dsh-forge/lib-path";
import type { ContainerRef } from "./types.js";

/** 目录树深度上限 */
const TREE_DEPTH_LIMIT = 3;
/** 目录树条目上限（超出以 … 行截断） */
const TREE_ENTRY_CAP = 60;

/** 锚点介绍行文本 */
const DIR_ROLE_NOTES: Readonly<Record<string, string>> = {
  proposal_dir: "提案文档目录：本任务的提案出处（proposal.md 及配套）。",
  feature_dir: "特性文档目录：prd/（需求与用户故事）、design/（技术设计）、test/（测试规划）。",
  "forge.project_logs_dir":
    "forge 运行日志目录：任务日志存放的根目录（位于工作区仓库之外，属 dsh-forge 运行数据——不进 git）。",
};

/** 锚点段（目录缺席/读失败 → undefined） */
function renderDirBlock(label: string, abs: string, note: string): string | undefined {
  try {
    readdirSync(abs);
  } catch {
    return undefined;
  }
  const pathLine = `  \`${abs}${sep}\``;
  const lines: string[] = [`${label}——${note}`, pathLine];
  scanLines(abs, "  ", 1, lines);
  return lines.join("\n");
}

/** logs 根锚点段：恒出 */
function renderLogsRootBlock(abs: string): string {
  return [`forge.project_logs_dir——${DIR_ROLE_NOTES["forge.project_logs_dir"]}`, `  \`${abs}${sep}\``].join("\n");
}

/** 任务日志锚点段：恒出；树仅任务目录在盘时追加 */
function renderTaskLogsBlock(abs: string): string {
  const note =
    "任务日志目录：{forge.task_logs_dir} = {forge.project_logs_dir}/{slug}/{local_id}；本轮任务的证据子文件夹与 resume.md 进度文件（随附 resume.validity.json 效度戳——跨 HEAD/基线漂移的证据强制重跑）存储在此。";
  const lines: string[] = [`forge.task_logs_dir——${note}`, `  \`${abs}${sep}\``];
  scanLines(abs, "  ", 1, lines);
  return lines.join("\n");
}

/** 递归目录树行（目录优先、名称码序；深度/条目双上限；隐藏项跳过） */
function scanLines(abs: string, prefix: string, depth: number, lines: string[]): void {
  if (depth > TREE_DEPTH_LIMIT || lines.length >= TREE_ENTRY_CAP) return;
  let entries: Dirent[];
  try {
    entries = readdirSync(abs, { withFileTypes: true });
  } catch {
    return;
  }
  const visible = entries
    .filter((e) => !e.name.startsWith("."))
    .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));
  visible.forEach((e, i) => {
    if (lines.length >= TREE_ENTRY_CAP) {
      lines.push(`${prefix}…`);
      return;
    }
    const last = i === visible.length - 1;
    lines.push(`${prefix}${last ? "└─ " : "├─ "}${e.name}${e.isDirectory() ? sep : ""}`);
    if (e.isDirectory()) scanLines(join(abs, e.name), prefix + (last ? "   " : "│  "), depth + 1, lines);
  });
}

/**
 * worker 任务目录锚点节（fail-soft 纯读）：logs 双锚恒出；容器文档锚点（slug 容器化——
 * features 目录在盘优先，否则 proposals 目录）在盘才出。logsRoot = <任务库>/logs；
 * 任务日志目录 = logsRoot/<slug>/<localId>。
 */
export function renderWorkerContext(input: {
  forgeDir: string;
  logsRoot: string;
  localId: string;
  source: ContainerRef;
}): string {
  const { forgeDir, logsRoot, localId, source } = input;
  const blocks: string[] = [];
  const docsRoot = docsRootOfForgeDir(forgeDir);
  const taskLogsDir = join(logsRoot, source.slug, localId);
  // slug 容器化：features 目录在盘优先（远征血统），否则 proposals 目录——fail-soft 探测序
  const featureDir = join(docsRoot, "features", source.slug);
  const proposalDir = join(docsRoot, "proposals", source.slug);
  let featureInDisk = false;
  try {
    readdirSync(featureDir);
    featureInDisk = true;
  } catch {
    featureInDisk = false;
  }
  const main = featureInDisk
    ? renderDirBlock("feature_dir", featureDir, DIR_ROLE_NOTES.feature_dir!)
    : renderDirBlock("proposal_dir", proposalDir, DIR_ROLE_NOTES.proposal_dir!);
  if (main !== undefined) blocks.push(main);
  blocks.push(renderLogsRootBlock(logsRoot), renderTaskLogsBlock(taskLogsDir));
  return [
    "## 任务目录锚点",
    "本任务领取的目录锚点（首行职责介绍；缩进行为绝对路径与目录内容）：",
    "工作目录即检出根（会话 cwd）——检索与改动均在此树内。",
    "",
    blocks.join("\n\n"),
  ].join("\n");
}
