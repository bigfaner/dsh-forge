// e2e globalSetup —— 壳 dist 确定性前置：1.5 起主窗口载自有壳（apps/web dist），
// e2e 前置构建（幂等重跑，防陈旧 dist 静默通过）。
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const WEB_DIR = join(fileURLToPath(import.meta.url), '..', '..', 'apps', 'web')

export default function globalSetup(): void {
  const build = spawnSync('pnpm', ['build:vite'], { cwd: WEB_DIR, shell: true, stdio: 'inherit' })
  if (build.status !== 0) {
    throw new Error(`e2e global-setup: apps/web build:vite 失败（exit ${String(build.status)}）——壳 dist 是 e2e 的确定性前置`)
  }
}
