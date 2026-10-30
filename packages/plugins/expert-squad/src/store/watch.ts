// store/watch —— 档案目录热刷新双通道（tech-design §5；语义照抄 skill-filesystem）。
// 通道一：chokidar 深度 1 监听各 root（flat .md 语义：深度 1 内仅 *.md 文件事件
// 相关；awaitWriteFinish 写稳定窗口 + atomic，ignoreInitial）；通道二：fs/observed
// 首方失效——模型 edit/write 变更落在任一 root 内的 .md 时同步失效（observeHostMutation
// 直呼失效，同 skill-filesystem）。失效统一走「索引整体换代」回调：取用方重新
// scanExpertRoots 产出下一代完整快照（无半代索引，§9），chokidar 通道以 microtask
// 合并同代内竞速事件。root 目录缺失为正常形态（静默空）；root 被删/监听出错 →
// warn + 重挂（scheduleRewatch 语义）。dispose 关闭全部 watcher 并吞掉迟到回调。

import { basename, dirname, resolve, relative, sep, isAbsolute } from "node:path";
import { statSync } from "node:fs";
import chokidar from "chokidar";
import type { FSWatcher } from "chokidar";
import type { ExpertRoot } from "./scan.js";

/** 失效回调：取用方触发索引整体换代（重新扫描产出下一代快照）。 */
export type Invalidate = () => void;

export interface ExpertWatchOptions {
  /** 失效回调（每次调用 = 触发一次整体换代；chokidar 通道已合并竞速事件）。 */
  onInvalidated: Invalidate;
  /** watcher 错误 / 重挂失败上报（缺省吞掉）。 */
  onError?: (error: unknown) => void;
  /** awaitWriteFinish 写稳定窗口（ms）；测试可调小。 */
  stabilityThresholdMs?: number;
  /** awaitWriteFinish 轮询间隔（ms）。 */
  pollIntervalMs?: number;
  /** chokidar 使用轮询代替原生事件。 */
  usePolling?: boolean;
}

const WATCH_EVENT = ["add", "change", "unlink"] as const;
type WatchEvent = (typeof WATCH_EVENT)[number] | "addDir" | "unlinkDir";

/** bug a7bdf03f：锚点爬升上界——缺失 root 向上找存在祖先最多爬的层数（防无界爬升）。 */
export const MAX_ANCHOR_CLIMB = 16;

/**
 * bug a7bdf03f：锚点爬升排除集（路径段小写比对）——爬升锚命中应用安装/数据特征
 * 目录即放弃监听：这些目录内的恒锁文件（如 Chromium data 的 Preferences*.tmp /
 * Network\Cookies）会引发 EBUSY 风暴；且「用户项目 experts 目录」不可能以它们为
 * 合法祖先。盘根由 dirname 自反判定单独排除。
 */
const UNSAFE_ANCHOR_SEGMENTS: ReadonlySet<string> = new Set([
  "node_modules",
  "user data",
  "application data",
]);

function isUnsafeAnchor(path: string): boolean {
  return path
    .split(/[\\/]+/)
    .some((segment) => UNSAFE_ANCHOR_SEGMENTS.has(segment.toLowerCase()));
}

/** 同一锚点降级只 warn 一次（禁循环重试刷屏——EBUSY 风暴教训，bug a7bdf03f）。 */
const degradedAnchors = new Set<string>();
function warnOnce(key: string, message: string): void {
  if (degradedAnchors.has(key)) return;
  degradedAnchors.add(key);
  console.warn(message);
}

/**
 * path 是否为 root 下深度 1 的 .md 档案（root 外 / 更深 / 非 .md → 无关）。
 * 语义同 skill-filesystem isPotentialSkillPath 的 flat .md 分支。
 */
export function isPotentialExpertPath(rootDir: string, path: string): boolean {
  const segments = containedSegments(rootDir, path);
  return segments !== undefined && segments.length === 1 && segments[0]!.endsWith(".md");
}

function isRelevantWatchEvent(rootDir: string, event: WatchEvent, path: string): boolean {
  // 目录事件不改变 flat .md 档案集合（子目录不是档案层）；root 自身被删走重挂。
  if (event === "addDir") return false;
  if (event === "unlinkDir") return true; // 可能是 root 自身 → 重挂判定
  return isPotentialExpertPath(rootDir, path);
}

function containedSegments(rootDir: string, path: string): string[] | undefined {
  const child = relative(resolve(rootDir), resolve(path));
  if (child.length === 0) return [];
  if (child === ".." || child.startsWith(`..${sep}`) || isAbsolute(child)) return undefined;
  return child.split(sep);
}

