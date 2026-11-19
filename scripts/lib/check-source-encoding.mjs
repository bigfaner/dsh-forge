// 源码文件编码校验器——pin-20 单源共享（判例家族 eaea8cea 第八度：ui/keyed-section.ts
// 整文件 UTF-8 被 GBK 误读后二次编码落盘，pin-19 只覆盖 package.json 的盲区收口）。
// 消费方：tests/contract/pin-20-source-encoding.test.ts（契约锚定 + 红样本自测）。
// 判据三条（逐源码文件）：
//   1. UTF-8 可解码（无非法字节序列，失败消息携首个非法字节偏移）
//   2. 无 BOM（EF BB BF）
//   3. 无 GBK-mojibake 签名字符（双字损坏痕迹——正常中文源码不含该字符簇）
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts', '.mjs', '.cjs', '.js', '.jsx']);
const EXCLUDED_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', '.tmp']);

// GBK-mojibake 签名集（\u 转义书写——本文件自身也在扫描面内，字面量会自伤）：
// UTF-8 中文按 GBK 误读后二次编码产生的高频错字（正确中文文本几乎不含；
// 同文件命中 ≥2 个不同签名即判损坏——单签名偶现不误伤）。
const MOJIBAKE_MARKERS = ['\u{9225}', '\u{951B}', '\u{951F}', '\u{9428}', '\u{9366}', '\u{93BA}', '\u{93C2}', '\u{9239}', '\u{59B2}\u{6212}'];


/** 仓库在场源码文件枚举：packages / plugins / apps / scripts / tests / e2e 递归，排除生成物与隐藏目录。 */
export function enumerateRepoSources() {
	const roots = ['packages', 'plugins', 'apps', 'scripts', 'tests', 'e2e'].map((r) => join(ROOT, r)).filter((r) => statSync(r, { throwIfNoEntry: false }) !== undefined);
	const walk = (dir, base) => {
		const ent = readdirSync(dir, { withFileTypes: true });
		const out = [];
		for (const e of ent) {
			if (e.name === 'node_modules' || e.name.startsWith('.') || EXCLUDED_DIRS.has(e.name)) continue;
			const rel = base ? `${base}/${e.name}` : e.name;
			const abs = join(dir, e.name);
			if (e.isDirectory()) out.push(...walk(abs, rel));
			else if (SOURCE_EXTENSIONS.has(e.name.slice(e.name.lastIndexOf('.')).toLowerCase())) out.push(rel);
		}
		return out;
	};
	return roots.map((r) => [r, r.replace(/\\/g, '/').split('/').pop()]).flatMap(([abs, name]) => walk(abs, name)).sort();
}

/** 单文件校验：非法即抛错（消息含绝对路径 + 定位）。 */
export function expectValidUtf8Source(absPath) {
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
		throw new Error(`源码文件非 UTF-8 可解码: ${absPath} @ byte ${offset}`);
	}
	// 2) BOM（原始字节断言 EF BB BF）
	if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
		throw new Error(`源码文件带 UTF-8 BOM: ${absPath} @ byte 0`);
	}
	// 3) GBK-mojibake 签名（双字损坏痕迹——≥2 个不同签名命中即判损坏）
	const hits = MOJIBAKE_MARKERS.filter((m) => text.includes(m));
	if (hits.length >= 2) {
		const first = text.indexOf(hits[0]);
		const before = Buffer.from(text.slice(0, first), 'utf8');
		throw new Error(`源码文件含 GBK-mojibake 签名字符（编码二次损坏痕迹: ${hits.join('/')}）: ${absPath} @ byte ${before.length}`);
	}
}
