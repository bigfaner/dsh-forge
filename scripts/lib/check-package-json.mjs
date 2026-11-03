// 包清单编码/JSON 校验器 + 仓库清单枚举——单源共享（bug 家族 eaea8cea 最终收口）。
// 消费方：tests/contract/pin-19-package-json-encoding.test.ts（契约锚定 + 红样本自测）
// 与 scripts/check-package-json.mjs（pnpm build / pnpm dev 前置机检 CLI）。
// 判据四条（与 pin-19 逐字同源）：
//   1. UTF-8 可解码（无非法字节序列，失败消息携首个非法字节偏移）
//   2. 无 BOM（EF BB BF——TextDecoder 默认剥头部 BOM，须按原始字节断言）
//   3. 原始文本无 U+FFFD 替换字符（编码损坏痕迹：U+FFFD 吞中文截断引号）
//   4. JSON.parse 合法
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const _BOM = '\uFEFF';
const REPLACEMENT = '\uFFFD';

/** 单文件校验：非法即抛错（消息含绝对路径 + 首损坏字节偏移）。 */
export function expectValidPackageJson(absPath) {
	const buf = readFileSync(absPath);
	// 1) UTF-8 可解码 + 首损坏字节偏移
	let text;
	try {
		text = new TextDecoder('utf-8', { fatal: true }).decode(buf);
	} catch {
		let offset = 0;
		while (offset < buf.length) {
			try {
				new TextDecoder('utf-8', { fatal: true }).decode(buf.subarray(offset, offset + 4));
				offset += 1;
			} catch {
				break;
			}
		}
		throw new Error(`package.json 非 UTF-8 可解码: ${absPath} @ byte ${offset}`);
	}
	// 2) BOM（原始字节断言 EF BB BF）
	if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
		throw new Error(`package.json 带 UTF-8 BOM: ${absPath} @ byte 0`);
	}
	// 3) U+FFFD 替换字符（字符索引 → UTF-8 字节偏移折算定位）
	const fffd = text.indexOf(REPLACEMENT);
	if (fffd >= 0) {
		const before = Buffer.from(text.slice(0, fffd), 'utf8');
		throw new Error(`package.json 含 U+FFFD 替换字符（编码损坏痕迹）: ${absPath} @ byte ${before.length}`);
	}
	// 4) JSON.parse
	try {
		JSON.parse(text);
	} catch (err) {
		throw new Error(`package.json 非法 JSON: ${absPath} @ ${(err).message}`);
	}
}

/** 仓库在场包清单枚举：packages 递归 package.json + apps/host/package.json + 根 package.json，排除 node_modules。 */
export function enumerateRepoPackageJsons() {
	const walk = (dir, base) => {
		const out = [];
		for (const ent of readdirSync(dir, { withFileTypes: true })) {
			if (ent.name === 'node_modules' || ent.name.startsWith('.')) continue;
			const rel = base ? `${base}/${ent.name}` : ent.name;
			if (ent.isDirectory()) out.push(...walk(`${dir}/${ent.name}`, rel));
			else if (ent.name === 'package.json') out.push(rel);
		}
		return out;
	};
	return [...walk(`${ROOT}/packages`, 'packages'), 'apps/host/package.json', 'package.json'].sort();
}
