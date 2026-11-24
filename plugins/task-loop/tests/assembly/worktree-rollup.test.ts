// worktree 归拢主根推导 pin（2026-11-24 用户裁决二修：git 命令现查，禁自造路径剥取规则；
// 1.6 收敛：porcelain 解析/主检出判定/fail-soft 归 @dsh-forge/lib-path/project-root 单源，
// 本面 = task-loop 键族消费面 pin——marker 触发 + 主根键派生 + fail-soft 回退语义不变）：
// 任务子 tab 空数据真因（键族缝回退主根单键 + 任务键落 worktree 键）修口钉。诊断留痕
// .forge/task-logs/001-task-tab-empty/ 与 002-git-rollup/。
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  deriveProjectKeyRolledUpGit,
  MARKER_PATTERN,
  spawnGitPorcelain,
  type GitPorcelainRunner,
} from "../../host/assembly/worktree-rollup.js";
import { deriveProjectKey } from "../../host/db/repositories/project-key.js";
import taskLoopPlugin from "../../host/index.js";

describe("deriveProjectKeyRolledUpGit（git 现查归拢——runner 注入桩）", () => {
  const ROOT = "Z:\\ws\\proj";
  const WT = `${ROOT}\\.forge\\worktrees\\plugins`;
  const porcelain = [
    "worktree Z:/ws/proj",
    "HEAD abc",
    "branch refs/heads/main",
    "",
    "worktree Z:/ws/proj/.forge/worktrees/plugins",
    "HEAD def",
    "branch refs/heads/b1",
    "",
  ].join("\n");
  const runner: GitPorcelainRunner = () => porcelain;

  it("marker 命中 + porcelain 现查 → 主根键 = porcelain 首条目派生（非路径剥取，分隔符随 cwd 拼写）", () => {
    const result = deriveProjectKeyRolledUpGit(WT, runner);
    expect(result.rolledUp).toBe(true);
    expect(result.mainRoot).toBe(ROOT);
    expect(result.key).toBe(deriveProjectKey(ROOT));
  });

  it("worktree 树内子路径 cwd 同样归拢主根键", () => {
    const result = deriveProjectKeyRolledUpGit(`${WT}\\host\\src`, runner);
    expect(result.rolledUp).toBe(true);
    expect(result.key).toBe(deriveProjectKey(ROOT));
  });

  it("非 worktree 形态 → 零 git 调用（runner 不触）+ 原样派生", () => {
    const spy = vi.fn<GitPorcelainRunner>(runner);
    expect(deriveProjectKeyRolledUpGit(ROOT, spy).key).toBe(deriveProjectKey(ROOT));
    expect(spy).not.toHaveBeenCalled();
    // 仅 .forge 一段 / worktrees 单段 / 大小写变体均不触发
    for (const cwd of [`${ROOT}\\.forge\\tmp`, `${ROOT}\\worktrees\\plugins`, `${ROOT}\\.Forge\\Worktrees\\plugins`]) {
      expect(MARKER_PATTERN.test(cwd)).toBe(false);
    }
  });

  it("git 探针抛错 → fail-soft 回退 cwd 键 + 回退原因留痕字段", () => {
    const failing: GitPorcelainRunner = () => {
      throw new Error("git not found");
    };
    const result = deriveProjectKeyRolledUpGit(WT, failing);
    expect(result.rolledUp).toBe(false);
    expect(result.key).toBe(deriveProjectKey(WT));
    expect(result.fallbackReason).toContain("git not found");
  });

  it("porcelain 清单不含 cwd → 回退 cwd 键（非本仓 worktree）", () => {
    const result = deriveProjectKeyRolledUpGit(WT, () => "worktree Z:/other/repo\n");
    expect(result.rolledUp).toBe(false);
    expect(result.key).toBe(deriveProjectKey(WT));
    expect(result.fallbackReason).toContain("非本仓 worktree");
  });

  it("空 cwd → 派生拒绝原样上抛（ProjectKeyDerivationError）", () => {
    expect(() => deriveProjectKeyRolledUpGit("")).toThrowError(/ERR_PROJECT_KEY_DERIVATION/);
  });
});

describe("归拢端到端（真 git 仓装配级——spawnGitPorcelain 真探针）", () => {
  const tempRoots: string[] = [];
  afterEach(() => {
    for (const root of tempRoots.splice(0)) {
      try {
        rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      } catch {
        // tmp 目录清理 best-effort（Windows 句柄延迟释放 EPERM 不炸测试）
      }
    }
  });

  function initRepoWithWorktree(): { root: string; wt: string } {
    const root = mkdtempSync(join(tmpdir(), "task-loop-rollup-git-"));
    tempRoots.push(root);
    const git = (args: string[], cwd: string) => execFileSync("git", args, { cwd, encoding: "utf8" });
    git(["init", "-b", "main"], root);
    git(["config", "user.email", "t@t"], root);
    git(["config", "user.name", "t"], root);
    git(["commit", "--allow-empty", "-m", "init"], root);
    const wt = join(root, ".forge", "worktrees", "plugins");
    git(["worktree", "add", "-b", "b1", wt, "main"], root);
    return { root, wt };
  }

  function execOf(cwd: string): unknown {
    return { agent: { session: { id: "s1", header: { cwd } } } };
  }

  it("真 git 仓 worktree cwd 写入 add_task → 主根 cwd 的 list_tasks 可见（真 porcelain 现查）", async () => {
    const { root, wt } = initRepoWithWorktree();
    const home = mkdtempSync(join(tmpdir(), "task-loop-rollup-home-"));
    tempRoots.push(home);
    const registered: { name: string; execute: (a: unknown, e: unknown) => Promise<unknown> }[] = [];
    const ctx = {
      reflect: { provide: () => {}, get: () => undefined },
      emit: () => {},
      tools: {
        register: (definition: { name: string; execute: (a: unknown, e: unknown) => Promise<unknown> }) => {
          registered.push(definition);
        },
      },
    };
    const dispose = taskLoopPlugin(ctx, { home, dbFile: ":memory:" });
    try {
      const byName = new Map(registered.map((t) => [t.name, t]));
      await byName.get("add_task")!.execute(
        { slug: "rollup-pin", title: "rollup pin", type: "coding-fix" },
        execOf(wt),
      );
      const listed = (await byName.get("list_tasks")!.execute({}, execOf(root))) as {
        cards: { slug: string }[];
      };
      expect(listed.cards.some((c) => c.slug === "rollup-pin")).toBe(true);
    } finally {
      dispose();
    }
  });

  it("spawnGitPorcelain 真探针：git 仓内返回含主根清单（口径冒烟——lib 单源 parseWorktreePorcelain 首条目）", async () => {
    const { root } = initRepoWithWorktree();
    const { parseWorktreePorcelain } = await import("@dsh-forge/lib-path/project-root");
    const entries = parseWorktreePorcelain(spawnGitPorcelain(root));
    expect(entries.length).toBeGreaterThanOrEqual(2);
    expect(normalize(entries[0]!.path)).toBe(normalize(root));
  });
});

const normalize = (p: string): string => p.replaceAll("\\", "/").replace(/\/+$/, "");
