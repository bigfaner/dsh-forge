// 双根插件包枚举单点（批1 包归位 ⑦——包居所两根：packages/plugins/* 子居所与 root 级
// plugins/* 树；expert-squad 迁 root 级后单根枚举即漏——glob/目录改动导致的假绿由
// 非零覆盖断言堵截，消费方各自断言清单含 expert-squad）。Run once per invocation;
// run-once, no watch。
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 枚举 workspace 内全部插件包（两根合并产出，键 = 自仓库根起的 workspace 子路径）。
 * @param {string} root 仓库根
 * @returns {{ name: string, dir: string }[]} name = 'packages/plugins/<x>' | 'plugins/<x>'
 */
export function workspacePluginDirs(root) {
  const out = [];
  for (const [prefix, base] of [
    ['packages/plugins', join(root, 'packages', 'plugins')],
    ['plugins', join(root, 'plugins')],
  ]) {
    if (!existsSync(base)) continue;
    for (const entry of readdirSync(base, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const pkgJson = join(base, entry.name, 'package.json');
      if (!existsSync(pkgJson)) continue;
      out.push({ name: `${prefix}/${entry.name}`, dir: join(base, entry.name) });
    }
  }
  return out.sort((a, b) => (a.name < b.name ? -1 : 1));
}

/** 非零覆盖断言（批1 ⑦）：枚举清单必须含 expert-squad——两根枚举/glob 改动致漏即红。 */
export function assertExpertSquadCovered(dirs) {
  if (!dirs.some(({ name }) => name.endsWith('/expert-squad'))) {
    console.error(`[workspace-plugin-dirs] 非零覆盖断言失败：枚举清单缺 plugins/expert-squad（${dirs.length} 包——枚举面漂移，堵 glob 假绿）`);
    process.exit(1);
  }
}
