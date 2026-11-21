#!/usr/bin/env node
// 包清单机检 CLI（bug 家族 eaea8cea 最终收口——机检兜底）：全仓 package.json
// 逐个跑编码/JSON 四条判据（见 scripts/lib/check-package-json.mjs），任一损坏
// 非零退出并逐条列出。接入面：pnpm build 第一步、pnpm dev 起跑前、check:manifests 别名。
//
// 附加规则（用户裁定 2026-11-21）：官方内部件六件（plugins/{forge,project,spec,
// task-loop,expert-squad,knowledge}）的 dependencies 键禁止任何 @deepseek-ai/* 前缀
// 依赖——官方内部件 runtime 声明经 file:/staging 闭包污染 profile（官方件遮蔽
// bf4f3851、同族 2801eeeb、desktop staging 旧代际 better-sqlite3 node-gyp，三度实证）。
// 正道：内联进 dist + 声明迁 devDependencies/peerDependencies（cordis peer + 构建期类型合法）。
import { readFileSync } from 'node:fs';
import { enumerateRepoPackageJsons, expectValidPackageJson, ROOT } from './lib/check-package-json.mjs';

const PLUGINS_INTERNAL_SIX = [
	'plugins/forge',
	'plugins/project',
	'plugins/spec',
	'plugins/task-loop',
	'plugins/expert-squad',
	'plugins/knowledge',
];

function checkInternalSixDependencies() {
	const violations = [];
	for (const rel of PLUGINS_INTERNAL_SIX) {
		const abs = `${ROOT}/${rel}/package.json`;
		let manifest;
		try {
			manifest = JSON.parse(readFileSync(abs, 'utf-8'));
		} catch (err) {
			violations.push(`${rel}: 清单不可解析（${(err).message}）`);
			continue;
		}
		const deps = manifest.dependencies ?? {};
		for (const [name] of Object.entries(deps)) {
			if (name.startsWith('@deepseek-ai/')) {
				violations.push(
					`${rel}: dependencies 含 @deepseek-ai/* 依赖「${name}」——官方内部件一律「内联进 dist + 声明迁 devDeps」，`
					+ 'runtime 声明经 file:/staging 闭包污染 profile（判例 bf4f3851 / 2801eeeb / desktop staging 旧代际三度实证）',
				);
			}
		}
	}
	return violations;
}

const bad = [];
for (const rel of enumerateRepoPackageJsons()) {
	try {
		expectValidPackageJson(`${ROOT}/${rel}`);
	} catch (err) {
		bad.push((err).message);
	}
}
bad.push(...checkInternalSixDependencies());
if (bad.length > 0) {
	console.error(`[check:manifests] 包清单机检不通过（${bad.length} 条）:`);
	for (const line of bad) console.error(`  - ${line}`);
	console.error('[check:manifests] 修复指引：编码/JSON 损坏从 git 父提交字节级回写，或经 node JSON 往返重建（scripts/bump-version.mjs）；禁非 UTF-8 文本替换重写。');
	process.exit(1);
}
console.log(`[check:manifests] ${enumerateRepoPackageJsons().length} 份包清单编码/JSON 全部合法；六件官方内部件 dependencies 零 @deepseek-ai/* 依赖`);