/**
 * 锚点爬升下的链外子树剪枝（bug 4d539d97）：root 缺失使锚爬至更上层目录时，
 * chokidar 会以深度预算监听锚下全部子树——链外兄弟子树（如仓内
 * apps/host/userdata.dev 的 Chromium profile，含恒锁的 Preferences*.tmp）
 * 被 fs.watch 触达即 EBUSY。只放行「root 链上的目录前缀」与 root 自身子树，
 * 链外同级目录整体剪除（递归遍历与事件面都不触达）。锚即 root（无爬升）
 * 时空链 → 全放行，保持既有行为。
 */
export function isOffChainDirectory(anchorDir: string, rootDir: string, path: string): boolean {
  const chain = containedSegments(anchorDir, rootDir);
  if (chain === undefined || chain.length === 0) return false;
  const segments = containedSegments(anchorDir, path);
  if (segments === undefined || segments.length === 0) return false;
  const depth = Math.min(segments.length, chain.length);
  for (let i = 0; i < depth; i += 1) {
    if (segments[i] !== chain[i]) return true;
  }
  return false;
}

/** fs/observed actor 是否为首方变更工具（edit/write，语义同 skill-filesystem）。 */
function mutationToolName(actor: unknown): "edit" | "write" | undefined {
  if (actor === undefined || actor === null || typeof actor !== "object" || !("name" in actor)) {
    return undefined;
  }
  const value = (actor as { name: unknown }).name;
  return value === "edit" || value === "write" ? value : undefined;
}

/** fs/observed 事件的最小形状（target.displayPath，本模块不依赖 dsh-fs 类型）。 */
export interface FsObservedTarget {
  displayPath: string;
}

/**
 * 产出可挂到 ctx.on("fs/observed", …) 的失效处理器：模型 edit/write 变更且路径
 * 落在任一 root 内的 .md → 同步失效（直呼，同 skill-filesystem）。wiring 由
 * registry/index 装配面完成，本模块保持 ctx 无关可测。
 */
export function makeFsObservedInvalidator(
  manager: Pick<ExpertWatchManager, "observeHostMutation">,
): (target: FsObservedTarget, observation: unknown, actor: unknown) => void {
  return (target, _observation, actor) => {
    if (mutationToolName(actor) === undefined) return;
    manager.observeHostMutation(target.displayPath);
  };
}

export class ExpertWatchManager {
  private readonly roots: readonly ExpertRoot[];
  private readonly options: ExpertWatchOptions;
  private readonly watchers = new Map<string, FSWatcher>();
  private closing = false;
  private invalidationQueued = false;

  constructor(roots: readonly ExpertRoot[], options: ExpertWatchOptions) {
    this.roots = roots;
    this.options = options;
  }

  /** 对每个 root 开启深度 1 watcher；全部就绪（或降级上报）后返回。 */
  async start(): Promise<void> {
    await Promise.all(
      this.roots.map(async (root) => {
        if (this.watchers.has(resolve(root.dir))) return;
        try {
          await this.openWatcher(root);
        } catch (error) {
          this.reportError(root, error);
        }
      }),
    );
  }

  /**
   * fs/observed 通道：首方（模型 edit/write）变更路径落在任一 root 深度 1 的
   * .md 内 → 同步失效。语义同 skill-filesystem observeHostMutation。
   */
  observeHostMutation(path: string): void {
    if (this.closing) return;
    const normalized = resolve(path);
    if (!this.roots.some((root) => isPotentialExpertPath(root.dir, normalized))) return;
    this.options.onInvalidated();
  }

  /** 关闭全部 watcher；迟到回调被 closing 标记吞掉。 */
  async dispose(): Promise<void> {
    this.closing = true;
    const closing = [...this.watchers.values()].map((w) => w.close());
    this.watchers.clear();
    await Promise.all(closing);
  }

  private reportError(root: ExpertRoot, error: unknown): void {
    if (this.closing) return;
    this.options.onError?.(new Error(`expert-squad: watcher for ${root.dir} failed: ${errorMessage(error)}`));
  }

