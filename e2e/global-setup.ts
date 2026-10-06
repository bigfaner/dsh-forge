// e2e globalSetup —— 壳 dist 确定性前置：1.5 起主窗口载自有壳（apps/web dist），
// e2e 前置构建（幂等重跑，防陈旧 dist 静默通过）。
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const WEB_DIR = join(fileURLToPath(import.meta.url), '..', '..', 'apps', 'web')

export default function globalSetup(): void {
  // 内存受限环境逃生口（5.4 dogfood 期间实证：系统 commit charge 耗尽时 vite 构建随机
  // 0xC0000409/heap-OOM，同一命令重试可过）——置位即跳过重建，dist 新鲜度由调用方担保
  // （手工前置 `pnpm build:vite` 成功后立即起跑；缺省不置位 = 行为不变，照常前置构建）。
  if (process.env.DSH_FORGE_E2E_SKIP_WEB_BUILD === '1') return
  const build = spawnSync('pnpm', ['build:vite'], { cwd: WEB_DIR, shell: true, stdio: 'inherit' })
  if (build.status !== 0) {
    throw new Error(`e2e global-setup: apps/web build:vite 失败（exit ${String(build.status)}）——壳 dist 是 e2e 的确定性前置`)
  }
}
