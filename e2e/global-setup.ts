// e2e globalSetup —— 壳 dist 确定性前置：1.5 起主窗口载自有壳（apps/web dist），
// e2e 前置构建（幂等重跑，防陈旧 dist 静默通过）。
// 跑批就绪硬门（proposal worker-exec-evidence-replay SC2）：任何载体进入 journey 前必过
// readinessGate（产物形态 + 进程存活/锁残留 + 端口残留）——未过即 fail-fast，spec 零起跑。
import { mkdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { readinessGate } from './support/readiness.js'

const WEB_DIR = join(fileURLToPath(import.meta.url), '..', '..', 'apps', 'web')

/**
 * e2e 进程树 TMP 自愈（fix-10——fix-9 的全树收口，recurrence of 0e4d2f2a）：
 *  - 根因：fix-9 的 e2eUserDataRoot() 只收敛 mobile 两 spec 的 mkdtemp 调用点；65+
 *    desktop spec 仍自建 userData 于 %TEMP%，派生会话沙箱下 Chrome 单例锁
 *    （process_singleton_win.cc:318）与 DevToolsActivePort 写入被拒（0x5），
 *    electron.launch <500ms 即退出（1.37 归因在案）。逐 spec 改造不经济 → 单点根治。
 *  - 触发条件与 fix-9 指纹同源：DSH_SHELL === '1'（dispatch worker 会话 env 实测在案）
 *    且未显式置 E2E_TMP_ROOT 时，把 TMP/TEMP/TMPDIR 重定向至 <ROOT>/.e2e-tmp
 *    （ensure 存在）——os.tmpdir() 在 e2e 进程树全体（runner/workers/子进程）随之
 *    解析到工作区可写路径，覆盖所有 spec 的 mkdtemp 与 chromium 临时面；
 *    真实终端（无指纹）零变化；E2E_TMP_ROOT 显式覆盖优先。
 *  - 落点层级：模块顶层执行 + playwright.config.ts 顶层显式调用——config 模块加载期
 *    早于 worker spawn，runner 侧 mutate 的 env 随子进程继承下沉；两处共用同一实现
 *    （幂等，仅首个生效），global-setup 单独跑也不失守。
 *  - Windows 边界在案注记：本机 run-once 命令执行（禁 --watch 形态——commit 内存纪律，
 *    docs/conventions/windows-commit-exhaustion.md）；写入面限定工作区可写路径——
 *    DSH 文件沙箱对 %TEMP% 的 0x5 拒正是本自愈的成因，不自建越界写入。
 */
export function applyE2eTmpRedirect(): void {
  const override = process.env.E2E_TMP_ROOT
  const derived = process.env.DSH_SHELL === '1'
  if (override === undefined && !derived) return
  const root = override !== undefined && override !== '' ? override : join(ROOT, '.e2e-tmp')
  const marker = process.env.__E2E_TMP_REDIRECTED__
  if (marker === root) return // 幂等：config 顶层与 global-setup 双入口只落一次
  mkdirSync(root, { recursive: true })
  process.env.TMP = root
  process.env.TEMP = root
  process.env.TMPDIR = root
  process.env.__E2E_TMP_REDIRECTED__ = root
}

/** 仓库根（e2e/ 上级；与 support/launch.ts ROOT 同口径：文件段 + e2e 段 + '..'） */
const ROOT = join(fileURLToPath(import.meta.url), '..', '..')

// 模块加载期即生效：global-setup 无论经 config 的 globalSetup 钩子还是被 config import，
// 本行都先于任何 worker/spec 执行。
applyE2eTmpRedirect()

export default async function globalSetup(): Promise<void> {
  // 内存受限环境逃生口（5.4 dogfood 期间实证：系统 commit charge 耗尽时 vite 构建随机
  // 0xC0000409/heap-OOM，同一命令重试可过）——置位即跳过重建，dist 新鲜度由调用方担保
  // （手工前置 `pnpm build:vite` 成功后立即起跑；缺省不置位 = 行为不变，照常前置构建）。
  if (process.env.DSH_FORGE_E2E_SKIP_WEB_BUILD !== '1') {
    const build = spawnSync('pnpm', ['build:vite'], { cwd: WEB_DIR, shell: true, stdio: 'inherit' })
    if (build.status !== 0) {
      throw new Error(`e2e global-setup: apps/web build:vite 失败（exit ${String(build.status)}）——壳 dist 是 e2e 的确定性前置`)
    }
  }
  // 就绪硬门：build（或 SKIP 形态下调用方担保的 dist）之后、任何 spec 起跑之前——
  // 产物形态 + 进程存活/锁残留 + 端口残留全过才放行；未过即抛错（秒级 fail-fast）。
  await readinessGate()
}
