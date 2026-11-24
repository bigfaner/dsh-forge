// host/assembly · worktree-rollup.ts —— task-loop 键族 worktree 归拢消费面（1.5 用户裁决
// git 现查；1.6 收敛：porcelain 解析 / 主检出判定 / fail-soft 抽 @dsh-forge/lib-path/
// project-root 单源——task-loop/spec/project 三插件共享，本模块零本地复本）。
// marker `.forge/worktrees` 段仅作**触发条件**（零 git 调用省费的廉价预检——forge 派发的
// worker cwd 恒在该形态下），主根一律由 lib 单源 `resolveMainCheckoutRoot` 推导：命中本仓
// worktree 清单任一条目路径 ⇒ 主根 = 清单首条目（git 恒先列主检出/bare 行）。git 缺席 /
// 命令失败 / cwd 不属清单任一条目 = fail-soft 回退 `deriveProjectKey(cwd)`（worktree 键——
// 行为同修口前），回退原因由调用方经诊断面留痕（AGENTS §7 不静默）。git 探针缝经 lib
// GitPorcelainRunner 注入，单测注桩。
import {
  isInWorktreeTree,
  matchPathSpelling,
  resolveMainCheckoutRoot,
  spawnGitWorktreePorcelain,
  type GitPorcelainRunner,
} from "@dsh-forge/lib-path/project-root";
import { deriveProjectKey } from "../db/repositories/project-key.js";

/** worktree 归拢结果（rolledUp = git 推导成功；fallbackReason = fail-soft 回退原因） */
export interface WorktreeRollupResult {
  readonly key: string;
  readonly rolledUp: boolean;
  /** git 现查推导出的主检出根（rolledUp = true 时在场，deriveProjectKey 原文口径） */
  readonly mainRoot?: string;
  readonly fallbackReason?: string;
}

export type { GitPorcelainRunner };

/** 生产探针（lib 单源转出口——既有调用面/测试桩注名兼容） */
export const spawnGitPorcelain: GitPorcelainRunner = spawnGitWorktreePorcelain;

export const MARKER_PATTERN = /[\\/]\.forge[\\/]worktrees[\\/]/;

/**
 * worktree 归拢主根推导（lib 单源消费面——AC 用户裁决 2026-11-24）：
 * ① marker 不命中 → 零 git 调用，原样 deriveProjectKey(cwd)；
 * ② marker 命中 → lib 单源 porcelain 现查；cwd 归属清单任一条目子树 → 主根 = 首条目
 *    （git 主行恒先列）→ deriveProjectKey(主根)；③ git 失败/空清单/非本仓清单 →
 *    fail-soft 回退 cwd 键 + 回退原因。
 * 空 cwd 派生拒绝由 deriveProjectKey 原样上抛（marker 不命中径）。
 */
export function deriveProjectKeyRolledUpGit(cwd: string, runner: GitPorcelainRunner = spawnGitPorcelain): WorktreeRollupResult {
  if (!MARKER_PATTERN.test(cwd)) {
    return { key: deriveProjectKey(cwd), rolledUp: false };
  }
  const probe = resolveMainCheckoutRoot(cwd, runner);
  if (probe.entries === undefined) {
    return { key: deriveProjectKey(cwd), rolledUp: false, fallbackReason: probe.reason };
  }
  if (!isInWorktreeTree(probe.entries, cwd)) {
    return { key: deriveProjectKey(cwd), rolledUp: false, fallbackReason: "porcelain 清单不含 cwd（非本仓 worktree）——回退 cwd 键" };
  }
  // git 输出恒正斜杠；project_key 拼写敏感（deriveDirName canonical path 原样入参）——主根
  // 改写为 cwd 同分隔符拼写，保证写（worktree cwd）读（主根 cwd）两侧键全等（lib 单源
  // matchPathSpelling）。
  const canonicalRoot = matchPathSpelling(cwd, probe.entries[0]!.path);
  return { key: deriveProjectKey(canonicalRoot), rolledUp: true, mainRoot: canonicalRoot };
}
