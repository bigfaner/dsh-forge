#!/usr/bin/env node
// 包清单机检 CLI（bug 家族 eaea8cea 最终收口——机检兜底）：全仓 package.json
// 逐个跑编码/JSON 四条判据（见 scripts/lib/check-package-json.mjs），任一损坏
// 非零退出并逐条列出。接入面：pnpm build 第一步、pnpm dev 起跑前、check:manifests 别名。
import { enumerateRepoPackageJsons, expectValidPackageJson, ROOT } from './lib/check-package-json.mjs';

const bad = [];
for (const rel of enumerateRepoPackageJsons()) {
	try {
		expectValidPackageJson(`${ROOT}/${rel}`);
	} catch (err) {
		bad.push((err).message);
	}
}
if (bad.length > 0) {
	console.error(`[check:manifests] 包清单编码/JSON 损坏（${bad.length} 个）:`);
	for (const line of bad) console.error(`  - ${line}`);
	console.error('[check:manifests] 修复指引：从 git 父提交字节级回写，或经 node JSON 往返重建（scripts/bump-version.mjs）；禁非 UTF-8 文本替换重写。');
	process.exit(1);
}
console.log(`[check:manifests] ${enumerateRepoPackageJsons().length} 份包清单编码/JSON 全部合法`);
