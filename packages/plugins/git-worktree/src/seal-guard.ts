// @dsh-forge/git-worktree —— 封存判定 + 发送拦截 + 会话 cwd 守护面。
// 提案流程二：worktree 被删（含经 git 命令）后挂靠会话进入封存态——可查看历史、不可发送。
// 「不可发送」的硬保证 = host 发送拦截面拒绝 + 明确错误提示（UI 三通道仅提示性视觉）。
// 检测时机 = 会话打开/切换时比对挂靠 worktree 在场性（`git worktree list` 与挂靠路径比对）。
// 1.19 cwd 强制守护：挂靠会话的 SessionHeader.cwd 必须 ≡ 绑定 worktreePath（归一比对）——
// 不一致即显式报错（SessionCwdMismatchError），不留「绑定 A 树、实际跑在 B 树」的静默漂移。

/** 会话绑定快照（来自 session-attach 读尾部） */
export interface SessionBinding {
  readonly worktreePath: string
  readonly branch: string
}

/** 封存判定结果 */
export interface SealDecision {
  /** true = 会话封存（挂靠 worktree 不在场） */
  readonly sealed: boolean
  /** 封存原因（sealed 时必带） */
  readonly reason?: 'worktree-missing'
}

/** 路径比对归一口径：分隔符统一为 `/`、大小写不敏感（Windows 盘符/目录大小写差异） */
export function normalizePathForCompare(path: string): string {
  return path.replaceAll('\\', '/').toLowerCase()
}

/**
 * 封存判定：会话打开/切换时调用——比对挂靠 worktree 在场性。
 * 无绑定的会话（null）恒不封存。
 */
export function evaluateSeal(binding: SessionBinding | null, presentWorktreePaths: readonly string[]): SealDecision {
  if (!binding) return { sealed: false }
  const target = normalizePathForCompare(binding.worktreePath)
  const present = presentWorktreePaths.some((path) => normalizePathForCompare(path) === target)
  return present ? { sealed: false } : { sealed: true, reason: 'worktree-missing' }
}

/** 封存会话发送拒绝错误（host 拦截面抛出，携带用户可读的明确提示） */
export class SessionSealedError extends Error {
  readonly sealed: true

  constructor() {
    super('worktree 已删除，会话已封存——可查看历史，不可发送')
    this.name = 'SessionSealedError'
    this.sealed = true
  }
}

/**
 * 挂靠会话 cwd 漂移错误（守护面显式报错——SessionHeader.cwd ≠ 绑定 worktreePath 时抛出，
 * 不留「绑定 A 树、实际跑在 B 树」的静默漂移）。
 */
export class SessionCwdMismatchError extends Error {
  readonly cwdMismatch: true

  constructor(
    readonly headerCwd: string,
    readonly worktreePath: string,
  ) {
    super(
      `挂靠会话 cwd 漂移：SessionHeader.cwd=${headerCwd || '(空)'} ≠ 绑定 worktree=${worktreePath}——` +
        '会话业务执行目录与绑定树不一致（cwd 强制纪律），拒绝静默放行',
    )
    this.name = 'SessionCwdMismatchError'
    this.cwdMismatch = true
  }
}

/**
 * cwd 守护判定（纯函数）：SessionHeader.cwd ≡ 绑定 worktreePath（归一比对）才放行。
 * header cwd 非空且不一致 → SessionCwdMismatchError；缺席（非预铸配方的历史会话，
 * 无漂移证据可判）→ 放行——守护只对可判定面生效，误杀历史会话不属于本纪律。
 */
export function assertSessionCwdMatches(headerCwd: string | undefined, worktreePath: string): void {
  if (headerCwd === undefined || headerCwd.trim() === '') return
  if (normalizePathForCompare(headerCwd) !== normalizePathForCompare(worktreePath)) {
    throw new SessionCwdMismatchError(headerCwd, worktreePath)
  }
}

/**
 * 发送拦截面：host 发送前调用——封存会话抛 SessionSealedError（拒绝 + 错误提示），
 * 未封存放行。这是「不可发送」的硬保证，不依赖 UI 禁用。
 */
export function assertSendable(decision: SealDecision): void {
  if (decision.sealed) throw new SessionSealedError()
}
