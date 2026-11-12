// dev 启动期插件包重建清单（bug 021d2655 防再漏）：
// 清单不再硬编码插件名——双根枚举（workspacePluginDirs 单点：packages/plugins/* +
// root 级 plugins/*，批1 包归位 ⑦）下全部含 build 脚本的插件包，加 packages/plugin-forge
// 本体（其 dist 由根 tsc -b/--watch 产出，tsbuildinfo 与输出脱节时 watch 初始 pass 零
// emit 呈旧态，与 ensure-host-dist 同缘由）。
// 含 bundle-client 缝的包由各自 build 脚本（clean-dist && tsc -b && bundle-host &&
// bundle-client）自产双 bundle——新增插件包只要落在两根之一且带 build 脚本即自动纳入。
// 非零覆盖断言：枚举结果必须含 expert-squad（expert-squad 迁 root 级后单根枚举即漏——
// 空集/漏包即红，堵 glob 改动导致的假绿）。
// 消费方：scripts/dev.mjs 启动期 run-once `pnpm -C <pkg> build`（增量幂等，禁 --watch）。
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertExpertSquadCovered, workspacePluginDirs } from './workspace-plugin-dirs.mjs';

export function ensurePackages(root) {
	const list = [];
	for (const { name, dir } of workspacePluginDirs(root)) {
		const pkgJson = join(dir, 'package.json');
		let scripts;
		try {
			scripts = JSON.parse(readFileSync(pkgJson, 'utf8')).scripts;
		} catch {
			continue; // package.json 不可读/非法——跳过，交由 pnpm 侧报错
		}
		if (scripts?.build) list.push(name);
	}
	if (existsSync(join(root, 'packages', 'plugin-forge', 'package.json'))) {
		list.push('packages/plugin-forge');
	}
	assertExpertSquadCovered(list.map((name) => ({ name })));
	return list;
}
