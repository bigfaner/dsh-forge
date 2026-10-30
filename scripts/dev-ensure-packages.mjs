// dev 启动期插件包重建清单（bug 021d2655 防再漏）：
// 清单不再硬编码插件名——扫描 packages/plugins/* 下全部含 build 脚本的插件包，
// 加 packages/plugin-forge 本体（其 dist 由根 tsc -b/--watch 产出，tsbuildinfo 与
// 输出脱节时 watch 初始 pass 零 emit 呈旧态，与 ensure-host-dist 同缘由）。
// 含 bundle-client 缝的包由各自 build 脚本（tsc -b && node scripts/bundle-client.mjs）
// 自产 dist/client.js——新增插件包只要落在 packages/plugins/ 且带 build 脚本即自动纳入。
// 消费方：scripts/dev.mjs 启动期 run-once `pnpm -C <pkg> build`（增量幂等，禁 --watch）。
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export function ensurePackages(root) {
	const list = [];
	const pluginsDir = join(root, 'packages', 'plugins');
	for (const name of readdirSync(pluginsDir).sort()) {
		const pkgJson = join(pluginsDir, name, 'package.json');
		if (!existsSync(pkgJson)) continue;
		let scripts;
		try {
			scripts = JSON.parse(readFileSync(pkgJson, 'utf8')).scripts;
		} catch {
			continue; // package.json 不可读/非法——跳过，交由 pnpm 侧报错
		}
		if (scripts?.build) list.push(`packages/plugins/${name}`);
	}
	if (existsSync(join(root, 'packages', 'plugin-forge', 'package.json'))) {
		list.push('packages/plugin-forge');
	}
	return list;
}
