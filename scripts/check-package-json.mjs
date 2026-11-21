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

// 联动断言（bug c48f2b6b）：声明面 lint 迁移（@deepseek-ai/* 迁 devDeps/peer）必须与
// bundle-host 内联例外表同步——凡该件 @deepseek-ai 声明依赖（非 cordis peer）必须命中
// 其 bundle-host 的 INLINE_OFFICIAL_FILTER，且 cordis 必须被 INLINE_EXEMPT 豁免（peer
// 单例由宿主注入，禁内联）。覆盖面：本轮收敛三件（project/task-loop/knowledge）；
// forge/spec/expert-squad 同族残留另卡处理，不在此断言。
const INLINE_LINKED_THREE = ['plugins/project', 'plugins/task-loop', 'plugins/knowledge'];

function extractRegexLiteral(src, constName) {
	const m = src.match(new RegExp(`const ${constName} = (\\/(?:[^/\\\\]|\\\\.)+\\/[a-z]*)`));
	if (!m) return null;
	const literal = m[1];
	const flags = literal.slice(literal.lastIndexOf('/') + 1);
	return new RegExp(literal.slice(1, literal.lastIndexOf('/')), flags);
}

function checkInlineFilterLinkage() {
	const violations = [];
	for (const rel of INLINE_LINKED_THREE) {
		let manifest;
		try {
			manifest = JSON.parse(readFileSync(`${ROOT}/${rel}/package.json`, 'utf-8'));
		} catch (err) {
			violations.push(`${rel}: 清单不可解析（${(err).message}）`);
			continue;
		}
		const src = readFileSync(`${ROOT}/${rel}/scripts/bundle-host.mjs`, 'utf-8');
		const filter = extractRegexLiteral(src, 'INLINE_OFFICIAL_FILTER');
		const exempt = extractRegexLiteral(src, 'INLINE_EXEMPT');
		if (!filter || !exempt) {
			violations.push(`${rel}: scripts/bundle-host.mjs 缺 INLINE_OFFICIAL_FILTER/INLINE_EXEMPT 内联例外表——lint 联动断言无法核销`);
			continue;
		}
		const declared = [
			...Object.keys(manifest.devDependencies ?? {}),
			...Object.keys(manifest.peerDependencies ?? {}),
		].filter((name) => name.startsWith('@deepseek-ai/'));
		for (const name of declared) {
			if (exempt.test(name)) continue; // cordis peer 外置
			if (!filter.test(name)) {
				violations.push(
					`${rel}: 官方件声明「${name}」未命中 bundle-host 内联例外表——lint 迁移未同步内联闭包（bug c48f2b6b 同族）`,
				);
			}
		}
		if (!exempt.test('@deepseek-ai/cordis')) {
			violations.push(`${rel}: 内联例外表未豁免 @deepseek-ai/cordis peer——单例语义由宿主注入，禁止内联`);
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
bad.push(...checkInlineFilterLinkage());
if (bad.length > 0) {
	console.error(`[check:manifests] 包清单机检不通过（${bad.length} 条）:`);
	for (const line of bad) console.error(`  - ${line}`);
	console.error('[check:manifests] 修复指引：编码/JSON 损坏从 git 父提交字节级回写，或经 node JSON 往返重建（scripts/bump-version.mjs）；禁非 UTF-8 文本替换重写。');
	process.exit(1);
}
console.log(`[check:manifests] ${enumerateRepoPackageJsons().length} 份包清单编码/JSON 全部合法；六件官方内部件 dependencies 零 @deepseek-ai/* 依赖`);