  private async openWatcher(root: ExpertRoot): Promise<void> {
    // Root cause: 逐出竞速（bug 38f87c0f）——dispose 后迟到的 start/scheduleRewatch
    // 仍会开出新 watcher 且无人再持有关闭权（持久句柄泄漏、逐出无界）。入口
    // closing 短路（对齐 scheduleRewatch 先例）。
    if (this.closing) return;
    // root 不存在是正常形态（静默空）：chokidar 对缺失路径不触发 ready，改挂最近
    // 存在祖先为 anchor，深度 = 层数差 + 1（skill-filesystem anchor 模式同型）。
    // bug a7bdf03f：爬升加常量上界 + 排除集——锚爬至盘根/应用安装数据特征目录
    // （Chromium data 恒锁文件 → EBUSY 风暴）即放弃本层监听并降级留痕一次；
    // project root 后建场景由 fs/observed 通道与下次取用重扫兜底（取舍留档）。
    const rootDir = resolve(root.dir);
    let anchor = rootDir;
    let depth = 1;
    let climbs = 0;
    for (;;) {
      try {
        statSync(anchor);
        break;
      } catch {
        const parent = dirname(anchor);
        if (climbs >= MAX_ANCHOR_CLIMB || parent === anchor || isUnsafeAnchor(parent)) {
          warnOnce(
            rootDir,
            `expert-squad: watcher anchor runaway guard——missing root ${rootDir} 的存在祖先命中盘根/上界/应用数据特征（${parent}），放弃本层监听（fs/observed 通道与下次取用重扫兜底）`,
          );
          return;
        }
        anchor = parent;
        depth += 1;
        climbs += 1;
      }
    }
    // statSync 成功停下的锚同样校验（爬升终点即盘根/应用数据特征目录的形态）。
    if (dirname(anchor) === anchor || isUnsafeAnchor(anchor)) {
      warnOnce(
        rootDir,
        `expert-squad: watcher anchor runaway guard——missing root ${rootDir} 的锚落在盘根/应用数据特征目录（${anchor}），放弃本层监听（fs/observed 通道与下次取用重扫兜底）`,
      );
      return;
    }
    const watcher = chokidar.watch(anchor, {
      persistent: true,
      ignoreInitial: true,
      depth,
      atomic: true,
      // 锚点爬升可能落在超大目录（如仓根）——剪枝对 flat .md 语义永不相干的路径：
      // 常驻依赖目录（node_modules/.git）与 root 链以外的子树（bug 4d539d97：链外
      // 恒锁文件如 Chromium profile 的 Preferences*.tmp 会引发 EBUSY watch 风暴）。
      ignored: (path: string, stats?: { isDirectory(): boolean }) =>
        stats?.isDirectory() === true &&
        (basename(path) === "node_modules" ||
          basename(path) === ".git" ||
          isOffChainDirectory(anchor, rootDir, path)),
      awaitWriteFinish: {
        stabilityThreshold: this.options.stabilityThresholdMs ?? 100,
        pollInterval: this.options.pollIntervalMs ?? 20,
      },
      usePolling: this.options.usePolling ?? false,
      interval: this.options.pollIntervalMs ?? 20,
    });
    this.watchers.set(resolve(root.dir), watcher);
    const ready = new Promise<void>((res, rej) => {
      watcher.once("ready", () => res());
      watcher.once("error", (error) => rej(error));
    });
    try {
      await ready;
    } catch (error) {
      this.watchers.delete(resolve(root.dir));
      await watcher.close().catch(() => {});
      throw error;
    }
    for (const event of [...WATCH_EVENT, "addDir", "unlinkDir"] as const) {
      watcher.on(event, (path) => this.handleWatchEvent(root, event, path as string));
    }
    watcher.on("error", (error) => {
      if (this.closing) return;
      this.reportError(root, error);
      this.queueInvalidation();
      void this.scheduleRewatch(root);
    });
  }

  private handleWatchEvent(root: ExpertRoot, event: WatchEvent, path: string): void {
    if (this.closing) return;
    const dir = resolve(root.dir);
    if (!isRelevantWatchEvent(dir, event, path)) return;
    // root 自身被删 → watcher 失效，重挂后新内容可再被监听（skill-filesystem 语义）。
    if (event === "unlinkDir" && resolve(path) === dir) {
      void this.scheduleRewatch(root);
    }
    this.queueInvalidation();
  }

  /** 关闭失效 watcher 并重开（root 重建后恢复监听），重开成功再失效一次。 */
  private async scheduleRewatch(root: ExpertRoot): Promise<void> {
    const dir = resolve(root.dir);
    const stale = this.watchers.get(dir);
    this.watchers.delete(dir);
    try {
      await stale?.close();
    } catch {
      // 旧 watcher 关闭失败不阻塞重挂
    }
    if (this.closing) return;
    try {
      await this.openWatcher(root);
    } catch (error) {
      this.reportError(root, error);
      return;
    }
    this.queueInvalidation();
  }

  /** microtask 合并：同代内竞速事件只触发一次失效（skill-filesystem 同语义）。 */
  private queueInvalidation(): void {
    if (this.closing || this.invalidationQueued) return;
    this.invalidationQueued = true;
    queueMicrotask(() => {
      this.invalidationQueued = false;
      if (this.closing) return;
      this.options.onInvalidated();
    });
  }
}

/**
 * 验收 5 断言辅助：失效须在预算（默认 5s）内到达，否则超时失败。
 */
export function waitForInvalidation(fired: Promise<void>, budgetMs = 5000): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  return Promise.race([
    fired,
    new Promise<never>((_res, rej) => {
      timer = setTimeout(() => rej(new Error(`热刷新失效未在 ${budgetMs}ms 内到达`)), budgetMs);
    }),
  ]).finally(() => clearTimeout(timer));
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
