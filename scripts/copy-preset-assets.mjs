// apps/host 非编译资产随构建拷贝（M3 3.7）——profile/presets/ 三 patch 底稿 → dist 同邻。
// 动机：tsc 不拷贝非 TS 资产，而 boot overlay 运行期读取底稿（apps/host/src/profile/
// presets.ts 双锚解析：dist 同邻 → repo src 回退）；packaged 形态只随 dist 出仓（assemble
// host-dist 递归拷贝）——无本步 = 打包形态预设面缺席（fail-soft 降级为无 hero 座位）。
// 挂点双联：pnpm build（package.json）+ scripts/dev.mjs electron 拉起前同步刷新——dev
// 形态双锚 dist 优先，历次 build 残留的 dist 旧副本会遮蔽 src 新改，故每次 dev 启动
// 先刷一次（改底稿 → 重启 dev 即生效）。幂等：逐文件覆盖拷贝，缺席即建目录。
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HOST_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'host')
const SRC = join(HOST_ROOT, 'src', 'profile', 'presets')
const OUT = join(HOST_ROOT, 'dist', 'profile', 'presets')

mkdirSync(OUT, { recursive: true })
for (const name of readdirSync(SRC)) {
  if (!name.endsWith('.patch.yml')) continue
  copyFileSync(join(SRC, name), join(OUT, name))
  console.log(`[copy-preset-assets] ${name} → dist/profile/presets/`)
}
