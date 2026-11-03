#!/usr/bin/env node
// 版本 bump 唯一正道（写入面规范——bug 家族 eaea8cea：文本替换重写清单多字节截断
// 六度复发，禁一切非 JSON 往返写法）。用法：
//   node scripts/bump-version.mjs <package.json 路径或包目录> <新版本>
// 行为：JSON.parse 往返改写（UTF-8 无 BOM）→ 写后即刻机检（本文件四判据）→ 失败
// 非零退出。bump 后请跑 tests/contract/pin-19-package-json-encoding.test.ts 复核全仓。
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expectValidPackageJson } from './lib/check-package-json.mjs';

const [targetArg, versionArg] = process.argv.slice(2);
if (targetArg === undefined || versionArg === undefined) {
	console.error('用法: node scripts/bump-version.mjs <package.json 路径或包目录> <新版本>');
	process.exit(2);
}
if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(versionArg)) {
	console.error(`非法 semver: ${versionArg}`);
	process.exit(2);
}
const target = resolve(dirname(fileURLToPath(import.meta.url)), '..', targetArg);
const pkgPath = target.endsWith('package.json') ? target : `${target}/package.json`;

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')); // 语法先验：坏清单进不来
const previous = pkg.version;
pkg.version = versionArg;
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8'); // 无 BOM UTF-8

try {
	expectValidPackageJson(pkgPath);
} catch (err) {
	console.error(`[bump] 写后机检失败（清单已损坏，请从 git 父提交回写）: ${(err).message}`);
	process.exit(1);
}
console.log(`[bump] ${pkg.name ?? pkgPath}: ${previous} -> ${versionArg}（写后机检通过）`);
