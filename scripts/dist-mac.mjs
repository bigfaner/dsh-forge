#!/usr/bin/env node
// `pnpm dist:mac` 末端 —— electron-builder DMG 封包（macOS）。
//
// 与 dist-win.mjs 同构镜像，平台差异三件：
//
// 签名：electron-builder 默认做 Keychain 签名身份自动发现（CSC_IDENTITY_AUTO_DISCOVERY）
// ——本机无证书时轻则刷警告，重则钥匙串授权弹窗/卡探测。P1 无签名发布计划 → 本脚本
// 默认置 false（完全跳过签名探测，产物未签名）；未来要签名时以环境变量显式覆盖
// （CSC_IDENTITY_AUTO_DISCOVERY=true + CSC_NAME="Developer ID Application: ..."）。
// 未签名产物本机直跑无碍；分发他机首启被 Gatekeeper 拦——右键「打开」或
// xattr -dr com.apple.quarantine /Applications/dsh-forge.app 放行。
//
// 压缩：DMG 载荷由 macOS 自带 hdiutil（UDZO）压缩，不经 7za——dist-win 的
// ELECTRON_BUILDER_COMPRESSION_LEVEL 内存坑（32 位 7za -mx=9）不适用，不设。
//
// 下载镜像（与 win 同理）：electron-builder 默认从 GitHub Releases 拉 Electron 运行时
// zip（electron-v44.0.0-darwin-{arm64,x64}.zip）——直连过慢。默认改走 npmmirror 镜像
// （与官方 zip 字节一致，checksum 校验不受影响）；两个变量均可用环境变量显式覆盖。
// 架构随打包机（electron-builder 缺省 host arch——Apple Silicon = arm64）；需 x64/
// universal 产物时显式 `pnpm exec electron-builder --mac --x64` 走同配置。
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// DMG 封包依赖 hdiutil（仅 macOS 在场）——非 darwin 提前 fail-loud，免深潜
// electron-builder 才报晦涩错
if (process.platform !== 'darwin') {
	console.error(
		`[dist:mac] DMG 封包仅 macOS 可跑（hdiutil 依赖）——当前平台 ${process.platform}`
	);
	process.exit(1);
}

const discovery = process.env.CSC_IDENTITY_AUTO_DISCOVERY ?? 'false';
process.env.CSC_IDENTITY_AUTO_DISCOVERY = discovery;
console.log(
	`[dist:mac] CSC_IDENTITY_AUTO_DISCOVERY=${discovery}${discovery === 'false' ? '（默认，P1 不签名——分发产物首启右键「打开」或 xattr -dr com.apple.quarantine）' : '（用户覆盖——走签名，另需 CSC_NAME）'}`
);

process.env.ELECTRON_MIRROR ??= 'https://npmmirror.com/mirrors/electron/';
process.env.ELECTRON_BUILDER_BINARIES_MIRROR ??=
	'https://npmmirror.com/mirrors/electron-builder-binaries/';
console.log(
	`[dist:mac] ELECTRON_MIRROR=${process.env.ELECTRON_MIRROR}（默认 npmmirror，GitHub 直连过慢；可用环境变量覆盖）`
);

const result = spawnSync(
	'pnpm exec electron-builder --mac --config electron-builder.config.mjs',
	{
		shell: true,
		stdio: 'inherit',
		cwd: ROOT,
		env: process.env
	}
);
if ((result.status ?? 1) !== 0) process.exit(result.status ?? 1);

// 封包成功 ≠ 内容正确：末端强制 assemble-installer-resources.mjs 同口径 --check
// 复核 release/staging + release/app 关键文件（与 dist-win.mjs 同构——staging 各类
// 产物 runtime/web-dist/mobile-dist/插件/prebuilds 布局跨平台同构，校验口径可复用）。
// 校验失败：assemble 脚本 CHECK FAILED 报出缺失清单并 exit 1（本脚本透传退出码）；
// 校验通过：输出 PACKAGING_CHECK_OK 可辨识行。
console.log(
	'[dist:mac] electron-builder 成功，末端自动关键文件复核（--check）...'
);
const check = spawnSync(
	'node scripts/assemble-installer-resources.mjs --check',
	{
		shell: true,
		stdio: 'inherit',
		cwd: ROOT,
		env: process.env
	}
);
if ((check.status ?? 1) !== 0) {
	console.error(
		'[dist:mac] PACKAGING_CHECK_FAILED —— 安装包关键文件复核未通过（缺失清单见上），拒绝声明封包成功'
	);
	process.exit(check.status ?? 1);
}
console.log('[dist:mac] PACKAGING_CHECK_OK —— staging + app 关键文件复核通过');
process.exit(0);
