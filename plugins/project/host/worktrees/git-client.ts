// git 子进程与外部事实触点单点（plugin-project 1.13 单体拆解——自 rpc-service 平移零语义改动）：
//   · symbolic-ref 探测（unborn HEAD 分支名兜底）；
//   · 目录 ACL 预防性补权（win32 icacls——bug 4209c531 语义逐字保留）；
//   · 盘上在场性 / 清单 present 缺省实现。
// leaf 模块：零域编排（编排归 service.ts），单向出边仅 worktree-ops。
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { promisify } from 'node:util'
import { listWorktrees } from './worktree-ops.js'

/** unborn HEAD 分支名缺省探测（git symbolic-ref --short HEAD——真机 git execFile；失败 null） */
export const defaultSymbolicRefOf = async (worktreePath: string, onDebug?: (message: string) => void): Promise<string | null> => {
  try {
    const { stdout } = await promisify(execFile)('git', ['-C', worktreePath, 'symbolic-ref', '--short', 'HEAD'], {
      windowsHide: true,
    })
    const branch = stdout.trim()
    return branch === '' ? null : branch
  } catch (cause) {
    // 豁免补点（diag-milestone-coverage）：探测失败 = null 落空显式拒原语义（调用方归 ''
    // 显式拒），行为零影响——debug 级留痕不静默（缝缺席零 emit 不兜底）。
    onDebug?.(`[git-worktree] symbolic-ref 探测失败（null 落空显式拒原语义）：${worktreePath}：${String(cause)}`)
    return null
  }
}

/**
 * 目录 ACL 预防性补权（bug 4209c531——与官方 diagnose-windows-sandbox-acl 修复同语义，
 * 前置到编排创建时点）。平台分派（钩子三平台均在，动作按需）：
 *   · win32：git worktree add 产出的树目录只继承父链 ACE（Authenticated Users Modify——
 *     不含 WRITE_DAC/WRITE_OWNER），沙箱授权链 grantWrite 要求目录链对授权进程有效
 *     WRITE_DAC+WRITE_OWNER，缺任一 = 新树首条命令必被拒 → icacls 为当前用户补
 *     FullControl（OI)(CI)（仅该树目录；不删改任何既有 ACE）；
 *   · linux/mac：显式 no-op——posix 树目录由创建者用户所有（ugo 语义天然满足授权
 *     前置），无 capability-SID 授权链，无需补权。
 * 调用方 fail-soft（失败只 warn，不阻断编排）。
 */
/** grant 超时上界（ms）——残余传播场景最坏 10s fail-soft（diagnose 技能兜底不变） */
const ACL_GRANT_TIMEOUT_MS = 10_000

/** ACL 子进程执行器（测试注入缝；缺省 = execFile promisified） */
export type AclRunner = (file: string, args: string[], opts?: { timeout?: number }) => Promise<string>
const defaultAclRunner: AclRunner = async (file, args, opts) =>
  (await promisify(execFile)(file, args, { windowsHide: true, ...opts })).stdout

const defaultEnsureDirAcl = async (
  path: string,
  run: AclRunner = defaultAclRunner,
  onDebug?: (message: string) => void,
): Promise<void> => {
  if (process.platform !== 'win32') return
  const user = `${process.env.USERDOMAIN ?? ''}\\${process.env.USERNAME ?? ''}`
  if (user === '\\') return
  // Root cause: 带继承标志的 ACE 写入触发 Windows 对整棵子树的继承传播（大仓库分钟级、
  // 独占 1 核——bug f9a23367），且旧实现每次编排无条件 grant（已补权目录重复付账）。
  // 幂等短路：先只读查 DACL（单目录 SD 读，毫秒级），当前用户已有 (OI)(CI)(F) 有效
  // ACE（含继承式 (I) 标记——继承物化在场同样有效）即跳过 grant；DENY 行拒绝优先不算。
  try {
    const current = await run('icacls', [path])
    const prefix = `${user}:`.toUpperCase()
    const granted = current.split('\n').some((line) => {
      const l = line.trim().toUpperCase()
      return !l.includes('(DENY)') && l.startsWith(prefix) && l.includes('(OI)(CI)') && l.includes('(F)')
    })
    if (granted) return
  } catch (cause) {
    // 豁免补点（diag-milestone-coverage）：只读失败走 grant 兜底（超时上界保护）——现行
    // fail-soft 语义不变，行为零影响——debug 级留痕不静默（缝缺席零 emit 不兜底）。
    onDebug?.(`[git-worktree] DACL 只读探测失败（走 grant 兜底，fail-soft 语义不变）：${path}：${String(cause)}`)
  }
  await run('icacls', [path, '/grant', `${user}:(OI)(CI)F`], { timeout: ACL_GRANT_TIMEOUT_MS })
}
export { defaultEnsureDirAcl }

/** 重路由目标活性探测（bug 4a30b193 缝——缺省 = existsSync 盘上事实；测试注入桩） */
export const defaultPathPresent = (path: string): boolean => existsSync(path)

/** 清单 present 缺省实现（git worktree list 路径列——R5 现查单源缺省面） */
export const defaultListPresent = (projectRoot: string): Promise<readonly string[]> =>
  listWorktrees(projectRoot).then((entries) => entries.map((entry) => entry.path))

/** worktree 展示名（路径尾段——bind/seal/healing 三域共源） */
export const worktreeNameOf = (path: string): string => path.replaceAll('\\', '/').split('/').filter(Boolean).at(-1) ?? path
